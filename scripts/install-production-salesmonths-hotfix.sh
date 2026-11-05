#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$PACKAGE_DIR/migrations/production"
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
[[ -f "$PACKAGE_DIR/server/economicIndices.ts" ]] || fail "fonte de índices econômicos ausente."
[[ -f "$PACKAGE_DIR/server/industryConsumptionStore.ts" ]] || fail "fonte do read model industrial ausente."
[[ -f "$MIGRATIONS/0060_economic_indices_prod.sql" ]] || fail "migração de índices econômicos ausente."
[[ -f "$MIGRATIONS/0061_industry_consumption_store_prod.sql" ]] || fail "migração do read model industrial ausente."
[[ -x "$NODE_BIN/npx" ]] || fail "npx Node 22 não encontrado."
command -v sudo >/dev/null || fail "sudo indisponível."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro hotfix de Produção em execução."
sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"
sudo -n cp -a "$ROOT/server/costEvolutionAnalise.ts" "$BACKUP/"
sudo -n cp -a "$ROOT/server/industryCostEvolutionAnalise.ts" "$BACKUP/"
sudo -n cp -a "$ROOT/server/economicIndices.ts" "$BACKUP/"
sudo -n cp -a "$ROOT/server/industryConsumptionStore.ts" "$BACKUP/"
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."

# As migrações abaixo são DDL; ainda assim, a contagem do Recebimento é
# registrada e conferida para tornar a proteção observável.
before_receipts="$(sudo -n -u postgres psql -X -At -d portal_operacoes_prod -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
# DDL aditivo somente no banco operacional da Produção. Nenhuma linha é inserida.
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d portal_operacoes_prod -f "$MIGRATIONS/0060_economic_indices_prod.sql"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d portal_operacoes_prod -f "$MIGRATIONS/0061_industry_consumption_store_prod.sql"
after_migration_receipts="$(sudo -n -u postgres psql -X -At -d portal_operacoes_prod -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$after_migration_receipts" == "$before_receipts" ]] || fail "nf_receipts mudou durante o DDL: antes=$before_receipts depois=$after_migration_receipts"

sudo -n cp -a "$PACKAGE_DIR/server/costEvolutionAnalise.ts" "$ROOT/server/"
sudo -n cp -a "$PACKAGE_DIR/server/industryCostEvolutionAnalise.ts" "$ROOT/server/"
sudo -n cp -a "$PACKAGE_DIR/server/economicIndices.ts" "$ROOT/server/"
sudo -n cp -a "$PACKAGE_DIR/server/industryConsumptionStore.ts" "$ROOT/server/"

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
echo "NF_RECEIPTS=$after_migration_receipts"
echo "DADOS_COPIADOS=NAO"
echo "MIGRACOES=NAO"
echo "ROLLBACK=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT && systemctl restart $SERVICE"
