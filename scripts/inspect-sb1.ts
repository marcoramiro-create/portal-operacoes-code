// ============================================================
// inspect-sb1.ts — diagnóstico read-only do SB1 no OneDrive
// Mostra o cabeçalho real e as primeiras linhas de dados, para
// confirmar de onde vem o código da família (coluna Familia vs
// Cod.Familia). Não grava nada.
// Uso (na VM): npx tsx --env-file=.env scripts/inspect-sb1.ts
// ============================================================
import { createOneDriveWorkerRequest, listOneDriveFiles, readOneDriveContent } from "../server/oneDriveOAuth";

async function main() {
  const req = createOneDriveWorkerRequest(process.env.ONEDRIVE_SERVICE_USER_ID ?? "");
  const listing = await listOneDriveFiles(req);
  const sb1 = listing.files
    .filter(f => f.name.startsWith("SB1 - "))
    .sort((a, b) => b.name.localeCompare(a.name))[0];
  if (!sb1) throw new Error("Nenhum SB1 - AAAAMMDDHHMM.csv encontrado no OneDrive.");
  console.log(`Arquivo: ${sb1.name} (${(sb1.size / 1048576).toFixed(0)} MB)`);
  const buf = await readOneDriveContent(req, sb1.id);
  const texto = buf.subarray(0, 6000).toString("latin1");
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  const idx = linhas.findIndex(l => l.toLowerCase().includes("familia"));
  if (idx < 0) throw new Error("Cabeçalho com 'Familia' não encontrado nas primeiras linhas.");
  const header = linhas[idx].split(";");
  console.log(`\nCabeçalho na linha ${idx + 1} (${header.length} colunas). Colunas de família:`);
  header.forEach((h, i) => {
    if (h.toLowerCase().includes("famil") || h.toLowerCase().includes("sub")) console.log(`  [${i}] ${h}`);
  });
  const iFamilia = header.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, "") === "familia");
  const iCodFamilia = header.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, "").includes("codfamilia"));
  const iSub = header.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, "").includes("subfamilia"));
  console.log(`\nÍndices: Familia=${iFamilia} · Cod.Familia=${iCodFamilia} · Sub-familia=${iSub}`);
  console.log("\nPrimeiras 3 linhas de dados (Código | Familia | Cod.Familia | Sub-familia):");
  for (const linha of linhas.slice(idx + 1, idx + 4)) {
    const col = linha.split(";");
    const iCodigo = header.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, "") === "codigo");
    console.log(`  ${col[iCodigo] ?? "?"} | Familia='${col[iFamilia] ?? "?"}' | Cod.Familia='${col[iCodFamilia] ?? "?"}' | Sub='${col[iSub] ?? "?"}'`);
  }
  process.exit(0);
}

main().catch(error => {
  console.error("ERRO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
