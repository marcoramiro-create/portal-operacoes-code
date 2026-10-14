# Handoff técnico — Portal de Operações

**Data:** 2026-10-14  
**Escopo:** Homologação e Produção  
**Regra deste documento:** não confundir fato verificado, relato histórico e ponto pendente de confirmação.

## 1. Resumo executivo

O projeto tem duas linhas diferentes no estado atual:

- **Código local/WebDev:** contém a evolução ABC, correções de custos, mudanças de menu e uma integração OneDrive ainda não commitada.
- **VM Oracle:** possui diretórios físicos separados para Homologação e Produção segundo evidência enviada pelo usuário, mas a versão exata do código executado em cada serviço não pôde ser verificada nesta inspeção porque a chave SSH disponível no Sandbox foi recusada.
- **Domínios públicos:** ambos respondem HTTP 200. O domínio sem `-prod` entrega o bundle `index-CUd28H7T.js`; o domínio com `-prod` entrega `index-Ch37iY5j.js`. Isso confirma respostas públicas distintas, mas **não identifica sozinho o commit ou o banco**.
- **Produção não foi alterada nesta inspeção.** Não houve deploy, build, migration, restart, escrita de banco ou alteração de configuração.

## 2. FATOS VERIFICADOS agora

### 2.1 Repositório local

- Projeto: `/home/ubuntu/gestao-suprimentos-logistica`.
- Branch atual: `main`.
- HEAD local: `90d8baa` — `fix: preservar curva da industria na evolucao`.
- `origin/main`: `9185fd9`.
- `user_github/main`: `90d8baa`.
- HEAD local está **à frente de `origin/main` em 1 commit**.
- Working tree não está limpa:
  - modificados: `.manus-logs/devserver.log`, `client/src/components/OneDriveImportSource.tsx`, `client/src/pages/CostEvolution.tsx`, `server/_core/env.ts`, `server/_core/index.ts`, `server/costEvolutionBenchmarkAdapter.test.ts`, `server/costEvolutionBenchmarkAdapter.ts`, `server/routers/portal.ts`;
  - não rastreados: `server/oneDriveOAuth.ts` e `supabase/migrations/0047_portal_onedrive_connections.sql`.
- Não há PRs abertos no repositório GitHub consultado.
- Repositório GitHub público consultado: [marcoramiro-create/portal-operacoes-code](https://github.com/marcoramiro-create/portal-operacoes-code).

### 2.2 Domínios públicos

Consulta somente leitura feita em 2026-10-14:

| Domínio | HTTP | Bundle entregue | Interpretação segura |
|---|---:|---|---|
| `https://portal-operacoes-megatec.duckdns.org/` | 200 | `index-CUd28H7T.js` | Responde publicamente; historicamente tratado como Homologação |
| `https://portal-operacoes-prod-megatec.duckdns.org/` | 200 | `index-Ch37iY5j.js` | Responde publicamente; historicamente tratado como Produção |

O bundle e o HTTP 200 **não comprovam** o commit, o banco ou a versão de backend.

### 2.3 GitHub/PRs

- Consulta `gh pr list --state open`: **nenhum PR aberto**.
- Os PRs existentes consultados são históricos e estão fechados/mesclados; não há trabalho em andamento formalizado por PR.

### 2.4 Validação local executada nesta retomada

Com os arquivos locais atuais:

```bash
NODE_OPTIONS=--max-old-space-size=1400 pnpm exec tsc --noEmit --incremental false
```

Resultado: **aprovado**.

Testes executados:

```bash
NODE_OPTIONS=--max-old-space-size=1400 \
  pnpm vitest run server/onedriveSharedLink.test.ts server/onedriveSharedSource.test.ts
```

Resultado: **2 arquivos, 3 testes aprovados**.

Não foi executado build ou deploy nesta inspeção.

## 3. RELATOS/evidências históricas recebidas do usuário

Os itens abaixo vieram de comandos, telas ou resultados enviados anteriormente. São úteis, mas não foram reexecutados nesta inspeção.

### 3.1 VM, serviços e separação física

O usuário enviou evidência de que:

- Homologação usa `/home/ubuntu/portal-operacoes-homolog` e serviço `portal-operacoes` na porta 3000.
- Produção usa `/home/ubuntu/portal-operacoes-production` e serviço `portal-operacoes-prod` na porta 3001.
- Ambos já retornaram HTTP 200 após a separação física.
- Antes da separação, os dois serviços usavam `/home/ubuntu/portal-operacoes-code`, o que permitia que alterações no mesmo diretório afetassem os dois ambientes.

A chave SSH disponível nesta sessão foi recusada com `Permission denied (publickey)`. Portanto, os itens acima permanecem como evidência histórica enviada pelo usuário, não como inspeção remota atual.

### 3.2 Bancos historicamente informados

Foi informado anteriormente que:

- Homologação: `portal_operacoes`.
- Produção portal: `portal_operacoes_prod`.
- Produção negócio: `portal_negocio_prod`.

Também foi verificado anteriormente que a tabela `sbz_product_curves` existia em `portal_operacoes` e `portal_operacoes_prod`, enquanto os dados de Compras (`inventoryAnalytics` e `protheusImports`) estavam no banco de negócio.

A existência atual dessas estruturas não foi reconsultada nesta inspeção por falta de acesso SSH.

### 3.3 Produção restaurada anteriormente

O usuário executou um procedimento de restauração em 2026-10-13 que:

- baixou uma candidata de restauração;
- ativou-a em `/home/ubuntu/portal-operacoes-production`;
- preservou backup em `/home/ubuntu/portal-operacoes-production.before-restore-20261013-202200`;
- confirmou posteriormente `PROD_HTTP=200`.

Isso comprova que houve uma restauração operacional naquele momento, mas **não comprova o commit atualmente servido** nem o estado atual do banco de Produção.

### 3.4 Homologação e OneDrive

- A migração `0046_access_request_person_identity.sql` foi aplicada na Homologação após correção de permissões do arquivo temporário.
- O usuário confirmou que a tela de usuários voltou a funcionar.
- A integração OneDrive foi preparada localmente, mas a instalação na Homologação falhou primeiro por ordem incorreta do instalador; depois foi preparado um instalador v2, porém **não há confirmação neste handoff de que ele tenha sido executado com sucesso**.
- A integração ainda não deve ser considerada implantada, testada fim a fim ou autorizada para Produção.

## 4. Mudanças concluídas desde 27/09

### 4.1 Compras, SB1/SBZ e zeros à esquerda

**Concluído no código:**

- Preservação do código original com zeros à esquerda na exibição e no dashboard.
- Migration de referência: `0028_inventory_analytics_code_original.sql`.
- Normalizador CSV Protheus com cabeçalho na terceira linha, BOM, delimitadores, aspas, duplicidades e linhas inválidas.
- Contratos/aliases para SB1, SBZ, SB5, SA2 e SC7.
- Correção posterior para priorizar **filial + código agregado** no cálculo da Curva ABC de Compras.

**Commits principais:** `91152ad`, `32b7b0d`, `f54254b`, `b2a15d4`.

**Estado:** implementado no código local; validação funcional no ambiente real precisa ser repetida com um item e filial conhecidos.

### 4.2 Cards e dashboard

**Concluído no código:**

- Barra compacta de indicadores do dashboard.
- Correções de contratos TypeScript do Dashboard e respostas de analytics.
- Ajustes de indicadores de estoque, cobertura, giro e valores.

**Commits principais:** `8673a80`, `9adb2ba`, `8515467`.

**Estado:** existente no código; não foi possível confirmar nesta inspeção o commit servido pelos domínios.

### 4.3 Menu e permissões

**Concluído no código:**

- Menu filtrado por permissões.
- Início visível para todos os usuários autorizados.
- Grupos Início, Cadastros, Importações, Operações, Análises e Administração.
- Busca por menu, grupos recolhíveis, favoritos e indicação de rota ativa.
- Identificação visual de Homologação/Produção baseada no domínio.
- Correções de permissões para administração técnica e Curva ABC da Indústria.

**Commits principais:** `5814f8c`, `c7725ea`, `49ac55f`, `b4d3aca`, `6106e03`, `6d2ca9d`, `9185fd9`.

**Estado:** houve relatos de diferenças visuais entre os ambientes; o estado efetivo atual na VM não foi confirmado por SSH nesta inspeção.

### 4.4 Recebimento e leitor Android

**Concluído no código:**

- Leitor híbrido/adaptativo para Android e iOS.
- Leitura por foto e câmera nativa no Android.
- Campos de ponto de leitura, filial, armazém, local e transportadora.
- Tipo de recebimento: estoque próprio ou redespacho.
- Etapas de fluxo: Recebimento, Descarga, Conferência e Envio ao fiscal.
- Regras de leitura por ponto, conferência item a item, divergências, bloqueio antes do fiscal e redespacho com filial destino obrigatória.
- Schema operacional de recebimentos e constraint composta relacionada ao ponto de leitura.

**Commits principais:** `f239dc8`, `226cc16`, `24c4d5a`, `347b716`, `edf7e71`, `ab70e19`, `373af61`, `074ea75`, `ec77420`, `40140f5`, `fa6ac46`.

**Estado:** regras e telas existem no código; a conferência item a item e a integração com XML/SA5/SC7 ainda não estão comprovadas como fluxo completo em ambiente real.

### 4.5 ABC da Indústria

**Concluído no código:**

- Importador de Entrada de Materiais RM BIS.
- Importador de Evolução de Estoque.
- Cálculo baseado em consumo em R$ e regras de fechamento.
- Gravação em `sbz_product_curves`.
- Rota/tela de Curva ABC da Indústria.
- Vínculo por filial + código agregado, com fallback individual para compatibilidade legada.

**Commits principais:** `d66a64d`, `361fe1a`, `9eb76d5`, `77ad859`, `f79c362`, `389a40b`, `13d9fe5`, `d31c7b7`, `86e7c84`, `0d6672c`, `a448a1c`.

**Estado:** houve validação local e correções sucessivas; o item real `03545` foi usado em testes/diagnóstico históricos. A confirmação atual no ambiente servido depende de consulta ao banco e backend da Homologação.

### 4.6 Evolução de Custos

**Concluído no código:**

- Painel gerencial de Curva ABC/ABCDE dentro da Evolução de Custos.
- Resumo por curva, média de variação, itens com base e alertas.
- Separação da fonte: Indústria via `sbz_product_curves`; Autopeças via dados aprovados de Compras (`inventoryAnalytics`).
- Separação entre banco do portal e banco de negócio.
- Prioridade de cruzamento: **filial + código agregado**, código individual como fallback legado.
- Filtro posterior para excluir itens sem custo no período e itens sem curva válida.
- Regra acordada: Indústria não usa curvas D/E; impacto estimado e inflação interna permanecem zero até haver base de cálculo aprovada.

**Commits/checkpoints principais:** `c7aa76c`, `c967e07`, `d0c7e63`, `ca3bab5`, `11cf713`, `a6d9791`, `1effaca1`, `b2a15d4`, `90d8baa`.

**Estado:** foi corrigido localmente e houve instalação relatada na Homologação para filtros de itens sem curva. Porém, o vínculo e a tela devem ser novamente testados com itens reais de Autopeças e Indústria antes de qualquer promoção.

## 5. Bugs ainda abertos / reprodução observada

### 5.1 Integração OneDrive

- **Sintoma:** primeiro instalador parou com `cp: cannot stat 'server/oneDriveOAuth.ts'` porque os arquivos novos ainda não existiam na cópia física da Homologação.
- **Correção preparada:** instalador v2 extrai primeiro, faz backup condicional e só depois instala.
- **Estado:** execução v2 ainda não confirmada.
- **Reprodução:** executar instalador antigo em uma cópia de Homologação que não contenha `server/oneDriveOAuth.ts`.

### 5.2 Evolução de estoque global versus Indústria

- **Sintoma histórico:** tentativa de importar uma evolução de estoque global resultou em `Unexpected token '<', "<html>... is not valid JSON`.
- **Interpretação segura:** a tela recebeu HTML onde esperava JSON; isso pode ser erro HTTP/proxy/timeout ou rota incorreta. Não é prova isolada de timeout.
- **Estado:** precisa ser reproduzido com logs HTTP e identificação do arquivo global versus arquivo da Indústria.

### 5.3 Curva não exibida na Evolução de Custos

- **Sintomas históricos:** itens conhecidos como curva A apareciam como `SEM_CURVA` ou no resumo “Sem curva”.
- **Causas investigadas:** banco errado, fonte de dados separada, prioridade de chave, código agregado, zeros à esquerda e saída antecipada do relatório.
- **Correções aplicadas no código:** fonte separada, chave filial + agregado, normalização e filtro de período/curva.
- **Estado:** não considerar encerrado sem teste real com:
  - segmento;
  - filial;
  - código agregado;
  - curva de origem;
  - resultado da tela;
  - commit/backend efetivamente servido.

### 5.4 Acesso e permissões

- **Sintoma resolvido na Homologação:** tela de usuários falhava com `column request.requested_display_name does not exist`.
- **Correção:** migração `0046_access_request_person_identity.sql` aplicada na Homologação; usuário confirmou retorno da tela.
- **Estado:** Produção não foi confirmada nesta inspeção.

### 5.5 Build e runtime

- O projeto já apresentou OOM com heap padrão durante Vite; builds bem-sucedidos usaram `NODE_OPTIONS=--max-old-space-size=1400`.
- Houve erros históricos por `dist/public/index.html` ausente durante troca de diretório/build atômico.
- O procedimento seguro precisa sempre validar arquivo final, cwd do serviço, porta, banco e HTTP antes de declarar sucesso.

## 6. Migrations no código versus aplicação confirmada

### 6.1 Existentes no código

A pasta `supabase/migrations` contém, entre outras, as migrations:

- `0028_inventory_analytics_code_original.sql`;
- `0029_user_operational_scope.sql`;
- `0030_production_role_rls.sql`;
- `0031_nf_receipt_flow.sql`;
- `0032_employee_reference_catalogs.sql`;
- `0033_nf_receipt_reading_point.sql`;
- `0034_nf_receipt_operational_fields.sql`;
- `0041_homolog_catalog_rls.sql`;
- `0046_access_request_person_identity.sql`;
- `0047_portal_onedrive_connections.sql`;
- `0047_portal_user_person_identity.sql`.

A duplicidade numérica `0047` precisa ser corrigida antes de usar uma sequência automática de migrations.

### 6.2 Aplicação confirmada por evidência histórica do usuário

- `0032_employee_reference_catalogs.sql`: aplicação relatada na Homologação.
- `0034_nf_receipt_operational_fields.sql`: aplicação relatada na Produção.
- Scripts de saneamento de autenticação `0043` e `0044`: aplicação relatada na Produção; não são migrations presentes com esses mesmos nomes nesta listagem atual.
- `0046_access_request_person_identity.sql`: aplicada na Homologação; o usuário confirmou que a tela de usuários voltou a funcionar.

### 6.3 Não confirmado

- Não há nesta inspeção uma consulta atual à tabela de controle de migrations em Produção.
- `0047_portal_onedrive_connections.sql` **não deve ser considerado aplicado** em nenhum ambiente.
- Não se deve inferir que todas as migrations do diretório estejam aplicadas em qualquer banco.

## 7. Versão em Produção

### FATO VERIFICADO

- O domínio público tratado como Produção respondeu HTTP 200 em 2026-10-14.
- Ele entregou `index-Ch37iY5j.js`.
- A Produção foi historicamente configurada no serviço `portal-operacoes-prod`, porta 3001, diretório `/home/ubuntu/portal-operacoes-production`.

### NÃO CONFIRMADO

- Commit/HEAD efetivamente executado pelo backend de Produção.
- Se o bundle público e o backend pertencem exatamente ao mesmo pacote.
- Se o domínio está chegando diretamente na VM Oracle ou em Vercel/proxy.
- Estado atual dos bancos `portal_operacoes_prod` e `portal_negocio_prod`.

A chave SSH disponível nesta sessão foi recusada; portanto, não é tecnicamente correto declarar uma versão de Produção por commit.

## 8. Decisões de negócio registradas

- Homologação e Produção devem ser independentes; nenhum build de Homologação deve atingir Produção.
- Produção só deve receber um pacote consolidado após homologação explícita do usuário.
- O vínculo gerencial da curva é sempre **filial + código agregado**; o código individual é fallback legado.
- A Curva da Indústria não deve apresentar D/E.
- Item sem custo no período deve ser ignorado na Evolução de Custos.
- Item com custo no período, mas sem curva válida, também não deve aparecer como “Sem curva”; o sistema deve exibir apenas itens elegíveis.
- Impacto estimado e inflação interna devem permanecer zerados até haver base de cálculo aprovada.
- A conferência de recebimento deve ser item a item e respeitar as etapas do fluxo.
- OneDrive deve ser leitura controlada; a gravação no portal continua sujeita a prévia e aprovação.

## 9. Riscos e bloqueios

1. **Acesso remoto:** a chave disponível nesta sessão não autentica na VM; isso impede prova independente do runtime e do banco.
2. **Divergência de linhas Git:** local `90d8baa`, `origin/main` `9185fd9` e GitHub `main` `90d8baa` não estão alinhados.
3. **Working tree suja:** há alterações ABC e OneDrive não commitadas.
4. **Deploy externo:** Vercel mostrou deploys classificados como Production historicamente; não foi possível confirmar domínios, variáveis ou bancos associados.
5. **Migrations:** há numeração duplicada `0047` e não existe matriz de aplicação verificada por ambiente.
6. **Banco dividido:** portal e negócio são bases distintas; consultas ABC dependem da fonte correta e do ambiente correto.
7. **OneDrive:** OAuth e token storage foram preparados localmente, mas não estão comprovados como instalados na Homologação.
8. **Reprodutibilidade:** HTTP 200 da raiz não prova que uma tela tRPC, uma importação ou uma análise ABC esteja funcional.

## 10. Próximo passo recomendado

### Primeiro — sem alteração de código/banco

Restabelecer acesso SSH de manutenção à VM ou fornecer uma chave válida. Depois executar somente leitura nos dois ambientes para confirmar:

- cwd efetivo e `ExecStart` dos dois serviços;
- HEAD ou marcador de pacote em cada diretório;
- bundle e data do build;
- banco configurado sem exibir credenciais;
- migrations aplicadas;
- HTTP e uma chamada funcional tRPC por ambiente.

### Segundo — Homologação

1. Confirmar se o instalador OneDrive v2 foi executado; se não, instalar apenas na Homologação.
2. Testar conexão OAuth com a pasta `Documents/Email attachments from Power Automate`.
3. Listar um arquivo real e baixá-lo sem gravar automaticamente.
4. Testar ABC com dois casos reais: um de Autopeças e um da Indústria, sempre registrando filial, agregado, curva de origem e resultado.
5. Testar o item sem custo e confirmar que ele não aparece.

### Terceiro — governança do código

1. Separar o trabalho OneDrive em commit próprio.
2. Separar correções ABC em commit próprio.
3. Resolver a duplicidade de numeração `0047`.
4. Criar uma matriz `ambiente → diretório → serviço → banco → commit → bundle`.
5. Só depois preparar um pacote de promoção; **não publicar em Produção sem autorização explícita**.

## 11. Links úteis

- [HEAD local no GitHub](https://github.com/marcoramiro-create/portal-operacoes-code/commit/90d8baa)
- [Commit publicado em `origin/main` no contexto local](https://github.com/marcoramiro-create/portal-operacoes-code/commit/9185fd9)
- [Lista de PRs do repositório](https://github.com/marcoramiro-create/portal-operacoes-code/pulls)

## 12. Conclusão para o próximo assistente

Não assumir que checkpoint é deploy, que build é publicação, que HTTP 200 prova funcionamento ou que uma migration existente foi aplicada. Antes de qualquer mudança, confirmar o ambiente pelo cwd do serviço, porta, banco e versão. Manter Produção congelada até que a Homologação seja testada e o usuário autorize um pacote consolidado.
