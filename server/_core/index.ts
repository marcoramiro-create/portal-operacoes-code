import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./vite";

const app = express();

// Body parser com limite maior para uploads
app.use(express.json({ limit: "75mb" }));
app.use(express.urlencoded({ limit: "75mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

// API tRPC
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Produção: serve os arquivos estáticos do portal
if (process.env.NODE_ENV !== "development") {
  serveStatic(app);
}

// Exporta o app para o handler api/[[...path]].ts (Vercel)
export default app;