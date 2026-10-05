import { readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import { importSb1, importSbz, importFamilias, importSubFamilias } from "../server/referenceImporters";
import { saveSb1References, saveSbzReferences, saveFamilyReferences, saveSubfamilyReferences } from "../server/db";

// Remove acentos para a busca não falhar por causa de "Famílias" vs "Familia"
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// A pasta com os arquivos vem do 1º argumento da linha de comando.
const FOLDER = process.argv[2];
if (!FOLDER) {
  console.error("Informe a pasta onde estão os arquivos. Ex.:");
  console.error('npx tsx --env-file=.env scripts/load-references.ts "C:\MinhaPasta"');
  process.exit(1);
}

// Procura o arquivo .xlsx MAIS RECENTE cujo nome contenha o trecho
function findFile(part: string): string {
  const candidates = readdirSync(FOLDER).filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith(".xlsx") && !lower.startsWith("~$") && normalize(f).includes(normalize(part));
  });
  if (candidates.length === 0) {
    const all = readdirSync(FOLDER).filter(f => !f.startsWith("~$"));
    throw new Error(`Nenhum arquivo .xlsx contendo "${part}" em ${FOLDER}. Arquivos presentes: ${all.join(", ")}`);
  }
  candidates.sort((a, b) => statSync(resolve(FOLDER, b)).mtimeMs - statSync(resolve(FOLDER, a)).mtimeMs);
  return resolve(FOLDER, candidates[0]);
}

async function main() {
  console.log("=== Início da carga de referências ===");

  console.log("[1/4] Localizando arquivos...");
  const sb1File = findFile("SB1");
  const sbzFile = findFile("SBZ");
  const famFile = findFile("Familias");
  const subFile = findFile("SubFamilia");
  console.log("  SB1:", sb1File);
  console.log("  SBZ:", sbzFile);
  console.log("  Familias:", famFile);
  console.log("  SubFamilia:", subFile);

  console.log("[2/4] Lendo e processando SB1...");
  const sb1 = importSb1(readFileSync(sb1File));
  console.log(`  SB1 lido: ${sb1.length} registros`);

  console.log("[2/4] Lendo e processando SBZ...");
  const sbz = importSbz(readFileSync(sbzFile));
  console.log(`  SBZ lido: ${sbz.length} registros`);

  console.log("[2/4] Lendo e processando Famílias...");
  const familias = importFamilias(readFileSync(famFile));
  console.log(`  Famílias lidas: ${familias.length} registros`);

  console.log("[2/4] Lendo e processando SubFamílias...");
  const subfamilias = importSubFamilias(readFileSync(subFile));
  console.log(`  SubFamílias lidas: ${subfamilias.length} registros`);

  console.log("[3/4] Gravando no banco (SB1, SBZ, Famílias, SubFamílias)...");
  const c1 = await saveSb1References(sb1);
  console.log(`  SB1 gravado: ${c1}`);
  const c2 = await saveSbzReferences(sbz);
  console.log(`  SBZ gravado: ${c2}`);
  const c3 = await saveFamilyReferences(familias);
  console.log(`  Famílias gravadas: ${c3}`);
  const c4 = await saveSubfamilyReferences(subfamilias);
  console.log(`  SubFamílias gravadas: ${c4}`);

  console.log("[4/4] Concluído!");
  console.log(`OK — SB1: ${c1} registros, SBZ: ${c2}, Famílias: ${c3}, SubFamílias: ${c4}`);
}
main().catch(e => { console.error("ERRO:", e); process.exit(1); });