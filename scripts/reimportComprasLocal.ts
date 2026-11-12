// ============================================================
// reimportComprasLocal.ts — reimporta uma planilha Compras direto
// do sistema de arquivos da VM, SEM passar pelo HTTP (sem timeout).
// Lê o arquivo do disco e chama importProtheusWorkbook + aprovação.
//
// Uso (na VM, dentro de /home/ubuntu/portal-operacoes-homolog):
//   npx tsx --env-file=.env scripts/reimportComprasLocal.ts "<caminho-do-arquivo.xlsx>" "<nome-de-registro.xlsx>"
// ============================================================
import { readFileSync } from "node:fs";
import { importProtheusWorkbook, updateProtheusImportStatus } from "../server/db";

async function main() {
  const caminho = process.argv[2];
  const nomeRegistro = process.argv[3] ?? caminho.split("/").pop() ?? "compras.xlsx";
  if (!caminho) throw new Error("Informe o caminho do arquivo .xlsx como primeiro argumento.");
  const buffer = readFileSync(caminho);
  console.log(`Arquivo: ${caminho} (${(buffer.length / 1048576).toFixed(1)} MB)`);
  const result = await importProtheusWorkbook(nomeRegistro, buffer);
  console.log(`Importado: importId=${result.id} registros=${result.rowCount}`);
  if (result.id) {
    await updateProtheusImportStatus(result.id, "approved");
    console.log(`Aprovado: importId=${result.id}`);
  }
  process.exit(0);
}

void main().catch(error => {
  console.error("ERRO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
