import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, getSupabasePool, type PortalIdentity } from "./supabasePortal";
// ============================================================
// Recebimento corporativo — PONTO DE LEITURA + DESCARGA + CONTROLE (23/09/2026)
// REGRA: o usuário indica DE ONDE está lendo a cada captura.
// A MESMA NF pode ser lida em vários pontos (chave única por:
// chave + usuário + ponto).
// DESCARGA: transportadora (referência do cadastro SA4 OU texto livre,
// nunca restritivo) + placa do veículo.
// CONTROLE: editar ponto (auditoria) + excluir controlado (registro preservado).
// ============================================================
export const READING_POINTS = ["descarga", "recebimento", "conferencia", "envio_fiscal"] as const;
export type ReadingPoint = (typeof READING_POINTS)[number];
export function isReadingPoint(value: unknown): value is ReadingPoint {
  return typeof value === "string" && (READING_POINTS as readonly string[]).includes(value);
}
export type CaptureMethod = "manual" | "camera" | "barcode_reader";
export function normalizeNfAccessKey(value: string) { return value.replace(/\D/g, ""); }
export function parseNfAccessKey(value: string) {
  const accessKey = normalizeNfAccessKey(value);
  if (!/^\d{44}$/.test(accessKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "A chave de acesso da NF deve possuir exatamente 44 dígitos numéricos." });
  return { accessKey, issuedYearMonth: accessKey.slice(2, 6), issuerCnpj: accessKey.slice(6, 20), invoiceModel: accessKey.slice(20, 22), invoiceSeries: accessKey.slice(22, 25), invoiceNumber: accessKey.slice(25, 34) };
}
type NfReceiptRow = {
  id: string; access_key: string; issuer_cnpj: string; invoice_model: string; invoice_series: string; invoice_number: string;
  issued_year_month: string; capture_method: CaptureMethod; reading_point: ReadingPoint; captured_at: Date; captured_by: string | null;
  protheus_sc7_reference: string | null; nf_legal_reference: string | null; matched_at: Date | null;
  supplier_code: string | null; supplier_store: string | null; supplier_legal_name: string | null; supplier_trade_name: string | null;
  carrier_id: string | null; carrier_display_name: string | null; carrier_name: string | null; vehicle_plate: string | null;
};
function mapNfReceiptRow(row: NfReceiptRow) {
  return {
    id: row.id, accessKey: row.access_key, issuerCnpj: row.issuer_cnpj, invoiceModel: row.invoice_model,
    invoiceSeries: row.invoice_series, invoiceNumber: row.invoice_number, issuedYearMonth: row.issued_year_month,
    captureMethod: row.capture_method, readingPoint: row.reading_point, capturedAt: row.captured_at, capturedBy: row.captured_by,
    protheusSc7Reference: row.protheus_sc7_reference, nfLegalReference: row.nf_legal_reference, matchedAt: row.matched_at,
    supplier: row.supplier_code ? { code: row.supplier_code, store: row.supplier_store, legalName: row.supplier_legal_name, tradeName: row.supplier_trade_name } : null,
    carrierId: row.carrier_id, carrierName: row.carrier_name || row.carrier_display_name, vehiclePlate: row.vehicle_plate,
  };
}
const NF_RECEIPT_SELECT = `select receipt.id, receipt.access_key, receipt.issuer_cnpj, receipt.invoice_model, receipt.invoice_series, receipt.invoice_number, receipt.issued_year_month, receipt.capture_method, receipt.reading_point, receipt.captured_at, user_record.display_name as captured_by, receipt.protheus_sc7_reference, receipt.nf_legal_reference, receipt.matched_at, supplier_match.supplier_code, supplier_match.store_code as supplier_store, supplier_match.legal_name as supplier_legal_name, supplier_match.trade_name as supplier_trade_name, receipt.carrier_id, carrier.name as carrier_display_name, receipt.carrier_name, receipt.vehicle_plate
     from public.nf_receipts receipt join public.portal_users user_record on user_record.id = receipt.captured_by_user_id left join lateral (select supplier.supplier_code, supplier.store_code, supplier.legal_name, supplier.trade_name from public.suppliers supplier where supplier.active = true and regexp_replace(coalesce(supplier.document_number, ''), '[^0-9]', '', 'g') = receipt.issuer_cnpj order by supplier.supplier_code, supplier.store_code limit 1) supplier_match on true left join public.transportadoras carrier on carrier.id = receipt.carrier_id
     where receipt.deleted_at is null`;
export async function listRecentNfReceipts(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "view");
  const result = await getSupabasePool().query<NfReceiptRow>(`${NF_RECEIPT_SELECT} order by receipt.captured_at desc limit 50`);
  return result.rows.map(mapNfReceiptRow);
}
export async function listNfReceiptsForExport(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "view");
  const result = await getSupabasePool().query<NfReceiptRow>(`${NF_RECEIPT_SELECT} order by receipt.captured_at desc limit 10000`);
  return result.rows.map(mapNfReceiptRow);
}
export async function createNfReceipt(input: { accessKey: string; captureMethod: CaptureMethod; readingPoint: ReadingPoint; carrierId?: string | null; carrierName?: string | null; vehiclePlate?: string | null }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "manage");
  if (!isReadingPoint(input.readingPoint)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o ponto de leitura: Descarga, Recebimento, Conferência ou Envio ao fiscal." });
  const parsed = parseNfAccessKey(input.accessKey);
  const carrierId = input.carrierId || null;
  const carrierName = (input.carrierName || "").trim() || null;
  const vehiclePlate = (input.vehiclePlate || "").trim().toUpperCase() || null;
  try {
    const result = await getSupabasePool().query<{ id: string; captured_at: Date }>(
      `insert into public.nf_receipts (access_key, issuer_cnpj, invoice_model, invoice_series, invoice_number, issued_year_month, capture_method, reading_point, captured_by_user_id, carrier_id, carrier_name, vehicle_plate)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id, captured_at`,
      [parsed.accessKey, parsed.issuerCnpj, parsed.invoiceModel, parsed.invoiceSeries, parsed.invoiceNumber, parsed.issuedYearMonth, input.captureMethod, input.readingPoint, identity.id, carrierId, carrierName, vehiclePlate],
    );
    await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'nf_receipt', $2, 'captured', jsonb_build_object('capture_method', $3::text, 'reading_point', $4::text, 'access_key_suffix', $5::text))", [identity.id, result.rows[0].id, input.captureMethod, input.readingPoint, parsed.accessKey.slice(-6)]);
    const supplierResult = await getSupabasePool().query<{ supplier_code: string; store_code: string; legal_name: string; trade_name: string | null }>("select supplier.supplier_code, supplier.store_code, supplier.legal_name, supplier.trade_name from public.suppliers supplier where supplier.active = true and regexp_replace(coalesce(supplier.document_number, ''), '[^0-9]', '', 'g') = $1 order by supplier.supplier_code, supplier.store_code limit 1", [parsed.issuerCnpj]);
    const supplierRow = supplierResult.rows[0];
    const supplier = supplierRow ? { code: supplierRow.supplier_code, store: supplierRow.store_code, legalName: supplierRow.legal_name, tradeName: supplierRow.trade_name } : null;
    return { id: result.rows[0].id, capturedAt: result.rows[0].captured_at, ...parsed, supplier };
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Esta chave já foi registrada neste ponto de leitura pelo mesmo usuário." });
    throw error;
  }
}
// ============================================================
// CONTROLE (23/09/2026) — edição do ponto + exclusão controlada.
// ============================================================
// BLOCO 2 (25/09/2026): correção da permissão de edição/exclusão.
// O portal só conhece os níveis view/manage/approve — o nível "admin" não existe,
// por isso ninguém (nem o administrador técnico) conseguia corrigir ponto ou remover leitura.
// Agora: administrador técnico (is_development_admin) OU quem tem permissão "manage"
// no módulo chaves-nf pode editar/excluir, sempre com motivo obrigatório e auditoria.
async function assertNfReceiptAdmin(identity: PortalIdentity) {
  if (identity.isDevelopmentAdmin) return;
  await assertApplicationPermission(identity, "chaves-nf", "manage");
}
export async function updateNfReceiptReadingPoint(input: { id: string; readingPoint: ReadingPoint; reason: string }, identity: PortalIdentity) {
  await assertNfReceiptAdmin(identity);
  if (!isReadingPoint(input.readingPoint)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o ponto de leitura." });
  const reason = input.reason.trim();
  if (!reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da alteração." });
  const current = await getSupabasePool().query<{ reading_point: ReadingPoint }>("select reading_point from public.nf_receipts where id = $1 and deleted_at is null", [input.id]);
  if (!current.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Leitura não encontrada." });
  const previous = current.rows[0].reading_point;
  if (previous === input.readingPoint) throw new TRPCError({ code: "BAD_REQUEST", message: "O ponto de leitura já está como selecionado." });
  await getSupabasePool().query("update public.nf_receipts set reading_point = $1 where id = $2", [input.readingPoint, input.id]);
  await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'nf_receipt', $2, 'reading_point_changed', jsonb_build_object('from', $3::text, 'to', $4::text, 'reason', $5::text))", [identity.id, input.id, previous, input.readingPoint, reason]);
  return { id: input.id, previous, readingPoint: input.readingPoint };
}
export async function softDeleteNfReceipt(input: { id: string; reason: string }, identity: PortalIdentity) {
  await assertNfReceiptAdmin(identity);
  const reason = input.reason.trim();
  if (!reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da exclusão." });
  const current = await getSupabasePool().query<{ access_key: string }>("select access_key from public.nf_receipts where id = $1 and deleted_at is null", [input.id]);
  if (!current.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Leitura não encontrada." });
  await getSupabasePool().query("update public.nf_receipts set deleted_at = now(), deleted_by_user_id = $1, delete_reason = $2 where id = $3", [identity.id, reason, input.id]);
  await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'nf_receipt', $2, 'deleted', jsonb_build_object('reason', $3::text, 'access_key_suffix', $4::text))", [identity.id, input.id, reason, current.rows[0].access_key.slice(-6)]);
  return { id: input.id, deleted: true };
}