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

await testImport("pg", () => import("pg"));
await testImport("drizzle-orm", () => import("drizzle-orm"));
await testImport("drizzle-orm/node-postgres", () => import("drizzle-orm/node-postgres"));
await testImport("@trpc/server", () => import("@trpc/server"));
await testImport("@trpc/server/adapters/express", () => import("@trpc/server/adapters/express"));
await testImport("superjson", () => import("superjson"));
await testImport("zod", () => import("zod"));
await testImport("axios", () => import("axios"));
await testImport("jose", () => import("jose"));
await testImport("cookie", () => import("cookie"));
await testImport("xlsx", () => import("xlsx"));
await testImport("nanoid", () => import("nanoid"));
await testImport("@aws-sdk/client-s3", () => import("@aws-sdk/client-s3"));
await testImport("@aws-sdk/s3-request-presigner", () => import("@aws-sdk/s3-request-presigner"));
await testImport("@supabase/supabase-js", () => import("@supabase/supabase-js"));

app.use((req, res) => {
  res.status(200).json({ results });
});

export default app;