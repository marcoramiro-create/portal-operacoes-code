import { createHash } from "node:crypto";
import { parseSb1, parseSbz } from "./protheusCatalogParsers";
import { importSb1, importSbz } from "./referenceImporters";
export type ReferenceKind = "SB1" | "SBZ";
export type SourceFile = { id: string; name: string; folderName: string; size: number; modifiedAt: string };
export function selectReferenceFile(files: SourceFile[], kind: ReferenceKind): SourceFile {
  const matches = files.filter(f => f.folderName.split("/")[0]?.toUpperCase() === kind && /\.csv$/i.test(f.name));
  matches.sort((a,b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  if (!matches.length) throw new Error(`Nenhum CSV encontrado na subpasta ${kind}. Nenhuma base foi alterada.`);
  if (matches.some(f => !Number.isFinite(Date.parse(f.modifiedAt)))) throw new Error(`${kind}: data de modificação inválida.`);
  if (matches.length > 1 && matches[0].modifiedAt === matches[1].modifiedAt) throw new Error(`${kind}: dois arquivos com a mesma data. Mantenha uma exportação vigente por subpasta.`);
  return matches[0];
}
export function prepareReference(kind: ReferenceKind, content: Buffer) {
  const parsed = kind === "SB1" ? parseSb1(content) : parseSbz(content);
  if (!parsed.rows.length || parsed.skippedRows || parsed.duplicateRows) throw new Error(`${kind}: validação bloqueada (${parsed.rows.length} válidas, ${parsed.skippedRows} inválidas, ${parsed.duplicateRows} duplicadas). Base anterior preservada.`);
  const hash = createHash("sha256").update(content).digest("hex");
  if (kind === "SB1") {
    const rows = parseSb1(content).rows;
    const index = importSb1([["Cod Agregado","Codigo","Descricao","Familia","Sub-familia","Tipo"], ...rows.map(r => [r.aggregateProductCode || r.productCode,r.productCode,r.description,r.family,r.subfamily,r.type])]);
    const unique = new Map(index.registros.filter(r => r.code && r.code !== "0").map(r => [r.code, { code:r.code,tipo:r.tipo,familiaCode:r.familiaCode,subfamiliaCode:r.subfamiliaCode }]));
    if (!unique.size) throw new Error("SB1: nenhum código agregado válido.");
    return { kind, hash, sb1: [...unique.values()], sbz: [] };
  }
  const rows = parseSbz(content).rows;
  const index = importSbz([["Filial","Codigo","Estoq Minimo","Estoq Maximo","Entra MRP"], ...rows.map(r => [r.branchCode,r.productCode,r.minStock,r.maxStock,r.mrp ? "Sim" : "Não"])]);
  return { kind, hash, sb1: [], sbz:[...index.porChave.values()].map(r => ({chave:r.chave,code:r.codigo,filial:r.filial,estoqMin:r.estoqMin?.toString() ?? null,estoqMax:r.estoqMax?.toString() ?? null,entraMrp:r.entraMrp})) };
}
