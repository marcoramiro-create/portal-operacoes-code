import { TRPCError } from "@trpc/server";
import type { PoolClient } from "pg";
import { assertApplicationPermission, getSupabasePool, PortalIdentity } from "./supabasePortal";

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
  const result = await getSupabasePool().query<{ product_code: string; product_name: string; unit_of_measure: string; branch_code: string; warehouse_code: string; warehouse_name: string; location_code: string; location_name: string; on_hand_quantity: string; reserved_quantity: string; minimum_quantity: string | null; maximum_quantity: string | null; safety_days: number | null; coverage_days: number | null }>(
    `select product.product_code, product.name as product_name, product.unit_of_measure, branch.code as branch_code, warehouse.code as warehouse_code, warehouse.name as warehouse_name, location.code as location_code, location.name as location_name, balance.on_hand_quantity::text, balance.reserved_quantity::text, policy.minimum_quantity::text, policy.maximum_quantity::text, policy.safety_days, policy.coverage_days
     from public.stock_balances balance join public.products product on product.id = balance.product_id join public.stock_locations location on location.id = balance.stock_location_id join public.warehouses warehouse on warehouse.id = location.warehouse_id join public.branches branch on branch.id = warehouse.branch_id left join public.stock_policies policy on policy.product_id = product.id and policy.warehouse_id = warehouse.id
     order by branch.code, warehouse.code, location.code, product.product_code`,
  );
  return result.rows.map(row => ({ productCode: row.product_code, productName: row.product_name, unitOfMeasure: row.unit_of_measure, branchCode: row.branch_code, warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, locationCode: row.location_code, locationName: row.location_name, onHandQuantity: Number(row.on_hand_quantity), reservedQuantity: Number(row.reserved_quantity), minimumQuantity: row.minimum_quantity === null ? null : Number(row.minimum_quantity), maximumQuantity: row.maximum_quantity === null ? null : Number(row.maximum_quantity), safetyDays: row.safety_days, coverageDays: row.coverage_days }));
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
