# Mapeamento das planilhas RM Bis — Evolução de custos

## Fontes analisadas

| Segmento | Arquivo | Linhas de dados | Filiais | Datas mensais |
|---|---|---:|---|---:|
| Autopeças | `AcompanhamentodeCustos-Peças-202501+.xlsx` | 8.680 | 0101, 0102, 0108, 0301, 0303 e 0306 | 19 |
| Indústria | `AcompanhamentodeCustos-Indústria-202501+.xlsx` | 3.307 | 0105 | 19 |

As duas fontes possuem a mesma estrutura lógica e 29 colunas físicas. A linha 1 apresenta o agrupador `DATA SALDO`; a linha 2 contém os cabeçalhos operacionais; as linhas seguintes contêm os itens. A chave `FILIAL + COD AGREGADO + CODIGO` é única nos dois arquivos analisados.

## Estrutura reconhecida

| Grupo | Campos |
|---|---|
| Identificação | `FILIAL`, `COD AGREGADO`, `CODIGO`, `ENTRA MRP` |
| Cadastro | `DESCRIÇÃO`, `COMPRADOR` |
| Última compra | `ULT.COMPRA`, `ULT.PRECO` |
| Série histórica | 19 datas no formato `aaaaMMdd`, de `20250131` a `20260731` |
| Apresentação | `Total Geral`, que não deve compor a série temporal |

## Mesclagens e limpeza

O RM Bis mescla as colunas físicas `I:J` em cada linha para o primeiro mês (`20250131`). Isso explica a coluna vazia adicional no arquivo. O importador deve usar o valor da célula superior esquerda da mesclagem, descartar a coluna física vazia e não duplicar o mês.

Foram encontrados 34.716 textos com espaços nas extremidades no arquivo de autopeças e 13.228 no arquivo da indústria. A normalização deve aplicar o equivalente a `ARRUMAR/TRIM`: remover espaços no início e no fim e reduzir sequências internas de espaços. Códigos, datas e números devem ser preservados como tipos próprios, sem retirar zeros à esquerda.

## Linhas e colunas excluídas da carga

O importador deve ignorar a linha final `Total Geral`, linhas totalmente vazias, colunas físicas vazias decorrentes de mesclagem e a coluna `Total Geral`. Os valores mensais vazios permanecem como ausência de observação; zero permanece zero e não pode ser convertido em valor ausente.

## Modelo histórico proposto

Cada arquivo gera uma versão de importação com segmento (`autopeças` ou `indústria`), nome original, data/hora da carga, usuário, quantidade de itens e período inicial/final. Cada item da versão preserva seus campos cadastrais e cria observações mensais com `dataSaldo` e `custo`. A visualização deve comparar custo inicial, custo final, variação absoluta e percentual, além de permitir filtro por filial, código, descrição, comprador e participação no MRP.

## Controles de validação

Antes da confirmação, a prévia deve informar linhas aceitas, linhas ignoradas, problemas de chave, datas mensais reconhecidas, período da carga e quantidade de observações. A confirmação é administrativa e não altera os arquivos originais.
