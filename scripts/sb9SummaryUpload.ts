// ============================================================
// sb9SummaryUpload.ts — publica a SB9 RESUMIDA no OneDrive
// ============================================================
// Papel no pipeline: etapa 1+2 (reduzir colunas e publicar em
// Cadastros/SB9_REDUZIDAS/SB9-resumida.csv), lendo o ORIGINAL
// direto do OneDrive — substitui vigia.js + sb9-upload.cjs.
//
// v2 (08/11): conexão ÚNICA com o banco (Client, não Pool) — a v1
// usava Pool max=1 e deadlockava: o advisory lock ocupava a única
// conexão e a leitura do token esperava uma segunda para sempre.
// Lock agora é try (não-bloqueante) com mensagem clara, e o job
// loga progresso: a cada 25 MB baixados e 250 mil linhas parseadas.
//
// Disciplina atômica (mesma do onedriveSummaryWriter.ts):
//   1. Grava SB9-resumida.csv.tmp no OneDrive (upload session)
//   2. Confere o tamanho do .tmp no Graph == tamanho local
//   3. Apaga SB9-resumida.csv anterior
//   4. Renomeia .tmp → SB9-resumida.csv
// Em qualquer falha antes do passo 4, o arquivo final anterior
// permanece intacto.
//
// Colunas: SUMMARY_SCHEMAS.SB9 (onedriveSummarySchemas.ts) é a
// FONTE ÚNICA.
//
// Uso (na VM, dentro de /home/ubuntu/portal-operacoes-homolog):
//   npx tsx --env-file=.env scripts/sb9SummaryUpload.ts --dry-run
//   npx tsx --env-file=.env scripts/sb9SummaryUpload.ts
// ============================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { Client } from "pg";
import { ENV } from "../server/_core/env";
import { createSb9StreamParser, type Sb9Row } from "../server/protheusCatalogParsers";
import { SUMMARY_SCHEMAS } from "../server/onedriveSummarySchemas";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORITY = `https://login.microsoftonline.com/${ENV.onedriveTenantId}`;
const SCOPES = "openid profile offline_access User.Read Files.Read Files.ReadWrite";
const HOMOLOG_ROOT = "/home/ubuntu/portal-operacoes-homolog";
const ADVISORY_LOCK_ID = 714050; // distinto do 714049 (sync de importação)
const SERVICE_USER_ID = process.env.ONEDRIVE_SERVICE_USER_ID ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const SCHEMA = SUMMARY_SCHEMAS.SB9;
const STAGE_PATH = `/tmp/sb9-resumida-${process.pid}.csv`;
const CHUNK = 10 * 1024 * 1024; // 10 MiB — múltiplo de 320 KiB exigido pelo Graph
const LOG_BYTES = 25 * 1024 * 1024; // progresso a cada 25 MB
const LOG_ROWS = 250_000; // progresso a cada 250 mil linhas

type DriveItem = { id: string; name: string; size: number; lastModifiedDateTime: string; file?: unknown; folder?: unknown };

function fail(message: string): never {
  console.error(`[sb9-resumida] ERRO: ${message}`);
  process.exit(1);
}

// ─── Guardas de execução ───────────────────────────────────────
if (process.cwd() !== HOMOLOG_ROOT) {
  fail(`Execução bloqueada: rode de dentro de ${HOMOLOG_ROOT}.`);
}
if (!/^[0-9a-f-]{36}$/i.test(SERVICE_USER_ID)) {
  fail("ONEDRIVE_SERVICE_USER_ID ausente ou inválido no .env.");
}

// Conexão ÚNICA: todo SQL do job passa por ela (lock, token, nada
// de segunda conexão — elimina a classe de deadlock da v1).
const client = new Client({
  connectionString: process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Cripto (espelha oneDriveOAuth.ts — mesma derivação de chave) ──
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
  console.log("[sb9-resumida] token expirado — renovando via refresh_token…");
  const response = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: ENV.onedriveClientId,
      client_secret: ENV.onedriveClientSecret,
      grant_type: "refresh_token",
      refresh_token: decryptValue(row.refresh_token_enc),
      scope: SCOPES,
    }),
  });
  if (!response.ok) fail("Não foi possível renovar o token do OneDrive. Reconecte pela tela do portal.");
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  await client.query(
    `update public.portal_onedrive_connections
        set access_token_enc=$2, refresh_token_enc=$3, expires_at=$4, updated_at=now()
      where user_id=$1`,
    [SERVICE_USER_ID, encryptValue(data.access_token), data.refresh_token ? encryptValue(data.refresh_token) : row.refresh_token_enc, new Date(Date.now() + data.expires_in * 1000)],
  );
  console.log("[sb9-resumida] token renovado.");
  return data.access_token;
}

// ─── Graph helpers ─────────────────────────────────────────────
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
  // A pasta Cadastros já apareceu em dois layouts no drive; tenta os dois.
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

function escapeCsvField(value: string) {
  return value.includes(";") || value.includes('"') || value.includes("\n") || value.includes("\r")
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

function summaryLine(row: Sb9Row) {
  const values: Record<string, string> = {
    "Filial": row.branchCode,
    "Produto": row.productCode,
    "Armazem": row.warehouseCode,
    "Data Saldo": row.balanceDate,
    "C Unit 1a M": row.unitCost1aM,
    "Qtd.Inic.Mes": row.initialQuantity,
    "Sld.Ini.Mes": row.initialBalance,
    "Grupo": row.groupCode,
    "Cod. Produto": row.auditProductCode,
    "Custo Stand.": row.standardCost,
  };
  return SCHEMA.columns.map(column => escapeCsvField(values[column] ?? "")).join(";");
}

async function writeLine(out: ReturnType<typeof createWriteStream>, line: string) {
  if (!out.write(line)) await new Promise<void>(resolve => out.once("drain", resolve));
}

// ─── Fluxo principal ───────────────────────────────────────────
let stageCreated = false;
try {
  await client.connect();
  const dbName = (await client.query("select current_database() as n")).rows[0]?.n;
  if (dbName !== "portal_operacoes") fail(`Banco '${dbName}' não é a Homologação autorizada (portal_operacoes).`);

  // Lock NÃO-bloqueante: se outra execução estiver de pé, avisa e sai.
  const locked = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [ADVISORY_LOCK_ID])).rows[0]?.ok;
  if (!locked) fail("Outra execução do sb9SummaryUpload está em andamento (lock ocupado). Tente mais tarde.");

  const token = await accessToken();
  const cadastros = await findCadastrosRoot(token);
  const cadastrosChildren = await listChildren(token, cadastros.id);
  const sb9Folder = cadastrosChildren.find(item => item.folder && item.name === "SB9");
  if (!sb9Folder) fail("Pasta Cadastros/SB9 não encontrada no OneDrive.");
  const reduzidasFolder = cadastrosChildren.find(item => item.folder && item.name === "SB9_REDUZIDAS");
  if (!reduzidasFolder) fail("Pasta Cadastros/SB9_REDUZIDAS não encontrada no OneDrive (crie-a vazia no OneDrive).");

  const sb9Children = await listChildren(token, sb9Folder.id);
  const fontes = sb9Children
    .filter(item => item.file && /^SB9 - \d{12}\.csv$/.test(item.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!fontes.length) fail("Nenhum arquivo 'SB9 - AAAAMMDDHHMM.csv' na pasta Cadastros/SB9.");
  const fonte = fontes[0];
  console.log(`[sb9-resumida] ${new Date().toISOString()} | Fonte: ${fonte.name} (${fonte.size} bytes)`);

  // Órfão de execução anterior: remove antes de começar.
  const orfaos = (await listChildren(token, reduzidasFolder.id)).filter(item => item.file && item.name === `${SCHEMA.fileName}.tmp`);
  for (const orfao of orfaos) {
    await fetch(`${GRAPH}/me/drive/items/${orfao.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    console.log(`[sb9-resumida] .tmp órfão removido (${orfao.name})`);
  }

  // Etapa 1 — download em streaming + palco local com as colunas do schema.
  const out = createWriteStream(STAGE_PATH, { encoding: "utf8" });
  stageCreated = true;
  await writeLine(out, SCHEMA.columns.map(escapeCsvField).join(";") + "\r\n");
  let rows = 0;
  let downloaded = 0;
  let lastLogBytes = 0;
  const parser = createSb9StreamParser((row: Sb9Row) => {
    rows += 1;
    if (rows % LOG_ROWS === 0) console.log(`[sb9-resumida] ${new Date().toISOString()} | ${rows.toLocaleString("pt-BR")} linhas parseadas`);
    void writeLine(out, summaryLine(row) + "\r\n");
  });
  const content = await fetch(`${GRAPH}/me/drive/items/${fonte.id}/content`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(900_000),
  });
  if (!content.ok || !content.body) fail(`Falha ao baixar ${fonte.name}: HTTP ${content.status}.`);
  console.log(`[sb9-resumida] download iniciado (${(fonte.size / 1048576).toFixed(0)} MB)…`);
  for await (const part of content.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(part);
    downloaded += buffer.length;
    if (downloaded - lastLogBytes >= LOG_BYTES) {
      lastLogBytes = downloaded;
      console.log(`[sb9-resumida] ${new Date().toISOString()} | baixados ${(downloaded / 1048576).toFixed(0)} de ${(fonte.size / 1048576).toFixed(0)} MB`);
    }
    parser.push(buffer);
  }
  const parsed = parser.finish();
  await new Promise<void>(resolve => out.end(resolve));
  if (!rows) fail("Nenhum registro válido no arquivo fonte. Nada foi publicado.");
  const stageSize = statSync(STAGE_PATH).size;
  console.log(`[sb9-resumida] ${new Date().toISOString()} | Palco local validado: ${rows} registros, ${(stageSize / 1048576).toFixed(1)} MB (linhas ignoradas na origem: ${parsed.skippedRows})`);

  if (DRY_RUN) {
    console.log("[sb9-resumida] --dry-run: nenhuma gravação no OneDrive. Removendo palco local.");
    await unlink(STAGE_PATH);
    stageCreated = false;
    process.exit(0);
  }

  // Etapa 2 — upload session do .tmp em blocos.
  console.log(`[sb9-resumida] publicando ${(stageSize / 1048576).toFixed(1)} MB em blocos de 10 MB…`);
  const sessionResponse = await fetch(
    `${GRAPH}/me/drive/items/${reduzidasFolder.id}:/${encodeURIComponent(`${SCHEMA.fileName}.tmp`)}:/createUploadSession`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
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
      const chunkResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-range": `bytes ${offset}-${offset + length - 1}/${stageSize}` },
        body: buffer,
      });
      if (!chunkResponse.ok) fail(`Falha no upload do bloco em ${offset}: HTTP ${chunkResponse.status}.`);
      const payload = await chunkResponse.json().catch(() => null) as { id?: string } | null;
      if (offset + length >= stageSize) {
        if (!payload?.id) fail("Upload concluído sem confirmação do Graph (.tmp sem id).");
        tmpItemId = payload.id;
      }
    }
  } finally {
    await handle.close();
  }

  // Etapa 3 — confere o .tmp no Graph antes de tocar no arquivo final.
  const tmpItem = await fetch(`${GRAPH}/me/drive/items/${tmpItemId}?$select=size,name`, { headers: { authorization: `Bearer ${token}` } });
  if (!tmpItem.ok) fail(`Falha ao conferir o .tmp publicado: HTTP ${tmpItem.status}.`);
  const tmpMeta = await tmpItem.json() as { size: number; name: string };
  if (tmpMeta.size !== stageSize) {
    await fetch(`${GRAPH}/me/drive/items/${tmpItemId}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    fail(`Validação do .tmp falhou: tamanho no Graph (${tmpMeta.size}) difere do palco local (${stageSize}). O arquivo final anterior foi preservado.`);
  }

  // Etapa 4 — apaga o anterior e renomeia (ponto atômico).
  const anterior = (await listChildren(token, reduzidasFolder.id)).find(item => item.file && item.name === SCHEMA.fileName);
  if (anterior) {
    await fetch(`${GRAPH}/me/drive/items/${anterior.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  }
  const renameResponse = await fetch(`${GRAPH}/me/drive/items/${tmpItemId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: SCHEMA.fileName }),
  });
  if (!renameResponse.ok) fail(`Falha ao renomear o .tmp para ${SCHEMA.fileName}: HTTP ${renameResponse.status}.`);

  console.log(`[sb9-resumida] ${new Date().toISOString()} | Publicada | ${SCHEMA.fileName} | ${rows} registros | ${(stageSize / 1048576).toFixed(1)} MB | ${SCHEMA.folder}`);
} finally {
  if (stageCreated) await unlink(STAGE_PATH).catch(() => undefined);
  await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]).catch(() => undefined);
  await client.end().catch(() => undefined);
}
