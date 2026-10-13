#!/usr/bin/env bash
set -euo pipefail

# Uso: assert-portal-environment.sh HOMOLOGACAO|PRODUCAO ENV_FILE SERVICE
ENVIRONMENT="${1:?informe HOMOLOGACAO ou PRODUCAO}"
ENV_FILE="${2:?informe o arquivo de ambiente}"
SERVICE="${3:?informe o serviço}"

[[ -f "$ENV_FILE" ]] || { echo "Arquivo ausente: $ENV_FILE" >&2; exit 40; }

case "$ENVIRONMENT" in
  HOMOLOGACAO)
    [[ "$SERVICE" == "portal-operacoes" ]] || { echo "Serviço inválido para Homologação." >&2; exit 41; }
    ! grep -Eq 'portal_(operacoes|negocio)_prod|PORT=3001' "$ENV_FILE" || { echo "Homologação aponta para Produção." >&2; exit 42; }
    ;;
  PRODUCAO)
    [[ "$SERVICE" == "portal-operacoes-prod" ]] || { echo "Serviço inválido para Produção." >&2; exit 43; }
    grep -Eq 'portal_operacoes_prod' "$ENV_FILE" || { echo "Banco portal de Produção ausente." >&2; exit 44; }
    grep -Eq 'portal_negocio_prod' "$ENV_FILE" || { echo "Banco de negócio de Produção ausente." >&2; exit 45; }
    ;;
  *) echo "Ambiente inválido: $ENVIRONMENT" >&2; exit 46 ;;
esac

echo "AMBIENTE_OK=$ENVIRONMENT SERVICO=$SERVICE"
