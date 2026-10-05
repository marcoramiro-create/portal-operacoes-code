// ============================================================
// Exportação do Recebimento de NF — inclui Ponto de leitura,
// Transportadora e Placa (23/09/2026).
// ============================================================
export function formatNfNumber(value?: string | null) {
  return (value || "").padStart(9, "0");
}

const readingPointLabels: Record<string, string> = {
  descarga: "Descarga", recebimento: "Recebimento", conferencia: "Conferência", envio_fiscal: "Envio ao fiscal",
};
const captureMethodLabels: Record<string, string> = {
  manual: "Digitação", camera: "Câmera", barcode_reader: "Leitor de mesa",
};

type ExportRow = {
  accessKey: string; invoiceNumber: string; invoiceSeries: string; issuerCnpj: string;
  readingPoint: string; captureMethod: string; capturedAt: Date | string; capturedBy?: string | null;
  carrierName?: string | null; vehiclePlate?: string | null;
  supplier?: { code: string; store: string; legalName?: string | null; tradeName?: string | null } | null;
};

export function formatNfReceiptExportRows(rows: ExportRow[]) {
  return rows.map(row => ({
    "Chave de acesso": row.accessKey,
    "NF": formatNfNumber(row.invoiceNumber),
    "Série": row.invoiceSeries || "",
    "CNPJ Emitente": row.issuerCnpj,
    "Fornecedor": row.supplier ? (row.supplier.tradeName || row.supplier.legalName || "") : "",
    "Código": row.supplier ? row.supplier.code : "",
    "Loja": row.supplier ? row.supplier.store : "",
    "Ponto de leitura": readingPointLabels[row.readingPoint] ?? row.readingPoint,
    "Forma de captura": captureMethodLabels[row.captureMethod] ?? row.captureMethod,
    "Usuário": row.capturedBy ?? "",
    "Data e hora": new Date(row.capturedAt).toLocaleString("pt-BR"),
    "Transportadora": row.carrierName ?? "",
    "Placa do veículo": row.vehiclePlate ?? "",
  }));
}