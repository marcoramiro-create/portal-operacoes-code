import { readFile } from "node:fs/promises";
import { previewAgra045Warehouses, previewMata020Suppliers } from "../server/protheusImportPreviews";

const [supplierPath, warehousePath] = process.argv.slice(2);
if (!supplierPath || !warehousePath) throw new Error("Informe os caminhos do CSV MATA020 e XML AGRA045.");

const [supplierContent, warehouseContent] = await Promise.all([readFile(supplierPath, "utf8"), readFile(warehousePath, "utf8")]);
const [suppliers, warehouses] = await Promise.all([previewMata020Suppliers(supplierContent), previewAgra045Warehouses(warehouseContent)]);
console.log(JSON.stringify({ suppliers, warehouses }, null, 2));
