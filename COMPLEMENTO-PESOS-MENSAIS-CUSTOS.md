# Complemento — Pesos mensais de custos

**Data da checagem:** 15/10/2026  
**Escopo:** leitura somente; nenhum arquivo foi alterado.

## A. Resumo executivo

### Autopeças

- A pasta corporativa `Documentos/Documentos/Portal de Operações/Cadastros` foi localizada e contém subpastas de `SA1`, `SA2`, `SA4`, `SA5`, `SB1`, `SB5`, `SBZ`, `SC7`, `SD1`, `SD2`, `SF1`, `SF2` e `SF4`.
- Os arquivos aparecem organizados por tabela, com um arquivo em cada subpasta.
- Nesta checagem não foi possível ler o conteúdo bruto dos arquivos para comprovar se existe quantidade vendida mensal por agregado e filial, nem confirmar `Qtd13M`, meses individuais ou período parcial.
- Portanto, **não está comprovado** que os pesos mensais de Autopeças estejam disponíveis nas exportações atualmente acessíveis.

### Indústria

- O conteúdo visível da pasta confirmada não apresentou arquivos ou subpastas chamadas `FECHAMENTO_ESTOQUE`, `ENTRADA_NF` ou equivalente.
- O código do portal reconhece uma fonte de evolução de estoque e uma fonte de entradas de materiais, mas isso é evidência do software, não prova de que os arquivos correspondentes estejam disponíveis no OneDrive.
- Não foi possível confirmar dois fechamentos consecutivos, o intervalo das entradas, saldo financeiro final, quantidade de saldo ou valor mensal de entradas.
- Logo, **não é possível declarar consumo financeiro mensal verificado da Indústria**.

### Evolução de Custos

- O código do Portal possui fontes separadas de evolução de custos para Autopeças e Indústria e trabalha com custo por período, filial, código individual e código agregado.
- Os arquivos concretos usados para essa evolução não foram localizados na pasta do OneDrive consultada nesta checagem.
- O alinhamento entre os meses da evolução de custos e eventuais pesos mensais permanece **não confirmado**.

## B. Arquivos e pastas observados

| Caminho relativo | Item observado | Modificação exibida | Grão esperado | Cabeçalho/período |
|---|---|---:|---|---|
| `Documentos/Documentos/Portal de Operações/Cadastros/SA1` | 1 arquivo | Há 6 dias | cadastro de clientes/entidades | não lido |
| `.../SA2` | 1 arquivo | Há 6 dias | cadastro de fornecedores | não lido |
| `.../SA4` | 1 arquivo | Há 6 dias | cadastro comercial/fiscal | não lido |
| `.../SA5` | 1 arquivo | Há 6 dias | vínculo produto-fornecedor | não lido |
| `.../SB1` | 1 arquivo | Há 6 dias | cadastro de produtos | não lido |
| `.../SB5` | 1 arquivo | Há 6 dias | cadastro complementar de produtos | não lido |
| `.../SBZ` | 1 arquivo | Há 6 dias | parâmetros de estoque por filial/produto | não lido |
| `.../SC7` | 1 arquivo | Há 6 dias | itens de pedidos de compra | não lido |
| `.../SD1` | 1 arquivo | Ontem | itens de entradas | não lido |
| `.../SD2` | 1 arquivo | Ontem | itens de vendas | não lido |
| `.../SF1` | 1 arquivo | Ontem | cabeçalho de entradas | não lido |
| `.../SF2` | 1 arquivo | Ontem | cabeçalho de vendas | não lido |
| `.../SF4` | 1 arquivo | Ontem | complemento fiscal | não lido |
| `Documentos/Documentos/Portal de Operações/FECHAMENTO_ESTOQUE` | não localizado | — | fechamento mensal | não confirmado |
| `Documentos/Documentos/Portal de Operações/ENTRADA_NF` | não localizado | — | entradas industriais | não confirmado |
| `Documentos/Documentos/Portal de Operações/Evolução de Custos` | não localizado | — | custo mensal | não confirmado |

As datas acima são as datas relativas exibidas pelo OneDrive, não datas extraídas dos nomes dos arquivos.

## C. Mapeamento de chaves proposto

| Componente | Chave necessária | Campo esperado | Situação |
|---|---|---|---|
| Vendas Autopeças | filial + código agregado + mês | SD2: filial, produto/agregado, data, quantidade | não comprovado no arquivo |
| CFOP de vendas | documento/item + CFOP | SD2/SF2/SF4: CFOP e natureza | não confirmado |
| Entradas Indústria | filial + código agregado + mês | SD1: filial, produto/agregado, data, quantidade, valor | parser do portal reconhece campos; arquivo não lido |
| Fechamento Indústria | filial + código agregado + mês | saldo final, quantidade e valor financeiro | fonte não localizada |
| Pedido de compra | filial destino + agregado + fornecedor + item | SC7: filial, produto, fornecedor, datas e quantidades | parser reconhece parte; arquivo não lido |
| Fornecedor | fornecedor + loja | SA2/SA5 | arquivo localizado; cabeçalho não lido |
| Curva | filial + código agregado | fonte ABC correspondente ao segmento | regra de negócio aprovada; mês não aplicável |
| Custo | filial + agregado + mês | evolução de custos | arquivo concreto não localizado |
| Filial do vendedor | vendedor + filial + vigência | SD2/SF2 ou tabela comercial adicional | não confirmado |

## D. Consumo financeiro da Indústria

A identidade operacional a validar é:

```text
consumo financeiro do mês
= saldo final do mês anterior
+ entradas válidas do mês
- saldo final do mês
```

Exemplo apenas sintético:

```text
saldo final anterior       1.000 unidades / R$ 100.000
+ entradas válidas           200 unidades / R$  22.000
- saldo final atual          850 unidades / R$  86.000
= consumo inferido           350 unidades / R$  36.000
```

Esse cálculo **não foi realizado com dados reais**, pois não foram encontrados, nesta leitura, dois fechamentos consecutivos e as entradas do intervalo. Além disso, as entradas precisam ser filtradas por CFOP antes do cálculo.

## E. Fatos, interpretação e regra aprovada

### Fatos lidos

- A raiz `Portal de Operações` contém a pasta `Cadastros`.
- `Cadastros` contém as subpastas de tabelas listadas acima.
- O OneDrive mostra um arquivo em cada subpasta observada.
- Não foram visualizadas, no nível consultado, pastas de fechamento de estoque, entrada industrial ou evolução de custos.

### Interpretação

- A organização atual é adequada para consumir cadastros e movimentos Protheus por tabela.
- A existência da pasta não comprova a semântica nem o cabeçalho do arquivo.
- A filial do vendedor não deve ser inferida da filial de emissão ou da filial de destino.

### Regras de negócio aprovadas

- Autopeças: variação mensal ponderada pela quantidade vendida do agregado no mesmo mês.
- Indústria: variação mensal ponderada pelo valor de consumo do agregado no mesmo mês.
- `CustoTot13M` não é peso.
- Não dividir total de 13 meses por 13 para inventar pesos mensais.
- Itens sem evolução no período não entram na média nem no impacto.
- Autopeças usa ABCDE; Indústria usa ABC.
- O vínculo preserva zeros à esquerda e diferencia código individual de agregado.

## F. Lacunas objetivas

1. Disponibilizar ou localizar as pastas/arquivos de `FECHAMENTO_ESTOQUE` e `ENTRADA_NF` da Indústria.
2. Identificar os arquivos reais da Evolução de Custos usados pelo Portal.
3. Ler somente cabeçalho e até 50 linhas de SD2/SF2 para confirmar quantidade vendida, mês, filial, agregado e CFOP.
4. Ler somente cabeçalho e até 50 linhas de SD1/SF1 para confirmar quantidade, valor, data, filial, agregado e CFOP.
5. Confirmar dois fechamentos consecutivos da Indústria e as entradas entre eles.
6. Confirmar onde está a filial do vendedor; se não estiver em SD2/SF2, exportar a tabela de vendedores/representantes com código, filial e vigência.
7. Confirmar se há coluna mensal individual ou apenas `Qtd13M`.
8. Confirmar se o mês atual é parcial.

## G. Segurança

Nada foi alterado no OneDrive, Portal, repositório, VM, banco ou Produção. Não houve upload, renomeação, exclusão, sincronização, importação, build ou deploy. A checagem parou após a produção deste complemento, conforme solicitado.
