import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0024_portal_auth_foundation.sql"), "utf8");

describe("migration 0024 — fundação de autenticação própria", () => {
  it("reaproveita portal_users sem criar cadastro paralelo", () => {
    expect(migration).toContain("alter table public.portal_users");
    expect(migration).toContain("password_hash text");
    expect(migration).toContain("user_id uuid not null references public.portal_users");
  });

  it("modela sessões revogáveis e com expiração", () => {
    expect(migration).toContain("create table if not exists public.portal_sessions");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("revoked_at timestamptz");
    expect(migration).toContain("expires_at timestamptz not null");
  });

  it("modela tokens de recuperação de uso único", () => {
    expect(migration).toContain("create table if not exists public.portal_password_reset_tokens");
    expect(migration).toContain("used_at timestamptz");
    expect(migration).toContain("portal_password_reset_tokens_active_user_idx");
  });

  it("registra eventos de autenticação e não armazena senha em texto", () => {
    expect(migration).toContain("create table if not exists public.portal_auth_events");
    expect(migration).toContain("login_success");
    expect(migration).toContain("login_failure");
    expect(migration).toContain("password_reset_completed");
    expect(migration).toContain("password_hash text");
    expect(migration).not.toContain("password text");
  });

  it("habilita RLS e grants para o usuário da aplicação", () => {
    expect(migration).toContain("alter table public.portal_sessions enable row level security");
    expect(migration).toContain("portal_sessions_portal_app");
    expect(migration).toContain("portal_password_reset_tokens_portal_app");
    expect(migration).toContain("portal_auth_events_portal_app");
  });
});
