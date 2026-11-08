// ============================================================
// protheusSummaryUpload.ts — publica QUALQUER tabela Protheus
// reduzida no OneDrive (job genérico, schema-driven)
// ============================================================
// Uso (na VM, dentro de /home/ubuntu/portal-operacoes-homolog):
//   npx tsx --env-file=.env scripts/protheusSummaryUpload.ts --product SB9 --dry-run
//   npx tsx --env-file=.env scripts/protheusSummaryUpload.ts --product SB9
//
// As colunas de cada tabela vivem em server/onedriveSummarySchemas.ts
// (fonte única). Este job NÃO conhece produto: lê o schema e reduz.
// O original é lido da pasta Cadastros/<PRODUTO> (arquivo mais novo
// "<PRODUTO> - AAAAMMDDHHMM.csv") e a reduzida é publicada em
// Cadastros/<PRODUTO>_REDUZIDAS/<PRODUTO>-resumida.csv.
//
// Herda da v4 do sb9SummaryUpload (validada em 08/11):
//   • download por FAIXAS de 32 MB com HTTP Range e retomada
//     (o SharePoint corta streams longos — travava aos 25 MB)
//   • retry por faixa (4) e por bloco de upload (3)
//   • escrita atômica write-then-delete com validação de tamanho
//   • escrita serializada (sem MaxListenersExceeded)
//   • conexão única com o banco + pg_try_advisory_lock
//
// Diferenças para o SB9:
//   • o parser é CSV GENÉRICO (cabeçalho + projeção de colunas),
//     não o createSb9StreamParser — cada tabela tem colunas próprias
//   • a pasta <PRODUTO>_REDUZIDAS é CRIADA se não existir
//   • o lock é por produto (id base + índice do produto)
// ============================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { Client } from "pg";
import { ENV } from "../server/_core/env";
import { SUMMARY_SCHEMAS, type ProductCode } from "../server/onedriveSummarySchemas";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORITY = `https://login.microsoftonline.com/${ENV.onedriveTenantId}`;
const SCOPES = "openid profile offline_access User.Read Files.Read Files.ReadWrite";
const HOMOLOG_ROOT = "/home/ubuntu/portal-operacoes-homolog";
const LOCK_BASE = 714060; // 714060..714075 por produto (distintos do 714049/50)
const SERVICE_USER_ID = process.env.ONEDRIVE_SERVICE_USER_ID ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const RANGE_SIZE = 32 * 1024 * 1024; // faixas de 32 MB com retomada
const RANGE_ATTEMPTS = 4;
const RANGE_TIMEOUT_MS = 4 * 60 * 1000;
const CHUNK = 10 * 1024 * 1024; // 10 MiB — múltiplo de 320 KiB exigido pelo Graph
const CHUNK_ATTEMPTS = 3;
const CHUNK_TIMEOUT_MS = 3 * 60 * 1000;
const LOG_BYTES = 25 * 1024 * 1024;
const LOG_ROWS = 250_000;

// ─── Argumento --product ─────────────────────────────────────
const productArg = process.argv.find(a => a.startsWith("--product="))?.slice(10)
  ?? process.argv[process.argv.indexOf("--product") + 1];
const PRODUCT = (productArg ?? "").toUpperCase() as ProductCode;
const SCHEMA = SUMMARY_SCHEMAS[PRODUCT];
const STAGE_PATH = `/tmp/${PRODUCT.toLowerCase()}-resumida-${process.pid}.csv`;

type DriveItem = { id: string; name: string; size: number; lastModifiedDateTime: string; file?: unknown; folder?: unknown };

function fail(message: string): never {
  console.error(`[${PRODUCT}-resumida] ERRO: ${message}`);
  process.exit(1);
}
function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("aborted due to timeout") ? "timeout — a transferência parou de responder" : text;
}

// ─── Guardas ─────────────────────────────────────────────
if (process.cwd() !== HOMOLOG_ROOT) {
  fail(`Execução bloqueada: rode de dentro de ${HOMOLOG_ROOT}.`);
}
if (!/^[0-9a-f-]{36}$/i.test(SERVICE_USER_ID)) {
  fail("ONEDRIVE_SERVICE_USER_ID ausente ou inválido no .env.");
}
if (!SCHEMA || !SCHEMA.columns.length || !SCHEMA.folder || !SCHEMA.fileName) {
  fail(`Produto '${PRODUCT}' sem schema configurado em onedriveSummarySchemas.ts (ou --product ausente).`);
}
const LOCK_ID = LOCK_BASE + Object.keys(SUMMARY_SCHEMAS).indexOf(PRODUCT);

// Conexão ÚNICA com o banco.
const client = new Client({
  connectionString: process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Cripto (espelha oneDriveOAuth.ts) ─────────────────────
function cryptoKey() {
  return createHash("sha256").update(ENV.onedriveTokenKey).digest();
}
function decryptValue(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function accessToken(): Promise<string> {
  const row = (await client.query<{ access_token_enc: string; refresh_token_enc: string | null; expires_at: Date }>(
    "select access_token_enc, refresh_token_enc, expires_at from public.portal_onedrive_connections where user_id=$1",
    [SERVICE_USER_ID],
  )).rows[0];
  if (!row) fail("OneDrive não conectado para o usuário de serviço. Conecte pela tela do portal.");
  if (new Date(row.expires_at).getTime() > Date.now() + 60_000) return decryptValue(row.access_token_enc);
  if (!row.refresh_token_enc) fail("Token do OneDrive expirado sem refresh disponível. Reconecte pela tela do portal.");
  console.log(`[${PRODUCT}-resumida] token expirado — renovando via refresh_token…`);
  const response = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: ENV.onedriveClientId,
      client_secret: ENV.onedriveClientSecret,
      grant_type: "refresh_token",
      refresh_token: decryptValue(row.refresh_token_enc),
      scope: SCOPES,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail("Não foi possível renovar o token do OneDrive. Reconecte pela tela do portal.");
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  await client.query(
    `update public.portal_onedrive_connections
        set access_token_enc=$2, refresh_token_enc=$3, expires_at=$4, updated_at=now()
      where user_id=$1`,
    [SERVICE_USER_ID, encryptValue(data.access_token), data.refresh_token ? encryptValue(data.refresh_token) : row.refresh_token_enc, new Date(Date.now() + data.expires_in * 1000)],
  );
  console.log(`[${PRODUCT}-resumida] token renovado.`);
  return data.access_token;
}

// ─── Graph helpers ─────────────────────────────────────────
async function listChildren(token: string, itemId: string | null): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let next: string | null = itemId
    ? `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/children?$select=id,name,size,lastModifiedDateTime,file,folder&$top=200`
    : `${GRAPH}/me/drive/root/children?$select=id,name,size,lastModifiedDateTime,file,folder&$top=200`;
  while (next) {
    const response = await fetch(next, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) fail(`Falha ao listar pastas do OneDrive: HTTP ${response.status}.`);
    const data = await response.json() as { value?: DriveItem[]; "@odata.nextLink"?: string };
    items.push(...(data.value ?? []));
    next = typeof data["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
  }
  return items;
}
async function findFolderPath(token: string, segments: string[]): Promise<DriveItem | null> {
  let current: DriveItem | null = null;
  for (const segment of segments) {
    const children = await listChildren(token, current?.id ?? null);
    const next = children.find(item => item.folder && item.name === segment);
    if (!next) return null;
    current = next;
  }
  return current;
}
async function findCadastrosRoot(token: string): Promise<DriveItem> {
  for (const segments of [
    ["Documents", "Documentos", "Portal de Operações", "Cadastros"],
    ["Documentos", "Portal de Operações", "Cadastros"],
    ["Cadastros"],
  ]) {
    const found = await findFolderPath(token, segments);
    if (found) return found;
  }
  fail("Pasta Cadastros não encontrada no OneDrive (layouts conhecidos).");
}
async function createFolder(token: string, parentItemId: string, name: string): Promise<DriveItem> {
  const response = await fetch(`${GRAPH}/me/drive/items/${parentItemId}/children`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 409) {
    // Já existe — reaproveita.
    const existing = (await listChildren(token, parentItemId)).find(item => item.folder && item.name === name);
    if (!existing) fail(`Pasta ${name} existe mas não foi encontrada na listagem.`);
    return existing;
  }
  if (!response.ok) fail(`Falha ao criar a pasta ${name}: HTTP ${response.status}.`);
  return await response.json() as DriveItem;
}

// ─── CSV genérico: projeção de colunas em streaming ────────────
function escapeCsvField(value: string) {
  return value.includes(";") || value.includes('"') || value.includes("\n") || value.includes("\r")
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}
async function writeLine(out: ReturnType<typeof createWriteStream>, line: string) {
  if (!out.write(line)) await new Promise<void>(resolve => out.once("drain", resolve));
}

/**
 * Parser CSV genérico em streaming (delimitador ';', aspas escapadas).
 * Mantém um buffer por linha; ao fechar uma linha válida, projeta as
 * colunas do schema e escreve no palco. Preserva TODAS as linhas.
 */
class GenericCsvProjector {
  private buffer = "";
  private headerMap: Map<string, number> | null = null;
  rows = 0;
  skipped = 0;
  constructor(
    private readonly columns: string[],
    private readonly requiredColumns: string[],
    private readonly emit: (line: string) => void,
  ) {}

  private parseLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ";" && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  private consumeLine(line: string) {
    if (!line.length) return;
    const values = this.parseLine(line);
    if (!this.headerMap) {
      // Procura o cabeçalho: linha que contém TODAS as colunas obrigatórias.
      const map = new Map<string, number>();
      values.forEach((value, index) => map.set(value.trim(), index));
      if (this.requiredColumns.every(col => map.has(col))) {
        this.headerMap = map;
        this.emit(this.columns.map(escapeCsvField).join(";") + "\r\n");
      }
      return;
    }
    // Linha de lixo do export RM BIS, ignorada (não vira registro vazio):
    //   • máscara ". . . / -" sob o cabeçalho (linha de formatação)
    //   • linha sem CÓDIGO (primeira coluna obrigatória de identificação)
    // A linha ";00;;…;MUNICIPIO…" do SA2 (padrão do RM BIS) cai aqui.
    const firstRequired = (values[this.headerMap?.get(this.requiredColumns[0]) ?? -1] ?? "").trim();
    if (!firstRequired || /^\.\s*\.\s*\.\s*\/?\s*-?\s*$/.test(firstRequired)) {
      this.skipped += 1;
      return;
    }
    const projected = this.columns.map(col => {
      const index = this.headerMap?.get(col);
      const raw = index == null ? "" : (values[index] ?? "");
      return escapeCsvField(raw);
    });
    this.rows += 1;
    if (this.rows % LOG_ROWS === 0) console.log(`[${PRODUCT}-resumida] ${new Date().toISOString()} | ${this.rows.toLocaleString("pt-BR")} linhas projetadas`);
    this.emit(projected.join(";") + "\r\n");
  }

  push(chunk: Buffer) {
    this.buffer += chunk.toString("utf8");
    let newlineIndex: number;
    // Cabe no meio de caracteres UTF-8 multibyte? Buffer.toString já decodifica
    // o que pôde; cortes no meio de sequência são raros e auto-corrigidos no
    // próximo chunk porque o buffer preserva o resto da linha.
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.consumeLine(line);
    }
  }

  finish() {
    if (this.buffer.length) {
      this.consumeLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
    }
    if (!this.headerMap) {
      throw new Error(
        `Cabeçalho não encontrado: as colunas obrigatórias [${this.requiredColumns.join(", ")}] ` +
          `não aparecem em nenhuma linha do arquivo original.`,
      );
    }
  }
}

// ─── Fluxo principal ───────────────────────────────────────
async function main() {
  await client.connect();
  const dbName = (await client.query("select current_database() as n")).rows[0]?.n;
  if (dbName !== "portal_operacoes") fail(`Banco '${dbName}' não é a Homologação autorizada (portal_operacoes).`);

  const locked = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [LOCK_ID])).rows[0]?.ok;
  if (!locked) fail(`Outra execução do ${PRODUCT}-resumida está em andamento (lock ocupado). Tente mais tarde.`);

  const token = await accessToken();
  const cadastros = await findCadastrosRoot(token);
  const cadastrosChildren = await listChildren(token, cadastros.id);
  const sourceFolder = cadastrosChildren.find(item => item.folder && item.name === PRODUCT);
  if (!sourceFolder) fail(`Pasta Cadastros/${PRODUCT} não encontrada no OneDrive.`);
  const sourcePattern = new RegExp(`^${PRODUCT} - \\d{12}\\.csv$`);
  const fontes = (await listChildren(token, sourceFolder.id))
    .filter(item => item.file && sourcePattern.test(item.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!fontes.length) fail(`Nenhum arquivo '${PRODUCT} - AAAAMMDDHHMM.csv' na pasta Cadastros/${PRODUCT}.`);
  const fonte = fontes[0];
  console.log(`[${PRODUCT}-resumida] ${new Date().toISOString()} | Fonte: ${fonte.name} (${fonte.size} bytes)`);

  // Pasta destino: cria se não existir (nome vem do schema, ex. Cadastros/SB9_REDUZIDAS).
  const destinoSegments = SCHEMA.folder.split("/");
  const destinoName = destinoSegments[destinoSegments.length - 1];
  let destinoFolder = cadastrosChildren.find(item => item.folder && item.name === destinoName);
  if (!destinoFolder) {
    destinoFolder = await createFolder(token, cadastros.id, destinoName);
    console.log(`[${PRODUCT}-resumida] pasta ${destinoName} criada no OneDrive.`);
  }

  // Órfãos de execuções anteriores: remove antes de começar.
  const orfaos = (await listChildren(token, destinoFolder.id)).filter(item => item.file && item.name === `${SCHEMA.fileName}.tmp`);
  for (const orfao of orfaos) {
    await fetch(`${GRAPH}/me/drive/items/${orfao.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    console.log(`[${PRODUCT}-resumida] .tmp órfão removido (${orfao.name})`);
  }

  // Etapa 1 — download por faixas + projeção no palco local.
  const out = createWriteStream(STAGE_PATH, { encoding: "utf8" });
  try {
    let writeChain: Promise<void> = Promise.resolve();
    const projector = new GenericCsvProjector(SCHEMA.columns, SCHEMA.requiredColumns, line => {
      writeChain = writeChain.then(() => writeLine(out, line));
    });
    let downloaded = 0;
    let lastLogBytes = 0;
    const total = fonte.size;
    for (let start = 0; start < total; start += RANGE_SIZE) {
      const end = Math.min(start + RANGE_SIZE, total) - 1;
      let faixaError: unknown = null;
      for (let attempt = 1; attempt <= RANGE_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetch(`${GRAPH}/me/drive/items/${fonte.id}/content`, {
            headers: { authorization: `Bearer ${token}`, range: `bytes=${start}-${end}` },
            signal: AbortSignal.timeout(RANGE_TIMEOUT_MS),
          });
          if (response.status !== 206 && response.status !== 200) throw new Error(`HTTP ${response.status} na faixa ${start}-${end}.`);
          if (!response.body) throw new Error("Resposta sem corpo na faixa " + start);
          for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
            const buffer = Buffer.from(part);
            downloaded += buffer.length;
            if (downloaded - lastLogBytes >= LOG_BYTES) {
              lastLogBytes = downloaded;
              console.log(`[${PRODUCT}-resumida] ${new Date().toISOString()} | baixados ${(downloaded / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB`);
            }
            projector.push(buffer);
          }
          if (downloaded < end + 1 && start + RANGE_SIZE <= total) throw new Error(`faixa ${start}-${end} incompleta (${downloaded} recebidos)`);
          faixaError = null;
          break;
        } catch (error) {
          faixaError = error;
          if (attempt < RANGE_ATTEMPTS) {
            console.log(`[${PRODUCT}-resumida] faixa em ${(start / 1048576).toFixed(0)} MB: tentativa ${attempt} falhou (${errorMessage(error)}); repetindo em 15 s…`);
            await sleep(15_000);
          }
        }
      }
      if (faixaError) fail(`faixa ${(start / 1048576).toFixed(0)} MB não concluída após ${RANGE_ATTEMPTS} tentativas: ${errorMessage(faixaError)}`);
    }
    projector.finish();
    await writeChain;
    await new Promise<void>(resolve => out.end(resolve));
    if (!projector.rows) fail("Nenhum registro válido no arquivo fonte. Nada foi publicado.");
    const stageSize = statSync(STAGE_PATH).size;
    console.log(`[${PRODUCT}-resumida] ${new Date().toISOString()} | Palco local validado: ${projector.rows} registros, ${(stageSize / 1048576).toFixed(1)} MB (linhas ignoradas na origem: ${projector.skipped})`);

    if (DRY_RUN) {
      console.log(`[${PRODUCT}-resumida] --dry-run: nenhuma gravação no OneDrive. Removendo palco local.`);
      await unlink(STAGE_PATH);
      return;
    }

    // Etapa 2 — upload session do .tmp em blocos (retry por bloco).
    console.log(`[${PRODUCT}-resumida] publicando ${(stageSize / 1048576).toFixed(1)} MB em blocos de 10 MB…`);
    const sessionResponse = await fetch(
      `${GRAPH}/me/drive/items/${destinoFolder.id}:/${encodeURIComponent(`${SCHEMA.fileName}.tmp`)}:/createUploadSession`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!sessionResponse.ok) fail(`Falha ao abrir upload session: HTTP ${sessionResponse.status}.`);
    const { uploadUrl } = await sessionResponse.json() as { uploadUrl: string };
    const handle = await open(STAGE_PATH, "r");
    let tmpItemId: string | null = null;
    try {
      for (let offset = 0; offset < stageSize; offset += CHUNK) {
        const length = Math.min(CHUNK, stageSize - offset);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        let chunkError: unknown = null;
        for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt += 1) {
          try {
            const chunkResponse = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "content-range": `bytes ${offset}-${offset + length - 1}/${stageSize}` },
              body: buffer,
              signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
            });
            if (!chunkResponse.ok) throw new Error(`HTTP ${chunkResponse.status} no bloco em ${offset}.`);
            const payload = await chunkResponse.json().catch(() => null) as { id?: string } | null;
            if (offset + length >= stageSize) {
              if (!payload?.id) throw new Error("Upload concluído sem confirmação do Graph (.tmp sem id).");
              tmpItemId = payload.id;
            }
            chunkError = null;
            break;
          } catch (error) {
            chunkError = error;
            if (attempt < CHUNK_ATTEMPTS) {
              console.log(`[${PRODUCT}-resumida] bloco em ${offset}: tentativa ${attempt} falhou (${errorMessage(error)}); repetindo em 10 s…`);
              await sleep(10_000);
            }
          }
        }
        if (chunkError) fail(`upload do bloco em ${offset} não concluído após ${CHUNK_ATTEMPTS} tentativas: ${errorMessage(chunkError)}`);
      }
    } finally {
      await handle.close();
    }

    // Etapa 3 — confere o .tmp no Graph antes de tocar no arquivo final.
    const tmpItem = await fetch(`${GRAPH}/me/drive/items/${tmpItemId}?$select=size,name`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    if (!tmpItem.ok) fail(`Falha ao conferir o .tmp publicado: HTTP ${tmpItem.status}.`);
    const tmpMeta = await tmpItem.json() as { size: number; name: string };
    if (tmpMeta.size !== stageSize) {
      await fetch(`${GRAPH}/me/drive/items/${tmpItemId}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      fail(`Validação do .tmp falhou: tamanho no Graph (${tmpMeta.size}) difere do palco local (${stageSize}). O arquivo final anterior foi preservado.`);
    }

    // Etapa 4 — apaga o anterior e renomeia (ponto atômico).
    const anterior = (await listChildren(token, destinoFolder.id)).find(item => item.file && item.name === SCHEMA.fileName);
    if (anterior) {
      await fetch(`${GRAPH}/me/drive/items/${anterior.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    }
    const renameResponse = await fetch(`${GRAPH}/me/drive/items/${tmpItemId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: SCHEMA.fileName }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!renameResponse.ok) fail(`Falha ao renomear o .tmp para ${SCHEMA.fileName}: HTTP ${renameResponse.status}.`);

    console.log(`[${PRODUCT}-resumida] ${new Date().toISOString()} | Publicada | ${SCHEMA.fileName} | ${projector.rows} registros | ${(stageSize / 1048576).toFixed(1)} MB | ${SCHEMA.folder}`);
  } catch (error) {
    await new Promise<void>(resolve => out.end(resolve)).catch(() => undefined);
    await unlink(STAGE_PATH).catch(() => undefined);
    throw error;
  }
}

main()
  .catch(error => fail(errorMessage(error)))
  .finally(async () => {
    await unlink(STAGE_PATH).catch(() => undefined);
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    await client.end().catch(() => undefined);
  });