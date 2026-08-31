import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerStorageProxy } from "./storageProxy";
import { registerOAuthRoutes } from "./oauth";

const app = express();

let initError: string | null = null;

try {
  app.use(express.json({ limit: "75mb" }));
  app.use(express.urlencoded({ limit: "75mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
} catch (error: any) {
  initError = error?.stack || error?.message || String(error);
  console.error("[Lambda] Init failed:", initError);
  app.use("/api/trpc", (req, res) => {
    res.status(500).json({ error: { json: { message: `Server init failed: ${initError}`, code: -32600 } } });
  });
}

app.use((req, res) => {
  if (initError) {
    res.status(500).json({ error: { json: { message: `Server init failed: ${initError}`, code: -32600 } } });
  } else {
    res.status(404).send("Not found");
  }
});

export default app;