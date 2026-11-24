# Tabela para validação fiscal/controladoria — 2025 Q1

**Data da análise:** 23/11/2026  
**Escopo:** leitura local de SB1, SD1, SF1 e SB9. Nenhum banco remoto, código funcional ou ambiente foi alterado.

## Como ler

- **Valor do item SD1:** valor das linhas do produto filtrado.
- **Valor total SF1:** valor da nota inteira, podendo conter outros produtos. Não deve ser atribuído automaticamente ao produto focal.
- **Custo de entrada:** `valor do item SD1 / quantidade do item SD1`.
- **Custo SB9:** `C Unit 1a M` da SB9, usado apenas para comparação.
- **Frete/seguro/despesas:** campos explicitamente informados nas fontes; não foram calculados por estimativa.

---

## 1. Resumo comparativo principal

| Segmento | Filial | Armazém | Produto | Mês | Qtd. entrada | Valor item SD1 | Custo entrada | Custo SB9 | Diferença unitária | Diferença % | Frete | Seguro | Despesa |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Autopeças | 0303 | 01 | 100000142456 | 01/2025 | 64 | R$ 26.902,40 | R$ 420,3500 | R$ 383,9860 | R$ 36,3640 | 9,47% | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| Autopeças | 0303 | 01 | 100000142456 | 03/2025 | 48 | R$ 20.176,80 | R$ 420,3500 | R$ 420,2450 | R$ 0,1050 | 0,02% | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| Indústria | 0105 | 20 | 04088 | 01/2025 | 44.878 | R$ 284.526,52 | R$ 6,3400 | R$ 5,2101 | R$ 1,1299 | 21,69% | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| Indústria | 0105 | 20 | 04088 | 02/2025 | 30.005 | R$ 190.231,70 | R$ 6,3400 | R$ 5,2298 | R$ 1,1102 | 21,23% | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| Indústria | 0105 | 20 | 04088 | 03/2025 | 23.410 | R$ 148.419,40 | R$ 6,3400 | R$ 5,2253 | R$ 1,1147 | 21,33% | R$ 0,00 | R$ 0,00 | R$ 0,00 |

### Observação sobre o armazém 01 da Indústria

Para o produto `04088`, a SB9 do armazém `01` apresentou custo unitário zero nos três meses. A comparação principal acima usa o armazém `20`, que possui custo positivo e é o armazém onde as entradas do caso foram classificadas.

---

## 2. Detalhamento das notas de Autopeças

**Produto:** `100000142456`  
**Agregado:** `301010414-MGT` — Tambor de freio 16,5x8 Outboard  
**Filial/armazém:** `0303 / 01`  
**CFOP:** `2102`

| Mês | Documento/série | Data recebimento SF1 | Qtd. do produto | Valor do produto SD1 | Unitário SD1 | Valor mercadoria SF1 — nota inteira | Valor bruto SF1 — nota inteira | ICMS SF1 — nota inteira | IPI SF1 — nota inteira | Frete SF1 | Despesas SF1 | Seguro SF1 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 01/2025 | 000007303 / 100 | 31/01/2025 | 64 | R$ 26.902,40 | R$ 420,35 | R$ 47.079,20 | R$ 48.609,28 | R$ 3.295,54 | R$ 1.530,08 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| 03/2025 | 000007598 / 100 | 24/03/2025 | 48 | R$ 20.176,80 | R$ 420,35 | R$ 62.211,80 | R$ 64.233,69 | R$ 4.354,83 | R$ 2.021,89 | R$ 0,00 | R$ 0,00 | R$ 0,00 |

**Atenção:** os valores SF1 das notas acima são maiores que o valor do produto porque as notas contêm outros itens. Não usar `Vlr.Mercad` ou `Vlr.Bruto` da SF1 como se fossem o valor do produto `100000142456`.

---

## 3. Detalhamento das notas da Indústria

**Produto/agregado:** `04088` — Tubo aço 80x80x4,75x6000mm A500  
**Filial/armazém:** `0105 / 20`  
**CFOP:** `1101`  
**Unitário SD1 em todos os documentos:** R$ 6,34

| Mês | Documento/série | Data recebimento SF1 | Qtd. do produto | Valor do produto SD1 | Valor mercadoria SF1 — nota inteira | Valor bruto SF1 — nota inteira | ICMS SF1 — nota inteira | IPI SF1 — nota inteira | Frete SF1 | Despesas SF1 | Seguro SF1 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 01/2025 | 000102952 / 2 | 24/01/2025 | 31.607 | R$ 200.388,38 | R$ 200.388,38 | R$ 210.407,80 | R$ 18.929,49 | R$ 10.019,42 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| 01/2025 | 000102979 / 2 | 24/01/2025 | 9.958 | R$ 63.133,72 | R$ 195.018,40 | R$ 204.769,33 | R$ 18.422,21 | R$ 9.750,93 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| 01/2025 | 000103043 / 2 | 30/01/2025 | 3.313 | R$ 21.004,42 | R$ 113.255,90 | R$ 118.918,69 | R$ 10.698,61 | R$ 5.662,79 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| 02/2025 | 000103519 / 2 | 24/02/2025 | 30.005 | R$ 190.231,70 | R$ 190.231,70 | R$ 199.743,29 | R$ 17.970,05 | R$ 9.511,59 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| 03/2025 | 000104010 / 2 | 20/03/2025 | 23.410 | R$ 148.419,40 | R$ 191.802,06 | R$ 201.392,16 | R$ 18.118,39 | R$ 9.590,10 | R$ 0,00 | R$ 0,00 | R$ 0,00 |

**Atenção:** em algumas notas o valor mercadoria SF1 é maior que o valor do produto focal porque a nota contém outros itens. O cabeçalho SF1 não deve ser rateado para o produto sem regra fiscal/contábil aprovada.

---

## 4. Saldo inicial observado na SB9 da Indústria

| Mês | Filial | Armazém | Produto | Custo unitário SB9 | Saldo inicial informado na SB9 |
|---|---:|---:|---|---:|---:|
| 01/2025 | 0105 | 20 | 04088 | R$ 5,2101 | 430.703,45 |
| 02/2025 | 0105 | 20 | 04088 | R$ 5,2298 | 416.495,06 |
| 03/2025 | 0105 | 20 | 04088 | R$ 5,2253 | 409.463,80 |

Esses saldos iniciais são relevantes em relação às entradas do mês. Por isso, é plausível que a SB9 esteja refletindo uma valorização média/contábil de estoque, e não o preço unitário da compra daquele mês. Essa interpretação precisa ser confirmada pela Controladoria ou pelo responsável pelo Protheus.

---

## 5. Perguntas objetivas para Fiscal/Controladoria

1. `SB9.C Unit 1a M` representa o custo médio de abertura, o custo médio após movimentações ou outro custo contábil?
2. O custo da SB9 é líquido de ICMS, IPI ou outros tributos? Quais tributos entram ou saem da valorização?
3. O saldo inicial da SB9 já carrega custo de períodos anteriores? Em caso afirmativo, qual é a regra de atualização após uma nova entrada?
4. Para a análise gerencial, devemos mostrar preço de entrada fiscal, custo médio contábil da SB9 ou ambos?
5. Existe rateio de custos indiretos, industrialização, transporte ou despesas fora dos campos reduzidos de SD1/SF1?
6. A competência correta para comparar entrada e custo mensal é `SF1.Dt. Receb.`, `SD1.DT Digitacao`, `SD1.DT Custo` ou o fechamento mensal da SB9?

## Conclusão provisória

Nos registros examinados, frete, seguro e despesas estão zerados. A diferença da SB9 não deve ser corrigida adicionando frete sem evidência. A validação decisiva agora é confirmar a natureza contábil de `C Unit 1a M` e a regra de incorporação de impostos/saldo inicial.
