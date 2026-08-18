import "dotenv/config";
import { getAnalyticsDashboard } from "../server/db.ts";

const [allData, branchData, typePeData, familyData, subfamilyData] = await Promise.all([
  getAnalyticsDashboard({}),
  getAnalyticsDashboard({ branch: "0101" }),
  getAnalyticsDashboard({ productType: "PE" }),
  getAnalyticsDashboard({ family: "EIXO FREIOS E RODADOS" }),
  getAnalyticsDashboard({ subfamily: "TAMBOR DE FREIO" }),
]);

const expectedBranches = ["0101", "0102", "0301", "0303"];
const isDescendingBySales = rows => rows.every((row, index) => index === 0 || rows[index - 1].salesValue13M >= row.salesValue13M);
const expectedTurnover = allData.summary.salesValue13M / allData.summary.stockValue;

if (!allData.currentImport || allData.summary.salesValue13M <= 0 || allData.summary.stockValue <= 0) {
  throw new Error("O painel não retornou vendas ou estoque financeiro da importação atual.");
}
if (Math.abs(allData.summary.turnover - expectedTurnover) > 0.000001) {
  throw new Error("O giro do painel não corresponde a CustoTot13M dividido por Total R$.");
}
if (allData.byBranch.map(row => row.label).join(",") !== expectedBranches.join(",")) {
  throw new Error("O painel não está limitado às quatro unidades prioritárias.");
}
if (branchData.byBranch.length !== 1 || branchData.byBranch[0]?.label !== "0101") {
  throw new Error("O filtro de unidade 0101 não retornou o agrupamento esperado.");
}
if (typePeData.summary.salesValue13M < 0) {
  throw new Error("O filtro de tipo PE retornou um valor inválido.");
}
if (familyData.byFamily.length !== 1 || familyData.byFamily[0]?.label !== "EIXO FREIOS E RODADOS") {
  throw new Error("O filtro de família não retornou o agrupamento esperado.");
}
if (subfamilyData.bySubfamily.length !== 1 || subfamilyData.bySubfamily[0]?.label !== "TAMBOR DE FREIO") {
  throw new Error("O filtro de subfamília não retornou o agrupamento esperado.");
}
if (!isDescendingBySales(allData.byFamily) || !isDescendingBySales(allData.bySubfamily)) {
  throw new Error("As visões de família e subfamília não estão ordenadas por vendas decrescentes.");
}

console.log(JSON.stringify({
  salesValue13M: allData.summary.salesValue13M,
  stockValue: allData.summary.stockValue,
  turnover: allData.summary.turnover,
  branches: allData.byBranch.map(row => row.label),
  productTypesValidated: ["PE"],
  families: allData.byFamily.length,
  subfamilies: allData.bySubfamily.length,
}));
