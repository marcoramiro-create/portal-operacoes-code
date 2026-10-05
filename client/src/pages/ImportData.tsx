// ============================================================
// client/src/pages/ImportData.tsx
// Tela de importação de planilhas do Protheus e cadastros de referência.
// Módulo: Compras e análise Protheus.
// MUDANÇA (07/09/2026): histórico de importações e exclusão direto na tela,
// sem depender de SQL, para as cinco importações (Compras, SB1, SBZ, Famílias, SubFamílias).
// MUDANÇA (08/09/2026): corrige o botão "Excluir" do histórico de cadastros,
// que chamava a rota errada (deleteImport) e por isso não fazia nada.
// MUDANÇA (25/09/2026): Compras envia o arquivo direto (base64) pela rota
// importWorkbook, sem depender de armazenamento. Removidos os cards de upload
// dos cadastros (SB1, SBZ, Famílias, SubFamílias) — eles são importados pela
// ferramenta de importações. MANTIDO o histórico de importações dos cadastros.
// ============================================================
import { Button } from "@/components/ui/button";
import OneDriveImportSource from "@/components/OneDriveImportSource";
import OperationalImportPreviewPanel from "@/components/OperationalImportPreviewPanel";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, FileSpreadsheet, FileUp, History, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import { toast } from "sonner";

// Lê o arquivo e devolve o conteúdo em base64, sem o prefixo "data:...".
async function lerArquivoComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = leitor.result as string;
      resolver(resultado.split(",")[1] ?? resultado);
    };
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

export default function ImportData() {
  const utils = trpc.useUtils();
  const { data: imports = [] } = trpc.analytics.imports.useQuery();
  const { data: canAdminister = false } = trpc.analytics.canAdminister.useQuery();
  const { data: refHistory = [] } = trpc.analytics.referenceImportHistory.useQuery();
  const [file, setFile] = useState<File | null>(null);

  const setImportStatus = trpc.analytics.setImportStatus.useMutation({
    onSuccess: async result => { await Promise.all([utils.analytics.imports.invalidate(), utils.analytics.dashboard.invalidate(), utils.analytics.filterOptions.invalidate()]); toast.success(result.status === "approved" ? "Versão aprovada para uso no painel." : "Versão arquivada."); },
    onError: error => toast.error(error.message),
  });

  const deleteImport = trpc.analytics.deleteImport.useMutation({
    onSuccess: async () => { await Promise.all([utils.analytics.imports.invalidate(), utils.analytics.dashboard.invalidate(), utils.analytics.filterOptions.invalidate()]); toast.success("Carga excluída."); },
    onError: error => toast.error(error.message),
  });

  // MUDANÇA (08/09/2026): exclusão de cadastro a partir do histórico (usa a rota correta).
  const deleteReference = trpc.analytics.deleteReference.useMutation({
    onSuccess: async () => { await Promise.all([utils.analytics.referenceCounts.invalidate(), utils.analytics.referenceImportHistory.invalidate()]); toast.success("Cadastro e histórico excluídos."); },
    onError: error => toast.error(error.message),
  });

  // MUDANÇA (25/09/2026): importação da Compras direto pelo arquivo em base64,
  // sem passar pelo armazenamento (que não está configurado no servidor).
  const importWorkbook = trpc.analytics.importWorkbook.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.analytics.imports.invalidate(), utils.analytics.dashboard.invalidate(), utils.analytics.filterOptions.invalidate()]);
      setFile(null);
      const regs = (result as { rowCount?: number } | null)?.rowCount;
      toast.success(regs != null ? `Compras importada: ${regs.toLocaleString("pt-BR")} registros. Aguardando aprovação do ADM para entrar no painel.` : "Compras importada com sucesso. Aguardando aprovação do ADM para entrar no painel.");
    },
    onError: error => toast.error(error.message),
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !/^Compras - \d{12}\.xlsx$/i.test(selected.name)) { toast.error("O nome deve seguir o padrão Compras - aaaaMMddHHmm.xlsx."); event.target.value = ""; return; }
    if (selected && !selected.name.toLowerCase().endsWith(".xlsx")) { toast.error("Selecione uma planilha no formato .xlsx."); event.target.value = ""; return; }
    if (selected && selected.size > 18 * 1024 * 1024) { toast.error("A planilha deve ter no máximo 18 MB."); event.target.value = ""; return; }
    setFile(selected);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return toast.error("Selecione a planilha extraída do Protheus.");
    try {
      const contentBase64 = await lerArquivoComoBase64(file);
      importWorkbook.mutate({ fileName: file.name, contentBase64 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ler a planilha.");
    }
  };

  const kindLabel = (kind: string) => ({ sb1: "SB1", sbz: "SBZ", familias: "Famílias", subfamilias: "SubFamílias" } as Record<string, string>)[kind] ?? kind;
  const deleteKind = (kind: string) => deleteReference.mutate({ kind: kind as "sb1" | "sbz" | "familias" | "subfamilias" });

  return (
    <div className="page-wrap max-w-5xl">
      <header className="mb-7">
        <p className="eyebrow">Fonte de dados</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Importar planilha</h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">Envie cada versão da extração Excel do Protheus. A carga preserva o histórico, valida as colunas e permite analisar vendas, estoque, giro e MRP separadamente.</p>
      </header>
      {canAdminister && <OneDriveImportSource />}
      {canAdminister && <OperationalImportPreviewPanel />}
      <section className="sc-surface p-6 sm:p-8">
        <form onSubmit={submit}>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-[#dcebf7] text-slate-950"><FileSpreadsheet className="h-6 w-6" /></div>
            <div className="flex-1">
              <p className="text-base font-extrabold tracking-tight text-slate-950">Planilha do Protheus</p>
              <p className="mt-1 text-sm font-medium text-slate-500">Formato aceito: `Compras - aaaaMMddHHmm.xlsx` · Limite: 18 MB · Uma aba com a tabela de dados · MRP opcional (Sim/Não). O nome original é preservado e a data/hora dele define o histórico.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <label className="inline-flex h-10 max-w-xl cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-400">
              <FileUp className="h-4 w-4" />
              <span>{file ? file.name : "Selecionar planilha"}</span>
              <input aria-label="Selecionar planilha Excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} className="sr-only" />
            </label>
            <Button type="submit" disabled={!file || importWorkbook.isPending} className="bg-slate-950 text-white hover:bg-slate-800">
              {importWorkbook.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {importWorkbook.isPending ? "Importando" : "Importar planilha"}
            </Button>
          </div>
          {file && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-700" />Arquivo selecionado e pronto para importação.</p>}
        </form>
      </section>
      {canAdminister && (
        <section className="sc-surface mt-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1f2f4] text-slate-950"><History className="h-4 w-4" /></span>
            <div><h2 className="text-base font-extrabold tracking-tight text-slate-950">Histórico de importações dos cadastros</h2><p className="text-xs font-medium text-slate-500">Registros de cada carga de SB1, SBZ, Famílias e SubFamílias. Excluir remove os dados do cadastro e seu histórico.</p></div>
          </div>
          <div className="divide-y divide-slate-100">
            {refHistory.length === 0 && <p className="px-5 py-8 text-center text-sm font-medium text-slate-500">Nenhuma importação de cadastro registrada ainda.</p>}
            {refHistory.map(item => (
              <div className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7" key={item.id}>
                <div>
                  <p className="font-bold text-slate-950">{kindLabel(item.kind)}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{item.fileName} · {item.rowCount.toLocaleString("pt-BR")} registros · {formatDate(item.importedAt)}</p>
                </div>
                <Button variant="outline" size="sm" disabled={deleteReference.isPending} onClick={() => deleteKind(item.kind)} className="text-red-700 hover:bg-red-50"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</Button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="sc-surface mt-5 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><FileUp className="h-4 w-4" /></span>
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-950">Cargas realizadas</h2>
            <p className="text-xs font-medium text-slate-500">Somente versões aprovadas pelo ADM entram no painel; as demais permanecem no histórico.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {imports.length === 0 && <p className="px-5 py-10 text-center text-sm font-medium text-slate-500">Nenhuma planilha foi importada.</p>}
          {imports.map(item => (
            <div className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7" key={item.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-950">{item.fileName}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "archived" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{item.status === "approved" ? "Em uso" : item.status === "archived" ? "Arquivada" : "Pendente"}</span>
                </div>
                <p className="mt-1 font-medium text-slate-500">{item.rowCount.toLocaleString("pt-BR")} registros · Histórico: {formatDate(item.importedAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-slate-500">{item.status === "pending" ? "Aguardando ADM" : item.status === "approved" ? "Disponível no painel" : "Fora do painel"}</p>
                {canAdminister && item.status === "pending" && <Button variant="outline" size="sm" disabled={setImportStatus.isPending} onClick={() => setImportStatus.mutate({ importId: item.id, status: "approved" })}><ShieldCheck className="mr-2 h-3.5 w-3.5" />Aprovar uso</Button>}
                {canAdminister && item.status === "approved" && <Button variant="outline" size="sm" disabled={setImportStatus.isPending} onClick={() => setImportStatus.mutate({ importId: item.id, status: "archived" })}><Archive className="mr-2 h-3.5 w-3.5" />Arquivar</Button>}
                {canAdminister && <Button variant="outline" size="sm" disabled={deleteImport.isPending} onClick={() => deleteImport.mutate({ importId: item.id })} className="text-red-700 hover:bg-red-50"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</Button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}