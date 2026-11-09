// ============================================================
// ImportancePanel.tsx — PAINEL GLOBAL DE IMPORTÂNCIA (v2)
// ============================================================
// v2 (09/11/2026) — feedback do Marco:
//   • RÉGUA DE PESOS ajustável ao vivo (padrão Custos): os 4 pesos
//     (estoque/consumo/curva/cobertura) são sliders; a reordenação
//     é recalculada no cliente sobre as linhas já buscadas (50).
//   • ORDENAÇÃO PBI: clicar no cabeçalho ordena pela coluna.
//   • Linhas mostram os componentes do índice recalculado.
// Fórmula base (aprovada 08/11/2026) em server/importanceIndex.ts.
// ============================================================
import { useMemo, useState } from "react";
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

// Metas contratuais e fatores (espelham server/importanceIndex.ts).
const META_COBERTURA: Record<string, number> = { A: 60, B: 90, C: 120, D: 120, E: 120 };
const FATOR_CURVA: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4, D: 0.2, E: 0.1 };

type Linha = {
  code?: string; codeOriginal?: string; description?: string; branch?: string; family?: string;
  grupo?: string; itens?: number; curve?: string | null;
  stockValue: number; salesValue13M: number; coverageDays: number;
  importancia: number;
  componentes?: { estoqueNorm: number; consumoNorm: number; fatorCurva: number; fatorCobertura: number };
};

type Pesos = { estoque: number; consumo: number; curva: number; cobertura: number };

// Recalcula o índice no cliente com os pesos da régua (mesma fórmula do servidor).
function recalcular(rows: Linha[], pesos: Pesos): Linha[] {
  const maxEstoque = Math.max(0, ...rows.map(r => r.stockValue));
  const maxConsumo = Math.max(0, ...rows.map(r => r.salesValue13M));
  return rows.map(row => {
    const estoqueNorm = maxEstoque > 0 ? row.stockValue / maxEstoque : 0;
    const consumoNorm = maxConsumo > 0 ? row.salesValue13M / maxConsumo : 0;
    const fatorCurva = FATOR_CURVA[(row.curve ?? "E").toUpperCase()] ?? 0.1;
    const meta = META_COBERTURA[(row.curve ?? "C").toUpperCase()] ?? 120;
    let fatorCobertura = 0;
    if (row.coverageDays <= 0) fatorCobertura = 1;
    else {
      const desvio = (row.coverageDays - meta) / meta;
      if (Math.abs(desvio) > 0.1) fatorCobertura = desvio < 0 ? Math.min(1, -desvio) : Math.min(1, desvio * 0.5);
    }
    const importancia = pesos.estoque * estoqueNorm + pesos.consumo * consumoNorm + pesos.curva * fatorCurva + pesos.cobertura * fatorCobertura;
    return { ...row, importancia: Math.round(importancia * 10000) / 10000, componentes: { estoqueNorm, consumoNorm, fatorCurva, fatorCobertura } };
  });
}

function SliderPesos({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label} · {Math.round(value * 100)}%</span>
      <input type="range" min={0} max={60} step={5} value={Math.round(value * 100)} onChange={e => onChange(Number(e.target.value) / 100)} className="w-28 accent-slate-900" />
    </label>
  );
}

const colunas: Array<{ key: string; label: string; right?: boolean }> = [
  { key: "posicao", label: "#" },
  { key: "principal", label: "Item/Família/Unidade" },
  { key: "importancia", label: "Índice", right: true },
  { key: "stockValue", label: "Estoque", right: true },
  { key: "salesValue13M", label: "Vendas 13M", right: true },
  { key: "coverageDays", label: "Cobertura", right: true },
  { key: "curve", label: "Curva" },
];

export default function ImportancePanel() {
  const [dimensao, setDimensao] = useState<Dimensao>("item");
  const [branch, setBranch] = useState<string>("");
  const [pesos, setPesos] = useState<Pesos>({ estoque: 0.35, consumo: 0.3, curva: 0.2, cobertura: 0.15 });
  const [sortKey, setSortKey] = useState<string>("importancia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const formula = trpc.importance.formula.useQuery(undefined, { retry: false });
  // Busca 50 linhas (máximo do router) e reordena no cliente com a régua.
  const top = trpc.importance.top.useQuery({ dimensao, limite: 50, branch: branch || undefined }, { retry: false });

  const linhas = useMemo(() => {
    const base = recalcular((top.data?.rows ?? []) as Linha[], pesos);
    const mult = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === "principal") {
        const av = a.codeOriginal ?? a.grupo ?? "";
        const bv = b.codeOriginal ?? b.grupo ?? "";
        return av.localeCompare(bv, "pt-BR") * mult;
      }
      if (sortKey === "curve") return String(a.curve ?? "").localeCompare(String(b.curve ?? "")) * mult;
      const av = Number((a as unknown as Record<string, unknown>)[sortKey] ?? 0);
      const bv = Number((b as unknown as Record<string, unknown>)[sortKey] ?? 0);
      return (av - bv) * mult;
    });
  }, [top.data, pesos, sortKey, sortDir]);

  const somaPesos = Math.round((pesos.estoque + pesos.consumo + pesos.curva + pesos.cobertura) * 100);
  const toggleSort = (key: string) => {
    if (key === "posicao") return;
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <section className="sc-surface mt-5 p-5 sm:p-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Compras · Importância global</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">O que é mais importante agora</h2>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-500">Índice = valor de estoque + consumo 13M + curva + desvio da cobertura contratual (A=60 · B=90 · C/D/E=120 dias). Ajuste os pesos na régua e a ordem muda na hora.</p>
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
      {/* Régua de pesos (padrão Custos) */}
      <div className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <SliderPesos label="Estoque" value={pesos.estoque} onChange={v => setPesos(p => ({ ...p, estoque: v }))} />
        <SliderPesos label="Consumo 13M" value={pesos.consumo} onChange={v => setPesos(p => ({ ...p, consumo: v }))} />
        <SliderPesos label="Curva" value={pesos.curva} onChange={v => setPesos(p => ({ ...p, curva: v }))} />
        <SliderPesos label="Cobertura" value={pesos.cobertura} onChange={v => setPesos(p => ({ ...p, cobertura: v }))} />
        <div className="flex items-center gap-2 pb-1">
          <span className={`text-xs font-extrabold ${somaPesos === 100 ? "text-emerald-700" : "text-amber-700"}`}>Σ {somaPesos}%</span>
          <button type="button" onClick={() => setPesos({ estoque: 0.35, consumo: 0.3, curva: 0.2, cobertura: 0.15 })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100">Padrão</button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {dimensoes.map(d => (
          <button key={d.key} type="button" onClick={() => { setDimensao(d.key); setSortKey("importancia"); setSortDir("desc"); }} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${dimensao === d.key ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{d.label}</button>
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
                {colunas.map(column => (
                  <TableHead key={column.key} className={column.right ? "text-right" : ""}>
                    {column.key === "posicao" ? (
                      column.label
                    ) : (
                      <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-[0.08em] hover:text-slate-950">
                        {column.label}
                        <span className={`text-[9px] ${sortKey === column.key ? "text-slate-900" : "text-slate-300"}`}>{sortKey === column.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((row, index) => {
                const meta = META_COBERTURA[(row.curve ?? "C").toUpperCase()] ?? 120;
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
                        <>
                          <p className="font-bold text-slate-950">{row.grupo}</p>
                          <p className="text-xs text-slate-500">{row.itens?.toLocaleString("pt-BR")} itens</p>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="text-sm font-extrabold text-slate-950">{row.importancia.toFixed(4)}</p>
                      {row.componentes && <p className="text-[10px] font-semibold text-slate-400">est {Math.round(row.componentes.estoqueNorm * 100)}% · cons {Math.round(row.componentes.consumoNorm * 100)}%</p>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatMoney(row.stockValue)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatMoney(row.salesValue13M)}</TableCell>
                    <TableCell className={`text-right text-sm font-bold ${coberturaCor}`}>{coberturaLabel}</TableCell>
                    <TableCell><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700">{row.curve ?? "—"}</span></TableCell>
                  </TableRow>
                );
              })}
              {linhas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum dado na carga aprovada atual.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {formula.data && (
        <footer className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold leading-5 text-slate-400">{formula.data.descricao}</p>
        </footer>
      )}
    </section>
  );
}
