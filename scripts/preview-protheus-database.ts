import { readFile } from "node:fs/promises";
import { previewAgra045Warehouses, previewMata020Suppliers, previewSi3CostCenters } from "../server/protheusImportPreviews";

const [supplierPath, warehousePath, costCenterPath] = process.argv.slice(2);
if (!supplierPath || !warehousePath || !costCenterPath) throw new Error("Informe os caminhos do CSV MATA020, XML AGRA045 e CSV SI3.");

const [supplierContent, warehouseContent, costCenterContent] = await Promise.all([readFile(supplierPath, "utf8"), readFile(warehousePath, "utf8"), readFile(costCenterPath, "utf8")]);
const [suppliers, warehouses, costCenters] = await Promise.all([previewMata020Suppliers(supplierContent), previewAgra045Warehouses(warehouseContent), previewSi3CostCenters(costCenterContent)]);
console.log(JSON.stringify({ suppliers, warehouses, costCenters }, null, 2));
