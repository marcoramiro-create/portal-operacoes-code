import express from "express";

const app = express();
app.use(express.json({ limit: "75mb" }));

const results: Record<string, string> = {};

async function testImport(name: string, importer: () => Promise<unknown>) {
  try {
    await importer();
    results[name] = "OK";
  } catch (error: any) {
    results[name] = `FAIL: ${error?.message || String(error)}`;
  }
}

await testImport("./env", () => import("./env"));
await testImport("./context", () => import("./context"));
await testImport("./trpc", () => import("./trpc"));
await testImport("./sdk", () => import("./sdk"));
await testImport("./cookies", () => import("./cookies"));
await testImport("./oauth", () => import("./oauth"));
await testImport("./storageProxy", () => import("./storageProxy"));
await testImport("../routers", () => import("../routers"));
await testImport("../db", () => import("../db"));
await testImport("../supabasePortal", () => import("../supabasePortal"));
await testImport("../storage", () => import("../storage"));
await testImport("../assetMaintenance", () => import("../assetMaintenance"));
await testImport("../assetAttachments", () => import("../assetAttachments"));
await testImport("../assetImport", () => import("../assetImport"));
await testImport("../inventoryCatalog", () => import("../inventoryCatalog"));
await testImport("../inventoryOperations", () => import("../inventoryOperations"));
await testImport("../costEvolutionService", () => import("../costEvolutionService"));
await testImport("../registrationAccess", () => import("../registrationAccess"));
await testImport("../protheusImportPreviews", () => import("../protheusImportPreviews"));
await testImport("../protheusRegistrationParsers", () => import("../protheusRegistrationParsers"));
await testImport("../registrationImports", () => import("../registrationImports"));
await testImport("../nfReceipts", () => import("../nfReceipts"));
await testImport("../onedriveSharedLink", () => import("../onedriveSharedLink"));
await testImport("../mata020Xml", () => import("../mata020Xml"));

app.use((req, res) => {
  res.status(200).json({ results });
});

export default app;