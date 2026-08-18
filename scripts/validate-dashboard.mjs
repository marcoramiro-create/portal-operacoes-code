import "dotenv/config";
import { getAnalyticsDashboard } from "../server/db.ts";

const [allStores, store0101, curveD] = await Promise.all([
  getAnalyticsDashboard({}),
  getAnalyticsDashboard({ branch: "0101" }),
  getAnalyticsDashboard({ curve: "D" }),
]);

if (!allStores.currentImport || allStores.summary.sales13M <= 0) {
  throw new Error("O painel consolidado não retornou os dados da importação.");
}
if (store0101.byBranch.length !== 1 || store0101.byBranch[0]?.branch !== "0101") {
  throw new Error("O filtro de loja 0101 não retornou o agrupamento esperado.");
}
if (curveD.byCurve.length !== 1 || curveD.byCurve[0]?.curve !== "D") {
  throw new Error("O filtro da curva D não retornou o agrupamento esperado.");
}

console.log(JSON.stringify({
  consolidatedSales: allStores.summary.sales13M,
  store0101Sales: store0101.summary.sales13M,
  curveDSales: curveD.summary.sales13M,
}));
