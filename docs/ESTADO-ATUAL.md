# Estado atual — Portal de Operações

**Atualizado em:** 23/11/2026 20:17 (horário de Brasília)
**Branch de trabalho:** `chore/sincronizacao-github`
**Objetivo desta etapa:** preparar a sincronização entre GitHub, sandbox, Oracle e computador, sem alterar bancos, OneDrive, Homologação ou Produção.

## Repositório oficial escolhido

O repositório oficial indicado pelo usuário é:

`https://github.com/marcoramiro-create/portal-operacoes-code`

O repositório `portal-operacoes` não respondeu como um repositório Git acessível na verificação read-only. O repositório `portal-operacoes-code` possui branch `main`, a mesma aplicação `gestao-suprimentos-logistica` e preserva a sequência de correções de custos iniciada no commit `45c2175`. Após o checkpoint desta etapa, a referência publicada passou a apontar para o checkpoint `ca79fe5`, que contém este documento.

O remote `origin` continua sendo um repositório interno do Manus, mas o remote `github` foi adicionado apontando para `portal-operacoes-code`. O GitHub é a fonte compartilhada; `origin` não deve ser usado para sincronizar Oracle, computador, Maestro ou Claude.

## Diagnóstico da divergência

O GitHub não é apenas uma cópia antiga do sandbox. Ele contém correções de custos mais recentes, entre elas:

- correção para não apagar custo válido quando a SB9 apresenta custo zero;
- correção da regra do custo total de Autopeças conforme a regra informada pelo usuário;
- utilitário `custoPorMes.ts` para validação mensal;
- componentes e rotas de diagnóstico/saúde do pipeline;
- scripts de reconstrução da Indústria e dos read models SB9;
- materialização/resumo de fontes do OneDrive.

O sandbox contém, por outro lado, alterações posteriores relacionadas a:

- separação de Homologação e Produção;
- migrações produtivas e read models adicionais;
- fallbacks para estruturas ausentes na Produção;
- correção para não refazer consultas pesadas ao recuperar foco da tela;
- ajustes recentes de autenticação e preparação de deploy.

Os arquivos `server/routers.ts` e `server/costEvolutionAnalise.ts` divergiam antes da integração. A branch `chore/sincronizacao-github` está agora baseada no histórico do GitHub e recebeu apenas dois ajustes mínimos: remoção de um auxiliar OneDrive incompleto que duplicava implementação existente e correção da chamada de redefinição de senha. A branch `main` local continua preservada separadamente para comparação.

## Estado de ambientes

A separação documentada permanece:

- Homologação: `/home/ubuntu/portal-operacoes-homolog`, porta 3000, banco operacional `portal_operacoes`.
- Produção: `/home/ubuntu/portal-operacoes-production`, porta 3001, bancos `portal_operacoes_prod` e `portal_negocio_prod`.
- Os bancos e cargas não serão copiados pelo Git.
- Migrações não fazem parte de um deploy comum; devem ser aplicadas separadamente, com conferência do banco alvo.
- Produção só pode receber tag ou SHA aprovado após Homologação e autorização explícita.

## Regras de sincronização

1. GitHub privado será a fonte oficial do código, documentação, testes, scripts e migrações.
2. OneDrive continuará sendo fonte dos arquivos Protheus; seus dados não entram no Git.
3. A Oracle executará releases aprovadas, sem usar o diretório compartilhado antigo.
4. O computador do usuário deverá usar clone do GitHub oficial e `git pull --ff-only` antes de trabalhar.
5. Maestro poderá executar diagnósticos e instalações previamente aprovadas na Oracle.
6. Claude poderá fazer revisão mecânica, testes e documentação, mas não decidir fórmulas, joins, CFOPs ou regras de negócio.
7. Nenhum agente deve editar diretamente a Produção ou o `main` sem branch, revisão e registro.

## Próxima sequência segura

1. Preservar este diagnóstico e os dois ajustes em commit na branch de integração.
2. Manter o remote GitHub separado do remote Manus.
3. Comparar os motores de custo, migrações, read models e scripts da `main` local com o histórico GitHub antes de promover qualquer versão.
4. Executar testes e build local; nesta etapa TypeScript, testes e build passaram.
5. Publicar uma branch/PR no GitHub oficial somente após revisar o diff final.
6. Atualizar o computador e a Oracle a partir do SHA aprovado, nunca por cópia manual de pasta.
7. Somente após validação funcional em Homologação criar uma tag para Produção.

## Validação técnica desta etapa

- `pnpm exec tsc --noEmit`: aprovado após os dois ajustes.
- `pnpm test --run`: aprovado.
- `pnpm run build`: aprovado.
- Publicação automática do checkpoint: falhou no health check porque o ambiente do sandbox não tinha `ONEDRIVE_TOKEN_KEY`. Isso não alterou a Oracle nem os bancos, mas confirma que a publicação automática não deve ser usada como deploy do Portal.

## Pendências de dados ainda existentes

A validação read-only das fontes ainda precisa fechar, quando o OneDrive autenticado estiver disponível:

- cabeçalho/amostra da SX5;
- cabeçalho bruto da carga de Compras;
- amostra SB9 da filial 0105, armazéns 01 e 20, especialmente janeiro de 2025.

Estas pendências não impedem a preparação da sincronização, mas impedem iniciar a materialização definitiva dos fatos mensais de custos.

## Proibições desta etapa

- Não fazer deploy automático a partir do sandbox; o checkpoint pode atualizar a referência GitHub, mas isso não substitui revisão, Homologação ou release.
- Não fazer deploy na Oracle.
- Não executar migração remota.
- Não copiar banco ou dados entre ambientes.
- Não substituir a `main` local pela branch GitHub sem preservar o histórico e os scripts de Produção/read models.


## Documento-mestre de requisitos — 23/11/2026

Foi criado `docs/PLANO-MESTRE-ANALISE-EVOLUTIVA.md`, consolidando os requisitos funcionais e técnicos já definidos para a evolução de custos e consumo de Autopeças e Indústria: fontes, filiais, armazéns, CFOPs, ponderação, períodos, ranking de agregados, pneus, auditoria, inflação/dólar e sequência de validação.

A consolidação é somente documental: não alterou código, banco, OneDrive, Homologação ou Produção. O próximo passo seguro é validação read-only de cabeçalhos/chaves e conciliação de um caso pequeno antes de qualquer novo read model, migração ou integração de tela.


## Primeira conciliação read-only — 23/11/2026

Foi concluída localmente a primeira conciliação controlada em `docs/CONCILIACAO-READONLY-0303-301010414-MGT-2025Q1.md`: Autopeças, filial 0303, agregado `301010414-MGT`, produto focal `100000142456`, armazém 01, janeiro a março de 2025. Foram cruzados SB1, SD1 e SF1; a SB9 foi usada somente para comparação.

O produto focal apresentou custo de entrada de R$ 420,35 em janeiro e março. A comparação com a SB9 foi próxima em março (R$ 420,2450) e divergente em janeiro (R$ 383,9860), confirmando que a análise de custo de entrada não deve substituir sua fonte por SB9 automaticamente. Nenhum banco remoto, código funcional, OneDrive, Homologação ou Produção foi alterado.


## Primeira conciliação read-only da Indústria — 23/11/2026

Foi concluída localmente a conciliação de `docs/CONCILIACAO-READONLY-0105-04088-2025Q1.md`: filial 0105, armazém 20, produto/agregado `04088`, janeiro a março de 2025. As entradas SD1/SF1, todas com CFOP 1101, resultaram em custo médio de R$ 6,34. A SB9 do armazém 20 apresentou R$ 5,2101, R$ 5,2298 e R$ 5,2253, diferença consistente de aproximadamente 21%.

A evidência reforça a separação entre custo de entrada e custo mensal da SB9 na Indústria. O armazém 01 apresentou custo zero e não foi usado como base comparável. A regra financeira ainda precisa ser conciliada com RM BIS/planilha antes de qualquer read model definitivo.


## Verificação da hipótese de frete — 23/11/2026

Foi verificado `Vlr. Frete`, `Vlr. Seguro` e `Vlr. Despesa` na SD1 e `Vlr.Frete`, `Vlr.Seguro` e `Vlr.Despesas` na SF1 para os dois casos controlados. Todos estavam zerados. A divergência entre custo de entrada e SB9 não é explicada por frete, seguro ou despesa explicitamente apropriáveis nesses registros. A análise foi registrada em `docs/VERIFICACAO-FRETE-CONCILIACOES-2025Q1.md`.


## Hipóteses após a verificação de frete — 23/11/2026

A análise local adicional verificou composição fiscal e saldo inicial. Na Indústria, as notas do produto 04088 têm IPI de 5% e ICMS informado, mas os percentuais observados não explicam exatamente a diferença da SB9. A SB9 também possui saldo inicial relevante no armazém 20, tornando plausível que `C Unit 1a M` seja custo de abertura/médio contábil, e não preço de entrada do mês. Essa hipótese permanece pendente de confirmação operacional da SB9; nenhuma fórmula foi alterada.


## Tabela para Fiscal/Controladoria — 23/11/2026

Foi criada `docs/TABELA-VALIDACAO-FISCAL-CONTROLADORIA-2025Q1.md`, com resumo comparativo, detalhamento das notas de Autopeças e Indústria, campos SF1, custos de entrada, SB9, saldos iniciais e perguntas objetivas para validação. O documento deixa explícito que valores `Vlr.Mercad`/`Vlr.Bruto` da SF1 são da nota inteira e não devem ser atribuídos ao produto sem rateio aprovado.


## Correção da conciliação de Autopeças — 23/11/2026

Na preparação da tabela para Fiscal/Controladoria, foi identificada e corrigida uma omissão: o produto `100000142456` possui duas entradas em março de 2025, não apenas uma. São 48 unidades a R$ 420,35 e 80 unidades a R$ 507,00, totalizando 128 unidades, R$ 60.736,80 e custo médio ponderado de R$ 474,5063. A comparação correta com a SB9 de R$ 420,2450 resulta em diferença de 12,91% em março. Os relatórios e a tabela foram corrigidos antes da entrega.
