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

## Verificação adicional de impostos e composição

Na Indústria, o produto `04088` possui `Vlr.Unitario` de R$ 6,34 nas entradas. As notas correspondentes têm IPI de 5% no cabeçalho e ICMS informado, mas o valor de ICMS varia por nota e os campos reduzidos da SD1 não permitem apropriar esse imposto diretamente ao item. A diferença da SB9, entre aproximadamente 17,5% e 17,8% abaixo da entrada, não coincide exatamente com a soma simples dos percentuais observados.

Também foi verificado que a SB9 registra saldo inicial relevante no armazém 20 — por exemplo, 430.703,45 na unidade de saldo em janeiro — enquanto a entrada do mês é de 44.878 unidades. Isso torna plausível que `C Unit 1a M` seja custo de abertura/médio contábil do estoque, e não o preço unitário da entrada do mês. Essa hipótese precisa ser confirmada pelo significado operacional da SB9 antes de qualquer fórmula definitiva.

Conclusão atual: o frete foi descartado nos casos testados; impostos, saldo inicial e regra de valorização da SB9 permanecem hipóteses abertas.
