import "dotenv/config";
import { getAnalyticsDashboard } from "../server/db.ts";

const [allData, branchData, curveData, familyData, subfamilyData] = await Promise.all([
  getAnalyticsDashboard({}),
  getAnalyticsDashboard({ branch: "0101" }),
  getAnalyticsDashboard({ curve: "D" }),
  getAnalyticsDashboard({ family: "EIXO FREIOS E RODADOS" }),
  getAnalyticsDashboard({ subfamily: "TAMBOR DE FREIO" }),
]);

if (!allData.currentImport || allData.summary.salesValue13M <= 0) {
  throw new Error("O painel não retornou as vendas financeiras da importação atual.");
}
if (branchData.byBranch.length !== 1 || branchData.byBranch[0]?.label !== "0101") {
  throw new Error("O filtro de unidade 0101 não retornou o agrupamento esperado.");
}
if (curveData.byCurve.length !== 1 || curveData.byCurve[0]?.label !== "D") {
  throw new Error("O filtro de curva D não retornou o agrupamento esperado.");
}
if (familyData.byFamily.length !== 1 || familyData.byFamily[0]?.label !== "EIXO FREIOS E RODADOS") {
  throw new Error("O filtro de família não retornou o agrupamento esperado.");
}
if (subfamilyData.bySubfamily.length !== 1 || subfamilyData.bySubfamily[0]?.label !== "TAMBOR DE FREIO") {
  throw new Error("O filtro de subfamília não retornou o agrupamento esperado.");
}

console.log(JSON.stringify({
  salesValue13M: allData.summary.salesValue13M,
  averageTurnover: allData.summary.capitalTurnover,
  groups: {
    branches: allData.byBranch.length,
    curves: allData.byCurve.length,
    families: allData.byFamily.length,
    subfamilies: allData.bySubfamily.length,
  },
}));
