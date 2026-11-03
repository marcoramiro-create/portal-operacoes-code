#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/ubuntu/portal-operacoes-homolog
NODE=/home/ubuntu/.nvm/versions/node/v22.23.2/bin/node
TSX="$ROOT/node_modules/tsx/dist/cli.mjs"
ENV_FILE=/etc/portal-operacoes/portal.env
MODE=${1:-}

if [[ "$(pwd -P)" != "$ROOT" || ! -f "$ROOT/package.json" ]]; then
  echo "ERRO: execute somente de dentro do diretório físico de Homologação." >&2
  exit 1
fi
if [[ ! -x "$NODE" || ! -f "$TSX" ]] || ! sudo -n test -r "$ENV_FILE"; then
  echo "ERRO: Node 22, tsx local ou arquivo de ambiente da Homologação indisponível." >&2
  exit 1
fi

case "$MODE" in
  --sales)
    SCRIPT="$ROOT/scripts/rebuildPurchaseSalesMonthly.ts"
    CONFIRM_KEY=PURCHASE_SALES_REBUILD_CONFIRM
    LABEL=sales
    ;;
  --sb9)
    SCRIPT="$ROOT/scripts/rebuildSb9Monthly.ts"
    CONFIRM_KEY=SB9_MONTHLY_REBUILD_CONFIRM
    LABEL=sb9
    ;;
  *)
    echo "Uso: bash scripts/runCostReadmodelRebuild.sh --sales|--sb9" >&2
    exit 2
    ;;
esac
if [[ ! -s "$SCRIPT" ]]; then
  echo "ERRO: script de rebuild ausente: $SCRIPT" >&2
  exit 1
fi
UNIT="portal-cost-readmodel-${LABEL}-$(date +%Y%m%d%H%M%S)-$$"
echo "Iniciando job transitório $LABEL na Homologação. Não execute o outro rebuild até este terminar."
sudo -n systemd-run --wait --pipe --collect \
  --unit="$UNIT" \
  --property=User=ubuntu \
  --property=WorkingDirectory="$ROOT" \
  --property=EnvironmentFile="$ENV_FILE" \
  --setenv=NODE_OPTIONS=--max-old-space-size=256 \
  --setenv="$CONFIRM_KEY=HOMOLOGACAO" \
  "$NODE" "$TSX" "$SCRIPT"
