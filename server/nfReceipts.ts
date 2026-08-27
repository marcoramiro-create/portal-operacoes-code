import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, getSupabasePool, PortalIdentity } from "./supabasePortal";

export type CaptureMethod = "manual" | "camera" | "barcode_reader";

export function normalizeNfAccessKey(value: string) { return value.replace(/\D/g, ""); }

export function parseNfAccessKey(value: string) {
  const accessKey = normalizeNfAccessKey(value);
  if (!/^\d{44}$/.test(accessKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "A chave de acesso da NF deve possuir exatamente 44 dígitos numéricos." });
  return { accessKey, issuedYearMonth: accessKey.slice(2, 6), issuerCnpj: accessKey.slice(6, 20), invoiceModel: accessKey.slice(20, 22), invoiceSeries: accessKey.slice(22, 25), invoiceNumber: accessKey.slice(25, 34) };
}

type NfReceiptRow = { id: string; access_key: string; issuer_cnpj: string; invoice_model: string; invoice_series: string; invoice_number: string; issued_year_month: string; capture_method: CaptureMethod; captured_at: Date; captured_by: string | null; protheus_sc7_reference: string | null; nf_legal_reference: string | null; matched_at: Date | null; supplier_code: string | null; supplier_store: string | null; supplier_legal_name: string | null; supplier_trade_name: string | null };

function mapNfReceiptRow(row: NfReceiptRow) {
  return { id: row.id, accessKey: row.access_key, issuerCnpj: row.issuer_cnpj, invoiceModel: row.invoice_model, invoiceSeries: row.invoice_series, invoiceNumber: row.invoice_number, issuedYearMonth: row.issued_year_month, captureMethod: row.capture_method, capturedAt: row.captured_at, capturedBy: row.captured_by, protheusSc7Reference: row.protheus_sc7_reference, nfLegalReference: row.nf_legal_reference, matchedAt: row.matched_at, supplier: row.supplier_code ? { code: row.supplier_code, store: row.supplier_store, legalName: row.supplier_legal_name, tradeName: row.supplier_trade_name } : null };
}

export async function listRecentNfReceipts(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "view");
  const result = await getSupabasePool().query<NfReceiptRow>(
    `select receipt.id, receipt.access_key, receipt.issuer_cnpj, receipt.invoice_model, receipt.invoice_series, receipt.invoice_number, receipt.issued_year_month, receipt.capture_method, receipt.captured_at, user_record.display_name as captured_by, receipt.protheus_sc7_reference, receipt.nf_legal_reference, receipt.matched_at, supplier_match.supplier_code, supplier_match.store_code as supplier_store, supplier_match.legal_name as supplier_legal_name, supplier_match.trade_name as supplier_trade_name
     from public.nf_receipts receipt join public.portal_users user_record on user_record.id = receipt.captured_by_user_id left join lateral (select supplier.supplier_code, supplier.store_code, supplier.legal_name, supplier.trade_name from public.suppliers supplier where supplier.active = true and regexp_replace(coalesce(supplier.document_number, ''), '[^0-9]', '', 'g') = receipt.issuer_cnpj order by supplier.supplier_code, supplier.store_code limit 1) supplier_match on true
     order by receipt.captured_at desc limit 50`,
  );
  return result.rows.map(mapNfReceiptRow);
}

export async function listNfReceiptsForExport(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "view");
  const result = await getSupabasePool().query<NfReceiptRow>(
    `select receipt.id, receipt.access_key, receipt.issuer_cnpj, receipt.invoice_model, receipt.invoice_series, receipt.invoice_number, receipt.issued_year_month, receipt.capture_method, receipt.captured_at, user_record.display_name as captured_by, receipt.protheus_sc7_reference, receipt.nf_legal_reference, receipt.matched_at, supplier_match.supplier_code, supplier_match.store_code as supplier_store, supplier_match.legal_name as supplier_legal_name, supplier_match.trade_name as supplier_trade_name
     from public.nf_receipts receipt join public.portal_users user_record on user_record.id = receipt.captured_by_user_id left join lateral (select supplier.supplier_code, supplier.store_code, supplier.legal_name, supplier.trade_name from public.suppliers supplier where supplier.active = true and regexp_replace(coalesce(supplier.document_number, ''), '[^0-9]', '', 'g') = receipt.issuer_cnpj order by supplier.supplier_code, supplier.store_code limit 1) supplier_match on true
     order by receipt.captured_at desc limit 10000`,
  );
  return result.rows.map(mapNfReceiptRow);
}

export async function createNfReceipt(input: { accessKey: string; captureMethod: CaptureMethod }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "manage");
  const parsed = parseNfAccessKey(input.accessKey);
  try {
    const result = await getSupabasePool().query<{ id: string; captured_at: Date }>(
      `insert into public.nf_receipts (access_key, issuer_cnpj, invoice_model, invoice_series, invoice_number, issued_year_month, capture_method, captured_by_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, captured_at`,
      [parsed.accessKey, parsed.issuerCnpj, parsed.invoiceModel, parsed.invoiceSeries, parsed.invoiceNumber, parsed.issuedYearMonth, input.captureMethod, identity.id],
    );
    await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'nf_receipt', $2, 'captured', jsonb_build_object('capture_method', $3::text, 'access_key_suffix', $4::text))", [identity.id, result.rows[0].id, input.captureMethod, parsed.accessKey.slice(-6)]);
    const supplierResult = await getSupabasePool().query<{ supplier_code: string; store_code: string; legal_name: string; trade_name: string | null }>("select supplier.supplier_code, supplier.store_code, supplier.legal_name, supplier.trade_name from public.suppliers supplier where supplier.active = true and regexp_replace(coalesce(supplier.document_number, ''), '[^0-9]', '', 'g') = $1 order by supplier.supplier_code, supplier.store_code limit 1", [parsed.issuerCnpj]);
    const supplierRow = supplierResult.rows[0];
    const supplier = supplierRow ? { code: supplierRow.supplier_code, store: supplierRow.store_code, legalName: supplierRow.legal_name, tradeName: supplierRow.trade_name } : null;
    return { id: result.rows[0].id, capturedAt: result.rows[0].captured_at, ...parsed, supplier };
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Esta chave de acesso já foi registrada anteriormente." });
    throw error;
  }
}
