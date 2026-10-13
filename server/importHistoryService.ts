import { getBusinessPool, getSupabasePool } from "./supabasePortal";
import type { QueryResultRow } from "pg";

export type ImportHistoryRow = {
  source: string;
  sourceKind: string;
  fileName: string;
  fileDate: string | null;
  importedAt: string | null;
  rowCount: number | null;
  status: string;
  environment: string;
};

function dateFromFileName(fileName: string): string | null {
  const match = fileName.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})(?:[_-]?(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function safeQuery<T extends QueryResultRow>(pool: ReturnType<typeof getBusinessPool> | ReturnType<typeof getSupabasePool>, sql: string): Promise<T[]> {
  try { return (await pool.query<T>(sql)).rows; } catch { return []; }
}

export async function listImportHistory(): Promise<ImportHistoryRow[]> {
  const business = getBusinessPool();
  const portal = getSupabasePool();
  const environment = process.env.NODE_ENV === "production" ? "Homologação/VM" : "Preview";
  const rows: ImportHistoryRow[] = [];

  const operational = await safeQuery<{ source_kind: string; file_name: string; imported_at: string; row_count: number; status: string }>(portal, `
    select source_kind, file_name, imported_at, row_count, status
      from public.operational_import_batches
     order by imported_at desc
  `);
  rows.push(...operational.map(row => ({ source: "Importação operacional", sourceKind: row.source_kind, fileName: row.file_name, fileDate: dateFromFileName(row.file_name), importedAt: row.imported_at, rowCount: Number(row.row_count ?? 0), status: row.status, environment })));

  const purchases = await safeQuery<{ file_name: string; imported_at: string; row_count: number; status: string }>(business, `
    select "fileName" as file_name, "importedAt" as imported_at, "rowCount" as row_count, status
      from public."protheusImports"
     order by "importedAt" desc
  `);
  rows.push(...purchases.map(row => ({ source: "Compras Protheus", sourceKind: "COMPRAS", fileName: row.file_name, fileDate: dateFromFileName(row.file_name), importedAt: row.imported_at, rowCount: Number(row.row_count ?? 0), status: row.status, environment })));

  const references = await safeQuery<{ kind: string; file_name: string; imported_at: string; row_count: number }>(portal, `
    select kind, "fileName" as file_name, "importedAt" as imported_at, "rowCount" as row_count
      from public."referenceImports"
     order by "importedAt" desc
  `);
  rows.push(...references.map(row => ({ source: "Cadastros Protheus", sourceKind: row.kind, fileName: row.file_name, fileDate: dateFromFileName(row.file_name), importedAt: row.imported_at, rowCount: Number(row.row_count ?? 0), status: "importado", environment })));

  const costs = await safeQuery<{ segment: string; file_name: string; imported_at: string; item_count: number; status: string }>(business, `
    select segment, "fileName" as file_name, "importedAt" as imported_at, "itemCount" as item_count, status
      from public."costEvolutionImports"
     order by "importedAt" desc
  `);
  rows.push(...costs.map(row => ({ source: row.segment === "industry" ? "Evolução de custos · Indústria" : "Evolução de custos · Autopeças", sourceKind: row.segment, fileName: row.file_name, fileDate: dateFromFileName(row.file_name), importedAt: row.imported_at, rowCount: Number(row.item_count ?? 0), status: row.status, environment })));

  return rows.sort((a, b) => String(b.importedAt ?? "").localeCompare(String(a.importedAt ?? "")));
}
