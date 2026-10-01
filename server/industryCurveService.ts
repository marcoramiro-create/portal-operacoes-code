/**
 * industryCurveService.ts
 * Gravação da Curva ABC da Indústria (0105) em sbz_product_curves.
 * Módulo: server (API tRPC). Data: 01/10/2026.
 *
 * MECANISMO "IMPORTAÇÃO EM USO" (regra 11): para cada fonte, o batch ATIVO é
 * o mais recente com status='processed' (imported_at desc — coluna real de
 * operational_import_batches; NÃO existe created_at nessa tabela).
 * Nada é fixado no código — se o usuário trocar a importadora (CSV/XLSX),
 * a carga em uso muda sozinha.
 *
 * GRAVAÇÃO (regra 13): operation=INDUSTRIA, branch_code=0105,
 * source='CURVA_ABC_INDUSTRIA', calculation_version='v1',
 * reference_period = mês de referência, is_current=true. Antes do UPSERT,
 * a versão anterior do mesmo período é marcada is_current=false. Transação
 * única: se qualquer passo falhar, nada fica gravado.
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
    };
  });
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
    if (!resultado.referencePeriod) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Curva ABC da Indústria: FECHAMENTO_ESTOQUE em uso não possui meses (mês de referência vazio).",
      });
    }

    // ---- gravação em transação única ----
    await client.query("begin");
    await client.query(
      "update public.sbz_product_curves set is_current = false where operation = $1 and branch_code = $2 and reference_period = $3 and is_current = true",
      [INDUSTRIA_OPERATION, INDUSTRIA_BRANCH, `${resultado.referencePeriod}-01`],
    );
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
          `${resultado.referencePeriod}-01`,
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