import { Pool } from "pg";
import { rebuildPurchaseSalesMonthly } from "../server/purchaseSalesMonthlyStore";

if (process.env.PURCHASE_SALES_REBUILD_CONFIRM !== "HOMOLOGACAO") {
  throw new Error("Reconstrução bloqueada. Defina PURCHASE_SALES_REBUILD_CONFIRM=HOMOLOGACAO somente ao executar na VM de Homologação.");
}

const connectionString = process.env.BUSINESS_DATABASE_URL
  ?? process.env.PORTAL_DATABASE_URL
  ?? process.env.SUPABASE_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname.replace(/^\//, "") !== "portal_operacoes") {
  throw new Error("Reconstrução bloqueada: conexão ausente ou banco diferente de portal_operacoes.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  application_name: "portal-purchase-sales-materializer",
});

try {
  console.log("[Vendas mensais] Rebuild iniciado em processo separado; a tela de custos não é chamada.");
  const result = await rebuildPurchaseSalesMonthly(pool);
  console.log("[Vendas mensais] Snapshot publicado:", JSON.stringify(result));
} catch (error) {
  console.error("[Vendas mensais] Rebuild falhou; o head anterior permanece intacto:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
