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
