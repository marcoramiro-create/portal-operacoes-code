# Separação entre Homologação e Produção

## Regra principal

A Homologação e a Produção não compartilham diretório de código, processo de build ou banco de dados.

| Ambiente | Diretório | Serviço | Porta | Banco portal | Banco negócio |
|---|---|---|---:|---|---|
| Homologação | `/home/ubuntu/portal-operacoes-homolog` | `portal-operacoes` | 3000 | `portal_operacoes` | configuração de homologação |
| Produção | `/home/ubuntu/portal-operacoes-production` | `portal-operacoes-prod` | 3001 | `portal_operacoes_prod` | `portal_negocio_prod` |

## Regras bloqueadas

- O build de Homologação nunca usa o diretório da Produção.
- O build de Produção exige `ALLOW_PRODUCTION_DEPLOY=YES`.
- Produção exige `PROD_REF` como tag ou SHA; `main` é recusada.
- Homologação recusa variáveis com `portal_operacoes_prod`, `portal_negocio_prod` ou porta 3001.
- Produção recusa configuração sem os dois bancos `_prod`.
- Migrações não fazem parte do deploy normal; devem ser aplicadas separadamente, com banco conferido.
- Qualquer promoção para Produção só ocorre depois de homologação e aprovação explícita.

## Procedimento

1. Executar `scripts/deploy-homolog.sh`.
2. Homologar e testar funcionalmente.
3. Criar uma tag/release ou escolher um SHA aprovado.
4. Somente com autorização explícita, executar `scripts/deploy-production.sh` com `ALLOW_PRODUCTION_DEPLOY=YES PROD_REF=<tag-ou-sha>`.

## Recuperação

Antes de qualquer restauração, fazer backup do código, banco portal, banco de negócio e arquivos de ambiente. Não restaurar dados sem confirmar o ponto de recuperação e o impacto nos registros operacionais criados depois dele.
