import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertApplicationPermission, getSupabasePool, getPortalIdentity, type PortalIdentity } from "../supabasePortal";
import { publicProcedure, router } from "../_core/trpc";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }

async function audit(identity: PortalIdentity, entityType: string, entityId: string, action: string, details: Record<string, unknown> = {}) {
await getSupabasePool().query(
"insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, $2, $3, $4, $5)",
[identity.id, entityType, entityId, action, JSON.stringify(details)]
);
}

export const epiRouter = router({
listCertificates: publicProcedure
.input(z.object({ productId: z.string().uuid().optional() }).optional())
.query(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "cadastros-epis", "view");
const pool = getSupabasePool();
const params: string[] = [];
let query = `        select ec.id, ec.product_id, p.product_code, p.name as product_name,                ec.ca_number, ec.manufacturer, ec.ca_issued_at, ec.ca_expires_at,                ec.status, ec.created_at, ec.updated_at         from public.epi_certificates ec         join public.products p on p.id = ec.product_id         where 1=1      `;
if (input?.productId) {
params.push(input.productId);
query += ` and ec.product_id = $${params.length}`;
}
query += ` order by ec.ca_expires_at desc nulls last`;
return (await pool.query(query, params)).rows;
}),
createCertificate: publicProcedure
.input(z.object({
productId: z.string().uuid(),
caNumber: z.string().min(1).max(20),
manufacturer: z.string().optional(),
caIssuedAt: z.string().optional(),
caExpiresAt: z.string().optional(),
}))
.mutation(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "cadastros-epis", "manage");
const pool = getSupabasePool();
const result = await pool.query(
`insert into public.epi_certificates (product_id, ca_number, manufacturer, ca_issued_at, ca_expires_at)          values ($1, $2, $3, $4, $5) returning id`,
[input.productId, input.caNumber, input.manufacturer || null, input.caIssuedAt || null, input.caExpiresAt || null]
);
await audit(identity, "epi_certificate", result.rows[0].id, "created", input);
return { id: result.rows[0].id };
}),
updateCertificate: publicProcedure
.input(z.object({
id: z.string().uuid(),
caNumber: z.string().min(1).max(20).optional(),
manufacturer: z.string().optional(),
caIssuedAt: z.string().optional(),
caExpiresAt: z.string().optional(),
status: z.enum(["active", "expired", "revoked"]).optional(),
}))
.mutation(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "cadastros-epis", "manage");
const pool = getSupabasePool();
const sets: string[] = [];
const params: string[] = [];
const fields = [
["ca_number", input.caNumber],
["manufacturer", input.manufacturer],
["ca_issued_at", input.caIssuedAt],
["ca_expires_at", input.caExpiresAt],
["status", input.status],
] as const;
for (const [field, value] of fields) {
if (value !== undefined) {
params.push(value as string);
sets.push(`${field} = $${params.length}`);
}
}
if (sets.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nada para atualizar." });
params.push(input.id);
await pool.query(`update public.epi_certificates set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
await audit(identity, "epi_certificate", input.id, "updated", input);
return { success: true };
}),
deactivateCertificate: publicProcedure
.input(z.object({ id: z.string().uuid() }))
.mutation(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "cadastros-epis", "manage");
const pool = getSupabasePool();
await pool.query("update public.epi_certificates set status = 'revoked', updated_at = now() where id = $1", [input.id]);
await audit(identity, "epi_certificate", input.id, "deactivated", {});
return { success: true };
}),
listDeliveries: publicProcedure
.input(z.object({
employeeId: z.string().uuid().optional(),
productId: z.string().uuid().optional(),
status: z.enum(["delivered", "returned", "lost", "discarded"]).optional(),
}).optional())
.query(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "entrega-epis", "view");
const pool = getSupabasePool();
const params: string[] = [];
let query = `        select ed.id, ed.product_id, p.product_code, p.name as product_name,                ed.employee_id, e.full_name as employee_name,                ed.ca_number, ed.batch, ed.size, ed.quantity,                ed.delivered_at, ed.expected_return_at, ed.returned_at, ed.returned_quantity,                ed.status, ed.notes, ed.created_at         from public.epi_deliveries ed         join public.products p on p.id = ed.product_id         join public.employees e on e.id = ed.employee_id         where 1=1      `;
if (input?.employeeId) { params.push(input.employeeId); query += ` and ed.employee_id = $${params.length}`; }
if (input?.productId) { params.push(input.productId); query += ` and ed.product_id = $${params.length}`; }
if (input?.status) { params.push(input.status); query += ` and ed.status = $${params.length}`; }
query += ` order by ed.delivered_at desc`;
return (await pool.query(query, params)).rows;
}),
createDelivery: publicProcedure
.input(z.object({
productId: z.string().uuid(),
employeeId: z.string().uuid(),
caNumber: z.string().optional(),
batch: z.string().optional(),
size: z.string().optional(),
quantity: z.number().int().min(1).default(1),
deliveredAt: z.string().optional(),
expectedReturnAt: z.string().optional(),
notes: z.string().optional(),
}))
.mutation(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "entrega-epis", "manage");
const pool = getSupabasePool();
const result = await pool.query(
`insert into public.epi_deliveries           (product_id, employee_id, ca_number, batch, size, quantity, delivered_at, expected_return_at, notes, delivered_by_user_id)          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
[input.productId, input.employeeId, input.caNumber || null, input.batch || null,
input.size || null, input.quantity, input.deliveredAt || null,
input.expectedReturnAt || null, input.notes || null, identity.id]
);
await audit(identity, "epi_delivery", result.rows[0].id, "created", input);
return { id: result.rows[0].id };
}),
returnDelivery: publicProcedure
.input(z.object({
id: z.string().uuid(),
returnedQuantity: z.number().int().min(1).default(1),
notes: z.string().optional(),
}))
.mutation(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "entrega-epis", "manage");
const pool = getSupabasePool();
await pool.query(
`update public.epi_deliveries          set returned_at = current_date, returned_quantity = $2, status = 'returned', notes = $3, updated_at = now()          where id = $1`,
[input.id, input.returnedQuantity, input.notes || null]
);
await audit(identity, "epi_delivery", input.id, "returned", input);
return { success: true };
}),
caAlerts: publicProcedure
.input(z.object({ daysAhead: z.number().int().min(0).max(365).default(30) }).optional())
.query(async ({ input, ctx }) => {
const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
await assertApplicationPermission(identity, "cadastros-epis", "view");
const pool = getSupabasePool();
const days = input?.daysAhead ?? 30;
const result = await pool.query(
`select ec.id, ec.product_id, p.product_code, p.name as product_name,                 ec.ca_number, ec.manufacturer, ec.ca_expires_at, ec.status,                 case                   when ec.status = 'revoked' then 'revogado'                   when ec.ca_expires_at is not null and ec.ca_expires_at < current_date then 'vencido'                   when ec.ca_expires_at is not null and ec.ca_expires_at <= current_date + interval '${days} days' then 'vencendo'                   else 'vigente'                 end as alert_status,                 ec.ca_expires_at - current_date as days_remaining          from public.epi_certificates ec          join public.products p on p.id = ec.product_id          where ec.status = 'active'            and (ec.ca_expires_at is null or ec.ca_expires_at <= current_date + interval '${days} days')          order by ec.ca_expires_at asc nulls last`,
[]
);
return result.rows;
}),
});