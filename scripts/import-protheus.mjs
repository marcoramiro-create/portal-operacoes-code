import "dotenv/config";
import { readFile } from "node:fs/promises";
import { importProtheusWorkbook } from "../server/db.ts";

const filePath = "/home/ubuntu/upload/Compras.xlsx";
const fileBuffer = await readFile(filePath);
const result = await importProtheusWorkbook("Compras.xlsx", fileBuffer);

console.log(JSON.stringify(result));
