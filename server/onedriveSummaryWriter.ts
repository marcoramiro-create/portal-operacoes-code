// ============================================================
// onedriveSummaryWriter.ts — ESCRITA ATÔMICA das versões resumidas
// ============================================================
// Ciclo (write-then-delete):
//   1. Grava <produto>-resumida.tmp.csv
//   2. Reabre o .tmp e valida (linhas > 0, colunas = schema)
//   3. Apaga <produto>-resumida.csv anterior
//   4. Renomeia .tmp → <produto>-resumida.csv
//
// Garantia: em nenhum momento o produto fica sem versão resumida válida.
// Pior caso = .tmp órfão, removido por cleanupOrphanTemps() na próxima execução.
//
// INJEÇÃO DE DEPENDÊNCIA: o cliente OneDrive é recebido por parâmetro.
// Este arquivo NÃO importa oneDriveOAuth.ts — compila e testa sem OAuth.
// ============================================================

import {
  assertProductConfigured,
  isProductConfigured,
  SUMMARY_SCHEMAS,
  type ProductCode,
  type ProductSchema,
} from "./onedriveSummarySchemas";

// ─── Interface do cliente OneDrive ─────────────────────────────
// Implementada pelo oneDriveOAuth.ts real e pelo fake dos testes.
export interface OneDriveClient {
  /** Lê um arquivo como texto. Lança se não existir. */
  readText(path: string): Promise<string>;
  /** Grava (cria ou sobrescreve) um arquivo. */
  writeText(path: string, content: string): Promise<void>;
  /** Apaga um arquivo. Não lança se não existir. */
  deleteFile(path: string): Promise<void>;
  /** Renomeia/move um arquivo. */
  rename(fromPath: string, toPath: string): Promise<void>;
  /** Lista arquivos de uma pasta. */
  listFiles(folder: string): Promise<string[]>;
}

// ─── Tipos ─────────────────────────────────────────────────────
export type SourceRow = Record<string, string>;

export type SummaryRow = Record<string, string>;

export type WriteResult = {
  product: ProductCode;
  rowsWritten: number;
  columnsWritten: number;
  finalPath: string;
  bytesWritten: number;
};

// ─── CSV helpers ───────────────────────────────────────────────
const DELIMITER = ";";

function escapeCsvField(value: string): string {
  if (value.includes(DELIMITER) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeCsv(columns: string[], rows: SummaryRow[]): string {
  const header = columns.map(escapeCsvField).join(DELIMITER);
  const body = rows.map((row) => columns.map((col) => escapeCsvField(row[col] ?? "")).join(DELIMITER));
  return [header, ...body].join("\r\n") + "\r\n";
}

function parseCsv(content: string): { header: string[]; rows: SummaryRow[] } {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) return { header: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === DELIMITER && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: SummaryRow = {};
    header.forEach((col, idx) => {
      row[col] = values[idx] ?? "";
    });
    return row;
  });
  return { header, rows };
}

// ─── Projeção de colunas (pura, sem I/O) ───────────────────────
/**
 * Projeta apenas as colunas do schema, preservando TODAS as linhas.
 * Lança se alguma coluna obrigatória estiver ausente no original.
 */
export function projectColumns(sourceRows: SourceRow[], schema: ProductSchema): SummaryRow[] {
  if (!sourceRows.length) return [];

  const availableColumns = new Set(Object.keys(sourceRows[0]));
  const missing = schema.requiredColumns.filter((col) => !availableColumns.has(col));
  if (missing.length) {
    throw new Error(
      `Colunas obrigatórias ausentes no arquivo original: ${missing.join(", ")}. ` +
        `Colunas disponíveis: ${Array.from(availableColumns).join(", ")}.`,
    );
  }

  return sourceRows.map((row) => {
    const projected: SummaryRow = {};
    for (const col of schema.columns) {
      projected[col] = row[col] ?? "";
    }
    return projected;
  });
}

// ─── Caminhos ──────────────────────────────────────────────────
function summaryPath(schema: ProductSchema): string {
  return `${schema.folder}/${schema.fileName}`;
}

function tempPath(schema: ProductSchema): string {
  return `${schema.folder}/${schema.fileName}.tmp`;
}

// ─── Escrita atômica ───────────────────────────────────────────
/**
 * Grava a versão resumida com atomicidade write-then-delete.
 *
 * Etapas:
 *   1. Serializa e grava o .tmp
 *   2. Reabre o .tmp e valida (linhas > 0, header = schema.columns)
 *   3. Apaga o arquivo final anterior
 *   4. Renomeia .tmp → final
 *
 * Em qualquer falha, o arquivo final anterior permanece intacto
 * (exceto se a falha ocorrer na etapa 4, quando o .tmp fica órfão
 * para retry — cleanupOrphanTemps() remove na próxima execução).
 */
export async function writeSummaryAtomic(
  product: ProductCode,
  rows: SummaryRow[],
  client: OneDriveClient,
): Promise<WriteResult> {
  const schema = assertProductConfigured(product);

  if (!rows.length) {
    throw new Error(`Nenhuma linha para gravar no produto ${product}. Abortando para não gerar arquivo vazio.`);
  }

  const finalPath = summaryPath(schema);
  const tmpPath = tempPath(schema);
  const content = serializeCsv(schema.columns, rows);

  // Etapa 1 — grava o .tmp
  await client.writeText(tmpPath, content);

  // Etapa 2 — reabre e valida
  const written = await client.readText(tmpPath);
  const parsed = parseCsv(written);

  if (parsed.rows.length !== rows.length) {
    await client.deleteFile(tmpPath).catch(() => undefined);
    throw new Error(
      `Validação falhou: esperadas ${rows.length} linhas, encontradas ${parsed.rows.length} no .tmp.`,
    );
  }

  const headerMatches =
    parsed.header.length === schema.columns.length &&
    parsed.header.every((col, idx) => col === schema.columns[idx]);

  if (!headerMatches) {
    await client.deleteFile(tmpPath).catch(() => undefined);
    throw new Error(
      `Validação falhou: cabeçalho do .tmp não corresponde ao schema. ` +
        `Esperado: [${schema.columns.join(", ")}]. Encontrado: [${parsed.header.join(", ")}].`,
    );
  }

  // Etapa 3 — apaga o anterior
  await client.deleteFile(finalPath);

  // Etapa 4 — renomeia
  await client.rename(tmpPath, finalPath);

  return {
    product,
    rowsWritten: rows.length,
    columnsWritten: schema.columns.length,
    finalPath,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}

// ─── Limpeza de órfãos ─────────────────────────────────────────
/**
 * Remove arquivos .tmp órfãos de todos os produtos configurados.
 * Chamado no início de cada ciclo de atualização.
 * Retorna a quantidade de arquivos removidos.
 */
export async function cleanupOrphanTemps(client: OneDriveClient): Promise<number> {
  let removed = 0;

  for (const product of Object.keys(SUMMARY_SCHEMAS) as ProductCode[]) {
    if (!isProductConfigured(product)) continue;

    const schema = SUMMARY_SCHEMAS[product];
    const tmpName = `${schema.fileName}.tmp`;

    try {
      const files = await client.listFiles(schema.folder);
      if (files.some((f) => f === tmpName || f.endsWith(`/${tmpName}`))) {
        await client.deleteFile(tempPath(schema));
        removed++;
      }
    } catch {
      // Pasta inexistente ou inacessível — segue para o próximo produto.
    }
  }

  return removed;
}

// ─── Leitura da resumida (para o pipeline consumir) ────────────
/**
 * Lê a versão resumida do OneDrive e devolve as linhas.
 * Usado pelo pipeline para gravar em operational_source_rows —
 * garante que o que vai ao banco é exatamente o que está no OneDrive.
 */
export async function readSummary(product: ProductCode, client: OneDriveClient): Promise<SummaryRow[]> {
  const schema = assertProductConfigured(product);
  const content = await client.readText(summaryPath(schema));
  return parseCsv(content).rows;
}