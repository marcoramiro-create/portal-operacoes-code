import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0023_corporate_catalog_and_curves.sql"), "utf8");

describe("migration 0023 — cadastro corporativo e curvas", () => {
  it("mantém products como cadastro corporativo e preserva origem SB1", () => {
    expect(migration).toContain("alter table public.products add column if not exists source_batch_id");
    expect(migration).toContain("source_product_code");
    expect(migration).toContain("source_system");
  });

  it("modela agregado 1:N sem tratar agregado como produto", () => {
    expect(migration).toContain("create table if not exists public.product_aggregates");
    expect(migration).toContain("create table if not exists public.product_aggregate_members");
    expect(migration).toContain("aggregate_id uuid not null references public.product_aggregates");
    expect(migration).toContain("product_id uuid not null references public.products");
  });

  it("mantém histórico da curva por produto, filial e operação", () => {
    expect(migration).toContain("create table if not exists public.sbz_product_curves");
    expect(migration).toContain("reference_period date not null");
    expect(migration).toContain("calculation_version text not null");
    expect(migration).toContain("unique(product_id, branch_code, operation, reference_period, calculation_version)");
  });

  it("habilita RLS e policies para portal_app", () => {
    expect(migration).toContain("alter table public.products enable row level security");
    expect(migration).toContain("products_portal_app");
    expect(migration).toContain("product_types_portal_app");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("product_aggregates_portal_app");
    expect(migration).toContain("sbz_product_curves_portal_app");
  });
});
