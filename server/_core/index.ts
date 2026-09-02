import "dotenv/config";
import express from "express";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

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
// (sem importar vite/rollup — evita o crash no Vercel)
if (process.env.NODE_ENV !== "development") {
  const distPublic = path.join(process.cwd(), "dist", "public");
  app.use(express.static(distPublic));
  // Fallback SPA: qualquer rota que não seja /api vai para o index.html
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.join(distPublic, "index.html"));
  });
}

// Exporta o app para o handler api/[[...path]].ts (Vercel)
export default app;