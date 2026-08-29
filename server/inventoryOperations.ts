import { TRPCError } from "@trpc/server";
import type { PoolClient } from "pg";
import { assertApplicationPermission, getSupabasePool, type PortalIdentity } from "./supabasePortal";

export type OperationLineInput = { productId: string; quantity: number; sizeCode?: string };

export function assertOperationLines(lines: OperationLineInput[]) {
  if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe pelo menos um item." });
  const duplicate = new Set<string>();
  lines.forEach(line => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "As quantidades devem ser maiores que zero." });
    const key = `${line.productId}|${line.sizeCode?.trim() ?? ""}`;
    if (duplicate.has(key)) throw new TRPCError({ code: "BAD_REQUEST", message: "Não repita o mesmo produto e tamanho na operação." });
    duplicate.add(key);
  });
}

export function requisitionStatus(requestedQuantity: number, fulfilledQuantity: number) {
  if (fulfilledQuantity <= 0) return "open" as const;
  return fulfilledQuantity >= requestedQuantity ? "completed" as const : "partial" as const;
}

export function requiresEmployeeItemCustody(inventoryControlCategory: string) {
  return inventoryControlCategory === "epi" || inventoryControlCategory === "uniform";
}

async function assertPermission(identity: PortalIdentity, nodeKey: string, permission: "view" | "manage") { await assertApplicationPermission(identity, nodeKey, permission); }

async function getCurrentEmployee(identity: PortalIdentity, client?: PoolClient) {
  const database = client ?? getSupabasePool();
  const result = await database.query<{ employee_id: string | null; can_fulfill_inventory_requests: boolean }>("select employee_id, can_fulfill_inventory_requests from public.portal_users where id = $1", [identity.id]);
  const row = result.rows[0];
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário do portal não encontrado." });
  return row;
}

async function ensureRequester(identity: PortalIdentity, client?: PoolClient) {
  const current = await getCurrentEmployee(identity, client);
  if (!current.employee_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Vincule seu usuário a um funcionário antes de criar requisições." });
  const employee = await (client ?? getSupabasePool()).query<{ is_inventory_requester: boolean; active: boolean }>("select is_inventory_requester, active from public.employees where id = $1", [current.employee_id]);
  if (!employee.rows[0]?.active || !employee.rows[0]?.is_inventory_requester) throw new TRPCError({ code: "FORBIDDEN", message: "O funcionário associado a este usuário não está liberado para requisitar itens." });
  return current.employee_id;
}

async function ensureFulfiller(identity: PortalIdentity, client?: PoolClient) {
  const current = await getCurrentEmployee(identity, client);
  if (!identity.isDevelopmentAdmin && !current.can_fulfill_inventory_requests) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não está autorizado a atender requisições do almoxarifado." });
}

async function createOperation(client: PoolClient, input: { type: string; status: string; actor: PortalIdentity; requesterEmployeeId?: string; sourceWarehouseId?: string; sourceLocationId?: string; destinationWarehouseId?: string; destinationLocationId?: string; nfReceiptId?: string; relatedOperationId?: string; scheduledAt?: string; reason?: string; notes?: string }) {
  const result = await client.query<{ id: string; operation_number: string }>(
    `insert into public.stock_operations (operation_type, status, requested_by_user_id, requester_employee_id, handled_by_user_id, source_warehouse_id, source_stock_location_id, destination_warehouse_id, destination_stock_location_id, nf_receipt_id, related_operation_id, scheduled_at, occurred_at, reason, notes)
     values ($1, $2, $3, $4, $3, $5, $6, $7, $8, $9, $10, $11, now(), $12, $13) returning id, operation_number`,
    [input.type, input.status, input.actor.id, input.requesterEmployeeId ?? null, input.sourceWarehouseId ?? null, input.sourceLocationId ?? null, input.destinationWarehouseId ?? null, input.destinationLocationId ?? null, input.nfReceiptId ?? null, input.relatedOperationId ?? null, input.scheduledAt ?? null, input.reason ?? null, input.notes ?? null],
  );
  return result.rows[0];
}

async function createLine(client: PoolClient, operationId: string, input: { productId: string; requestedQuantity?: number; fulfilledQuantity?: number; quantity?: number; sizeCode?: string; notes?: string }) {
  const result = await client.query<{ id: string }>(
    `insert into public.stock_operation_lines (stock_operation_id, product_id, requested_quantity, fulfilled_quantity, quantity, size_code, notes)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [operationId, input.productId, input.requestedQuantity ?? 0, input.fulfilledQuantity ?? 0, input.quantity ?? 0, input.sizeCode?.trim() ?? "", input.notes ?? null],
  );
  return result.rows[0].id;
}

async function applyBalanceMovement(client: PoolClient, input: { lineId: string; locationId: string; productId: string; quantity: number; direction: "in" | "out"; actorId: string; sizeCode?: string }) {
  const sizeCode = input.sizeCode?.trim() ?? "";
  const balance = await client.query<{ id: string; on_hand_quantity: string; reserved_quantity: string }>(
    "select id, on_hand_quantity, reserved_quantity from public.stock_balances where stock_location_id = $1 and product_id = $2 and stock_lot_id is null and size_code = $3 for update",
    [input.locationId, input.productId, sizeCode],
  );
  const current = Number(balance.rows[0]?.on_hand_quantity ?? 0);
  const delta = input.direction === "in" ? input.quantity : -input.quantity;
  const next = current + delta;
  if (next < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Saldo insuficiente no local de estoque para concluir a operação." });
  if (balance.rows[0]) await client.query("update public.stock_balances set on_hand_quantity = $2, updated_at = now() where id = $1", [balance.rows[0].id, next]);
  else await client.query("insert into public.stock_balances (stock_location_id, product_id, stock_lot_id, size_code, on_hand_quantity) values ($1, $2, null, $3, $4)", [input.locationId, input.productId, sizeCode, next]);
  await client.query("insert into public.stock_movements (stock_operation_line_id, stock_location_id, product_id, size_code, movement_type, quantity, created_by_user_id) values ($1, $2, $3, $4, $5, $6, $7)", [input.lineId, input.locationId, input.productId, sizeCode, input.direction, input.quantity, input.actorId]);
}

async function audit(client: PoolClient, identity: PortalIdentity, operationId: string, type: string, details: Record<string, unknown>) {
  await client.query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'stock_operation', $2, $3, $4::jsonb)", [identity.id, operationId, type, JSON.stringify(details)]);
}

export async function inventoryContext(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-estoque", "view");
  const database = getSupabasePool();
  const [locations, products, nfReceipts] = await Promise.all([
    database.query<{ id: string; warehouse_id: string; branch_code: string; warehouse_code: string; warehouse_name: string; code: string; name: string }>("select location.id, location.warehouse_id, branch.code as branch_code, warehouse.code as warehouse_code, warehouse.name as warehouse_name, location.code, location.name from public.stock_locations location join public.warehouses warehouse on warehouse.id = location.warehouse_id join public.branches branch on branch.id = warehouse.branch_id where location.active and warehouse.active and branch.active order by branch.code, warehouse.code, location.code"),
    database.query<{ id: string; code: string; name: string; unit_of_measure: string; product_type_code: string | null }>("select product.id, product.product_code as code, product.name, product.unit_of_measure, type.code as product_type_code from public.products product left join public.product_types type on type.id = product.product_type_id where product.active and coalesce(type.stock_controlled, true) order by product.product_code"),
    database.query<{ id: string; access_key: string }>("select id, access_key from public.nf_receipts order by captured_at desc limit 200"),
  ]);
  return { locations: locations.rows.map(row => ({ id: row.id, warehouseId: row.warehouse_id, label: `${row.branch_code} · ${row.warehouse_code} · ${row.code} — ${row.name}`, warehouseLabel: `${row.branch_code} · ${row.warehouse_code} — ${row.warehouse_name}` })), products: products.rows.map(row => ({ id: row.id, label: `${row.code} — ${row.name}`, unitOfMeasure: row.unit_of_measure, productTypeCode: row.product_type_code })), nfReceipts: nfReceipts.rows.map(row => ({ id: row.id, accessKey: row.access_key })) };
}

export async function createRequisition(input: { sourceWarehouseId?: string; scheduledAt?: string; notes?: string; lines: OperationLineInput[] }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-requisicoes", "manage");
  assertOperationLines(input.lines);
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    const employeeId = await ensureRequester(identity, client);
    const operation = await createOperation(client, { type: "requisition", status: "open", actor: identity, requesterEmployeeId: employeeId, sourceWarehouseId: input.sourceWarehouseId, scheduledAt: input.scheduledAt, notes: input.notes });
    for (const line of input.lines) await createLine(client, operation.id, { productId: line.productId, requestedQuantity: line.quantity, sizeCode: line.sizeCode });
    await audit(client, identity, operation.id, "requisition_created", { lines: input.lines.length });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function postStockEntry(input: { type: "purchase_receipt" | "inventory_initial" | "inventory_adjustment"; destinationLocationId: string; nfReceiptId?: string; reason?: string; notes?: string; lines: OperationLineInput[] }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-movimentacoes", "manage");
  assertOperationLines(input.lines);
  if (["inventory_initial", "inventory_adjustment"].includes(input.type) && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa do inventário ou ajuste." });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1 and active", [input.destinationLocationId]);
    if (!location.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local de estoque não encontrado." });
    const operation = await createOperation(client, { type: input.type, status: "posted", actor: identity, destinationWarehouseId: location.rows[0].warehouse_id, destinationLocationId: input.destinationLocationId, nfReceiptId: input.nfReceiptId, reason: input.reason, notes: input.notes });
    for (const item of input.lines) {
      const lineId = await createLine(client, operation.id, { productId: item.productId, quantity: item.quantity, sizeCode: item.sizeCode });
      if (input.type === "inventory_initial" || input.type === "inventory_adjustment") {
        const balance = await client.query<{ on_hand_quantity: string }>("select on_hand_quantity from public.stock_balances where stock_location_id = $1 and product_id = $2 and stock_lot_id is null and size_code = $3 for update", [input.destinationLocationId, item.productId, item.sizeCode?.trim() ?? ""]);
        const current = Number(balance.rows[0]?.on_hand_quantity ?? 0);
        const direction = item.quantity >= current ? "in" : "out";
        const delta = Math.abs(item.quantity - current);
        if (delta) await applyBalanceMovement(client, { lineId, locationId: input.destinationLocationId, productId: item.productId, quantity: delta, direction, actorId: identity.id, sizeCode: item.sizeCode });
      } else await applyBalanceMovement(client, { lineId, locationId: input.destinationLocationId, productId: item.productId, quantity: item.quantity, direction: "in", actorId: identity.id, sizeCode: item.sizeCode });
    }
    await audit(client, identity, operation.id, `${input.type}_posted`, { lines: input.lines.length, nfReceiptId: input.nfReceiptId ?? null });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function postTransfer(input: { sourceLocationId: string; destinationLocationId: string; notes?: string; lines: OperationLineInput[] }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-movimentacoes", "manage");
  assertOperationLines(input.lines);
  if (input.sourceLocationId === input.destinationLocationId) throw new TRPCError({ code: "BAD_REQUEST", message: "A origem e o destino da transferência devem ser diferentes." });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    const locations = await client.query<{ id: string; warehouse_id: string }>("select id, warehouse_id from public.stock_locations where id = any($1::uuid[]) and active", [[input.sourceLocationId, input.destinationLocationId]]);
    if (locations.rows.length !== 2) throw new TRPCError({ code: "NOT_FOUND", message: "Local de origem ou destino não encontrado." });
    const source = locations.rows.find(row => row.id === input.sourceLocationId)!;
    const destination = locations.rows.find(row => row.id === input.destinationLocationId)!;
    const operation = await createOperation(client, { type: "transfer", status: "posted", actor: identity, sourceWarehouseId: source.warehouse_id, sourceLocationId: source.id, destinationWarehouseId: destination.warehouse_id, destinationLocationId: destination.id, notes: input.notes });
    for (const item of input.lines) {
      const lineId = await createLine(client, operation.id, { productId: item.productId, quantity: item.quantity, sizeCode: item.sizeCode });
      await applyBalanceMovement(client, { lineId, locationId: source.id, productId: item.productId, quantity: item.quantity, direction: "out", actorId: identity.id, sizeCode: item.sizeCode });
      await applyBalanceMovement(client, { lineId, locationId: destination.id, productId: item.productId, quantity: item.quantity, direction: "in", actorId: identity.id, sizeCode: item.sizeCode });
    }
    await audit(client, identity, operation.id, "transfer_posted", { lines: input.lines.length });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function listRequisitions(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-requisicoes", "view");
  const result = await getSupabasePool().query<{ id: string; operation_number: string; status: string; scheduled_at: Date | null; created_at: Date; requester: string | null; notes: string | null; source_warehouse: string | null; requested_lines: string; fulfilled_lines: string }>(
    `select operation.id, operation.operation_number, operation.status, operation.scheduled_at, operation.created_at, employee.full_name as requester, operation.notes, warehouse.name as source_warehouse,
       coalesce(sum(line.requested_quantity), 0)::text as requested_lines, coalesce(sum(line.fulfilled_quantity), 0)::text as fulfilled_lines
     from public.stock_operations operation
     left join public.employees employee on employee.id = operation.requester_employee_id
     left join public.warehouses warehouse on warehouse.id = operation.source_warehouse_id
     left join public.stock_operation_lines line on line.stock_operation_id = operation.id
     where operation.operation_type = 'requisition'
     group by operation.id, employee.full_name, warehouse.name order by operation.created_at desc limit 200`,
  );
  return result.rows.map(row => ({ id: row.id, operationNumber: row.operation_number, status: row.status, scheduledAt: row.scheduled_at, createdAt: row.created_at, requester: row.requester, notes: row.notes, sourceWarehouse: row.source_warehouse, requestedQuantity: Number(row.requested_lines), fulfilledQuantity: Number(row.fulfilled_lines) }));
}

export async function requisitionLines(requisitionId: string, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-atendimentos", "view");
  const result = await getSupabasePool().query<{ id: string; product_id: string; product_code: string; product_name: string; unit_of_measure: string; size_code: string; requested_quantity: string; fulfilled_quantity: string }>(
    `select line.id, line.product_id, product.product_code, product.name as product_name, product.unit_of_measure, line.size_code, line.requested_quantity::text, line.fulfilled_quantity::text
     from public.stock_operation_lines line join public.products product on product.id = line.product_id
     where line.stock_operation_id = $1 order by product.product_code, line.size_code`,
    [requisitionId],
  );
  return result.rows.map(row => ({ id: row.id, productId: row.product_id, productCode: row.product_code, productName: row.product_name, unitOfMeasure: row.unit_of_measure, sizeCode: row.size_code, requestedQuantity: Number(row.requested_quantity), fulfilledQuantity: Number(row.fulfilled_quantity), remainingQuantity: Number(row.requested_quantity) - Number(row.fulfilled_quantity) }));
}

export async function fulfillRequisition(input: { requisitionId: string; sourceLocationId: string; lines: OperationLineInput[]; notes?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-atendimentos", "manage");
  assertOperationLines(input.lines);
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    await ensureFulfiller(identity, client);
    const requisition = await client.query<{ id: string; requester_employee_id: string; status: string }>("select id, requester_employee_id, status from public.stock_operations where id = $1 and operation_type = 'requisition' for update", [input.requisitionId]);
    if (!requisition.rows[0] || ["completed", "cancelled"].includes(requisition.rows[0].status)) throw new TRPCError({ code: "BAD_REQUEST", message: "A requisição não está disponível para atendimento." });
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1 and active", [input.sourceLocationId]);
    if (!location.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local de estoque não encontrado." });
    const operation = await createOperation(client, { type: "fulfillment", status: "posted", actor: identity, requesterEmployeeId: requisition.rows[0].requester_employee_id, sourceWarehouseId: location.rows[0].warehouse_id, sourceLocationId: input.sourceLocationId, relatedOperationId: input.requisitionId, notes: input.notes });
    for (const item of input.lines) {
      const requestedLine = await client.query<{ id: string; requested_quantity: string; fulfilled_quantity: string }>("select id, requested_quantity, fulfilled_quantity from public.stock_operation_lines where stock_operation_id = $1 and product_id = $2 and size_code = $3 for update", [input.requisitionId, item.productId, item.sizeCode?.trim() ?? ""]);
      const original = requestedLine.rows[0];
      if (!original) throw new TRPCError({ code: "BAD_REQUEST", message: "O item informado não pertence à requisição." });
      if (Number(original.fulfilled_quantity) + item.quantity > Number(original.requested_quantity)) throw new TRPCError({ code: "BAD_REQUEST", message: "A quantidade atendida ultrapassa a quantidade requisitada." });
      const lineId = await createLine(client, operation.id, { productId: item.productId, quantity: item.quantity, fulfilledQuantity: item.quantity, sizeCode: item.sizeCode });
      await applyBalanceMovement(client, { lineId, locationId: input.sourceLocationId, productId: item.productId, quantity: item.quantity, direction: "out", actorId: identity.id, sizeCode: item.sizeCode });
      await client.query("update public.stock_operation_lines set fulfilled_quantity = fulfilled_quantity + $2, updated_at = now() where id = $1", [original.id, item.quantity]);
      const trackedProduct = await client.query<{ inventory_control_category: string }>("select inventory_control_category from public.products where id = $1", [item.productId]);
      if (requiresEmployeeItemCustody(trackedProduct.rows[0]?.inventory_control_category ?? "other")) {
        await client.query("insert into public.employee_item_custodies (product_id, employee_id, delivered_operation_line_id, delivered_by_user_id, delivered_quantity, size_code, notes) values ($1, $2, $3, $4, $5, $6, $7)", [item.productId, requisition.rows[0].requester_employee_id, lineId, identity.id, item.quantity, item.sizeCode?.trim() ?? "", input.notes ?? null]);
      }
    }
    const remaining = await client.query<{ remaining: string }>("select coalesce(sum(requested_quantity - fulfilled_quantity), 0)::text as remaining from public.stock_operation_lines where stock_operation_id = $1", [input.requisitionId]);
    await client.query("update public.stock_operations set status = $2, updated_at = now() where id = $1", [input.requisitionId, Number(remaining.rows[0].remaining) <= 0 ? "completed" : "partial"]);
    await audit(client, identity, operation.id, "fulfillment_posted", { requisitionId: input.requisitionId, lines: input.lines.length });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function stockPosition(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-estoque", "view");
  const result = await getSupabasePool().query<{ product_code: string; product_name: string; unit_of_measure: string; branch_code: string; warehouse_code: string; warehouse_name: string; location_code: string; location_name: string; on_hand_quantity: string; reserved_quantity: string; minimum_quantity: string | null; maximum_quantity: string | null; safety_days: number | null; coverage_days: number | null; average_daily_consumption: string }>(
    `with consumption as (
       select location.warehouse_id, movement.product_id, coalesce(sum(movement.quantity), 0)::numeric / 60 as average_daily_consumption
       from public.stock_movements movement
       join public.stock_locations location on location.id = movement.stock_location_id
       where movement.movement_type = 'out' and movement.created_at >= now() - interval '60 days'
       group by location.warehouse_id, movement.product_id
     )
     select product.product_code, product.name as product_name, product.unit_of_measure, branch.code as branch_code, warehouse.code as warehouse_code, warehouse.name as warehouse_name, location.code as location_code, location.name as location_name, balance.on_hand_quantity::text, balance.reserved_quantity::text, policy.minimum_quantity::text, policy.maximum_quantity::text, policy.safety_days, policy.coverage_days, coalesce(consumption.average_daily_consumption, 0)::text as average_daily_consumption
     from public.stock_balances balance join public.products product on product.id = balance.product_id join public.stock_locations location on location.id = balance.stock_location_id join public.warehouses warehouse on warehouse.id = location.warehouse_id join public.branches branch on branch.id = warehouse.branch_id left join public.stock_policies policy on policy.product_id = product.id and policy.warehouse_id = warehouse.id
     left join consumption on consumption.warehouse_id = warehouse.id and consumption.product_id = product.id
     order by branch.code, warehouse.code, location.code, product.product_code`,
  );
  return result.rows.map(row => { const onHandQuantity = Number(row.on_hand_quantity); const averageDailyConsumption = Number(row.average_daily_consumption); const minimumQuantity = row.minimum_quantity === null ? null : Number(row.minimum_quantity); const maximumQuantity = row.maximum_quantity === null ? null : Number(row.maximum_quantity); return { productCode: row.product_code, productName: row.product_name, unitOfMeasure: row.unit_of_measure, branchCode: row.branch_code, warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, locationCode: row.location_code, locationName: row.location_name, onHandQuantity, reservedQuantity: Number(row.reserved_quantity), minimumQuantity, maximumQuantity, safetyDays: row.safety_days, coverageDays: row.coverage_days, averageDailyConsumption, actualCoverageDays: averageDailyConsumption > 0 ? onHandQuantity / averageDailyConsumption : null, levelStatus: minimumQuantity !== null && onHandQuantity < minimumQuantity ? "below_minimum" : maximumQuantity !== null && onHandQuantity > maximumQuantity ? "above_maximum" : "within" }; });
}

export async function listStockPolicies(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-estoque", "view");
  const result = await getSupabasePool().query<{ id: string; warehouse_id: string; product_id: string; branch_code: string; warehouse_code: string; warehouse_name: string; product_code: string; product_name: string; minimum_quantity: string; maximum_quantity: string | null; safety_days: number; coverage_days: number; active: boolean }>(
    `select policy.id, policy.warehouse_id, policy.product_id, branch.code as branch_code, warehouse.code as warehouse_code, warehouse.name as warehouse_name, product.product_code, product.name as product_name, policy.minimum_quantity::text, policy.maximum_quantity::text, policy.safety_days, policy.coverage_days, policy.active
     from public.stock_policies policy join public.warehouses warehouse on warehouse.id = policy.warehouse_id join public.branches branch on branch.id = warehouse.branch_id join public.products product on product.id = policy.product_id
     order by branch.code, warehouse.code, product.product_code`,
  );
  return result.rows.map(row => ({ id: row.id, warehouseId: row.warehouse_id, productId: row.product_id, warehouseLabel: `${row.branch_code} · ${row.warehouse_code} — ${row.warehouse_name}`, productLabel: `${row.product_code} — ${row.product_name}`, minimumQuantity: Number(row.minimum_quantity), maximumQuantity: row.maximum_quantity === null ? null : Number(row.maximum_quantity), safetyDays: row.safety_days, coverageDays: row.coverage_days, active: row.active }));
}

export async function saveStockPolicy(input: { warehouseId: string; productId: string; minimumQuantity: number; maximumQuantity?: number; safetyDays: number; coverageDays: number }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-estoque", "manage");
  if (input.minimumQuantity < 0 || input.safetyDays < 0 || input.coverageDays < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Os níveis e prazos não podem ser negativos." });
  if (input.maximumQuantity !== undefined && input.maximumQuantity < input.minimumQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: "O estoque máximo deve ser maior ou igual ao mínimo." });
  const result = await getSupabasePool().query<{ id: string }>(
    `insert into public.stock_policies (warehouse_id, product_id, minimum_quantity, maximum_quantity, safety_days, coverage_days)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (warehouse_id, product_id) do update set minimum_quantity = excluded.minimum_quantity, maximum_quantity = excluded.maximum_quantity, safety_days = excluded.safety_days, coverage_days = excluded.coverage_days, active = true, updated_at = now()
     returning id`,
    [input.warehouseId, input.productId, input.minimumQuantity, input.maximumQuantity ?? null, input.safetyDays, input.coverageDays],
  );
  await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'stock_policy', $2, 'saved', $3::jsonb)", [identity.id, result.rows[0].id, JSON.stringify(input)]);
  return { id: result.rows[0].id };
}

export async function listRecentMovements(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-movimentacoes", "view");
  const result = await getSupabasePool().query<{ operation_number: string; operation_type: string; operation_status: string; movement_type: string; quantity: string; created_at: Date; product_code: string; product_name: string; location_code: string; location_name: string; actor_name: string | null }>(
    `select operation.operation_number, operation.operation_type, operation.status as operation_status, movement.movement_type, movement.quantity::text, movement.created_at, product.product_code, product.name as product_name, location.code as location_code, location.name as location_name, actor.display_name as actor_name
     from public.stock_movements movement
     join public.stock_operation_lines line on line.id = movement.stock_operation_line_id
     join public.stock_operations operation on operation.id = line.stock_operation_id
     join public.products product on product.id = movement.product_id
     join public.stock_locations location on location.id = movement.stock_location_id
     left join public.portal_users actor on actor.id = movement.created_by_user_id
     order by movement.created_at desc limit 200`,
  );
  return result.rows.map(row => ({ operationNumber: row.operation_number, operationType: row.operation_type, operationStatus: row.operation_status, movementType: row.movement_type, quantity: Number(row.quantity), createdAt: row.created_at, productCode: row.product_code, productName: row.product_name, locationCode: row.location_code, locationName: row.location_name, actorName: row.actor_name }));
}

export async function toolsContext(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-ferramentas", "view");
  const database = getSupabasePool();
  const [products, employees, locations] = await Promise.all([
    database.query<{ id: string; product_code: string; name: string }>("select id, product_code, name from public.products where active order by product_code"),
    database.query<{ id: string; employee_code: string | null; full_name: string }>("select id, employee_code, full_name from public.employees where active order by full_name"),
    database.query<{ id: string; branch_code: string; warehouse_code: string; location_code: string; location_name: string }>("select location.id, branch.code as branch_code, warehouse.code as warehouse_code, location.code as location_code, location.name as location_name from public.stock_locations location join public.warehouses warehouse on warehouse.id = location.warehouse_id join public.branches branch on branch.id = warehouse.branch_id where location.active order by branch.code, warehouse.code, location.code"),
  ]);
  return { products: products.rows.map(row => ({ id: row.id, label: `${row.product_code} — ${row.name}` })), employees: employees.rows.map(row => ({ id: row.id, label: `${row.employee_code ? `${row.employee_code} · ` : ""}${row.full_name}` })), locations: locations.rows.map(row => ({ id: row.id, label: `${row.branch_code} · ${row.warehouse_code} · ${row.location_code} — ${row.location_name}` })) };
}

export async function listToolInstances(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-ferramentas", "view");
  const result = await getSupabasePool().query<{ id: string; instance_code: string; status: string; condition_state: string; product_code: string; product_name: string; location_label: string | null; employee_name: string | null; delivered_at: Date | null; delivered_by: string | null }>(
    `select tool.id, tool.instance_code, tool.status, tool.condition_state, product.product_code, product.name as product_name,
       case when location.id is null then null else concat(branch.code, ' · ', warehouse.code, ' · ', location.code, ' — ', location.name) end as location_label,
       employee.full_name as employee_name, custody.delivered_at, delivered_by.display_name as delivered_by
     from public.tool_instances tool join public.products product on product.id = tool.product_id
     left join public.stock_locations location on location.id = tool.current_stock_location_id
     left join public.warehouses warehouse on warehouse.id = location.warehouse_id
     left join public.branches branch on branch.id = warehouse.branch_id
     left join public.employees employee on employee.id = tool.current_employee_id
     left join lateral (select * from public.tool_custodies where tool_instance_id = tool.id and returned_at is null order by delivered_at desc limit 1) custody on true
     left join public.portal_users delivered_by on delivered_by.id = custody.delivered_by_user_id
     order by tool.instance_code`,
  );
  return result.rows.map(row => ({ id: row.id, instanceCode: row.instance_code, status: row.status, conditionState: row.condition_state, productCode: row.product_code, productName: row.product_name, locationLabel: row.location_label, employeeName: row.employee_name, deliveredAt: row.delivered_at, deliveredBy: row.delivered_by }));
}

export async function createToolInstance(input: { productId: string; instanceCode: string; locationId: string; conditionState: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-ferramentas", "manage");
  const instanceCode = input.instanceCode.trim();
  if (!instanceCode) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o código individual da ferramenta." });
  try {
    const result = await getSupabasePool().query<{ id: string }>("insert into public.tool_instances (product_id, instance_code, current_stock_location_id, status, condition_state) values ($1, $2, $3, 'available', $4) returning id", [input.productId, instanceCode, input.locationId, input.conditionState]);
    await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'tool_instance', $2, 'created', $3::jsonb)", [identity.id, result.rows[0].id, JSON.stringify({ instanceCode, locationId: input.locationId })]);
    return { id: result.rows[0].id };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Já existe uma ferramenta com esse código individual." });
    throw error;
  }
}

export async function assignTool(input: { toolId: string; employeeId: string; notes?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-ferramentas", "manage");
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    await ensureFulfiller(identity, client);
    const tool = await client.query<{ product_id: string; current_stock_location_id: string | null; status: string; condition_state: string }>("select product_id, current_stock_location_id, status, condition_state from public.tool_instances where id = $1 for update", [input.toolId]);
    const current = tool.rows[0];
    if (!current || current.status !== "available" || !current.current_stock_location_id) throw new TRPCError({ code: "BAD_REQUEST", message: "A ferramenta não está disponível para entrega em estoque." });
    const employee = await client.query<{ id: string }>("select id from public.employees where id = $1 and active", [input.employeeId]);
    if (!employee.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado ou inativo." });
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1", [current.current_stock_location_id]);
    const operation = await createOperation(client, { type: "fulfillment", status: "posted", actor: identity, requesterEmployeeId: input.employeeId, sourceWarehouseId: location.rows[0].warehouse_id, sourceLocationId: current.current_stock_location_id, notes: input.notes });
    const lineId = await createLine(client, operation.id, { productId: current.product_id, quantity: 1 });
    await applyBalanceMovement(client, { lineId, locationId: current.current_stock_location_id, productId: current.product_id, quantity: 1, direction: "out", actorId: identity.id });
    await client.query("update public.tool_instances set current_stock_location_id = null, current_employee_id = $2, status = 'assigned', updated_at = now() where id = $1", [input.toolId, input.employeeId]);
    await client.query("insert into public.tool_custodies (tool_instance_id, employee_id, delivered_operation_line_id, delivered_by_user_id, delivered_condition, notes) values ($1, $2, $3, $4, $5, $6)", [input.toolId, input.employeeId, lineId, identity.id, current.condition_state, input.notes ?? null]);
    await audit(client, identity, operation.id, "tool_assigned", { toolId: input.toolId, employeeId: input.employeeId });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function returnTool(input: { toolId: string; locationId: string; conditionState: string; notes?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-ferramentas", "manage");
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    await ensureFulfiller(identity, client);
    const tool = await client.query<{ product_id: string; current_employee_id: string | null; status: string }>("select product_id, current_employee_id, status from public.tool_instances where id = $1 for update", [input.toolId]);
    const current = tool.rows[0];
    if (!current || current.status !== "assigned" || !current.current_employee_id) throw new TRPCError({ code: "BAD_REQUEST", message: "A ferramenta não está em posse de funcionário para devolução." });
    const custody = await client.query<{ id: string }>("select id from public.tool_custodies where tool_instance_id = $1 and returned_at is null order by delivered_at desc limit 1 for update", [input.toolId]);
    if (!custody.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi encontrada uma entrega em aberto para a ferramenta." });
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1 and active", [input.locationId]);
    if (!location.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local de estoque não encontrado." });
    const operation = await createOperation(client, { type: "return", status: "posted", actor: identity, requesterEmployeeId: current.current_employee_id, destinationWarehouseId: location.rows[0].warehouse_id, destinationLocationId: input.locationId, notes: input.notes });
    const lineId = await createLine(client, operation.id, { productId: current.product_id, quantity: 1 });
    await applyBalanceMovement(client, { lineId, locationId: input.locationId, productId: current.product_id, quantity: 1, direction: "in", actorId: identity.id });
    await client.query("update public.tool_instances set current_stock_location_id = $2, current_employee_id = null, status = 'available', condition_state = $3, updated_at = now() where id = $1", [input.toolId, input.locationId, input.conditionState]);
    await client.query("update public.tool_custodies set returned_operation_line_id = $2, received_by_user_id = $3, returned_at = now(), returned_condition = $4, notes = coalesce(notes, '') || case when $5::text is null then '' else E'\n' || $5 end, updated_at = now() where id = $1", [custody.rows[0].id, lineId, identity.id, input.conditionState, input.notes ?? null]);
    await audit(client, identity, operation.id, "tool_returned", { toolId: input.toolId, locationId: input.locationId });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function listEmployeeItemCustodies(input: { employeeId?: string; productId?: string; from?: string; to?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-devolucoes", "view");
  const result = await getSupabasePool().query<{ id: string; product_id: string; employee_id: string; product_code: string; product_name: string; employee_name: string; size_code: string; delivered_quantity: string; returned_quantity: string; delivered_at: Date; delivered_by: string | null; last_returned_at: Date | null; last_received_by: string | null }>(
    `select custody.id, custody.product_id, custody.employee_id, product.product_code, product.name as product_name, employee.full_name as employee_name, custody.size_code, custody.delivered_quantity::text, custody.returned_quantity::text, custody.delivered_at, delivered_by.display_name as delivered_by, last_return.returned_at as last_returned_at, received_by.display_name as last_received_by
     from public.employee_item_custodies custody join public.products product on product.id = custody.product_id join public.employees employee on employee.id = custody.employee_id left join public.portal_users delivered_by on delivered_by.id = custody.delivered_by_user_id
     left join lateral (select * from public.employee_item_custody_returns where custody_id = custody.id order by returned_at desc limit 1) last_return on true
     left join public.portal_users received_by on received_by.id = last_return.received_by_user_id
     where ($1::uuid is null or custody.employee_id = $1) and ($2::uuid is null or custody.product_id = $2) and ($3::timestamptz is null or custody.delivered_at >= $3) and ($4::timestamptz is null or custody.delivered_at < $4)
     order by custody.delivered_at desc`,
    [input.employeeId ?? null, input.productId ?? null, input.from ? `${input.from}T00:00:00.000Z` : null, input.to ? `${input.to}T23:59:59.999Z` : null],
  );
  return result.rows.map(row => ({ id: row.id, productId: row.product_id, employeeId: row.employee_id, productCode: row.product_code, productName: row.product_name, employeeName: row.employee_name, sizeCode: row.size_code, deliveredQuantity: Number(row.delivered_quantity), returnedQuantity: Number(row.returned_quantity), remainingQuantity: Number(row.delivered_quantity) - Number(row.returned_quantity), status: Number(row.delivered_quantity) > Number(row.returned_quantity) ? "pending" : "returned", deliveredAt: row.delivered_at, deliveredBy: row.delivered_by, lastReturnedAt: row.last_returned_at, lastReceivedBy: row.last_received_by }));
}

export async function employeeItemCustodyFilters(identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-devolucoes", "view");
  const database = getSupabasePool();
  const [employees, products] = await Promise.all([
    database.query<{ id: string; full_name: string }>("select distinct employee.id, employee.full_name from public.employee_item_custodies custody join public.employees employee on employee.id = custody.employee_id order by employee.full_name"),
    database.query<{ id: string; product_code: string; name: string }>("select distinct product.id, product.product_code, product.name from public.employee_item_custodies custody join public.products product on product.id = custody.product_id order by product.product_code"),
  ]);
  return { employees: employees.rows.map(row => ({ id: row.id, label: row.full_name })), products: products.rows.map(row => ({ id: row.id, label: `${row.product_code} — ${row.name}` })) };
}

export async function returnEmployeeItem(input: { custodyId: string; destinationLocationId: string; quantity: number; notes?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-devolucoes", "manage");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A quantidade devolvida deve ser maior que zero." });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    await ensureFulfiller(identity, client);
    const custody = await client.query<{ product_id: string; employee_id: string; size_code: string; delivered_quantity: string; returned_quantity: string }>("select product_id, employee_id, size_code, delivered_quantity, returned_quantity from public.employee_item_custodies where id = $1 for update", [input.custodyId]);
    const current = custody.rows[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Responsabilidade de item não encontrada." });
    if (input.quantity > Number(current.delivered_quantity) - Number(current.returned_quantity)) throw new TRPCError({ code: "BAD_REQUEST", message: "A quantidade devolvida ultrapassa a responsabilidade pendente." });
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1 and active", [input.destinationLocationId]);
    if (!location.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local de estoque não encontrado." });
    const operation = await createOperation(client, { type: "return", status: "posted", actor: identity, requesterEmployeeId: current.employee_id, destinationWarehouseId: location.rows[0].warehouse_id, destinationLocationId: input.destinationLocationId, notes: input.notes });
    const lineId = await createLine(client, operation.id, { productId: current.product_id, quantity: input.quantity, sizeCode: current.size_code });
    await applyBalanceMovement(client, { lineId, locationId: input.destinationLocationId, productId: current.product_id, quantity: input.quantity, direction: "in", actorId: identity.id, sizeCode: current.size_code });
    await client.query("insert into public.employee_item_custody_returns (custody_id, return_operation_line_id, received_by_user_id, returned_quantity, notes) values ($1, $2, $3, $4, $5)", [input.custodyId, lineId, identity.id, input.quantity, input.notes ?? null]);
    await client.query("update public.employee_item_custodies set returned_quantity = returned_quantity + $2, updated_at = now() where id = $1", [input.custodyId, input.quantity]);
    await audit(client, identity, operation.id, "employee_item_returned", { custodyId: input.custodyId, quantity: input.quantity });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function returnStockItem(input: { productId: string; destinationLocationId: string; quantity: number; sizeCode?: string; employeeId?: string; notes?: string }, identity: PortalIdentity) {
  await assertPermission(identity, "almoxarifado-devolucoes", "manage");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A quantidade devolvida deve ser maior que zero." });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    await ensureFulfiller(identity, client);
    const location = await client.query<{ warehouse_id: string }>("select warehouse_id from public.stock_locations where id = $1 and active", [input.destinationLocationId]);
    if (!location.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Local de estoque não encontrado." });
    const operation = await createOperation(client, { type: "return", status: "posted", actor: identity, requesterEmployeeId: input.employeeId, destinationWarehouseId: location.rows[0].warehouse_id, destinationLocationId: input.destinationLocationId, notes: input.notes });
    const lineId = await createLine(client, operation.id, { productId: input.productId, quantity: input.quantity, sizeCode: input.sizeCode });
    await applyBalanceMovement(client, { lineId, locationId: input.destinationLocationId, productId: input.productId, quantity: input.quantity, direction: "in", actorId: identity.id, sizeCode: input.sizeCode });
    await audit(client, identity, operation.id, "stock_item_returned", { productId: input.productId, quantity: input.quantity, employeeId: input.employeeId ?? null });
    await client.query("commit");
    return { id: operation.id, operationNumber: operation.operation_number };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
