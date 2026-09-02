import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

const app = express();
const server = createServer(app);

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

// ===== Vercel (serverless) =====
// Exporta o app para o handler api/[[...path]].ts
export default app;

// ===== Local / standalone =====
// Só inicia o servidor de escuta quando NÃO está no Vercel
if (!process.env.VERCEL) {
  function isPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const srv = net.createServer();
      srv.listen(port, () => {
        srv.close(() => resolve(true));
      });
      srv.on("error", () => resolve(false));
    });
  }

  async function findAvailablePort(startPort: number = 3000): Promise<number> {
    for (let port = startPort; port < startPort + 20; port++) {
      if (await isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available port found starting from ${startPort}`);
  }

  async function startServer() {
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, server);
    }
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }

  startServer().catch(console.error);
}