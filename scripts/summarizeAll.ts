// ============================================================
// summarizeAll.ts — varredura automática das tabelas Protheus
// ============================================================
// Chamado pelo timer systemd (a cada 1 h). Para cada produto
// configurado em onedriveSummarySchemas.ts:
//   1. Lista Cadastros/<PRODUTO> no OneDrive e pega o original
//      mais novo (<PRODUTO> - AAAAMMDDHHMM.csv).
//   2. Compara com o último processado (estado em
//      portal_onedrive_reference_state, kind = 'SUMMARY:<PRODUTO>').
//   3. Se mudou (ou nunca processado), executa o job de redução
//      em processo isolado (o mesmo do botão do portal).
//   4. Grava o novo estado (item_id + modified_at).
// Sem mudança → "Sem alteração" e segue ao próximo produto.
//
// Uso (na VM): npx tsx --env-file=.env scripts/summarizeAll.ts
// ============================================================
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { ENV } from "../server/_core/env";
import { SUMMARY_SCHEMAS, type ProductCode, isProductConfigured } from "../server/onedriveSummarySchemas";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORITY = `https://login.microsoftonline.com/${ENV.onedriveTenantId}`;
const SCOPES = "openid profile offline_access User.Read Files.Read Files.ReadWrite";
const HOMOLOG_ROOT = "/home/ubuntu/portal-operacoes-homolog";
const SERVICE_USER_ID = process.env.ONEDRIVE_SERVICE_USER_ID ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const SUMMARY_TIMEOUT_MS = 30 * 60 * 1000;

type DriveItem = { id: string; name: string; size: number; lastModifiedDateTime: string; file?: unknown; folder?: unknown };

function fail(message: string): never {
  console.error(`[summarize-all] ERRO: ${message}`);
  process.exit(1);
}

if (process.cwd() !== HOMOLOG_ROOT) fail(`Execução bloqueada: rode de dentro de ${HOMOLOG_ROOT}.`);
if (!/^[0-9a-f-]{36}$/i.test(SERVICE_USER_ID)) fail("ONEDRIVE_SERVICE_USER_ID ausente ou inválido no .env.");

const client = new Client({
  connectionString: process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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
  if (!row) fail("OneDrive não conectado para o usuário de serviço.");
  if (new Date(row.expires_at).getTime() > Date.now() + 60_000) return decryptValue(row.access_token_enc);
  if (!row.refresh_token_enc) fail("Token expirado sem refresh disponível.");
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
  if (!response.ok) fail("Não foi possível renovar o token do OneDrive.");
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  await client.query(
    `update public.portal_onedrive_connections
        set access_token_enc=$2, refresh_token_enc=$3, expires_at=$4, updated_at=now()
      where user_id=$1`,
    [SERVICE_USER_ID, encryptValue(data.access_token), data.refresh_token ? encryptValue(data.refresh_token) : row.refresh_token_enc, new Date(Date.now() + data.expires_in * 1000)],
  );
  return data.access_token;
}

async function listChildren(token: string, itemId: string | null): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let next: string | null = itemId
    ? `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/children?$select=id,name,size,lastModifiedDateTime,file,folder&$top=200`
    : `${GRAPH}/me/drive/root/children?$select=id,name,size,lastModifiedDateTime,file,folder&$top=200`;
  while (next) {
    const response = await fetch(next, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) fail(`Falha ao listar pastas: HTTP ${response.status}.`);
    const data = await response.json() as { value?: DriveItem[]; "@odata.nextLink"?: string };
    items.push(...(data.value ?? []));
    next = typeof data["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
  }
  return items;
}

async function findCadastrosRoot(token: string): Promise<DriveItem> {
  let current: DriveItem | null = null;
  for (const segment of ["Documents", "Documentos", "Portal de Operações", "Cadastros"]) {
    const children = await listChildren(token, current?.id ?? null);
    const next = children.find(item => item.folder && item.name === segment);
    if (!next) {
      // Layout alternativo: "Documentos" direto na raiz.
      if (!current && segment === "Documents") {
        const root = await listChildren(token, null);
        const alt = root.find(item => item.folder && item.name === "Documentos");
        if (!alt) fail("Pasta Documentos não encontrada no OneDrive.");
        current = alt;
        continue;
      }
      fail(`Pasta '${segment}' não encontrada no OneDrive.`);
    }
    current = next;
  }
  return current as DriveItem;
}

function runSummaryScript(product: string): Promise<{ code: number; log: string }> {
  return new Promise(resolve => {
    const child = spawn(
      "npx",
      ["tsx", "--env-file=.env", "scripts/protheusSummaryUpload.ts", `--product=${product}`],
      { cwd: HOMOLOG_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    const collect = (chunk: unknown) => {
      log += String(chunk);
      if (log.length > 8_192) log = log.slice(-8_192);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGKILL"), SUMMARY_TIMEOUT_MS);
    child.on("close", code => { clearTimeout(timer); resolve({ code: code ?? -1, log }); });
    child.on("error", error => { clearTimeout(timer); resolve({ code: -1, log: `${log}\nERRO: ${error.message}` }); });
  });
}

async function main() {
  await client.connect();
  const dbName = (await client.query("select current_database() as n")).rows[0]?.n;
  if (dbName !== "portal_operacoes") fail(`Banco '${dbName}' não é a Homologação autorizada.`);

  const locked = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [714080])).rows[0]?.ok;
  if (!locked) fail("Outra varredura em andamento (lock ocupado).");

  const token = await accessToken();
  const cadastros = await findCadastrosRoot(token);
  const children = await listChildren(token, cadastros.id);

  const produtos = (Object.keys(SUMMARY_SCHEMAS) as ProductCode[]).filter(p => isProductConfigured(p));
  console.log(`[summarize-all] ${new Date().toISOString()} | varredura de ${produtos.length} produtos${DRY_RUN ? " (dry-run)" : ""}`);

  const resumo: string[] = [];
  for (const product of produtos) {
    const schema = SUMMARY_SCHEMAS[product];
    const sourceFolder = children.find(item => item.folder && item.name === product);
    if (!sourceFolder) { resumo.push(`${product}: pasta ausente`); continue; }
    const pattern = new RegExp(`^${product} - \\d{12}\\.csv$`);
    const fontes = (await listChildren(token, sourceFolder.id))
      .filter(item => item.file && pattern.test(item.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    if (!fontes.length) { resumo.push(`${product}: sem original`); continue; }
    const fonte = fontes[0];

    // Estado do último processado (kind = SUMMARY:<PRODUTO>).
    const kind = `SUMMARY:${product}`;
    const prior = (await client.query<{ item_id: string; modified_at: string }>(
      "select item_id, modified_at from public.portal_onedrive_reference_state where kind=$1",
      [kind],
    )).rows[0];
    if (prior && String(prior.item_id) === fonte.id
        && new Date(prior.modified_at).getTime() === new Date(fonte.lastModifiedDateTime).getTime()) {
      resumo.push(`${product}: Sem alteração`);
      continue;
    }

    if (DRY_RUN) { resumo.push(`${product}: NOVO (${fonte.name}) — seria reduzido`); continue; }

    console.log(`[summarize-all] ${product}: reduzindo ${fonte.name}…`);
    const { code, log } = await runSummaryScript(product);
    const publicada = log.includes("| Publicada |");
    if (code === 0 && publicada) {
      await client.query(
        `insert into public.portal_onedrive_reference_state (kind, item_id, file_name, file_hash, modified_at, row_count, updated_at)
         values ($1, $2, $3, 'summary', $4::timestamptz, 0, now())
         on conflict (kind) do update set item_id=$2, file_name=$3, modified_at=$4::timestamptz, updated_at=now()`,
        [kind, fonte.id, fonte.name, fonte.lastModifiedDateTime],
      );
      const publicadaLinha = log.split("\n").find(l => l.includes("| Publicada |")) ?? "";
      resumo.push(`${product}: OK — ${publicadaLinha.split("| Publicada |")[1]?.trim() ?? ""}`);
    } else {
      resumo.push(`${product}: FALHOU (exit ${code}) — ${log.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`);
    }
  }

  console.log(`[summarize-all] resultado:\n${resumo.map(r => `  ${r}`).join("\n")}`);
}

main()
  .catch(error => {
    console.error(`[summarize-all] ERRO: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.query("select pg_advisory_unlock($1)", [714080]).catch(() => undefined);
    await client.end().catch(() => undefined);
  });
