import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, getSupabasePool, PortalIdentity } from "./supabasePortal";

type CatalogInput = { code: string; name: string };

function trimRequired(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new TRPCError({ code: "BAD_REQUEST", message: `${label} é obrigatório.` });
  return normalized;
}

async function assertCatalogManagement(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "cadastros-estrutura-estoque", "manage");
}

async function audit(identity: PortalIdentity, entityType: string, entityId: string, action: string, details: Record<string, unknown>) {
  await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, $2, $3, $4, $5::jsonb)", [identity.id, entityType, entityId, action, JSON.stringify(details)]);
}

function rethrowDuplicate(error: unknown, label: string): never {
  if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new TRPCError({ code: "CONFLICT", message: `${label} já possui um cadastro com esse código.` });
  throw error;
}

export async function listInventoryCatalog(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "cadastros-estrutura-estoque", "view");
  const database = getSupabasePool();
  const [productTypes, orgUnits, costCenters, companies, branches, warehouses, stockLocations, products] = await Promise.all([
    database.query<{ id: string; code: string; name: string; description: string | null; stock_controlled: boolean; active: boolean }>("select id, code, name, description, stock_controlled, active from public.product_types order by code"),
    database.query<{ id: string; code: string; name: string; active: boolean }>("select id, code, name, active from public.org_units order by code"),
    database.query<{ id: string; unit_id: string | null; unit_code: string | null; code: string; name: string; active: boolean }>("select center.id, center.unit_id, unit.code as unit_code, center.code, center.name, center.active from public.cost_centers center left join public.org_units unit on unit.id = center.unit_id order by center.code"),
    database.query<{ id: string; code: string; legal_name: string; trade_name: string | null; tax_id: string | null; active: boolean }>("select id, code, legal_name, trade_name, tax_id, active from public.companies order by code"),
    database.query<{ id: string; company_id: string; company_code: string; code: string; name: string; tax_id: string | null; active: boolean }>("select branch.id, branch.company_id, company.code as company_code, branch.code, branch.name, branch.tax_id, branch.active from public.branches branch join public.companies company on company.id = branch.company_id order by company.code, branch.code"),
    database.query<{ id: string; branch_id: string; branch_code: string; code: string; name: string; active: boolean }>("select warehouse.id, warehouse.branch_id, branch.code as branch_code, warehouse.code, warehouse.name, warehouse.active from public.warehouses warehouse join public.branches branch on branch.id = warehouse.branch_id order by branch.code, warehouse.code"),
    database.query<{ id: string; warehouse_id: string; warehouse_code: string; code: string; name: string; active: boolean }>("select location.id, location.warehouse_id, warehouse.code as warehouse_code, location.code, location.name, location.active from public.stock_locations location join public.warehouses warehouse on warehouse.id = location.warehouse_id order by warehouse.code, location.code"),
    database.query<{ id: string; product_code: string; name: string; product_type_id: string | null; product_type_code: string | null; inventory_control_category: string; unit_of_measure: string; requires_size: boolean; requires_lot: boolean; requires_expiration: boolean; requires_ca: boolean; active: boolean }>("select product.id, product.product_code, product.name, product.product_type_id, type.code as product_type_code, product.inventory_control_category, product.unit_of_measure, product.requires_size, product.requires_lot, product.requires_expiration, product.requires_ca, product.active from public.products product left join public.product_types type on type.id = product.product_type_id order by product.product_code"),
  ]);
  return {
    productTypes: productTypes.rows.map(row => ({ id: row.id, code: row.code, name: row.name, description: row.description, stockControlled: row.stock_controlled, active: row.active })),
    orgUnits: orgUnits.rows.map(row => ({ id: row.id, code: row.code, name: row.name, active: row.active })),
    costCenters: costCenters.rows.map(row => ({ id: row.id, unitId: row.unit_id, unitCode: row.unit_code, code: row.code, name: row.name, active: row.active })),
    companies: companies.rows.map(row => ({ id: row.id, code: row.code, legalName: row.legal_name, tradeName: row.trade_name, taxId: row.tax_id, active: row.active })),
    branches: branches.rows.map(row => ({ id: row.id, companyId: row.company_id, companyCode: row.company_code, code: row.code, name: row.name, taxId: row.tax_id, active: row.active })),
    warehouses: warehouses.rows.map(row => ({ id: row.id, branchId: row.branch_id, branchCode: row.branch_code, code: row.code, name: row.name, active: row.active })),
    stockLocations: stockLocations.rows.map(row => ({ id: row.id, warehouseId: row.warehouse_id, warehouseCode: row.warehouse_code, code: row.code, name: row.name, active: row.active })),
    products: products.rows.map(row => ({ id: row.id, code: row.product_code, name: row.name, productTypeId: row.product_type_id, productTypeCode: row.product_type_code, inventoryControlCategory: row.inventory_control_category, unitOfMeasure: row.unit_of_measure, requiresSize: row.requires_size, requiresLot: row.requires_lot, requiresExpiration: row.requires_expiration, requiresCa: row.requires_ca, active: row.active })),
  };
}

export async function createProductType(input: CatalogInput & { description?: string; stockControlled: boolean }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.product_types (code, name, description, stock_controlled) values ($1, $2, $3, $4) returning id", [code, name, input.description?.trim() || null, input.stockControlled]);
    await audit(identity, "product_type", result.rows[0].id, "created", { code, name });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "O tipo de produto"); }
}

export async function createOrgUnit(input: CatalogInput, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.org_units (code, name) values ($1, $2) returning id", [code, name]);
    await audit(identity, "org_unit", result.rows[0].id, "created", { code, name });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "A unidade"); }
}

export async function createCostCenter(input: CatalogInput & { unitId?: string }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.cost_centers (code, name, unit_id) values ($1, $2, $3) returning id", [code, name, input.unitId || null]);
    await audit(identity, "cost_center", result.rows[0].id, "created", { code, name, unitId: input.unitId || null });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "O centro de custo"); }
}

export async function createCompany(input: { code: string; legalName: string; tradeName?: string; taxId?: string }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const legalName = trimRequired(input.legalName, "Razão social");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.companies (code, legal_name, trade_name, tax_id) values ($1, $2, $3, $4) returning id", [code, legalName, input.tradeName?.trim() || null, input.taxId?.replace(/\D/g, "") || null]);
    await audit(identity, "company", result.rows[0].id, "created", { code, legalName });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "A empresa"); }
}

export async function createBranch(input: CatalogInput & { companyId: string; taxId?: string }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.branches (company_id, code, name, tax_id) values ($1, $2, $3, $4) returning id", [input.companyId, code, name, input.taxId?.replace(/\D/g, "") || null]);
    await audit(identity, "branch", result.rows[0].id, "created", { code, name, companyId: input.companyId });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "A filial"); }
}

export async function createWarehouse(input: CatalogInput & { branchId: string }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.warehouses (branch_id, code, name) values ($1, $2, $3) returning id", [input.branchId, code, name]);
    await audit(identity, "warehouse", result.rows[0].id, "created", { code, name, branchId: input.branchId });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "O armazém"); }
}

export async function createStockLocation(input: CatalogInput & { warehouseId: string }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const code = trimRequired(input.code, "Código");
  const name = trimRequired(input.name, "Nome");
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.stock_locations (warehouse_id, code, name) values ($1, $2, $3) returning id", [input.warehouseId, code, name]);
    await audit(identity, "stock_location", result.rows[0].id, "created", { code, name, warehouseId: input.warehouseId });
    return { id: result.rows[0].id };
  } catch (error) { return rethrowDuplicate(error, "O local de estoque"); }
}

export async function configureInventoryProduct(input: { productId: string; productTypeId: string; inventoryControlCategory: "consumable" | "epi" | "uniform" | "tool" | "other"; unitOfMeasure: string; requiresSize: boolean; requiresLot: boolean; requiresExpiration: boolean; requiresCa: boolean }, identity: PortalIdentity) {
  await assertCatalogManagement(identity);
  const unitOfMeasure = trimRequired(input.unitOfMeasure, "Unidade de medida").toUpperCase();
  const result = await getSupabasePool().query<{ id: string }>("update public.products set product_type_id = $2, inventory_control_category = $3, unit_of_measure = $4, requires_size = $5, requires_lot = $6, requires_expiration = $7, requires_ca = $8, updated_at = now() where id = $1 returning id", [input.productId, input.productTypeId, input.inventoryControlCategory, unitOfMeasure, input.requiresSize, input.requiresLot, input.requiresExpiration, input.requiresCa]);
  if (!result.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
  await audit(identity, "product", input.productId, "inventory_configured", { productTypeId: input.productTypeId, inventoryControlCategory: input.inventoryControlCategory, unitOfMeasure, requiresSize: input.requiresSize, requiresLot: input.requiresLot, requiresExpiration: input.requiresExpiration, requiresCa: input.requiresCa });
  return { id: input.productId };
}
