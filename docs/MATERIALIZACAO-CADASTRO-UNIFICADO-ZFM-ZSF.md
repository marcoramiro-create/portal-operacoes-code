# Materialização unificada de ZFM e ZSF

**Data:** 2026-10-29  
**Projeto:** Portal de Operações Megatec  
**Ambiente:** definição local; sem aplicação em banco, Homologação ou Produção  
**Status:** proposta técnica para implementação controlada

## 1. Decisão estrutural

ZFM e ZSF serão tratadas como catálogos corporativos, não como cadastros internos de Compras, Estoque ou outro módulo.

A fonte oficial continua sendo:

```text
OneDrive
└── Documentos/Portal de Operações/Cadastros
    ├── ZFM/Famílias.xlsx
    └── ZSF/SubFamília.xlsx
```

O dado bruto continuará em `operational_source_rows`. A camada consultável será derivada e rastreável por lote.

## 2. Modelo conceitual

```text
EMPRESA
└── FILIAL
    └── PRODUTO (products)
        ├── AGREGADO (product_aggregates)
        ├── FAMÍLIA (catálogo ZFM)
        └── SUBFAMÍLIA (catálogo ZSF)
```

Família e SubFamília não serão relacionadas diretamente pelo mesmo código. O vínculo correto será obtido pela SB1:

```text
SB1.Codigo          → products.source_product_code
SB1.Familia        → código ZFM
SB1.Sub-familia    → código ZSF
```

A regra de produto aprovada permanece:

```text
SB1.Codigo = SB9.Produto = SBZ.Codigo
```

Para SBZ, a consulta operacional acrescenta:

```text
SBZ.Filial
```

## 3. Tabela central de classificações

A implementação deverá usar uma única tabela central de valores classificatórios, em vez de criar uma tabela de família dentro de cada módulo.

Nome recomendado:

```text
corporate_catalog_classifications
```

Colunas mínimas:

```text
id                 uuid primary key
kind               text: FAMILIA | SUBFAMILIA
code               text preservando zeros à esquerda
description        text
source_batch_id    uuid nullable → operational_import_batches
source_system      text default 'ZFM' ou 'ZSF'
active             boolean
valid_from         date/timestamp
valid_to           date/timestamp nullable
created_at         timestamptz
updated_at         timestamptz
```

Restrição principal:

```text
unique(kind, code)
```

Índices mínimos:

```text
(kind, code)
(kind, active)
(source_batch_id)
```

O código deve permanecer textual. Não converter `0000002` para `2` na gravação.

## 4. Relação do produto com a classificação

A implementação deverá manter a classificação vinculada ao produto da SB1, e não apenas dentro de JSON sem índice.

Nome recomendado:

```text
product_classification_links
```

Colunas mínimas:

```text
product_id             uuid → products
classification_id      uuid → corporate_catalog_classifications
classification_kind    text: FAMILIA | SUBFAMILIA
source_batch_id        uuid nullable
valid_from             date/timestamp
valid_to               date/timestamp nullable
active                 boolean
created_at             timestamptz
```

Restrições recomendadas:

```text
unique(product_id, classification_kind) where active
```

A relação deve permitir somente uma Família ativa e uma SubFamília ativa por produto, mas deve preservar histórico quando a classificação mudar.

## 5. Por que não usar somente products.metadata

`products.metadata` pode continuar recebendo cópia descritiva para compatibilidade, mas não será a fonte principal para filtros e cruzamentos.

Motivos:

- Família e SubFamília serão usadas em filtros e junções.
- Precisamos rastrear o lote de origem.
- Precisamos detectar código sem correspondência na ZFM/ZSF.
- Precisamos preservar histórico de alteração.
- O cadastro deve ser reutilizado por Compras, Custos, Estoque e Sugestão de Compras.

## 6. Fluxo de carga

A sincronização futura deve executar nesta ordem:

1. Listar `ZFM/Famílias.xlsx` e `ZSF/SubFamília.xlsx` no OneDrive.
2. Selecionar por caminho, extensão, `eTag`/hash e data de modificação.
3. Ler XLSX com cabeçalho deslocado na linha 4.
4. Validar código, descrição, duplicidade e zeros à esquerda.
5. Criar o lote de importação.
6. Gravar as classificações centrais em transação.
7. Ler os produtos materializados da SB1.
8. Aplicar `SB1.Familia → ZFM` e `SB1.Sub-familia → ZSF`.
9. Gravar ou atualizar os vínculos ativos de cada produto.
10. Registrar divergências sem apagar o lote bruto.
11. Só publicar a nova camada se toda a validação estrutural passar.

A atualização deve ser conjunta: não atualizar ZFM sem ZSF, ou ZSF sem registrar o resultado da carga correspondente.

## 7. Situações de auditoria

Devem ser registradas como problemas, sem apagar o produto:

- código de Família da SB1 ausente na ZFM;
- código de SubFamília da SB1 ausente na ZSF;
- produto SB1 sem Família ou SubFamília;
- código duplicado dentro da mesma fonte;
- descrição vazia;
- código convertido para número pela exportação;
- divergência entre o código original e o normalizado;
- classificação anterior substituída por nova classificação.

## 8. Compatibilidade com o legado

Nesta etapa, as tabelas abaixo não serão apagadas nem desativadas:

```text
familyReferences
subfamilyReferences
```

O caminho novo será alimentado em paralelo. A migração das leituras deverá ocorrer somente depois de:

1. comparar contagens;
2. comparar código e descrição;
3. comparar vínculos de produtos;
4. testar filtros de Compras, Custos e Sugestão de Compras;
5. validar os resultados em Homologação.

## 9. Critérios de aceite

- ZFM: 19 registros válidos no arquivo atualmente confirmado.
- ZSF: 68 registros válidos no arquivo atualmente confirmado.
- Cabeçalho na linha 4 aceito.
- Códigos com zeros à esquerda preservados.
- Descrições com espaços internos preservadas.
- ZFM e ZSF não relacionadas diretamente por código.
- SB1 usada como ponte para o produto.
- Nenhum produto perde seu vínculo atual por falta de correspondência.
- Dados brutos preservados.
- Legado preservado até a homologação da paridade.
- Produção não alterada.

## 10. Fora desta etapa

- Não criar ainda a tabela de parâmetros SBZ.
- Não integrar SB9 à Evolução de Custos.
- Não desligar `familyReferences` ou `subfamilyReferences`.
- Não executar migração na VM.
- Não alterar OneDrive.
- Não publicar na Homologação até o fluxo de gravação e paridade estar implementado e testado.
