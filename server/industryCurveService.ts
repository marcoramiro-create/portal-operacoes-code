/**
 * industryCurveService.ts
 * Gravação da Curva ABC da Indústria (0105) em sbz_product_curves.
 * Módulo: server (API tRPC). Data: 01/10/2026 — v2 (consumo em R$ puro).
 *
 * MECANISMO "IMPORTAÇÃO EM USO": para cada fonte, o batch ATIVO é o mais
 * recente com status='processed' (imported_at desc — coluna real de
 * operational_import_batches). Nada é fixado no código.
 *
 * GARANTIA DE CADASTRO: public.products estava VAZIA (materialização do SB1
 * suspensa em 24/09). Antes de gravar a curva, este service garante em
 * products SOMENTE os produtos que a curva vai usar, lendo a SB1 em uso
 * direto da operational_source_rows (SQL, sem corpo HTTP de ~80 mil linhas)
 * e inserindo com a MESMA semântica da materializeSb1
 * (operationalImportService.ts): mesmo ON CONFLICT (product_code) DO UPDATE.
 *
 * GRAVAÇÃO: operation=INDUSTRIA, branch_code=0105, source='CURVA_ABC_INDUSTRIA',
 * calculation_version='v2', reference_period = mês de referência,
 * is_current=true. Antes do UPSERT, a versão anterior do mesmo período é
 * marcada is_current=false. Transação única: se qualquer passo falhar, nada
 * fica gravado.
 */
import type { Pool, PoolClient } from "pg";
import { TRPCError } from "@trpc/server";
import { getSupabasePool } from "./supabasePortal";
import { normalizeBranchCode, normalizeProductCode } from "./operationalNormalization";
import {
  calcularCurvaIndustriaCore,
  CURVA_ABC_INDUSTRIA_SOURCE,
  CURVA_ABC_INDUSTRIA_VERSION,
  INDUSTRIA_BRANCH,
  INDUSTRIA_OPERATION,
  type IndustryCurveInput,
  type IndustryCurveSummary,
} from "./industryCurveCalculations";

async function batchEmUso(client: PoolClient, sourceKind: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    "select id from public.operational_import_batches where source_kind = $1 and status = 'processed' order by imported_at desc limit 1",
    [sourceKind],
  );
  return res.rows[0]?.id ?? null;
}

async function lerSb1(client: PoolClient, batchId: string): Promise<IndustryCurveInput["sb1"]> {
  const res = await client.query(
    "select product_code, aggregate_product_code, normalized_payload from public.operational_source_rows where batch_id = $1",
    [batchId],
  );
  return res.rows.map((r) => {
    const p = r.normalized_payload ?? {};
    return {
      productCode: normalizeProductCode(r.product_code),
      aggregateProductCode: r.aggregate_product_code ? normalizeProductCode(r.aggregate_product_code) : null,
      description: String(p.description ?? ""),
    };
  });
}

async function lerSbz(client: PoolClient, batchId: string): Promise<IndustryCurveInput["sbz"]> {
  const res = await client.query(
    "select branch_code, product_code from public.operational_source_rows where batch_id = $1",
    [batchId],
  );
  return res.rows
    .filter((r) => normalizeBranchCode(r.branch_code) === INDUSTRIA_BRANCH)
    .map((r) => ({
      productCode: normalizeProductCode(r.product_code),
      branchCode: normalizeBranchCode(r.branch_code),
    }));
}

async function lerEntradas(client: PoolClient, batchId: string): Promise<IndustryCurveInput["entradas"]> {
  const res = await client.query(
    "select product_code, aggregate_product_code, branch_code, normalized_payload from public.operational_source_rows where batch_id = $1",
    [batchId],
  );
  return res.rows
    .filter((r) => normalizeBranchCode(r.branch_code) === INDUSTRIA_BRANCH)
    .map((r) => {
      const p = r.normalized_payload ?? {};
      return {
        productCode: normalizeProductCode(r.product_code),
        aggregateProductCode: r.aggregate_product_code ? normalizeProductCode(r.aggregate_product_code) : null,
        entryDate: p.entryDate ? String(p.entryDate) : null,
        quantity: p.quantity != null ? Number(p.quantity) : null,
        itemValue: p.itemValue != null ? Number(p.itemValue) : null,
      };
    });
}

async function lerFechamentos(client: PoolClient, batchId: string): Promise<IndustryCurveInput["fechamentos"]> {
  const res = await client.query(
    "select product_code, aggregate_product_code, branch_code, normalized_payload from public.operational_source_rows where batch_id = $1 and branch_code = $2",
    [batchId, INDUSTRIA_BRANCH],
  );
  return res.rows.map((r) => {
    const p = r.normalized_payload ?? {};
    return {
      productCode: normalizeProductCode(r.product_code),
      year: p.year != null ? Number(p.year) : null,
      month: p.month != null ? Number(p.month) : null,
      quantity: p.quantity != null ? Number(p.quantity) : null,
      unit: p.unit ? String(p.unit) : null,
      totalValue: p.totalValue != null ? Number(p.totalValue) : null, // R$ total da linha (soma entre quebras)
    };
  });
}

/**
 * Garante em public.products os produtos que a curva vai usar.
 * Mesma semântica da materializeSb1; idempotente; não apaga nada.
 */
async function garantirProdutos(client: PoolClient, batchSb1: string, codigosNecessarios: string[]): Promise<void> {
  const codigos = Array.from(new Set(codigosNecessarios.filter((c) => c && c.trim())));
  if (codigos.length === 0) return;
  const res = await client.query(
    "select product_code, normalized_payload from public.operational_source_rows where batch_id = $1 and product_code = any($2)",
    [batchSb1, codigos],
  );
  for (const r of res.rows) {
    const p = r.normalized_payload ?? {};
    const codigo = normalizeProductCode(r.product_code);
    if (!codigo) continue;
    const name = String(p.description ?? "").trim() || `Produto ${codigo}`;
    const productType = p.type != null && String(p.type).trim() !== "" ? String(p.type).trim() : null;
    const metadata = {
      familia: p.family != null && String(p.family).trim() !== "" ? String(p.family).trim() : null,
      subfamilia: p.subfamily != null && String(p.subfamily).trim() !== "" ? String(p.subfamily).trim() : null,
      ncm: p.ncm != null ? String(p.ncm) : "",
      inclusionDate: p.inclusionDate != null ? String(p.inclusionDate) : "",
    };
    await client.query(
      `insert into public.products
         (product_code, name, product_type, active, metadata, source_batch_id, source_system, source_product_code, updated_at)
       values ($1, $2, $3, true, $4::jsonb, $5, 'SB1', $1, now())
       on conflict (product_code) do update set
         name = excluded.name,
         product_type = excluded.product_type,
         metadata = excluded.metadata,
         source_batch_id = excluded.source_batch_id,
         active = true,
         updated_at = now()`,
      [codigo, name, productType, JSON.stringify(metadata), batchSb1],
    );
  }
}

/**
 * Recalcula e grava a Curva ABC da Indústria com as cargas EM USO.
 * Idempotente: recalcular a mesma versão do mesmo período sobrescreve as
 * linhas (UPSERT na UNIQUE product_id+branch_code+operation+reference_period+version).
 */
export async function recalcularCurvaIndustria(pool?: Pool): Promise<IndustryCurveSummary> {
  const connection = pool ?? getSupabasePool();
  const client = await connection.connect();
  try {
    const batchEntrada = await batchEmUso(client, "ENTRADA_NF");
    const batchFechamento = await batchEmUso(client, "FECHAMENTO_ESTOQUE");
    if (!batchEntrada || !batchFechamento) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Curva ABC da Indústria: é preciso ter importado ENTRADA_NF e FECHAMENTO_ESTOQUE antes.",
      });
    }
    const batchSb1 = await batchEmUso(client, "SB1");
    const batchSbz = await batchEmUso(client, "SBZ");
    const input: IndustryCurveInput = {
      entradas: await lerEntradas(client, batchEntrada),
      fechamentos: await lerFechamentos(client, batchFechamento),
      sb1: batchSb1 ? await lerSb1(client, batchSb1) : [],
      sbz: batchSbz ? await lerSbz(client, batchSbz) : [],
    };
    const resultado = calcularCurvaIndustriaCore(input);
    if (!resultado.referencePeriod || !resultado.resumo.referencePeriod) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Curva ABC da Indústria: FECHAMENTO_ESTOQUE em uso não possui meses (mês de referência vazio).",
      });
    }

    // ---- gravação em transação única ----
    await client.query("begin");
    await client.query(
      "update public.sbz_product_curves set is_current = false where operation = $1 and branch_code = $2 and reference_period = $3 and is_current = true",
      [INDUSTRIA_OPERATION, INDUSTRIA_BRANCH, `${resultado.resumo.referencePeriod}-01`],
    );
    if (batchSb1) {
      await garantirProdutos(client, batchSb1, resultado.registros.map((r) => r.productCode));
    }
    let produtosGravados = 0;
    const achadosExtra: Array<{ aggregateProductCode: string; motivo: string }> = [];
    for (const reg of resultado.registros) {
      const metadata = {
        aggregateCode: reg.aggregateProductCode,
        aggregateDescription: reg.aggregateDescription,
        classe: reg.classe,
        participacao: reg.participacao,
        valorConsumo: reg.valorConsumo,
        quantidadeConsumo: reg.quantidadeConsumo,
        unidade: reg.unidade,
        unidadeDivergente: reg.unidadeDivergente,
      };
      const gravado = await client.query(
        `insert into public.sbz_product_curves
           (product_id, branch_code, operation, curve_code, reference_period,
            source, calculation_version, calculated_at, is_current, metadata)
         select p.id, $1, $2, $3, $4, $5, $6, now(), true, $7::jsonb
           from public.products p
          where p.product_code = $8
         on conflict (product_id, branch_code, operation, reference_period, calculation_version)
         do update set curve_code = excluded.curve_code,
                       metadata = excluded.metadata,
                       calculated_at = now(),
                       is_current = true`,
        [
          INDUSTRIA_BRANCH,
          INDUSTRIA_OPERATION,
          reg.classe,
          `${resultado.resumo.referencePeriod}-01`,
          CURVA_ABC_INDUSTRIA_SOURCE,
          CURVA_ABC_INDUSTRIA_VERSION,
          JSON.stringify(metadata),
          reg.productCode,
        ],
      );
      if ((gravado.rowCount ?? 0) > 0) {
        produtosGravados += 1;
      } else {
        achadosExtra.push({
          aggregateProductCode: reg.aggregateProductCode,
          motivo: `Produto ${reg.productCode} sem registro em products (SB1 em uso).`,
        });
      }
    }
    await client.query("commit");
    return {
      ...resultado.resumo,
      produtosGravados,
      achados: [...resultado.resumo.achados, ...achadosExtra],
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
// ---------------------------------------------------------------------------
// Leitura da curva corrente (tela do Bloco 4.4) — 01/10/2026
// ---------------------------------------------------------------------------
export interface IndustryCurveSnapshotRow {
  agregado: string;
  descricao: string;
  classe: "A" | "B" | "C";
  participacao: number;
  valorConsumo: number;
  quantidadeConsumo: number;
  unidade: string | null;
}
export interface IndustryCurveSnapshot {
  referencePeriod: string; // "2026-08"
  calculationVersion: string;
  calculatedAt: string;
  totalAgregados: number;
  porClasse: { A: number; B: number; C: number };
  registros: IndustryCurveSnapshotRow[];
}

export async function obterCurvaIndustriaAtual(pool?: Pool): Promise<IndustryCurveSnapshot> {
  const connection = pool ?? getSupabasePool();
  const res = await connection.query(
    `select distinct on ((c.metadata->>'aggregateCode'))
            (c.metadata->>'aggregateCode') as agregado,
            (c.metadata->>'aggregateDescription') as descricao,
            c.curve_code as classe,
            (c.metadata->>'participacao') as participacao,
            (c.metadata->>'valorConsumo') as valor,
            (c.metadata->>'quantidadeConsumo') as quantidade,
            (c.metadata->>'unidade') as unidade,
            c.calculation_version,
            c.reference_period,
            c.calculated_at
       from public.sbz_product_curves c
      where c.operation = $1 and c.is_current = true
      order by (c.metadata->>'aggregateCode'), (c.metadata->>'valorConsumo')::numeric desc nulls last`,
    [INDUSTRIA_OPERATION],
  );
  const num = (v: unknown): number => (v == null || v === "" ? 0 : Number(v));
  const registros: IndustryCurveSnapshotRow[] = res.rows.map((r) => ({
    agregado: String(r.agregado ?? ""),
    descricao: String(r.descricao ?? ""),
    classe: (String(r.classe ?? "C") === "A" ? "A" : String(r.classe) === "B" ? "B" : "C") as "A" | "B" | "C",
    participacao: num(r.participacao),
    valorConsumo: num(r.valor),
    quantidadeConsumo: num(r.quantidade),
    unidade: r.unidade ? String(r.unidade) : null,
  }));
  const porClasse = { A: 0, B: 0, C: 0 };
  for (const reg of registros) porClasse[reg.classe] += 1;
  return {
    referencePeriod: res.rows[0]?.reference_period ? String(res.rows[0].reference_period).slice(0, 7) : "",
    calculationVersion: res.rows[0]?.calculation_version ? String(res.rows[0].calculation_version) : "",
    calculatedAt: res.rows[0]?.calculated_at ? String(res.rows[0].calculated_at) : "",
    totalAgregados: registros.length,
    porClasse,
    registros,
  };
}