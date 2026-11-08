// ============================================================
// ImportancePanel.tsx — PAINEL GLOBAL DE IMPORTÂNCIA
// ============================================================
// Três blocos (Top itens / Top famílias / Top unidades) ranqueados
// pelo Índice de Importância (fórmula aprovada 08/11/2026). Cada
// linha mostra os componentes do índice; a fórmula é transparente
// (pesos visíveis no rodapé). Filtros: unidade e curva.
// ============================================================
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/format";
import { LoaderCircle } from "lucide-react";

type Dimensao = "item" | "familia" | "unidade";

const dimensoes: Array<{ key: Dimensao; label: string }> = [
  { key: "item", label: "Top itens" },
  { key: "familia", label: "Top famílias" },
  { key: "unidade", label: "Top unidades" },
];

type Linha = { code?: string; codeOriginal?: string; description?: string; branch?: string; family?: string; grupo?: string; itens?: number; curve?: string | null; stockValue: number; salesValue13M: number; coverageDays: number; importancia: number; componentes?: { estoqueNorm: number; consumoNorm: number; fatorCurva: number; fatorCobertura: number } };

export default function ImportancePanel() {
  const [dimensao, setDimensao] = useState<Dimensao>("item");
  const [branch, setBranch] = useState<string>("");
  const formula = trpc.importance.formula.useQuery(undefined, { retry: false });
  const top = trpc.importance.top.useQuery({ dimensao, limite: 20, branch: branch || undefined }, { retry: false });

  return (
    <section className="sc-surface mt-5 p-5 sm:p-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Compras · Importância global</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">O que é mais importante agora</h2>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-500">Índice = valor de estoque (35%) + consumo 13M (30%) + curva (20%) + desvio da cobertura contratual (15%). Cobertura contratual: A=60 · B=90 · C/D/E=120 dias.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="control h-9 w-40" value={branch} onChange={event => setBranch(event.target.value)} title="Filtrar por unidade">
            <option value="">Todas as unidades</option>
            <option value="0101">0101</option><option value="0102">0102</option><option value="0103">0103</option>
            <option value="0106">0106</option><option value="0107">0107</option><option value="0108">0108</option>
            <option value="0301">0301</option><option value="0303">0303</option><option value="0304">0304</option>
            <option value="0305">0305</option><option value="0306">0306</option><option value="0307">0307</option>
          </select>
        </div>
      </header>
      <div className="mt-4 flex flex-wrap gap-2">
        {dimensoes.map(d => (
          <button key={d.key} type="button" onClick={() => setDimensao(d.key)} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${dimensao === d.key ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{d.label}</button>
        ))}
      </div>
      {top.isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Calculando importância…</p>
      ) : top.error ? (
        <p className="mt-5 text-sm font-semibold text-rose-700">{top.error.message}</p>
      ) : (
        <div className="mt-4 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>{dimensao === "item" ? "Item" : dimensao === "familia" ? "Família" : "Unidade"}</TableHead>
                {dimensao === "item" && <TableHead>Unid.</TableHead>}
                {dimensao === "item" && <TableHead>Família</TableHead>}
                <TableHead className="text-right">Índice</TableHead>
                <TableHead className="text-right">Estoque (R$)</TableHead>
                <TableHead className="text-right">Vendas 13M (R$)</TableHead>
                <TableHead className="text-right">Cobertura</TableHead>
                <TableHead>Curva</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(top.data?.rows ?? []).map((raw, index) => {
                const row = raw as Linha;
                const meta = formula.data?.metaCobertura?.[(row.curve ?? "C").toUpperCase()] ?? 120;
                const coberturaLabel = `${Math.round(row.coverageDays)} d (meta ${meta})`;
                const desvio = row.coverageDays - meta;
                const coberturaCor = Math.abs(desvio) / meta <= 0.1 ? "text-emerald-700" : desvio < 0 ? "text-amber-700" : "text-sky-700";
                return (
                  <TableRow key={`${row.code ?? row.grupo}-${index}`}>
                    <TableCell className="text-xs font-bold text-slate-400">{index + 1}</TableCell>
                    <TableCell>
                      {dimensao === "item" ? (
                        <>
                          <p className="font-bold text-slate-950">{row.codeOriginal || row.code}</p>
                          <p className="max-w-72 truncate text-xs text-slate-500">{row.description}</p>
                        </>
                      ) : (
                        <p className="font-bold text-slate-950">{row.grupo}</p>
                      )}
                      {dimensao !== "item" && <p className="text-xs text-slate-500">{row.itens?.toLocaleString("pt-BR")} itens</p>}
                    </TableCell>
                    {dimensao === "item" && <TableCell className="text-xs font-semibold text-slate-600">{row.branch}</TableCell>}
                    {dimensao === "item" && <TableCell className="text-xs text-slate-600">{row.family || "—"}</TableCell>}
                    <TableCell className="text-right">
                      <p className="text-sm font-extrabold text-slate-950">{row.importancia.toFixed(4)}</p>
                      <p className="text-[10px] font-semibold text-slate-400">est {Math.round((row.componentes?.estoqueNorm ?? 0) * 100)}% · cons {Math.round((row.componentes?.consumoNorm ?? 0) * 100)}%</p>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatMoney(row.stockValue)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatMoney(row.salesValue13M)}</TableCell>
                    <TableCell className={`text-right text-sm font-bold ${coberturaCor}`}>{coberturaLabel}</TableCell>
                    <TableCell><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700">{row.curve ?? "—"}</span></TableCell>
                  </TableRow>
                );
              })}
              {!top.isLoading && (top.data?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum dado na carga aprovada atual.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {formula.data && (
        <footer className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold leading-5 text-slate-400">{formula.data.descricao} · Pesos ajustáveis na régua (padrão Custos).</p>
        </footer>
      )}
    </section>
  );
}
