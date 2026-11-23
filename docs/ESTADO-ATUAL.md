# Estado atual — Portal de Operações

**Atualizado em:** 23/11/2026 20:17 (horário de Brasília)
**Branch de trabalho:** `chore/sincronizacao-github`
**Objetivo desta etapa:** preparar a sincronização entre GitHub, sandbox, Oracle e computador, sem alterar bancos, OneDrive, Homologação ou Produção.

## Repositório oficial escolhido

O repositório oficial indicado pelo usuário é:

`https://github.com/marcoramiro-create/portal-operacoes-code`

O repositório `portal-operacoes` não respondeu como um repositório Git acessível na verificação read-only. O repositório `portal-operacoes-code` possui branch `main`, commit atual `45c217522bfa97152b986223046ecf2860c424e9` e a mesma aplicação `gestao-suprimentos-logistica`.

O remote atualmente configurado no sandbox ainda é um repositório interno temporário do Manus. Ele não deve ser tratado como fonte compartilhada entre o usuário, a Oracle, o computador, o Maestro e o Claude.

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

Os arquivos `server/routers.ts` e `server/costEvolutionAnalise.ts` divergem entre os dois locais. Portanto, não é seguro executar `git pull`, substituir o sandbox pelo GitHub ou publicar o estado local diretamente.

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

1. Preservar este diagnóstico em commit local.
2. Adicionar o GitHub oficial como remote separado, sem remover o remote Manus.
3. Fazer uma integração em branch temporária, mantendo os dois históricos.
4. Comparar e integrar primeiro os motores de custo e os testes correspondentes.
5. Comparar depois migrações, read models, scripts de deploy e componentes de diagnóstico.
6. Executar testes e build local.
7. Publicar uma branch/PR no GitHub oficial.
8. Atualizar o computador e a Oracle a partir do SHA aprovado, nunca por cópia manual de pasta.
9. Somente após validação funcional em Homologação criar uma tag para Produção.

## Pendências de dados ainda existentes

A validação read-only das fontes ainda precisa fechar, quando o OneDrive autenticado estiver disponível:

- cabeçalho/amostra da SX5;
- cabeçalho bruto da carga de Compras;
- amostra SB9 da filial 0105, armazéns 01 e 20, especialmente janeiro de 2025.

Estas pendências não impedem a preparação da sincronização, mas impedem iniciar a materialização definitiva dos fatos mensais de custos.

## Proibições desta etapa

- Não fazer push automático para `main`.
- Não fazer deploy na Oracle.
- Não executar migração remota.
- Não copiar banco ou dados entre ambientes.
- Não sobrescrever o GitHub com o sandbox antes da integração dos dois conjuntos de alterações.
