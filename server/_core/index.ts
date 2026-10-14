import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { COOKIE_NAME } from "@shared/const";
import { finishOneDrive, startOneDrive, downloadOneDriveFile } from "../oneDriveOAuth";

const app = express();

app.use(express.json({ limit: "75mb" }));
app.use(express.urlencoded({ limit: "75mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

app.get("/api/onedrive/connect", asyncRoute(startOneDrive));
app.get("/onedrive/callback", asyncRoute(finishOneDrive));
app.get("/api/onedrive/file", asyncRoute(downloadOneDriveFile));

// A sessão própria usa o mesmo cookie httpOnly da aplicação. O marcador interno
// impede que seu token seja tratado como JWT do Supabase pelas rotas existentes.
app.use((req, _res, next) => {
  if (!req.headers.authorization && req.headers.cookie) {
    const token = req.headers.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (token) req.headers.authorization = `PortalSession ${token}`;
  }
  next();
});

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

// Rotas HTTP assíncronas precisam terminar em middleware de erro; caso contrário,
// uma rejeição no Express 4 pode derrubar o processo e produzir 502 no nginx.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const status = code === "FORBIDDEN" ? 403 : code === "BAD_GATEWAY" ? 502 : code === "UNAUTHORIZED" ? 401 : 500;
  const message = error instanceof Error ? error.message : "Erro interno ao processar a solicitação.";
  if (!res.headersSent) res.status(status).send(message);
});

if (process.env.NODE_ENV !== "development") {
  const distPublic = path.join(process.cwd(), "dist", "public");
  app.use(express.static(distPublic));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distPublic, "index.html"));
  });
}

export default app;
