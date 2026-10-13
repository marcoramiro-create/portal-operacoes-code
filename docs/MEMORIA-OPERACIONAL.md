# Memória operacional — Portal de Operações

Atualização: 13/10/2026. Consultar este documento antes de qualquer proposta de deploy, migração ou mudança estrutural. Esta memória depende de os arquivos do projeto estarem disponíveis; não substitui verificação atual dos ambientes.

## Fatos comprovados

- A VM Oracle em 144.22.211.136 executa os serviços systemd portal-operacoes (3000) e portal-operacoes-prod (3001).
- O retorno enviado pelo usuário em pasted_content_29.txt comprova WorkingDirectory e cwd real do processo principal em /home/ubuntu/portal-operacoes-homolog e /home/ubuntu/portal-operacoes-production, respectivamente. Ambos retornaram HTTP 200.
- Antes da separação, ambos usavam /home/ubuntu/portal-operacoes-code. Alterar fontes e dist nesse diretório compartilhado podia atingir ambos os ambientes.
- Configuração anteriormente verificada: Homologação usa portal_operacoes; Produção usa portal_operacoes_prod e portal_negocio_prod. Não presumir configuração futura sem conferir.
- A separação copiou a versão corrente para ambos os diretórios; NÃO restaurou a versão anteriormente homologada da Produção.
- A imagem da Vercel enviada em 13/10/2026 mostra deploys recentes Ready, classificados como Production, da branch main e dos commits recentes do projeto. Portanto, a integração de deploy da Vercel continua ativa. Domínios, variáveis e acesso a bancos dessa publicação não foram verificados. O rótulo Production da Vercel não comprova que seja o serviço produtivo da Oracle.
- A chave SSH disponível no Sandbox foi recusada. Os comandos na VM foram executados pelo usuário. Não alegar execução remota própria.

## Pendências prioritárias

1. Verificar proxy/DNS para identificar os endereços que chegam a 3000 e 3001; separar endereços de Homologação e Produção.
2. Verificar domínios e bancos usados pela Vercel; avaliar desativação apenas do deploy automático se ela não for utilizada, sem excluir projeto ou histórico.
3. Identificar versão aprovada e backups para rollback do código produtivo. Preservar dados operacionais e exigir aprovação do alvo exato antes de restaurar.
4. Instalar e testar barreiras de deploy na VM. Os scripts existentes foram apenas preparados localmente e têm validação de sintaxe, NÃO comprovação operacional. Revisar antes de usar: conferir WorkingDirectory efetivo, instalar dependências no checkout novo, evitar build sobre dist ativo e usar referência realmente imutável.
5. Corrigir ABC somente em Homologação com prova de dados reais. O router costEvolution.analise revisado não repassava input.segment ao getCostEvolutionAnalise; isso deve ser investigado antes de qualquer conclusão sobre Indústria.
6. Comparar o item 294311/filial 0303 na mesma versão de Compras e custos. A consulta anterior incluiu OR branch e LIMIT 30 e, portanto, retornou outros itens: NÃO prova ausência do item nem divergência de códigos. Corrigir a consulta de diagnóstico antes de concluir.
7. Investigar importação global de evolução de estoque. Unexpected token '<' prova resposta não JSON; não comprova isoladamente timeout. Logs e resposta HTTP precisam ser verificados.
8. Apresentar mapa funcional separado para aprovação; descrições no menu não foram aprovadas pelo usuário.

## Regras e lições obrigatórias

- Ser sucinto, objetivo e econômico. Informar antes de alterar comportamentos; cumprir as aprovações do usuário.
- Não confundir checkpoint, commit, build, instalação e validação funcional. Reportar cada estágio com evidência.
- HTTP 200 na raiz não comprova ABC funcionando, importação concluída ou banco correto.
- Não usar o diretório antigo para builds dos serviços atuais.
- Nunca atualizar Produção sem homologação e autorização explícita. Preparar scripts não significa proteção instalada.
- Evitar set -e no shell interativo: usar script ou bash em subprocesso para que falhas não derrubem o SSH.
- Conferir pré-requisitos, permissões, espaço, dependências e backups antes de parar serviços.
- Não apagar diretórios existentes para repetir instalação; preservar e planejar rollback.
- Não restaurar banco apenas para reverter interface/código.
- Não engolir erro SQL e apresentar ausência de curva como diagnóstico definitivo. Distinguir erro de fonte, falta de dados e falha de vínculo.
- Não inferir equivalência de códigos agregados e produtos ou remover sufixos sem regra de negócio validada.
- Cadastros únicos e hierárquicos: empresa → filial → demais entidades conforme seu vínculo real. Não criar cadastros paralelos dentro de módulos específicos.

## Entrega mínima para afirmar sucesso

Mostrar serviço, cwd efetivo, porta, banco configurado sem credenciais, versão instalada e teste funcional de um caso real. Para ABC: mesmo item, filial e versão de referência, classificação de origem e classificação resultante.
