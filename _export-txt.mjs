// ============================================================
// _export-txt.mjs
// Exporta os arquivos .ts/.tsx/.json do projeto para .txt,
// facilitando copiar e colar no chat de suporte.
// Uso: node _export-txt.mjs  (ou dê dois cliques em exportar-txt.bat)
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(ROOT, "_txt-export");

// Pastas ignoradas (não exportadas)
const IGNORE = new Set(["node_modules", "dist", ".git", ".next", ".vercel", "_txt-export", "coverage", "build"]);

// Extensões exportadas (agora inclui .json)
const EXTENSIONS = new Set([".ts", ".tsx", ".json"]);

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

async function main() {
  // 1) Apaga e recria a pasta de destino
  await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });

  // 2) Copia todos os .ts/.tsx/.json como .txt (estrutura espelhada)
  const files = await collectFiles(ROOT);
  let count = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const destFile = path.join(DEST, rel + ".txt");
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.copyFile(file, destFile);
    count += 1;
  }

  // 3) Gera os arquivos de núcleo (com cabeçalho por arquivo)
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

  console.log("");
  console.log(`Exportacao concluida: ${count} arquivos .ts/.tsx/.json copiados para _txt-export`);
  console.log("Abra a pasta _txt-export e cole o conteudo dos arquivos _NUCLEO_*.txt no chat.");
}

main().catch((error) => {
  console.error("Erro:", error.message);
  process.exit(1);
});