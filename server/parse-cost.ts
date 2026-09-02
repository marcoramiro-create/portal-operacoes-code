// server/parse-cost.ts
import 'dotenv/config';
import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { costRecords } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// ===== Config =====
const FILE_PATH = process.env.COST_FILE_PATH ?? 'C:/Users/mramiro/Desktop/portal-operacoes-code/OneDrive/Portal Operações/01_Importacoes_Originais/Acompanhamento de Custos - Peças - 202501+.xlsx';
const SHEET_NAME = 'Sheet';
const HEADER_ROW = 2; // linha 2 (1-based); linha 1 é o título "DATA SALDO"
const MONTH_COLUMNS = ['I','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB'];

// Limites das colunas (conforme schema do banco)
const LIMITS: Record<string, number> = {
  filial: 10,
  cod_agregado: 19,
  codigo: 19,
  descricao: 120,
  comprador_codigo: 10,
  comprador_nome: 100,
  ultima_compra: 8,
  period: 7,
  source_file: 255,
};

// ===== Helpers =====
const trim = (v: unknown): string => (v == null ? '' : String(v).trim());
const toBool = (v: unknown): boolean => trim(v).toUpperCase() === 'S';
const toNumber = (v: unknown): number | null => {
  if (v == null || trim(v) === '') return null;
  const n = Number(trim(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
// Normaliza a data para YYYYMMDD (8 chars) — cabe em varchar(8)
const normalizeDate8 = (v: unknown): string => {
  const s = trim(v);
  if (/^\d{8}$/.test(s)) return s;                 // já é YYYYMMDD
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);  // DD-MM-YYYY
  if (m2) return `${m2[3]}${m2[2]}${m2[1]}`;
  return s.slice(0, 8);                             // fallback: trunca em 8
};
const toPeriod = (v: unknown): string => {
  const m = trim(v).match(/^(\d{4})(\d{2})/);
  return m ? `${m[1]}${m[2]}` : trim(v);
};
// Código do comprador é numérico, 1 a 6 dígitos. Só aceita isso; resto vai pro nome.
const splitComprador = (v: unknown) => {
  const s = trim(v);
  const idx = s.indexOf('-');
  let codigo = '';
  let nome = s;
  if (idx !== -1) {
    codigo = s.slice(0, idx).trim();
    nome = s.slice(idx + 1).trim();
  }
  if (!/^\d{1,6}$/.test(codigo)) {
    if (codigo) nome = codigo + (nome ? ' ' + nome : '');
    codigo = '';
  }
  return { codigo, nome };
};
// Filial é um código numérico (ex.: 0306). Linhas de total/resumo (ex.: "Total Geral") são ignoradas.
const isFilialValida = (v: unknown): boolean => /^\d+$/.test(trim(v));

// ===== Main =====
async function main() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DATABASE_URL não encontrada. Verifique se o .env está na raiz do projeto.');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  const db = drizzle(pool);

  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Aba "${SHEET_NAME}" não encontrada`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const records: typeof costRecords.$inferInsert[] = [];

  for (let i = HEADER_ROW; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isFilialValida(r[0])) continue; // <-- pula vazias e "Total Geral"
    const comprador = splitComprador(r[5]);
    for (const col of MONTH_COLUMNS) {
      const colIdx = XLSX.utils.decode_col(col);
      records.push({
        filial: trim(r[0]),
        sheet_type: 'pecas',
        cod_agregado: trim(r[1]),
        codigo: trim(r[2]),
        entra_mrp: toBool(r[3]),
        descricao: trim(r[4]),
        comprador_codigo: comprador.codigo,
        comprador_nome: comprador.nome,
        ultima_compra: normalizeDate8(r[6]),
        ultimo_preco: toNumber(r[7]),
        period: toPeriod(rows[1][colIdx]),
        custo_medio: toNumber(r[colIdx]),
        source_file: 'Acompanhamento de Custos - Peças - 202501+.xlsx',
        imported_at: new Date(),
      });
    }
  }

  console.log(`Registros gerados: ${records.length}`);

  // ===== VALIDAÇÃO: identifica exatamente qual coluna/valor estoura =====
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    for (const [field, limit] of Object.entries(LIMITS)) {
      const val = (rec as any)[field];
      if (typeof val === 'string' && val.length > limit) {
        console.error(`\n❌ ESTOURO na linha ${i}: coluna "${field}" (limite ${limit})`);
        console.error(`   Valor (${val.length} chars): "${val}"`);
        console.error(`   Filial: "${rec.filial}" | Código: "${rec.codigo}" | Período: "${rec.period}"`);
        process.exit(1);
      }
    }
  }
  console.log('Validação OK: nenhum campo excede os limites.');

  // Limpa registros antigos do mesmo arquivo (evita duplicar ao re-rodar)
  await db.delete(costRecords).where(eq(costRecords.source_file, 'Acompanhamento de Custos - Peças - 202501+.xlsx'));

  const BATCH = 1000;
  for (let i = 0; i < records.length; i += BATCH) {
    await db.insert(costRecords).values(records.slice(i, i + BATCH));
  }
  console.log('Importação concluída.');
}

main().catch((e) => { console.error(e); process.exit(1); });