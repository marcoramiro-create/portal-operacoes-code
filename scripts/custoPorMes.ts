// ============================================================
// custoPorMes.ts — imprime o Custo Total do motor, MÊS A MÊS,
// usando exatamente a função da tela (getCostEvolutionAnalise).
// Serve para validar contra os totais mensais do Excel.
//
// Uso (na VM, dentro de /home/ubuntu/portal-operacoes-homolog):
//   npx tsx --env-file=.env scripts/custoPorMes.ts 202511 202611
// ============================================================
import { getCostEvolutionAnalise } from "../server/costEvolutionAnalise";

async function main() {
  const inicio = process.argv[2] ?? "202411";
  const fim = process.argv[3] ?? "202611";
  const meses: string[] = [];
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(4, 6));
  for (;;) {
    const p = `${ano}${String(mes).padStart(2, "0")}`;
    meses.push(p);
    if (p === fim) break;
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
    if (meses.length > 60) break;
  }
  let acumulado = 0;
  for (const periodo of meses) {
    const r = await getCostEvolutionAnalise({ segment: "auto_parts", periodoInicio: periodo, periodoFim: periodo });
    const total = Number((r.cards as { custoTotal: number }).custoTotal);
    acumulado += total;
    console.log(`${periodo}\t${total.toFixed(2)}`);
  }
  console.log("---");
  console.log(`TOTAL\t${acumulado.toFixed(2)}`);
  process.exit(0);
}

void main().catch(error => {
  console.error("ERRO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
