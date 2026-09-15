// Regras validadas do Portal de Operações.
// Textos são limpos sem destruir informação; códigos preservam zeros à esquerda,
// sufixos e caracteres alfanuméricos. Não remover ou acrescentar caracteres.
export function cleanSourceText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeProductCode(value: unknown): string {
  return cleanSourceText(value).toUpperCase();
}

export function normalizeBranchCode(value: unknown): string {
  const text = cleanSourceText(value);
  const match = text.match(/^(\d{1,4})/);
  return match ? match[1].padStart(4, '0') : text;
}

export function normalizeSupplierKey(code: unknown, store: unknown): string {
  return `${cleanSourceText(code)}|${cleanSourceText(store)}`;
}

export function normalizePurchaseOrderKey(branch: unknown, number: unknown, item?: unknown): string {
  const base = `${normalizeBranchCode(branch)}|${cleanSourceText(number)}`;
  return item === undefined ? base : `${base}|${cleanSourceText(item)}`;
}

export function normalizeInvoiceKey(branch: unknown, invoice: unknown, series: unknown, supplier: unknown, accessKey?: unknown): string {
  const access = cleanSourceText(accessKey);
  return access || `${normalizeBranchCode(branch)}|${cleanSourceText(invoice)}|${cleanSourceText(series)}|${cleanSourceText(supplier)}`;
}

export function parseSourceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cleanSourceText(value);
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

export type OperationCode = 'AUTOPECAS' | 'SERVICOS' | 'INDUSTRIA' | 'IMPLEMENTOS';

export function classifyOperation(input: { branch?: unknown; uf?: unknown; department?: unknown }): OperationCode | null {
  const branch = normalizeBranchCode(input.branch);
  const uf = cleanSourceText(input.uf).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const department = cleanSourceText(input.department).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (branch === '0105' || uf === 'INDUSTRIA' || department.startsWith('IND -')) return 'INDUSTRIA';
  if (department === 'OFICINAS') return 'SERVICOS';
  if (department === 'IMPLEMENTOS') return 'IMPLEMENTOS';
  if (department === 'PECAS') return 'AUTOPECAS';
  return null;
}
