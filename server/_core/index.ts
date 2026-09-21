import "dotenv/config";
import express from "express";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { COOKIE_NAME } from "@shared/const";

const app = express();

app.use(express.json({ limit: "75mb" }));
app.use(express.urlencoded({ limit: "75mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

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

if (process.env.NODE_ENV !== "development") {
  const distPublic = path.join(process.cwd(), "dist", "public");
  app.use(express.static(distPublic));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distPublic, "index.html"));
  });
}

export default app;
