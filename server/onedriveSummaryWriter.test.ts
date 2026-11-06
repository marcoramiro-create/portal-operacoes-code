// ============================================================
// onedriveSummaryWriter.test.ts
// ============================================================
// Cobre: projeção, atomicidade (falha em cada etapa), idempotência,
// órfãos, schema drift e produto não configurado.
// Usa um cliente OneDrive em memória — nenhuma chamada de rede.
// ============================================================

import { describe, expect, it, beforeEach } from "vitest";
import {
  cleanupOrphanTemps,
  projectColumns,
  readSummary,
  writeSummaryAtomic,
  type OneDriveClient,
  type SourceRow,
} from "./onedriveSummaryWriter";
import { SUMMARY_SCHEMAS } from "./onedriveSummarySchemas";

// ─── Cliente fake em memória ───────────────────────────────────
class FakeOneDriveClient implements OneDriveClient {
  files = new Map<string, string>();
  failOn: { op: "write" | "read" | "delete" | "rename"; path?: string } | null = null;

  async readText(path: string): Promise<string> {
    if (this.failOn?.op === "read" && (!this.failOn.path || this.failOn.path === path)) {
      throw new Error(`Falha simulada de leitura em ${path}`);
    }
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`Arquivo não encontrado: ${path}`);
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    if (this.failOn?.op === "write" && (!this.failOn.path || this.failOn.path === path)) {
      throw new Error(`Falha simulada de escrita em ${path}`);
    }
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    if (this.failOn?.op === "delete" && (!this.failOn.path || this.failOn.path === path)) {
      throw new Error(`Falha simulada de exclusão em ${path}`);
    }
    this.files.delete(path);
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    if (this.failOn?.op === "rename" && (!this.failOn.path || this.failOn.path === toPath)) {
      throw new Error(`Falha simulada de rename em ${toPath}`);
    }
    const content = this.files.get(fromPath);
    if (content === undefined) throw new Error(`Arquivo não encontrado: ${fromPath}`);
    this.files.delete(fromPath);
    this.files.set(toPath, content);
  }

  async listFiles(folder: string): Promise<string[]> {
    return Array.from(this.files.keys()).filter((p) => p.startsWith(`${folder}/`));
  }
}

// ─── Fixtures ──────────────────────────────────────────────────
const SB9_SCHEMA = SUMMARY_SCHEMAS.SB9;
const FINAL_PATH = `${SB9_SCHEMA.folder}/${SB9_SCHEMA.fileName}`;
const TMP_PATH = `${FINAL_PATH}.tmp`;

function makeSourceRow(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    Filial: "0105",
    Produto: "000000000000123",
    Armazem: "01",
    "Data Saldo": "20260930",
    "C Unit 1a M": "12,3456",
    "Qtd.Inic.Mes": "100",
    "Sld.Ini.Mes": "50",
    Grupo: "0001",
    "Cod. Produto": "000000000000123",
    "Custo Stand.": "10,00",
    "Coluna Extra Ignorada": "lixo",
    ...overrides,
  };
}

// ─── Testes ────────────────────────────────────────────────────
describe("projectColumns", () => {
  it("mantém apenas as colunas do schema, na ordem do schema", () => {
    const projected = projectColumns([makeSourceRow()], SB9_SCHEMA);
    expect(Object.keys(projected[0])).toEqual(SB9_SCHEMA.columns);
    expect(projected[0]["Coluna Extra Ignorada"]).toBeUndefined();
  });

  it("preserva TODAS as linhas", () => {
    const rows = Array.from({ length: 500 }, (_, i) => makeSourceRow({ Produto: `P${i}` }));
    const projected = projectColumns(rows, SB9_SCHEMA);
    expect(projected).toHaveLength(500);
  });

  it("preserva zeros à esquerda como string", () => {
    const projected = projectColumns([makeSourceRow({ Filial: "0105", Grupo: "0001" })], SB9_SCHEMA);
    expect(projected[0].Filial).toBe("0105");
    expect(projected[0].Grupo).toBe("0001");
  });

  it("lança erro explícito quando coluna obrigatória está ausente", () => {
    const row = makeSourceRow();
    delete row["Cod. Produto"];
    expect(() => projectColumns([row], SB9_SCHEMA)).toThrow(/Colunas obrigatórias ausentes.*Cod\. Produto/);
  });

  it("devolve array vazio para entrada vazia", () => {
    expect(projectColumns([], SB9_SCHEMA)).toEqual([]);
  });
});

describe("writeSummaryAtomic", () => {
  let client: FakeOneDriveClient;

  beforeEach(() => {
    client = new FakeOneDriveClient();
  });

  it("grava o arquivo final com header e linhas corretas", async () => {
    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    const result = await writeSummaryAtomic("SB9", rows, client);

    expect(result.rowsWritten).toBe(1);
    expect(result.columnsWritten).toBe(SB9_SCHEMA.columns.length);
    expect(result.finalPath).toBe(FINAL_PATH);

    const content = client.files.get(FINAL_PATH);
    expect(content).toBeDefined();
    expect(content!.split("\r\n")[0]).toBe(SB9_SCHEMA.columns.join(";"));
    expect(client.files.has(TMP_PATH)).toBe(false);
  });

  it("substitui o arquivo anterior sem deixar o produto sem versão", async () => {
    client.files.set(FINAL_PATH, "versao-antiga");

    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    await writeSummaryAtomic("SB9", rows, client);

    expect(client.files.get(FINAL_PATH)).not.toBe("versao-antiga");
    expect(client.files.has(TMP_PATH)).toBe(false);
  });

  it("falha na escrita do .tmp: arquivo anterior permanece intacto", async () => {
    client.files.set(FINAL_PATH, "versao-antiga");
    client.failOn = { op: "write", path: TMP_PATH };

    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    await expect(writeSummaryAtomic("SB9", rows, client)).rejects.toThrow(/Falha simulada de escrita/);

    expect(client.files.get(FINAL_PATH)).toBe("versao-antiga");
  });

  it("falha na validação: .tmp é removido e anterior permanece", async () => {
    client.files.set(FINAL_PATH, "versao-antiga");
    client.failOn = { op: "read", path: TMP_PATH };

    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    await expect(writeSummaryAtomic("SB9", rows, client)).rejects.toThrow(/Falha simulada de leitura/);

    expect(client.files.get(FINAL_PATH)).toBe("versao-antiga");
  });

  it("falha no delete do anterior: .tmp fica órfão para retry", async () => {
    client.files.set(FINAL_PATH, "versao-antiga");
    client.failOn = { op: "delete", path: FINAL_PATH };

    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    await expect(writeSummaryAtomic("SB9", rows, client)).rejects.toThrow(/Falha simulada de exclusão/);

    expect(client.files.get(FINAL_PATH)).toBe("versao-antiga");
    expect(client.files.has(TMP_PATH)).toBe(true);
  });

  it("falha no rename: .tmp fica órfão para retry", async () => {
    client.files.set(FINAL_PATH, "versao-antiga");
    client.failOn = { op: "rename", path: FINAL_PATH };

    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);
    await expect(writeSummaryAtomic("SB9", rows, client)).rejects.toThrow(/Falha simulada de rename/);

    expect(client.files.has(TMP_PATH)).toBe(true);
  });

  it("é idempotente: duas execuções produzem o mesmo conteúdo", async () => {
    const rows = projectColumns([makeSourceRow()], SB9_SCHEMA);

    await writeSummaryAtomic("SB9", rows, client);
    const first = client.files.get(FINAL_PATH);

    await writeSummaryAtomic("SB9", rows, client);
    const second = client.files.get(FINAL_PATH);

    expect(second).toBe(first);
  });

  it("recusa gravar zero linhas", async () => {
    await expect(writeSummaryAtomic("SB9", [], client)).rejects.toThrow(/Nenhuma linha/);
    expect(client.files.size).toBe(0);
  });

  it("lança erro claro para produto não configurado", async () => {
    await expect(writeSummaryAtomic("SB2", [{ x: "1" }], client)).rejects.toThrow(
      /Schema do produto SB2 não configurado/,
    );
  });
});

describe("cleanupOrphanTemps", () => {
  it("remove .tmp órfão do SB9", async () => {
    const client = new FakeOneDriveClient();
    client.files.set(TMP_PATH, "lixo");

    const removed = await cleanupOrphanTemps(client);

    expect(removed).toBe(1);
    expect(client.files.has(TMP_PATH)).toBe(false);
  });

  it("não remove nada quando não há órfãos", async () => {
    const client = new FakeOneDriveClient();
    client.files.set(FINAL_PATH, "ok");

    const removed = await cleanupOrphanTemps(client);

    expect(removed).toBe(0);
    expect(client.files.get(FINAL_PATH)).toBe("ok");
  });
});

describe("readSummary", () => {
  it("lê de volta exatamente o que foi gravado", async () => {
    const client = new FakeOneDriveClient();
    const rows = projectColumns([makeSourceRow(), makeSourceRow({ Produto: "P2" })], SB9_SCHEMA);

    await writeSummaryAtomic("SB9", rows, client);
    const readBack = await readSummary("SB9", client);

    expect(readBack).toHaveLength(2);
    expect(readBack[0].Filial).toBe("0105");
    expect(readBack[1].Produto).toBe("P2");
  });
});