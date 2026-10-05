import { createHash } from "node:crypto";
import type { Sb1Row, Sb5Row, Sa2Row, SbzRow } from "./protheusCatalogParsers";
import { parseSa2, parseSb1, parseSb5, parseSbz } from "./protheusCatalogParsers";
export type CatalogPreviewKind = "SB1" | "SBZ" | "SB5" | "SA2";
export type CatalogPreview = { sourceKind: CatalogPreviewKind; fileName: string; fileHash: string; sourceRows: number; validRows: number; skippedRows: number; duplicateRows: number; issues: { row: number; field: string; message: string }[]; sampleRows: Array<Sb1Row | SbzRow | Sb5Row | Sa2Row> };
function hash(content: Buffer | string) { return createHash("sha256").update(content).digest("hex"); }
export function previewCatalogImport(sourceKind: CatalogPreviewKind, fileName: string, content: Buffer | string): CatalogPreview { const parsed = sourceKind === "SB1" ? parseSb1(content) : sourceKind === "SBZ" ? parseSbz(content) : sourceKind === "SB5" ? parseSb5(content) : parseSa2(content); return { sourceKind, fileName, fileHash: hash(content), sourceRows: parsed.sourceRows, validRows: parsed.rows.length, skippedRows: parsed.skippedRows, duplicateRows: parsed.duplicateRows, issues: parsed.issues.slice(0, 200), sampleRows: parsed.rows.slice(0, 20) }; }
