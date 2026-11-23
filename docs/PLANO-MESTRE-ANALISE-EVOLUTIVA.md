# Plano mestre — análise evolutiva de custos e consumo

**Projeto:** Portal de Operações Megatec  
**Data de consolidação:** 23/11/2026  
**Status:** requisitos consolidados; nenhuma alteração de código, banco, OneDrive, Homologação ou Produção nesta etapa.

## 1. Objetivo executivo

Construir no Portal uma visão profissional e auditável da evolução dos custos de entrada dos produtos, separando Autopeças e Indústria. A análise deverá permitir navegar do agregado para os produtos, filtrar por filial e período, acompanhar quantidade, custo médio ponderado e valor total, e preservar a origem e a fórmula de cada número.

A primeira entrega analítica deverá produzir dados tabulares, planilha Excel e gráficos. A apresentação executiva será uma etapa posterior, depois da conciliação dos números.

## 2. Escopos que não podem ser misturados

### 2.1 Autopeças

- A análise de curva de Autopeças permanece baseada nas vendas mensais disponíveis na carga de Compras (`inventoryAnalytics.salesMonths`), com classificação ABCDE já existente no Portal.
- A análise evolutiva de custos de entrada deve usar as entradas fiscais e seus CFOPs aprovados, não o custo da SB9 como fonte primária do preço de entrada.
- O agrupamento gerencial deve partir da SB1, preservando a hierarquia centralizada: empresa/filial, código individual e código agregado.
- As filiais de apresentação inicialmente priorizadas são `0101`, `0102`, `0301` e `0303`. O conjunto operacional de Autopeças já definido no projeto também inclui `0106`, `0107`, `0108`, `0306` e `0307`; a tela deverá permitir a seleção explícita.
- A classificação de pneus não será eliminada. Pneus serão tratados em visão ou filtro separado.

### 2.2 Indústria

- A Indústria utiliza a filial `0105` e somente os armazéns `01` e `20`.
- O consumo mensal é calculado pela variação do estoque, ajustada pelas entradas: saldo do mês anterior + entradas do mês - saldo do mês atual, com proteção contra consumo negativo na visão gerencial.
- Consumos negativos, fechamentos ausentes, produtos sem vínculo e demais exceções devem permanecer na auditoria.
- A curva da Indústria é calculada pelo Portal, por valor, usando janela móvel de 12 meses e histórico de alterações. Não se usa ABCDE: a Indústria mantém ABC.
- O custo mantido para consulta deve informar o mês de referência; não se deve fabricar um custo anterior ao início do período.

## 3. Dimensões obrigatórias

Toda consulta analítica deve preservar e permitir, quando aplicável:

1. segmento: Autopeças ou Indústria;
2. filial;
3. armazém;
4. código individual do produto;
5. descrição do produto;
6. código agregado e descrição do agregado;
7. tipo de produto;
8. família e subfamília, quando disponíveis;
9. mês de referência;
10. origem do fato e versão do snapshot.

Códigos devem ser tratados como texto, mantendo zeros à esquerda e sufixos. Não devem ser criados cadastros paralelos dentro dos módulos de análise.

## 4. Métricas aprovadas

### 4.1 Quantidade mensal

A quantidade deve ser agregada por produto, filial e mês, mantendo a possibilidade de detalhamento por documento, fornecedor e CFOP quando a fonte permitir.

### 4.2 Custo médio de entrada

Para cada produto, filial e mês:

```text
custo médio ponderado = valor válido das entradas / quantidade válida das entradas
```

A ponderação é feita pela quantidade de cada entrada. Meses sem entrada não devem produzir zero artificial: para a série visual, o último preço médio válido pode ser carregado apenas quando essa regra for explicitamente indicada e o mês de origem permanecer visível. O fato original sem entrada deve continuar distinguível do valor carregado.

### 4.3 Valor mensal

O valor da análise de entrada é o valor efetivo das entradas classificadas como válidas para a visão. Não se deve substituir silenciosamente o valor de entrada pelo custo da SB9.

Para análises de vendas ou sugestão de compras, permanece a regra já aprovada: quantidade vendida no mês multiplicada pelo valor médio aplicável daquele mês, agregada para o período. Essa regra não deve ser confundida com a análise de custo de entrada.

### 4.4 Curva

- Autopeças: ABCDE conforme a lógica de vendas já existente.
- Indústria: ABC calculada pelo Portal, por valor e janela móvel de 12 meses.
- A classe é calculada no nível de agregado, mantendo os produtos subordinados consultáveis.
- A regra de duas casas decimais deve ser preservada; os limites e a ordem das classes devem permanecer versionados e auditáveis.

## 5. Fontes e cruzamentos

### 5.1 Cadastro e hierarquia

- `SB1`: produto, descrição, tipo, família, subfamília e código agregado.
- `SBZ`: produto por filial, parâmetros de estoque e MRP.
- `ZFM`/`ZSF`: descrições de família e subfamília.
- `SX5`: descrições e classificação de tipos/CFOPs.
- `SYS_COMPANY` e `NNR`: empresa, filial e armazém, quando necessários.

### 5.2 Entradas de Autopeças

- `SD1`: itens de entrada, quantidade, valor, data de entrada, produto, fornecedor, CFOP, TES e centro de custo.
- `SF1`: cabeçalho da nota, datas e valor geral.
- `SF4`: TES e CFOP, quando a relação estiver disponível.
- `SA2`: fornecedor.
- `SC7`: pedido relacionado, apenas para enriquecer o prazo/lead time, não para duplicar entradas.

A data da análise é a **data efetiva de entrada**, não a data de emissão do pedido. O cruzamento deve evitar duplicação de itens por nota, série, filial e produto.

### 5.3 Indústria

- `SB9`/fonte reduzida: fechamento mensal, saldo e custo por filial, produto, armazém e data.
- Entradas industriais: fonte mensal já definida no read model da Indústria; quando a análise fiscal for ampliada, usar `SD1`/`SF1` com classificação de CFOP.
- O read model versionado deve ser a base de consulta, sem reconstrução pesada durante o filtro.

### 5.4 Vendas de Autopeças

- `inventoryAnalytics.salesMonths` das cargas aprovadas de Compras, para a curva e as análises de vendas já existentes.
- `SD2`/`SF2` poderão ser usados em uma etapa posterior de vendas fiscais, depois da validação dos cabeçalhos, chaves e CFOPs.

## 6. CFOPs informados para a etapa de entradas

Os CFOPs fornecidos para a análise de peças devem ser preservados em tabela versionada, com classificação auditável:

- Saídas/vendas informadas para etapa posterior: `5102`, `6102`, `5405`, `6405`, `5108`, `6108`, `5403`, `6403`, `5404`, `6404`, `5949`.
- Entradas/compras informadas para a análise atual: `1101`, `1102`, `1117`, `1401`, `1403`, `1922`, `2102`, `2403`.

A lista acima é a declaração de escopo fornecida pelo usuário, não uma autorização para importar registros sem validação. Antes da materialização, deve-se confirmar a presença dos CFOPs nos cabeçalhos reais e classificar devoluções, transferências, bonificações, estornos e operações intragrupo. Operações entre empresas/filiais do grupo devem permanecer separáveis e, conforme a regra aprovada, fora da curva principal.

## 7. Seleção dos principais agregados

A seleção inicial será feita por representatividade acumulada em valor, sem escolher pneus para a visão geral de peças. Pneus terão visão própria.

A definição operacional a validar antes do primeiro snapshot é:

- período-base da seleção;
- se o ranking usa valor de entrada ou valor consumido/vendido;
- se o ranking é global ou específico por filial;
- se os 10 agregados são fixos para a apresentação ou recalculados a cada período.

A recomendação técnica é guardar o ranking com versão, período-base e critério, para que uma apresentação histórica não mude silenciosamente após nova carga.

## 8. Períodos e formas de apresentação

A base deve conservar granularidade mensal desde `01/2025` até o último mês validado. A aplicação poderá derivar:

- mês a mês;
- trimestres;
- semestres;
- ano de 2025;
- YTD de 2026;
- período total selecionado.

A agregação trimestral ou semestral deve ser derivada dos fatos mensais, nunca substituir a base mensal.

## 9. Funil de análise

A navegação desejada é:

1. segmento;
2. período e filiais;
3. ranking de agregados;
4. agregado selecionado;
5. produtos que compõem o agregado;
6. filial e armazém;
7. quantidade, valor e custo médio por mês;
8. documentos, fornecedor, CFOP e auditoria.

O gráfico deve manter a linha nos meses sem entrada somente quando houver regra de carregamento do último preço válido; deve mostrar claramente o mês do último preço e não sugerir que houve uma entrada inexistente.

## 10. Inflação e dólar

A comparação com inflação e dólar foi solicitada, mas a fonte, índice, periodicidade, data-base e tratamento de câmbio ainda não foram homologados. Não devem ser inventados índices nem misturados ao custo operacional antes de definir:

- índice de inflação aplicável;
- fonte oficial e série;
- cotação do dólar e critério de fechamento;
- data de referência mensal;
- se a comparação será nominal, corrigida ou apenas um painel contextual.

Até essa definição, inflação e dólar devem aparecer como pendência, não como número zero interpretado como resultado.

## 11. Auditoria e qualidade

Cada snapshot deve registrar:

- arquivo e hash da fonte;
- período e filiais abrangidos;
- quantidade de linhas lidas, aceitas e rejeitadas;
- CFOPs encontrados e classificados;
- duplicidades detectadas;
- produtos sem SB1, agregado ou filial;
- notas canceladas/devolvidas/transferidas;
- meses sem entrada;
- custo carregado de mês anterior, quando houver;
- versão publicada e data de publicação.

Resultado parcial ou snapshot desatualizado não deve ser apresentado como atual. Falhas devem manter a versão anterior publicada.

## 12. O que já existe e o que falta

### Já documentado ou preparado

- matriz de fontes e visões: `docs/MATRIZ-FONTES-E-VISOES-2026-10-29.md`;
- dicionário inicial Protheus: `docs/DICIONARIO-DADOS-PROTHEUS-INICIAL.md`;
- base mensal versionada da Indústria: `docs/DECISOES/20261102-MANUS-BASE-MENSAL-INDUSTRIA.txt`;
- read model local de vendas mensais de Autopeças: `docs/20261103-MANUS-VENDAS-MENSAIS-ETAPA-LOCAL.txt`;
- regras de sincronização e ambientes: `docs/ESTADO-ATUAL.md` e `docs/SEPARACAO-DE-AMBIENTES.md`.

### Ainda não aprovado para execução

1. confirmação dos cabeçalhos e amostras reais de `SX5`, Compras, `SD1`, `SF1` e demais fontes necessárias;
2. classificação final de CFOPs e operações intragrupo;
3. definição final do ranking dos 10 agregados;
4. fonte e fórmula de inflação/dólar;
5. conciliação de um agregado e uma filial contra a planilha/RM BIS;
6. desenho final das tabelas de fatos de entrada, sem aplicar migração remota;
7. integração da tela somente depois que o snapshot for conciliado.

## 13. Próximo passo seguro

O próximo trabalho técnico deve ser **read-only e econômico**:

1. fechar a matriz de cabeçalhos reais e chaves;
2. escolher um agregado, uma filial de Autopeças e um período curto;
3. calcular manualmente/descartavelmente o custo de entrada pelos CFOPs aprovados;
4. conciliar quantidade, valor e custo médio com a fonte do usuário;
5. repetir o mesmo procedimento na Indústria para a filial 0105 e armazéns 01/20;
6. somente após a conciliação, definir o esquema definitivo do read model e preparar uma branch específica.

Nenhuma migração, importação, reconstrução ou alteração de Produção faz parte deste próximo passo.
