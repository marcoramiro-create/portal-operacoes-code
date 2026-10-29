# Dicionário inicial de dados Protheus

Atualização: 15/10/2026

## Objetivo

Este documento organiza as exportações disponíveis no OneDrive e os campos que o Portal de Operações já reconhece. Ele será a base para validar os cabeçalhos reais e, depois, transformar os dados em regras de negócio aprovadas.

As classificações usadas são:

- **Confirmado no OneDrive**: pasta/arquivo foi localizado na pasta corporativa autorizada.
- **Confirmado no código**: campo é aceito por parser existente no portal.
- **Inferido**: interpretação funcional provável, ainda não aprovada como regra.
- **A confirmar**: depende da leitura do cabeçalho bruto ou da validação do usuário.

## Local validado

Pasta consultada:

`Documents/Documentos/Portal de Operações/Cadastros`

Subpastas encontradas no OneDrive:

`SA1`, `SA2`, `SA4`, `SA5`, `SB1`, `SB5`, `SBZ`, `SC7`, `SD1`, `SD2`, `SF1`, `SF2` e `SF4`.

Cada pasta apresentou um arquivo exportado. A interface do OneDrive informou que os arquivos foram modificados entre 09/10/2026 e 14/10/2026. O nome dos arquivos contém datas de exportação, por exemplo `SA1 - 20261009.csv`, `SB1 - 202610090908.csv`, `SC7 - 20261012.csv` e `SD1 - 202610141358.csv`.

O portal deve usar o arquivo existente no OneDrive como fonte. O usuário não deve precisar baixar e reenviar manualmente o arquivo.

## Cadastros

### SB1 — Produtos

**Uso previsto:** cadastro mestre de produtos, vínculo com código agregado, descrição e classificação.

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `Cod Agregado` | Chave gerencial para Compras, ABC e Evolução de Custos | Confirmado no código; regra de prioridade aprovada |
| `Código` | Código individual do produto | Confirmado no código |
| `Descrição` | Descrição para filtros e apresentação | Confirmado no código |
| `Tipo` | Tipo/vertente do produto | Confirmado no código; significado exato a confirmar |
| `Família` | Agrupamento de produto | Confirmado no código |
| `Sub-Família` | Subagrupamento de produto | Confirmado no código |
| `Pos.IPI/NCM` | Classificação fiscal | Confirmado no código |
| `Dt Inclusão` | Data de inclusão do produto | Confirmado no código |

**Chave de negócio:** o cruzamento deve priorizar `filial + código agregado`. O código individual é fallback para fontes legadas ou registros que não tragam agregado.

**Zeros à esquerda:** devem ser preservados na leitura e normalizados somente nas funções de cruzamento.

### SBZ — Produto por filial

**Uso previsto:** parâmetros de estoque e MRP por filial.

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `Filial` | Identifica a loja/filial do item | Confirmado no código |
| `Código` | Código do produto na filial | Confirmado no código |
| `Estoq Minimo` | Estoque mínimo | Confirmado no código |
| `Estoq Maximo` | Estoque máximo | Confirmado no código |
| `Entra MRP` | Indica participação no MRP | Confirmado no código |
| `Grupo Trib.` | Grupo tributário | Confirmado no código; uso analítico futuro |
| `Tipo` | Tipo do registro/produto | Confirmado no código; significado a confirmar |
| `Origem` | Origem do item | Confirmado no código; significado a confirmar |
| `Class.Fiscal` | Classificação fiscal | Confirmado no código |

**Chave de negócio:** `filial + código`. A SBZ não possui código agregado; no cruzamento com Compras, o código agregado da SB1 deve apontar para o código da SBZ.

### SB9 — Saldos e custos mensais

**Fonte validada:** `SB9-202610262105_1.csv`. O arquivo possui uma linha inicial com a identificação `SB9`, uma linha em branco, cabeçalho separado por ponto e vírgula e 497 linhas de dados.

**Uso previsto:** histórico mensal de saldo inicial e custo unitário por filial, produto e armazém.

| Campo | Papel no portal | Situação |
|---|---|---|
| `Filial` | Filial do saldo | Confirmado no arquivo |
| `Produto` | Código textual do produto | Confirmado no arquivo; preservar zeros e sufixos |
| `Armazem` | Local do saldo | Confirmado no arquivo |
| `Data Saldo` | Mês/data de referência do saldo | Confirmado no arquivo |
| `Sld.Ini.Mes` | Saldo inicial mensal | Confirmado no arquivo; 119 registros não nulos na amostra recebida |
| `C Unit 1a M` | Custo unitário principal | Confirmado no arquivo; 119 registros não nulos na amostra recebida |
| `C Unit 2a M` a `C Unit 5a M` | Custos unitários adicionais | Confirmado no arquivo; zerados na amostra recebida |
| `Custo Stand.` | Custo padrão | Confirmado no arquivo; zerado na amostra recebida |
| `R Unitario` | Valor unitário de referência/reposição | Confirmado no arquivo; zerado na amostra recebida |
| `Grupo` | Grupo do produto | Confirmado no arquivo |
| `Cod. Produto` | Código de produto informado pela fonte | Confirmado no arquivo |

**Chave técnica provisória:** `filial + produto + armazém + data saldo`. O vínculo gerencial deve resolver o produto pela SB1 e priorizar `filial + código agregado`.

**Período e escopo da amostra recebida:** filial `0101`, 25 produtos distintos, de `28/02/2025` a `31/12/2025`. A carga recebida não deve ser tratada como histórico completo do OneDrive até a conferência do arquivo definitivo.

### SB5 — Complemento do produto

**Uso previsto:** enriquecer produtos de Autopeças.

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `Produto` | Código do produto | Confirmado no código |
| `Familia Tec.` | Família técnica | Confirmado no código |
| `Família Peça` | Família comercial da peça | Confirmado no código |
| `Marca Peça` | Marca do item | Confirmado no código |
| `Linha Peça` | Linha da peça | Confirmado no código |

### SA2 — Fornecedores

**Uso previsto:** cadastro mestre de fornecedores e vínculo com SA5, SC7 e entradas.

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `Código` | Código do fornecedor | Confirmado no código |
| `Loja` | Loja/unidade do fornecedor | Confirmado no código; compõe a chave |
| `Razão Social` | Nome legal | Confirmado no código |
| `CNPJ/CPF` | Documento do fornecedor | Confirmado no código |
| `Endereço` | Endereço comercial | Confirmado no código |
| `Numero` | Número do endereço | Confirmado no código |
| `CEP` | CEP | Confirmado no código |
| `Bairro` | Bairro | Confirmado no código |
| `Município` | Município | Confirmado no código |
| `Estado` | UF | Confirmado no código |

**Chave de negócio:** `código do fornecedor + loja`.

### SA5 — Produto por fornecedor

**Uso previsto:** amarração produto-fornecedor, preço/condições e seleção de fornecedor para compras.

O parser específico da SA5 ainda não está documentado no código com o mesmo nível de detalhe de SB1/SBZ/SA2. Portanto, devem ser confirmados no cabeçalho bruto, no mínimo:

- código do fornecedor;
- loja do fornecedor;
- código individual do produto;
- código agregado, se existir;
- preço ou último preço;
- moeda/unidade de compra;
- prazo ou condição de entrega, se exportado;
- fornecedor preferencial ou prioridade;
- data de validade/atualização.

**Situação:** pasta e arquivo confirmados no OneDrive; colunas a confirmar.

### SA1 — Clientes

**Uso previsto:** histórico de vendas, consumo e eventual análise por cliente.

A pasta e o arquivo foram confirmados no OneDrive. O parser de referência atual não registra o leiaute completo de SA1. Devem ser confirmados:

- código do cliente;
- loja;
- razão social/nome;
- CPF/CNPJ;
- município e UF;
- grupo/região/canal, se houver;
- situação do cadastro.

**Situação:** arquivo confirmado; campos a confirmar no cabeçalho bruto.

### SA4 — Transportadoras

**Uso previsto:** cadastro de transportadoras e futuro recebimento/logística.

A pasta e o arquivo foram confirmados no OneDrive. Devem ser confirmados:

- código da transportadora;
- nome/razão social;
- CNPJ/CPF;
- endereço;
- situação;
- contatos, se exportados.

**Situação:** arquivo confirmado; campos a confirmar no cabeçalho bruto.

## Compras e entradas

### SC7 — Pedidos de compra

**Uso previsto:** pedidos abertos, saldo a receber, previsão e composição da Sugestão de Compras.

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `Filial` | Loja/filial do pedido | Confirmado no código |
| `Numero PC` | Número do pedido | Confirmado no código |
| `Item` | Item do pedido | Confirmado no código |
| `Produto` | Código do produto/agregado | Confirmado no código |
| `Quantidade` | Quantidade pedida | Confirmado no código |
| `Prev Entrega` | Data prevista | Confirmado no código |
| `Entrega` | Data efetiva ou informação de entrega | Confirmado no código; semântica a validar |
| `Vlr.Total` | Valor total do item/pedido | Confirmado no código |
| `DT Emissao` | Data de emissão | Confirmado no código |
| `Qtd.Entregue` | Quantidade já entregue | Confirmado no código |
| `Fornecedor` | Código do fornecedor | Confirmado no código |
| `Loja` | Loja do fornecedor | Confirmado no código |
| `Armazem` | Armazém/local de destino | Confirmado no código |
| `Usuario` | Comprador/responsável | Confirmado no código; semântica a validar |
| `Pre-Notas` | Pré-nota associada | Confirmado no código |
| `Qt.Pre-Nota` | Quantidade em pré-nota | Confirmado no código |

**Chave de negócio:** `filial + número do pedido + item`.

### SD1 — Itens de entrada

**Uso previsto:** histórico de entradas de mercadoria e cálculo do lead time realizado.

O parser operacional já reconhece o modelo de entrada de materiais com estes campos:

| Campo reconhecido | Papel no portal | Situação |
|---|---|---|
| `EMPRESA - FILIAL` | Origem/filial da entrada | Confirmado no código |
| `NOTA/SERIE` | Identificação fiscal | Confirmado no código |
| `FORNECEDOR` | Fornecedor da entrada | Confirmado no código |
| `LOJA` | Loja do fornecedor | Confirmado no código |
| `PRODUTO` | Código individual | Confirmado no código |
| `COD. AGREG.` | Código agregado | Confirmado no código |
| `DESCRIÇÃO PRODU` | Descrição | Confirmado no código |
| `NUMERO PED COMP` | Pedido de compra de origem | Confirmado no código |
| `ITEM SEQ.` | Item do pedido | Confirmado no código |
| `EMISSAO PED COMP` | Data de emissão do pedido | Confirmado no código |
| `VALOR ITEM` | Valor do item | Confirmado no código |
| `QUANTIDADE` | Quantidade recebida | Confirmado no código |
| `DATA ENTRADA` | Data efetiva da entrada | Confirmado no código |
| `VALOR TOTAL` | Valor total | Confirmado no código |

**Situação:** arquivo confirmado no OneDrive; cabeçalho bruto ainda deve ser conferido para confirmar a grafia e a posição das colunas.

### SF1 — Cabeçalho de entrada

**Uso previsto:** dados gerais da nota de entrada, fornecedor, datas e valores.

O arquivo está presente no OneDrive. O leiaute bruto ainda deve ser validado. A expectativa mínima é localizar:

- filial;
- número e série da NF;
- fornecedor e loja;
- chave de acesso;
- data de emissão;
- data de entrada;
- valor total;
- situação/status;
- armazém ou local de destino, se exportado.

### SF4 — Fiscal/tributário da entrada

**Uso previsto:** complemento fiscal da operação. Não deve ser usado como fonte primária de quantidade recebida sem confirmação.

O arquivo está presente no OneDrive. Campos e relacionamento ainda a confirmar.

### CFOP — Regra fiscal obrigatória

O CFOP não pode ser tratado como detalhe de apresentação. Ele altera a interpretação do movimento e deve participar da classificação das entradas, saídas, devoluções, transferências e operações que não representam consumo ou abastecimento normal.

Antes de calcular vendas, entradas, consumo, estoque ou lead time, cada registro deve ser classificado por CFOP e natureza fiscal. No mínimo, precisamos distinguir:

- entrada de compra para estoque;
- entrada por transferência;
- devolução de venda;
- devolução ao fornecedor;
- bonificação/doação;
- industrialização ou remessa para terceiros;
- transferência entre filiais;
- venda normal;
- venda para operação que não deve compor consumo;
- cancelamento ou estorno.

**Campos a localizar nas fontes fiscais:** `CFOP`, descrição do CFOP, tipo de movimento, origem/destino, documento de referência, série, situação/cancelamento e item da nota.

**Regra provisória:** nenhum CFOP deve entrar automaticamente no consumo ou nas entradas válidas sem uma tabela de classificação aprovada. A tabela deve ser versionada e permitir exceções por operação, filial e tipo de documento.

**Situação:** requisito confirmado pelo usuário; códigos e fontes exatas ainda precisam ser validados nos cabeçalhos de SF1, SF4, SD1 e SD2.

## Vendas e consumo

### SD2 — Itens vendidos

**Uso previsto:** consumo histórico por produto, filial e período para a Sugestão de Compras.

O arquivo está presente no OneDrive. A expectativa mínima é localizar:

- filial;
- nota/série;
- cliente e loja;
- produto e código agregado;
- quantidade vendida;
- valor unitário e total;
- data da venda/emissão;
- armazém/local;
- vendedor ou canal, se necessário.

Além dos campos acima, devem ser localizados obrigatoriamente:

- `CFOP` e eventual código de natureza da operação;
- filial do vendedor/emissor;
- vendedor, representante ou usuário responsável;
- filial/loja de atendimento, quando diferente da filial emissora;
- indicador de devolução, transferência, cancelamento ou operação especial.

O vendedor não deve ser associado automaticamente à filial de destino. São dimensões diferentes e precisam ser preservadas.

### SF2 — Cabeçalho das vendas

**Uso previsto:** datas, cliente, filial e valores gerais das notas que complementam o SD2.

O arquivo está presente no OneDrive. O relacionamento esperado é por número/série/filial, mas precisa ser confirmado no cabeçalho e nas chaves reais.

## Relação com a Sugestão de Compras

A sugestão não deve usar apenas estoque mínimo e máximo. A regra aprovada conceitualmente deve considerar, por **filial/loja e código agregado**:

1. consumo histórico de SD2;
2. estoque disponível e evolução de estoque;
3. pedidos SC7 ainda não recebidos;
4. entradas realizadas em SD1/SF1;
5. curva ABC/ABCDE;
6. estoque mínimo e máximo da SBZ;
7. fornecedor e SA5;
8. **lead time real das entregas**;
9. cobertura projetada;
10. excedente ou risco de ruptura.

Para **Autopeças** e **Indústria**, a mesma arquitetura será reutilizada, mas com parâmetros, fontes, filiais e curvas próprios. A sugestão da Indústria não será uma cópia dos parâmetros de Compras: ela deverá respeitar a filial industrial, o consumo industrial, os movimentos fiscais válidos, os estoques e entradas da Indústria e a classificação ABC própria do segmento.

### Filial do vendedor

A sugestão precisa separar pelo menos quatro dimensões que podem aparecer com nomes parecidos nas exportações:

1. filial emissora da venda;
2. filial/loja que atende o cliente;
3. filial do vendedor ou representante;
4. filial de destino do pedido de compra.

O cálculo de consumo deve usar a dimensão aprovada como **filial de abastecimento**, não simplesmente o vendedor. A filial do vendedor será usada para análise comercial, regionalização e eventual rateio somente depois de confirmada a regra de negócio.

Se a filial do vendedor não estiver em SA1, SD2 ou SF2, será necessária a exportação da tabela que contenha essa relação. A tabela deverá trazer, no mínimo, código do vendedor, nome, filial, vigência e situação.

### Sugestão da Indústria

A Sugestão de Compras da Indústria deve compartilhar os componentes técnicos, mas manter uma visão própria:

- chave: filial industrial + código agregado;
- consumo e estoque da Indústria;
- entradas e pedidos da Indústria;
- CFOPs classificados para a operação industrial;
- curva ABC da Indústria, sem classes D/E quando essa for a regra aprovada;
- lead time por fornecedor e item/agregado;
- cobertura e excedente calculados com parâmetros industriais;
- separação de matéria-prima, componente, produto intermediário e demais tipos definidos no cadastro.

Não se deve misturar o ranking de Autopeças com o da Indústria, mesmo que o produto tenha código semelhante.

### Lead time real

O lead time realizado deve ser calculado quando existir o par:

```text
SC7.DT Emissao → SD1.DATA ENTRADA
```

A unidade recomendada é a quantidade de dias corridos. O cálculo deve ser feito por:

```text
filial de destino
+ código agregado
+ fornecedor
+ loja do fornecedor
```

Quando houver poucos registros, o sistema deve mostrar a quantidade de observações e usar uma regra de fallback aprovada, por exemplo:

1. mediana do lead time do item/agregado na filial;
2. mediana do fornecedor para a filial;
3. mediana geral do fornecedor;
4. prazo informado na SA5, se existir;
5. parâmetro manual aprovado.

Não se deve usar média simples sem mostrar dispersão. A mediana reduz o efeito de atrasos excepcionais. Também devem ser exibidos mínimo, máximo, mediana e quantidade de entregas observadas.

### Cobertura

A cobertura projetada deve usar o consumo médio diário ajustado e o estoque disponível mais recebimentos confiáveis:

```text
cobertura em dias = estoque projetado / consumo médio diário
```

O estoque projetado deve separar:

```text
estoque disponível
+ pedidos com entrega prevista dentro da janela confiável
- reservas/consumo esperado
```

A janela confiável deve considerar o lead time real do item/agregado, e não somente a data prevista informada no SC7.

### Excedente

O excedente deve ser calculado somente depois de considerar o estoque necessário até o próximo ciclo de abastecimento:

```text
excedente = estoque projetado - estoque necessário até a próxima reposição
```

Uma futura fórmula de quantidade sugerida poderá ser:

```text
necessidade = consumo médio diário × (lead time real + período de proteção)
quantidade sugerida = máximo(0, estoque alvo - estoque projetado)
```

Os valores de período de proteção, lote mínimo, múltiplo de compra e arredondamento ainda precisam ser aprovados.

## Fontes de custos e ABC já conhecidas

A Evolução de Custos usa arquivos RM BIS separados por segmento. O dicionário deve manter essa origem distinta das exportações Protheus:

- Autopeças: evolução de custos com várias filiais;
- Indústria: evolução de custos com filial 0105;
- Curva: vínculo prioritário por `filial + código agregado`;
- itens sem base de custo no período filtrado devem ser ignorados;
- itens sem curva válida não devem aparecer na tabela gerencial;
- impacto estimado e inflação interna permanecem zerados até existir base quantitativa aprovada.

## Pendências de validação

1. Ler o cabeçalho bruto e até 50 linhas de cada arquivo do OneDrive.
2. Confirmar se os cabeçalhos estão na primeira, segunda ou terceira linha de cada exportação.
3. Confirmar delimitador, codificação e se existem cabeçalhos repetidos.
4. Confirmar as chaves entre SC7, SD1/SF1 e SD2/SF2.
5. Confirmar se `Produto` nas exportações de Compras representa código individual ou agregado.
6. Confirmar quais campos da SA5 representam prazo, preço e fornecedor preferencial.
7. Confirmar a definição operacional de loja: filial de destino, estabelecimento do fornecedor ou ambos.
8. Aprovar a fórmula de lead time, cobertura, excedente, lote mínimo e período de proteção.
9. Identificar os campos e a tabela que informam a filial do vendedor.
10. Levantar todos os CFOPs presentes nas fontes e montar uma classificação inicial para validação.
11. Definir quais CFOPs entram no consumo, nas entradas válidas, nas devoluções e nas transferências.
12. Confirmar os parâmetros específicos da Sugestão de Compras da Indústria.

## Regra de segurança

Este documento é apenas um inventário e uma proposta inicial de interpretação. Não altera banco, não importa dados e não promove nada para Produção. Nenhuma regra de compras deve ser ativada antes da validação dos cabeçalhos brutos e da aprovação das fórmulas pelo usuário.
