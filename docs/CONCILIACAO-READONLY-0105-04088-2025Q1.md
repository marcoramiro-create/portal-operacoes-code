# Conciliação read-only — Indústria 0105 / produto 04088

**Data:** 23/11/2026  
**Status:** primeira conciliação local da Indústria; nenhum banco remoto, código funcional ou ambiente Oracle alterado.

## 1. Caso selecionado

- **Segmento:** Indústria
- **Filial:** `0105`
- **Armazém analisado:** `20`
- **Armazém de comparação:** `01`
- **Produto:** `04088`
- **Agregado:** `04088`
- **Descrição:** Tubo aço 80x80x4,75x6000mm A500
- **Tipo SB1:** `ME`
- **Período:** janeiro a março de 2025
- **CFOP efetivamente encontrado:** `1101`

O produto foi selecionado porque possui entradas nos três meses e saldo/custo positivo na SB9 do armazém 20 nos mesmos meses.

## 2. Método

A competência das entradas foi definida por `SF1.Dt. Receb.`. As linhas de `SD1` foram aceitas somente quando:

- filial = `0105`;
- armazém = `20`;
- produto = `04088`;
- CFOP pertence à lista aprovada;
- o documento encontrou exatamente um cabeçalho correspondente na SF1.

O custo médio mensal foi calculado por:

```text
soma(SD1.Vlr.Total) / soma(SD1.Quantidade)
```

A SB9 foi consultada apenas para comparação, preservando a separação entre custo de entrada e custo mensal do saldo.

## 3. Entradas mensais

| Mês | Documentos | CFOP | Quantidade | Valor total | Custo médio de entrada |
|---|---|---:|---:|---:|---:|
| 01/2025 | `000102952`, `000102979`, `000103043` | 1101 | 44.878 | R$ 284.526,52 | R$ 6,3400 |
| 02/2025 | `000103519` | 1101 | 30.005 | R$ 190.231,70 | R$ 6,3400 |
| 03/2025 | `000104010` | 1101 | 23.410 | R$ 148.419,40 | R$ 6,3400 |

Todos os documentos encontraram um único registro na SF1. A entrada de janeiro foi dividida em três notas, mas o custo unitário permaneceu R$ 6,34.

## 4. Comparação com SB9

| Mês | Armazém SB9 | Custo de entrada | Custo SB9 | Diferença unitária | Diferença percentual |
|---|---:|---:|---:|---:|---:|
| 01/2025 | 20 | R$ 6,3400 | R$ 5,2101 | R$ 1,1299 | 21,69% |
| 02/2025 | 20 | R$ 6,3400 | R$ 5,2298 | R$ 1,1102 | 21,23% |
| 03/2025 | 20 | R$ 6,3400 | R$ 5,2253 | R$ 1,1147 | 21,33% |

A SB9 do armazém 01 apresentou custo zero nos três meses. Por isso, ela não foi usada como custo comparável principal; o armazém 20 é o escopo industrial definido para este caso.

## 5. Conclusão inicial

1. O método de entrada fiscal produz uma série estável de R$ 6,34 por unidade no trimestre.
2. A SB9 do armazém 20 apresenta custo aproximadamente 21% inferior em todos os meses.
3. Essa diferença é consistente, não um erro de arredondamento. Pode refletir composição de estoque, custo contábil, saldo inicial, custo médio do Protheus ou outra regra da base industrial.
4. A diferença confirma que a curva/consumo da Indústria e a análise de custo de entrada devem permanecer em fatos separados, com origem e fórmula explicitadas.
5. Não é correto substituir o custo de entrada pelo custo da SB9 sem uma regra de negócio aprovada.

## 6. Próxima verificação

Antes de materializar o read model industrial de custos, é necessário conciliar este mesmo produto com a fonte RM BIS/planilha utilizada pelo usuário e verificar se o custo esperado da apresentação é o custo fiscal da entrada, o custo médio contábil da SB9 ou uma terceira composição que considere estoque inicial e entradas.

Nenhuma migração, importação, reconstrução ou alteração remota foi executada.
