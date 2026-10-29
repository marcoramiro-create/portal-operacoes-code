import { createHash } from "node:crypto";
import { parseSb1, parseSbz, parseZfm, parseZsf } from "./protheusCatalogParsers";
import { importSb1, importSbz } from "./referenceImporters";
export type ReferenceKind = "SB1" | "SBZ" | "ZFM" | "ZSF";
export type SourceFile = { id: string; name: string; folderName: string; size: number; modifiedAt: string };
export function selectReferenceFile(files: SourceFile[], kind: ReferenceKind): SourceFile {
  const extension = kind === "ZFM" || kind === "ZSF" ? /\.(?:xlsx|xls)$/i : /\.csv$/i;
  const matches = files.filter(f => f.folderName.split("/")[0]?.toUpperCase() === kind && extension.test(f.name));
  matches.sort((a,b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  if (!matches.length) throw new Error(`Nenhum CSV encontrado na subpasta ${kind}. Nenhuma base foi alterada.`);
  if (matches.some(f => !Number.isFinite(Date.parse(f.modifiedAt)))) throw new Error(`${kind}: data de modificação inválida.`);
  if (matches.length > 1 && matches[0].modifiedAt === matches[1].modifiedAt) throw new Error(`${kind}: dois arquivos com a mesma data. Mantenha uma exportação vigente por subpasta.`);
  return matches[0];
}
export function prepareReference(kind: ReferenceKind, content: Buffer) {
  const hash = createHash("sha256").update(content).digest("hex");
  if (kind === "SB1") {
    const parsed = parseSb1(content);
    if (!parsed.rows.length) throw new Error(`${kind}: nenhum registro válido encontrado. Base anterior preservada.`);
    const rows = parsed.rows;
    const index = importSb1([["Cod Agregado","Codigo","Descricao","Familia","Sub-familia","Tipo"], ...rows.map(r => [r.aggregateProductCode || r.productCode,r.productCode,r.description,r.family,r.subfamily,r.type])]);
    const unique = new Map(index.registros.filter(r => r.code && r.code !== "0").map(r => [r.code, { code:r.code,tipo:r.tipo,familiaCode:r.familiaCode,subfamiliaCode:r.subfamiliaCode }]));
    if (!unique.size) throw new Error("SB1: nenhum código agregado válido.");
    return {
      kind,
      hash,
      sb1: [...unique.values()],
      sbz: [],
      catalog: [],
      products: rows.map(row => ({ productCode: row.productCode, family: row.family, subfamily: row.subfamily })),
    };
  }
  if (kind === "ZFM" || kind === "ZSF") {
    const parsed = kind === "ZFM" ? parseZfm(content) : parseZsf(content);
    if (!parsed.rows.length) throw new Error(`${kind}: nenhum registro válido encontrado. Base anterior preservada.`);
    return { kind, hash, sb1: [], sbz: [], catalog: parsed.rows, products: [] };
  }
  const parsed = parseSbz(content);
  if (!parsed.rows.length) throw new Error(`${kind}: nenhum registro válido encontrado. Base anterior preservada.`);
  const rows = parsed.rows;
  const index = importSbz([["Filial","Codigo","Estoq Minimo","Estoq Maximo","Entra MRP"], ...rows.map(r => [r.branchCode,r.productCode,r.minStock,r.maxStock,r.mrp ? "Sim" : "Não"]) ]);
  return { kind, hash, sb1: [], sbz:[...index.porChave.values()].map(r => ({chave:r.chave,code:r.codigo,filial:r.filial,estoqMin:r.estoqMin?.toString() ?? null,estoqMax:r.estoqMax?.toString() ?? null,entraMrp:r.entraMrp})), catalog: [], products: [] };
}
