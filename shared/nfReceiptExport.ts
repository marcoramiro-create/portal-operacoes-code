export type NfReceiptExportSource = {
  accessKey: string;
  issuerCnpj: string;
  invoiceModel: string;
  invoiceSeries: string;
  invoiceNumber: string;
  issuedYearMonth: string;
  captureMethod: "manual" | "camera" | "barcode_reader";
  capturedAt: Date;
  capturedBy: string | null;
  protheusSc7Reference: string | null;
  nfLegalReference: string | null;
  matchedAt: Date | null;
  supplier: { code: string; store: string | null; legalName: string | null; tradeName: string | null } | null;
};

const captureMethodLabels: Record<NfReceiptExportSource["captureMethod"], string> = {
  manual: "Digitação",
  camera: "Câmera",
  barcode_reader: "Leitor de mesa",
};

const formatDateTime = (value: Date | null) => value ? value.toLocaleString("pt-BR") : "";

export function formatNfReceiptExportRows(rows: NfReceiptExportSource[]) {
  return rows.map(row => ({
    "Chave de acesso": row.accessKey,
    "CNPJ emitente": row.issuerCnpj,
    "Fornecedor": row.supplier?.tradeName || row.supplier?.legalName || "Não identificado",
    "Código fornecedor": row.supplier?.code ?? "",
    "Loja fornecedor": row.supplier?.store ?? "",
    "Modelo NF": row.invoiceModel,
    "Série NF": row.invoiceSeries,
    "Número NF": row.invoiceNumber,
    "Ano/mês emissão": row.issuedYearMonth,
    "Modo de coleta": captureMethodLabels[row.captureMethod],
    "Usuário da leitura": row.capturedBy ?? "Usuário do portal",
    "Data/hora da leitura": formatDateTime(row.capturedAt),
    "Referência SC7 Protheus": row.protheusSc7Reference ?? "",
    "Referência NF Legal": row.nfLegalReference ?? "",
    "Data/hora do cruzamento": formatDateTime(row.matchedAt),
  }));
}
