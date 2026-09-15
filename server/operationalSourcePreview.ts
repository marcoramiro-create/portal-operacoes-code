import { createHash } from "node:crypto";
import { parseNfLegal, parsePurchaseOrders, parseStockEvolution } from "./operationalSourceParsers";
export type OperationalPreviewKind = "PEDIDO_COMPRA" | "NF_LEGAL" | "NF_NATIVA" | "FECHAMENTO_ESTOQUE";
export type OperationalPreview = { sourceKind: OperationalPreviewKind; fileName: string; fileHash: string; sourceRows: number; validRows: number; skippedRows: number; issues: { row: number; field: string; message: string }[]; sampleRows: unknown[] };
function hash(content: Buffer|string){return createHash("sha256").update(content).digest("hex");}
export function previewOperationalImport(sourceKind:OperationalPreviewKind,fileName:string,content:Buffer|string):OperationalPreview{const parsed=sourceKind==="PEDIDO_COMPRA"?parsePurchaseOrders(content.toString()):sourceKind==="NF_LEGAL"||sourceKind==="NF_NATIVA"?parseNfLegal(content,sourceKind):parseStockEvolution(content);return{sourceKind,fileName,fileHash:hash(content),sourceRows:parsed.sourceRows,validRows:parsed.rows.length,skippedRows:parsed.skippedRows,issues:parsed.issues.slice(0,200),sampleRows:parsed.rows.slice(0,20)};}
