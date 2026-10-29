# Matriz de fontes e visões — Portal de Operações Megatec

**Origem:** Manus — análise dos SQLs fornecidos pelo usuário e do dicionário de campos Protheus.
**Data:** 2026-10-29
**Ambiente:** somente repositório local; nenhuma alteração em Homologação, Produção ou banco.

## 1. Regra geral

As exportações serão consumidas diretamente do OneDrive. O portal deverá preservar os códigos como texto, inclusive zeros à esquerda e sufixos, e cruzar as fontes por chaves explicitamente definidas por visão. A origem do dado deve permanecer rastreável por arquivo, tabela, período e filial.

SB1 e SBZ já foram carregadas anteriormente e não devem ser baixadas novamente quando o arquivo não tiver mudado. ZFM e ZSF são dimensões de classificação; não devem ser tratadas como grupo de produto ou como família da SB9.

## 2. Fontes já disponíveis ou em uso

- **SB1:** cadastro de produtos; código, descrição, descrição 2, código agregado, tipo, unidade, NCM, família e subfamília, comprador e indicador Randon.
- **SBZ:** dados por filial e produto; entra no MRP, origem, última compra, preço, classificação, grupo tributário, estoque mínimo/máximo e localização.
- **ZFM:** descrição e parâmetros da família.
- **ZSF:** descrição e parâmetros da subfamília.
- **SB9:** saldo/custo mensal por filial, produto, armazém e data; exportação disponível localmente e aguardando integração ao fluxo do portal.
- **SC7:** pedidos de compra, datas de emissão e entrega, quantidades pedida/entregue/pendente, preços, fornecedor e pedido.
- **SD1:** entradas de materiais, nota/série, produto, quantidade, valores, CFOP, TES, fornecedor, pedido relacionado e data de entrada.
- **SF1:** cabeçalho da nota de entrada e valor bruto da NF.
- **SF4:** TES, texto, CFOP e indicador de geração de duplicata.
- **SA2:** cadastro de fornecedores.
- **SA1:** cadastro de clientes.
- **SD2/SF2:** saídas/vendas e cabeçalho da nota de saída.
- **SA3:** vendedores e filial do vendedor.
- **SB2:** saldo físico por filial, produto e armazém; ainda deve ser disponibilizada para consumo do portal.
- **NNR:** descrição dos armazéns.
- **SX5:** descrições de tipos e CFOPs.
- **SBM:** descrição dos grupos de produtos.
- **SYS_COMPANY:** empresa/filial.
- **VS1/VO1:** vínculos de ordem de serviço e frota usados na visão de margem.
- **SE1/SE2:** contas a receber e a pagar; ainda não são prioridade operacional do portal.

## 3. Dependências por visão

### 3.1 Acompanhamento de custos

SQL fornecido: `SQL-AcompanhamentodeCustos.txt`.

Fontes diretas:

- SB9: filial, código, armazém, data do saldo, quantidade inicial, saldo inicial e custo unitário `B9_CM1`.
- SB1: descrição, descrição 2, código agregado, comprador, tipo, unidade, NCM e bloqueio.
- SBZ: bloqueio, grupo tributário, entra no MRP, última compra, último preço e classificação.
- SY1: nome do comprador.

Chave operacional inicial: **filial + código do produto + armazém + data do saldo**. O agregado vem de SB1 e deve ser usado no cruzamento gerencial com curvas.

A SB9 permite materializar o custo mensal e a comparação mês a mês. O campo identificado pelo usuário como custo é `Cst 1a M`, correspondente ao `B9_CM1` no SQL.

### 3.2 Evolução de estoques

SQL fornecido: `SQL-Evoluçãodeestoques.txt`.

Fontes diretas:

- SB9: data, quantidade e valor inicial do estoque.
- SB1: código, agregado, descrição, unidade, tipo e indicador Randon.
- SBZ: dados complementares por filial/produto.
- NNR: descrição do armazém.
- SX5: descrição do tipo de produto.

A visão exclui a filial 0201, considera somente valores positivos e usa período a partir de 2024 no SQL fornecido. A filial 0105 representa a Indústria.

### 3.3 Pedidos de compras

SQL fornecido: `SQL-Pedidosdecompras.txt`.

Fontes diretas:

- SC7: datas do pedido e entrega, número, produto, quantidades, preços, valores, fornecedor, conta e usuários.
- SB1: agregado, NCM, família, subfamília, descrição, tipo e indicador Randon.
- SBZ: MRP, origem e grupo tributário.
- SA2: fornecedor.
- ZFM/ZSF: descrições de família e subfamília.
- SYS_COMPANY: empresa/filial.

A visão já contém os campos necessários para quantidade pendente, valor pendente e início do cálculo do lead time planejado. O lead time real dependerá da comparação de SC7 com SD1, usando pedido, item, produto, filial e fornecedor.

### 3.4 Entradas de materiais

SQL fornecido: `SQL-Entradasdemateriais.txt`.

Fontes diretas:

- SD1: data de entrada, nota/série, produto, quantidade, valores, TES, CFOP, fornecedor, pedido e centro de custo.
- SF1: espécie e valor bruto da NF.
- SF4: TES, CFOP e indicador de duplicata.
- SX5: descrição do CFOP.
- SB1: produto, descrições, tipo, agregado, unidade, família e subfamília.
- SA2: fornecedor.
- SBM: grupo do produto.
- SC7: pedido de compra relacionado.
- SYS_COMPANY: empresa/filial.
- ZFM/ZSF: descrições de família e subfamília.

CFOP e TES devem ser preservados. Eles serão necessários para separar compras normais, bonificações, complementos, devoluções, imobilizado e demais naturezas.

### 3.5 Saldos em estoque

SQL fornecido: `SQL-Saldosemestoque.txt`.

Fontes diretas:

- SB2: filial, produto, armazém, última movimentação, última saída, quantidade, custo e valor.
- SB1: tipo, NCM, descrição, unidade, agregado e indicador Randon.
- SBZ: última compra, localização, despesas, estoque mínimo/máximo, MRP e origem.
- NNR: descrição do armazém.
- SX5: descrição de tipos.
- ZFM/ZSF: família, subfamília, comissão e markup.

Essa é a fonte necessária para cobertura, excedente, estoque atual e comparação com consumo/vendas.

### 3.6 Margem de vendas

SQL fornecido: `SQL-Margemdevendas.txt`.

Fontes diretas:

- SD2/SF2: venda, cliente, quantidade, valor, custo, CFOP, TES e nota.
- SB1/SBZ: produto, agregado, classificações e dados tributários.
- SA1: cliente, segmento, CRM e região.
- SA3: vendedor, filial do vendedor e centro de custo.
- SF4/SX5: TES, CFOP e descrições.
- VS1/VO1: ordem de serviço e frota.
- ZFM/ZSF: família, subfamília, comissão e markup.

A visão deve ser preparada por área: peças, serviços, comercial e indústria. Os filtros de tipo de produto e CFOP não devem ser embutidos de forma irreversível.

### 3.7 Contas a pagar

SQL fornecido: `SQL-Contasapagar.txt`.

Fontes diretas:

- SE2: filial, documento, parcela, fornecedor, vencimento, emissão, tipo, saldo, valor e histórico.
- SA2: CNPJ/CPF e razão social do fornecedor.

### 3.8 Fluxo de caixa

SQL fornecido: `SQL-Fluxodecaixa.txt`.

Fontes diretas:

- SE1: contas a receber.
- SE2: contas a pagar.
- SA1/SA2: identificação das contrapartes.

A visão usa vencimento, saldo, situação, fluxo e classificação a receber/a pagar.

## 4. Próximas fontes prioritárias

1. **SB2 — prioridade alta:** necessária para saldo atual, cobertura e excedente.
2. **SB9 — prioridade alta:** necessária para concluir custos mensais e acompanhar variação por produto/agregado.
3. **SC7 e SD1 — prioridade alta:** já disponíveis; devem ser cruzadas para pedidos pendentes, recebimentos e lead time real.
4. **SF1, SF4 e SX5 — prioridade alta:** necessárias para validar NF, TES e CFOP.
5. **SA2 — prioridade alta:** necessária para fornecedor, ranking e lead time por fornecedor.
6. **SD2 e SF2 — prioridade média:** necessárias para vendas, consumo real e margem.
7. **SA1 e SA3 — prioridade média:** necessárias para visão comercial, cliente, vendedor e filial do vendedor.
8. **SBM e NNR — prioridade média:** enriquecem grupo de produto e armazém.
9. **SE1 e SE2 — prioridade posterior:** financeiro, contas a receber/pagar e fluxo de caixa.
10. **VS1 e VO1 — prioridade posterior:** integração de serviços e frota.

## 5. Regras de cruzamento aprovadas

- Produto: preservar como texto.
- SB1: `B1_COD` é o código do produto; `B1_XAGREG` é o código agregado.
- SB9: `B9_COD` deve ser cruzado com SB1 `B1_COD`; custo e saldo devem manter filial, armazém e data.
- SBZ: `BZ_COD` deve ser cruzado com SB1 `B1_COD`, sempre respeitando `BZ_FILIAL` quando a informação for por filial.
- Família: SB1 `B1_XFAM` + ZFM `ZFM_COD`.
- Subfamília: SB1 `B1_XSUBFAM` + ZSF `ZSF_COD`.
- Curva ABC e análises gerenciais: priorizar **filial + código agregado**, usando o código individual apenas como fallback legado controlado.
- Entradas e pedidos: preservar CFOP, TES, fornecedor, filial, pedido e item; não inferir natureza apenas pela descrição.
- Indústria: não exibir curvas D/E nem itens sem curva.
- Autopeças: manter curvas A/B/C/D/E.
- Impacto estimado e inflação interna permanecem zero enquanto não houver base financeira homologada.

## 6. Estado desta etapa

- Documento criado como matriz de análise e dependências.
- Nenhum código alterado nesta etapa.
- Nenhuma migração aplicada nesta etapa.
- Nenhuma alteração feita na Homologação.
- Nenhuma alteração feita na Produção.
