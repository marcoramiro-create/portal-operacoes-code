import { and, desc, eq, sql } from "drizzle-orm";
import { costEvolutionImports } from "../drizzle/schema";
import { getDb } from "./db";
import { parseCostEvolutionWorkbook, type CostEvolutionSegment } from "./costEvolution";

export type CostEvolutionFilters = {
  segment: CostEvolutionSegment;
  branch?: string;
  mrp?: "Sim" | "Não";
  buyer?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

type CostRecordRow = {
  sheetType: "pecas" | "industria";
  filial: string;
  codAgregado: string;
  codigo: string;
  entraMrp: boolean;
  descricao: string;
  compradorCodigo: string | null;
  compradorNome: string | null;
  ultimaCompra: string | null;
  ultimoPreco: number | null;
  period: string;
  custoMedio: number;
  sourceFile: string;
  importedAt: Date;
};

const asBusinessDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function splitBuyerCodeName(buyer: string): { code: string | null; name: string | null } {
  const normalized = (buyer || "").replace(/\s+/g, " ").trim();
  if (!normalized) return { code: null, name: null };
  const match = /^(\d+)\s*[-–—]?\s*(.*)$/.exec(normalized);
  if (match) return { code: match[1], name: (match[2] || "").trim() || null };
  return { code: null, name: normalized };
}

function toCostRecordPeriod(balanceDate: string): string {
  return balanceDate.slice(0, 7).replace("-", "");
}

function toCostRecordPurchaseDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

export async function commitCostEvolutionImport(input: {
  fileName: string;
  contentBase64: string;
  segment: CostEvolutionSegment;
  importedBy: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const buffer = Buffer.from(input.contentBase64, "base64");
  const parsed = parseCostEvolutionWorkbook(input.fileName, buffer, input.segment);
  if (parsed.issues.length)
    throw new Error(`A planilha contém ${parsed.issues.length} erro(s) de validação. Revise a prévia antes de confirmar.`);
  if (!parsed.rows.length) throw new Error("A planilha não contém itens válidos para importação.");

  return db.transaction(async (tx) => {
    // 1) Registra a versão (para aparecer na lista e poder aprovar).
    const inserted = await tx
      .insert(costEvolutionImports)
      .values({
        segment: input.segment,
        fileName: input.fileName,
        fileKey: "local",
        status: "pending",
        itemCount: parsed.itemCount,
        observationCount: parsed.observationCount,
        periodStart: asBusinessDate(parsed.periodStart),
        periodEnd: asBusinessDate(parsed.periodEnd),
        importedBy: input.importedBy,
      })
      .returning({ id: costEvolutionImports.id });
    const created = inserted[0];
    if (!created) throw new Error("Não foi possível registrar a versão de custos.");

    // 2) Grava os dados na tabela que a análise realmente lê (cost_records).
    const sheetType: "pecas" | "industria" = input.segment === "industry" ? "industria" : "pecas";
    const filiais = Array.from(new Set(parsed.rows.map((row) => row.branch))).filter(Boolean);
    const periods = Array.from(
      new Set(parsed.rows.flatMap((row) => row.observations.map((obs) => toCostRecordPeriod(obs.balanceDate)))),
    ).filter(Boolean);

    if (filiais.length && periods.length) {
      // Evita duplicar ao reimportar o mesmo arquivo: apaga antes o que já existe
      // para as mesmas filiais, meses e tipo de carga.
      await tx.execute(sql`delete from cost_records
        where sheet_type = ${sheetType}::sheet_type
          and filial in (${sql.join(filiais.map((f) => sql`${f}`), sql`, `)})
          and period in (${sql.join(periods.map((p) => sql`${p}`), sql`, `)})`);

      const importedAt = new Date();
      const records: CostRecordRow[] = [];
      for (const row of parsed.rows) {
        const buyer = splitBuyerCodeName(row.buyer);
        for (const observation of row.observations) {
          records.push({
            sheetType,
            filial: row.branch,
            codAgregado: row.aggregateCode,
            codigo: row.code,
            entraMrp: row.mrp === "Sim",
            descricao: row.description,
            compradorCodigo: buyer.code,
            compradorNome: buyer.name,
            ultimaCompra: row.lastPurchaseDate ? toCostRecordPurchaseDate(row.lastPurchaseDate) : null,
            ultimoPreco: row.lastPurchasePrice,
            period: toCostRecordPeriod(observation.balanceDate),
            custoMedio: observation.cost,
            sourceFile: input.fileName,
            importedAt,
          });
        }
      }

      for (let start = 0; start < records.length; start += 1000) {
        const chunk = records.slice(start, start + 1000);
        const values = chunk.map(
          (r) => sql`(${r.sheetType}::sheet_type, ${r.filial}, ${r.codAgregado}, ${r.codigo}, ${r.entraMrp}, ${r.descricao}, ${r.compradorCodigo}, ${r.compradorNome}, ${r.ultimaCompra}, ${r.ultimoPreco}, ${r.period}, ${r.custoMedio}, ${r.sourceFile}, ${r.importedAt})`,
        );
        await tx.execute(sql`insert into cost_records
          (sheet_type, filial, cod_agregado, codigo, entra_mrp, descricao, comprador_codigo, comprador_nome, ultima_compra, ultimo_preco, period, custo_medio, source_file, imported_at)
          values ${sql.join(values, sql`, `)}`);
      }
    }

    return {
      id: created.id,
      status: "pending",
      fileName: input.fileName,
      itemCount: parsed.itemCount,
      observationCount: parsed.observationCount,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
    };
  });
}

export async function listCostEvolutionImports(segment: CostEvolutionSegment) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(costEvolutionImports)
    .where(eq(costEvolutionImports.segment, segment))
    .orderBy(desc(costEvolutionImports.importedAt), desc(costEvolutionImports.id));
}

export async function updateCostEvolutionImportStatus(id: number, status: "approved" | "archived") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const current = (await db.select().from(costEvolutionImports).where(eq(costEvolutionImports.id, id)).limit(1))[0];
  if (!current) throw new Error("Versão de custos não encontrada.");

  await db.transaction(async (tx) => {
    if (status === "approved") {
      await tx
        .update(costEvolutionImports)
        .set({ status: "archived" })
        .where(and(eq(costEvolutionImports.segment, current.segment), eq(costEvolutionImports.status, "approved")));
    }
    await tx.update(costEvolutionImports).set({ status }).where(eq(costEvolutionImports.id, id));
  });

  return { success: true as const };
}

export async function getCostEvolutionFilterOptions() {
  return { currentImport: null, branches: [] as string[], buyers: [] as string[], mrps: [] as ("Sim" | "Não")[] };
}

export async function getCostEvolutionItems() {
  return { currentImport: null, page: 1, pageSize: 50, total: 0, items: [] };
}

export async function getCostEvolutionSummary() {
  return { currentImport: null, itemCount: 0, observationCount: 0, latestAverageCost: 0 };
}