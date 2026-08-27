import { readFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) throw new Error("Informe o caminho do XML a analisar.");

const xml = await readFile(source, "utf8");
const decode = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();

function cellsFromRow(row) {
  const cells = [];
  const cellExpression = /<Cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/Cell>)/g;
  let cell;
  let position = 1;
  while ((cell = cellExpression.exec(row))) {
    const indexMatch = cell[1].match(/(?:ss:)?Index="(\d+)"/);
    if (indexMatch) position = Number(indexMatch[1]);
    cells[position - 1] = decode(cell[2] ?? "");
    position += 1;
  }
  return cells;
}

const worksheets = [...xml.matchAll(/<Worksheet\b[^>]*(?:ss:)?Name="([^"]+)"[^>]*>/g)].map(match => match[1]);
const rowExpression = /<Row\b[^>]*>([\s\S]*?)<\/Row>/g;
const populatedRows = [];
let row;
let totalRows = 0;
while ((row = rowExpression.exec(xml))) {
  totalRows += 1;
  const cells = cellsFromRow(row[1]);
  if (cells.some(Boolean) && populatedRows.length < 12) populatedRows.push(cells);
}

console.log(JSON.stringify({
  worksheets,
  totalRows,
  firstPopulatedRows: populatedRows.map(cells => cells.map(value => value ? value.slice(0, 120) : "")),
}, null, 2));
