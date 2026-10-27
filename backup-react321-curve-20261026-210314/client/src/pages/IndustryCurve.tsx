import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Download, Filter, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const monthLabel = (period: string) => (period ? `${period.slice(5, 7)}/${period.slice(0, 4)}` : "-");
const dateTime = (value: string) => (value ? new Date(value).toLocaleString("pt-BR") : "-");

type LinhaCurva = {
  agregado: string;
  descricao: string;
  classe: "A" | "B" | "C";
  participacao: number;
  valorConsumo: number;
  quantidadeConsumo: number;
  unidade: string | null;
};

function PaginaHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="mb-7">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">{description}</p>
    </header>
  );
}

const badgeClasse: Record<"A" | "B" | "C", string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-sky-100 text-sky-700",
  C: "bg-slate-100 text-slate-600",
};

export default function IndustryCurve() {
  const curva = trpc.operationalImport.curvaIndustriaAtual.useQuery(undefined, { retry: false });
  const recalcular = trpc.operationalImport.recalcularCurvaIndustria.useMutation({
    onSuccess: (resultado) => {
      toast.success(`Curva ABC recalculada: ${resultado.totalAgregados.toLocaleString("pt-BR")} agregados - ${resultado.classeA} A / ${resultado.classeB} B / ${resultado.classeC} C - ${resultado.referencePeriod}`);
      trpc.useUtils().operationalImport.curvaIndustriaAtual.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const [classe, setClasse] = useState("");
  const [busca, setBusca] = useState("");
  const [exporting, setExporting] = useState(false);

  const linhas: LinhaCurva[] = useMemo(() => (curva.data?.registros ?? []) as LinhaCurva[], [curva.data?.registros]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas
      .filter((l) => (!classe || l.classe === classe) && (!q || l.descricao.toLowerCase().includes(q) || l.agregado.toLowerCase().includes(q)))
      .sort((a, b) => {
        const ordem = { A: 0, B: 1, C: 2 };
        if (ordem[a.classe] !== ordem[b.classe]) return ordem[a.classe] - ordem[b.classe];
        return b.valorConsumo - a.valorConsumo;
      });
  }, [linhas, classe, busca]);

  const exportXlsx = async () => {
    if (!filtradas.length) { toast.error("Nao ha itens para exportar."); return; }
    const mod = await import("exceljs") as any;
    const ExcelJS = mod.default ?? mod;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Curva ABC Industria");
    const header = ["Classe", "Agregado", "Descricao", "Valor consumo", "Participacao", "Qtd consumida", "Unidade"];
    const aoa: (string | number)[][] = [header];
    filtradas.forEach((l) => {
      aoa.push([l.classe, l.agregado, l.descricao, l.valorConsumo, l.participacao, l.quantidadeConsumo, l.unidade ?? ""]);
    });
    sheet.addRows(aoa);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;
    sheet.columns.forEach((col: { width?: number }, index: number) => {
      col.width = index === 0 ? 8 : index === 1 ? 18 : index === 2 ? 55 : index === 5 ? 18 : 16;
    });
    sheet.getColumn(4).numFmt = "#,##0.00";
    sheet.getColumn(5).numFmt = "0.00%";
    sheet.getColumn(6).numFmt = "#,##0.00";
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = "A1:G1";
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    a.download = `curva-abc-industria-${curva.data?.referencePeriod || "sem-periodo"}-${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (curva.isLoading) {
    return (
      <div className="page-wrap">
        <div className="sc-surface flex items-center gap-3 p-6 text-sm font-semibold text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />Carregando curva ABC da Industria...
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <PaginaHeader
        eyebrow="Suprimentos e estoques - Industria - Curva ABC"
        title="Curva ABC da Industria"
        description="Classificacao 80/15/05 por agregado com consumo em reais (saldo anterior + entradas - saldo atual) sobre a janela de 12 meses, filial unica 0105. Divergencias e itens fora do universo sao registrados para auditoria - nada e eliminado nem inserido."
      />
      <section className="sc-surface p-5 sm:p-7">
        <div className="rounded-xl bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-800">
          Segmento <strong>Industria</strong>: filial unica <strong>0105</strong>. Periodo de referencia:{" "}
          <strong>{curva.data?.referencePeriod ? monthLabel(curva.data.referencePeriod) : "-"}</strong> - versao{" "}
          <strong>{curva.data?.calculationVersion || "-"}</strong>
          {curva.data?.calculatedAt ? ` - calculada em ${dateTime(curva.data.calculatedAt)}` : ""}.
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">
              Classe<select className="control" value={classe} onChange={(event) => setClasse(event.target.value)}><option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select>
            </label>
            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">
              Descricao<Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar" />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={exporting} onClick={() => { setExporting(true); exportXlsx().finally(() => setExporting(false)); }}>
              {exporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Exportar para Excel
            </Button>
            <Button onClick={() => recalcular.mutate()} disabled={recalcular.isPending} className="bg-slate-950 hover:bg-slate-800">
              {recalcular.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Recalcular curva
            </Button>
          </div>
        </div>
      </section>
      <section className="sticky top-0 z-10 mt-5 grid gap-4 bg-[#f2f4f5] py-3 md:grid-cols-3 xl:grid-cols-6">
        {[["Classe A", curva.data?.porClasse.A.toLocaleString("pt-BR") ?? "-"], ["Classe B", curva.data?.porClasse.B.toLocaleString("pt-BR") ?? "-"], ["Classe C", curva.data?.porClasse.C.toLocaleString("pt-BR") ?? "-"], ["Agregados (universo)", curva.data?.totalAgregados.toLocaleString("pt-BR") ?? "-"], ["Periodo", curva.data?.referencePeriod ? monthLabel(curva.data.referencePeriod) : "-"], ["Versao", curva.data?.calculationVersion || "-"]].map(([label, value]) => (
          <div key={label} className="sc-surface p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-extrabold tracking-tight text-slate-950">{value}</p></div>
        ))}
      </section>
      <section className="sc-surface mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Curva ABC por agregado</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{filtradas.length.toLocaleString("pt-BR")} agregados exibidos - consumo em reais na janela de 12 meses</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Classe</TableHead>
                <TableHead>Agregado</TableHead>
                <TableHead>Descricao</TableHead>
                <TableHead className="text-right">Valor consumo</TableHead>
                <TableHead className="text-right">Participacao</TableHead>
                <TableHead className="text-right">Qtd consumida</TableHead>
                <TableHead>Unidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length ? filtradas.map((l) => (
                <TableRow key={l.agregado}>
                  <TableCell><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${badgeClasse[l.classe]}`}>{l.classe}</span></TableCell>
                  <TableCell className="font-bold text-slate-950">{l.agregado}</TableCell>
                  <TableCell className="max-w-md">{l.descricao}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{money.format(l.valorConsumo)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{l.participacao > 0 ? percent(l.participacao) : "-"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{number.format(l.quantidadeConsumo)}</TableCell>
                  <TableCell>{l.unidade || "-"}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-sm font-medium text-slate-500">{curva.data?.totalAgregados ? "Nenhum agregado encontrado para os filtros." : "Nenhuma curva calculada ainda. Importe FECHAMENTO_ESTOQUE e ENTRADA_NF ou clique em Recalcular curva."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
