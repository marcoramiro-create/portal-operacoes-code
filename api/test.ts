//import { existsSync, statSync } from "node:fs";

//export default function handler(req: any, res: any) {
//  const caminho = "./dist/index.js";
//  const existe = existsSync(caminho);
//  const tamanho = existe ? statSync(caminho).size : 0;
//  res.status(200).json({ ok: true, arquivo: caminho, existe, tamanho });
//}