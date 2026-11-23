# Verificação de frete nas conciliações — 2025 Q1

**Data:** 23/11/2026  
**Escopo:** somente leitura local; nenhuma alteração remota.

## Resultado

A hipótese de que a diferença entre custo de entrada e SB9 seja frete foi testada diretamente nos registros usados nas duas conciliações:

| Caso | Fonte | Campos verificados | Resultado |
|---|---|---|---|
| Autopeças 0303 / produto 100000142456 | SD1 | `Vlr. Frete`, `Vlr. Seguro`, `Vlr. Despesa` | todos zero |
| Autopeças 0303 / produto 100000142456 | SF1 | `Vlr.Frete`, `Vlr.Seguro`, `Vlr.Despesas` | todos zero |
| Indústria 0105 / produto 04088 / armazém 20 | SD1 | `Vlr. Frete`, `Vlr. Seguro`, `Vlr. Despesa` | todos zero |
| Indústria 0105 / produto 04088 / armazém 20 | SF1 | `Vlr.Frete`, `Vlr.Seguro`, `Vlr.Despesas` | todos zero |

## Observação sobre `Vlr.Mercad` e `Vlr.Bruto`

Alguns cabeçalhos SF1 apresentam `Vlr.Bruto` superior a `Vlr.Mercad`. Esses valores são totais da nota fiscal, que pode conter outros itens além do produto focal. Portanto, não podem ser somados diretamente ao produto para explicar a diferença da SB9 sem rateio por item e sem uma regra fiscal aprovada.

## Conclusão

Nos dois casos controlados, a diferença não é explicada por frete, seguro ou despesas explicitamente gravados nas linhas de entrada. Permanecem como hipóteses a investigar:

1. custo médio contábil da SB9 versus preço da entrada fiscal;
2. composição por estoque anterior e saldo inicial;
3. impostos ou valores incorporados de forma diferente entre SD1/SF1 e SB9;
4. rateio de custos no fechamento mensal;
5. divergência de competência entre data de recebimento e data de fechamento;
6. conversão de unidade, lote ou fator de conversão;
7. eventual diferença entre o produto fiscal e a chave/código materializado na SB9.

Não se deve corrigir a fórmula adicionando frete enquanto a fonte não apresentar valor de frete apropriável ao item.
