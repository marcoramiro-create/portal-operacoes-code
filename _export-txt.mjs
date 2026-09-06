// ============================================================
// _export-txt.mjs
// Exporta os arquivos .ts/.tsx/.json/.sql do projeto para .txt,
// facilitando copiar e colar no chat de suporte.
// Tambem gera:
//   - _ESTRUTURA_PROJETO.txt (arvore de pastas e arquivos)
//   - _PROGRESSO.txt (data/hora da exportacao + estatisticas)
// Uso: node _export-txt.mjs  (ou de dois cliques em exportar-txt.bat)
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(ROOT, "_txt-export");

// Pastas ignoradas (nao exportadas)
// Obs: "OneDrive" e a pasta de sincronizacao do computador, nao faz parte do codigo
const IGNORE = new Set(["node_modules", "dist", ".git", ".next", ".vercel", "_txt-export", "coverage", "build", "OneDrive"]);

// Extensoes exportadas (agora inclui .json e .sql)
const EXTENSIONS = new Set([".ts", ".tsx", ".json", ".sql"]);

// Grupos de arquivos importantes (gerados separados, prontos para colar no chat)
const GROUPS = {
  "_NUCLEO_1_FUNDACAO.txt": [
    "vercel.json",
    "package.json",
    "tsconfig.json",
    "api/[[...path]].ts",
    "server/routers.ts",
    "server/_core/index.ts",
    "server/_core/trpc.ts",
    "client/src/lib/trpc.ts",
  ],
  "_NUCLEO_2_CUSTOS.txt": [
    "server/routers/costEvolution.ts",
    "server/costEvolution.ts",
    "server/costEvolutionAnalise.ts",
    "server/costEvolutionService.ts",
    "client/src/pages/CostEvolution.tsx",
  ],
  "_NUCLEO_3_PORTAL.txt": [
    "server/routers/portal.ts",
  ],
};

// Formata a data/hora atual no padrao dd/mm/aaaa hh:mm
function agora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Percorre o projeto e devolve a lista de arquivos com as extensoes desejadas
async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await collectFiles(full));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

// Monta a arvore de pastas/arquivos do projeto (sem as pastas ignoradas)
async function buildTree(dir, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let lines = [];
  const visibles = entries.filter((e) => !IGNORE.has(e.name));
  visibles.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < visibles.length; i++) {
    const entry = visibles[i];
    const isLast = i === visibles.length - 1;
    const branch = prefix + (isLast ? "└── " : "├── ");
    lines.push(branch + entry.name);
    if (entry.isDirectory()) {
      const next = prefix + (isLast ? "    " : "│   ");
      lines = lines.concat(await buildTree(path.join(dir, entry.name), next));
    }
  }
  return lines;
}

async function main() {
  // 1) Apaga e recria a pasta de destino
  await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });

  // 2) Copia todos os .ts/.tsx/.json/.sql como .txt (estrutura espelhada)
  const files = await collectFiles(ROOT);
  let count = 0;
  const porExtensao = {};
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const destFile = path.join(DEST, rel + ".txt");
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.copyFile(file, destFile);
    count += 1;
    const ext = path.extname(file);
    porExtensao[ext] = (porExtensao[ext] || 0) + 1;
  }

  // 3) Gera os arquivos de nucleo (com cabecalho por arquivo)
  for (const [groupName, relFiles] of Object.entries(GROUPS)) {
    let output = "";
    let groupCount = 0;
    for (const rel of relFiles) {
      const source = path.join(ROOT, rel);
      try {
        const content = await fs.readFile(source, "utf8");
        output += `\n// ============================================================\n// ARQUIVO: ${rel}\n// ============================================================\n\n${content}\n`;
        groupCount += 1;
      } catch {
        output += `\n// ============================================================\n// ARQUIVO: ${rel}\n// (NAO ENCONTRADO)\n// ============================================================\n`;
      }
    }
    await fs.writeFile(path.join(DEST, groupName), output, "utf8");
    console.log(`Gerado: ${groupName} (${groupCount} arquivo(s))`);
  }

  // 4) Gera o nucleo do banco (junta TODOS os .sql de supabase/migrations)
  const migracoesDir = path.join(ROOT, "supabase", "migrations");
  let sqlOutput = "";
  let sqlCount = 0;
  try {
    const sqlFiles = (await fs.readdir(migracoesDir)).filter((n) => n.endsWith(".sql")).sort();
    for (const name of sqlFiles) {
      const content = await fs.readFile(path.join(migracoesDir, name), "utf8");
      sqlOutput += `\n-- ============================================================\n-- ARQUIVO: supabase/migrations/${name}\n-- ============================================================\n\n${content}\n`;
      sqlCount += 1;
    }
  } catch {
    sqlOutput = "\n// (PASTA supabase/migrations NAO ENCONTRADA)\n";
  }
  await fs.writeFile(path.join(DEST, "_NUCLEO_4_BANCO.txt"), sqlOutput, "utf8");
  console.log(`Gerado: _NUCLEO_4_BANCO.txt (${sqlCount} arquivo(s) .sql)`);

  // 5) Gera o arquivo de estrutura do projeto
  const treeLines = await buildTree(ROOT);
  const estrutura = `// ============================================================\n// ESTRUTURA DO PROJETO\n// Gerado automaticamente em ${agora()}\n// (pastas ignoradas: node_modules, dist, .git, .next, .vercel, _txt-export, coverage, build, OneDrive)\n// ============================================================\n\n${treeLines.join("\n")}\n`;
  await fs.writeFile(path.join(DEST, "_ESTRUTURA_PROJETO.txt"), estrutura, "utf8");
  console.log("Gerado: _ESTRUTURA_PROJETO.txt");

  // 6) Gera o arquivo de progresso / ultima exportacao
  let linhasPorExtensao = "";
  for (const [ext, qtd] of Object.entries(porExtensao).sort()) {
    linhasPorExtensao += `  ${ext}: ${qtd} arquivo(s)\n`;
  }
  const progresso = `// ============================================================\n// PROGRESSO / ULTIMA EXPORTACAO\n// ============================================================\n\nData e hora da exportacao: ${agora()}\n\nArquivos exportados por tipo:\n${linhasPorExtensao}Total de arquivos: ${count}\n`;
  await fs.writeFile(path.join(DEST, "_PROGRESSO.txt"), progresso, "utf8");
  console.log("Gerado: _PROGRESSO.txt");

  console.log("");
  console.log(`Exportacao concluida: ${count} arquivos .ts/.tsx/.json/.sql copiados para _txt-export`);
  console.log("Abra a pasta _txt-export e cole no chat: _NUCLEO_*.txt, _ESTRUTURA_PROJETO.txt e _PROGRESSO.txt.");
}

main().catch((error) => {
  console.error("Erro:", error.message);
  process.exit(1);
});