#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.23.2/bin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/var/backups/portal-operacoes-prod}"
BACKUP="$BACKUP_ROOT/salesmonths-hotfix-$STAMP"
LOCK="/tmp/portal-operacoes-prod-salesmonths-hotfix.lock"

fail() { echo "ERRO: $*" >&2; exit 1; }
[[ "${ALLOW_PRODUCTION_DEPLOY:-}" == "YES" ]] || fail "Produção bloqueada: use ALLOW_PRODUCTION_DEPLOY=YES."
[[ "$ROOT" == *production* && "$SERVICE" == *prod* && "$ENV_FILE" == *prod* ]] || fail "caminho, serviço ou ambiente não são de Produção."
[[ -f "$PACKAGE_DIR/server/costEvolutionAnalise.ts" ]] || fail "fonte Autopeças ausente."
[[ -f "$PACKAGE_DIR/server/industryCostEvolutionAnalise.ts" ]] || fail "fonte Indústria ausente."
[[ -x "$NODE_BIN/npx" ]] || fail "npx Node 22 não encontrado."
command -v sudo >/dev/null || fail "sudo indisponível."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro hotfix de Produção em execução."
sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"
sudo -n cp -a "$ROOT/server/costEvolutionAnalise.ts" "$BACKUP/"
sudo -n cp -a "$ROOT/server/industryCostEvolutionAnalise.ts" "$BACKUP/"
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."

sudo -n cp -a "$PACKAGE_DIR/server/costEvolutionAnalise.ts" "$ROOT/server/"
sudo -n cp -a "$PACKAGE_DIR/server/industryCostEvolutionAnalise.ts" "$ROOT/server/"

cd "$ROOT"
export PATH="$NODE_BIN:$PATH"
export NODE_OPTIONS="--max-old-space-size=1400"
set -a
source "$ENV_FILE"
set +a
npx --no-install vite build
npx --no-install esbuild server/_core/index.ts \
  --platform=node --packages=external --bundle --format=esm \
  --outdir=dist --alias:@shared=./shared
test -f dist/public/index.html
test -f dist/index.js

sudo -n systemctl restart "$SERVICE"
for i in $(seq 1 12); do
  if sudo -n systemctl is-active --quiet "$SERVICE" && curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:3001/; then
    echo "PROD_HTTP=200"
    break
  fi
  [[ "$i" == 12 ]] && fail "serviço/HTTP não estabilizou."
  sleep 5
done

echo "PRODUCAO_SALESMONTHS_HOTFIX_OK"
echo "BACKUP=$BACKUP"
echo "DADOS_COPIADOS=NAO"
echo "MIGRACOES=NAO"
echo "ROLLBACK=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT && systemctl restart $SERVICE"
