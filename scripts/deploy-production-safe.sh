#!/usr/bin/env bash
set -euo pipefail

# Promoção controlada para Produção.
# Não copia dados da Homologação, não executa rebuild de fatos e não altera nf_receipts.
# Uso explícito:
#   ALLOW_PRODUCTION_DEPLOY=YES PROD_REF=<SHA> bash scripts/deploy-production-safe.sh

ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
DB="${PROD_DB:-portal_operacoes_prod}"
REF="${PROD_REF:-}"
REPO_URL="${REPO_URL:-https://github.com/marcoramiro-create/portal-operacoes-code.git}"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.23.2/bin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/var/backups/portal-operacoes-prod}"
BACKUP="$BACKUP_ROOT/$STAMP"
WORK="$(mktemp -d /tmp/portal-prod-deploy.XXXXXX)"
LOCK="/tmp/portal-operacoes-prod-deploy.lock"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

fail() { echo "ERRO: $*" >&2; exit 1; }

[[ "${ALLOW_PRODUCTION_DEPLOY:-}" == "YES" ]] || fail "Produção bloqueada: use ALLOW_PRODUCTION_DEPLOY=YES."
[[ -n "$REF" && "$REF" != "main" && "$REF" != "origin/main" ]] || fail "PROD_REF deve ser uma tag ou SHA imutável, nunca main."
[[ "$ROOT" == *production* && "$SERVICE" == *prod* && "$ENV_FILE" == *prod* ]] || fail "caminho, serviço ou ambiente não são de Produção."
[[ "$DB" == "portal_operacoes_prod" ]] || fail "este procedimento só aceita portal_operacoes_prod."
[[ -r "$ENV_FILE" ]] || fail "arquivo de ambiente ilegível: $ENV_FILE"
grep -Eq 'portal_operacoes_prod' "$ENV_FILE" || fail "portal_operacoes_prod não encontrado no ambiente."
grep -Eq 'portal_negocio_prod' "$ENV_FILE" || fail "portal_negocio_prod não encontrado no ambiente."
command -v sudo >/dev/null || fail "sudo indisponível."
command -v psql >/dev/null || fail "psql indisponível."
command -v rsync >/dev/null || fail "rsync indisponível."
[[ -x "$NODE_BIN/node" && -x "$NODE_BIN/npx" ]] || fail "Node 22/npx esperados não encontrados."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro deploy de Produção em execução."

sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"

# Snapshot somente para recuperação/checagem. Não é restaurado automaticamente.
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."
sudo -n cp -a "$ENV_FILE" "$BACKUP/portal-prod.env" 
sudo -n chmod 600 "$BACKUP/portal-prod.env"
sudo -n -u postgres pg_dump -Fc --schema-only -d "$DB" > "$BACKUP/database-schema-before.dump"
sudo -n -u postgres pg_dump -Fc -d "$DB" -t public.nf_receipts > "$BACKUP/nf-receipts-before.dump"

before_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
before_environment="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT value FROM public.portal_schema_info WHERE key='environment'")"
[[ "$before_environment" == "production" ]] || fail "portal_schema_info não confirma environment=production."

# Obtém exatamente a referência solicitada, sem usar main e sem alterar o diretório ativo.
REPO="$WORK/repo"
if [[ -d "$ROOT/.git" ]]; then
  git -C "$ROOT" fetch --quiet origin
  git -C "$ROOT" rev-parse "$REF^{commit}" >/dev/null
  GIT_DIR="$ROOT"
else
  git clone --quiet "$REPO_URL" "$REPO"
  git -C "$REPO" fetch --quiet origin
  git -C "$REPO" rev-parse "$REF^{commit}" >/dev/null
  GIT_DIR="$REPO"
fi
COMMIT="$(git -C "$GIT_DIR" rev-parse "$REF^{commit}")"

git -C "$GIT_DIR" archive "$COMMIT" | tar -x -C "$WORK"
STAGE="$WORK/stage"
mkdir -p "$STAGE"
git -C "$GIT_DIR" archive "$COMMIT" | tar -x -C "$STAGE"
ln -s "$ROOT/node_modules" "$STAGE/node_modules"

# As migrações são executadas separadamente do build e somente no banco produtivo.
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$STAGE/supabase/migrations/production/0057_purchase_sales_monthly_store_prod.sql"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$STAGE/supabase/migrations/production/0058_sb9_monthly_cost_store_prod.sql"

after_migration_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$after_migration_receipts" == "$before_receipts" ]] || fail "contagem de nf_receipts mudou durante as migrações: antes=$before_receipts depois=$after_migration_receipts"

cd "$STAGE"
export PATH="$NODE_BIN:$PATH"
export NODE_OPTIONS="--max-old-space-size=1400"
npx --no-install vite build
npx --no-install esbuild server/_core/index.ts \
  --platform=node --packages=external --bundle --format=esm \
  --outdir=dist --alias:@shared=./shared
test -f dist/public/index.html
test -f dist/index.js

# Troca somente o código/build. node_modules, ambiente e bancos ficam fora da operação.
sudo -n rsync -a --delete \
  --exclude=node_modules \
  --exclude=.git \
  "$STAGE/" "$ROOT/"
sudo -n chown -R ubuntu:ubuntu "$ROOT/dist" "$ROOT/client" "$ROOT/server" "$ROOT/shared" 2>/dev/null || true

if ! sudo -n systemctl restart "$SERVICE"; then
  echo "Falha ao reiniciar; o banco não será restaurado automaticamente." >&2
  exit 1
fi
sleep 15
sudo -n systemctl is-active --quiet "$SERVICE" || fail "serviço não ficou ativo."
curl -fsS --max-time 30 -o /dev/null -w 'PROD_HTTP=%{http_code}\n' http://127.0.0.1:3001/

final_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$final_receipts" == "$before_receipts" ]] || fail "contagem final de nf_receipts mudou: antes=$before_receipts depois=$final_receipts"

echo "PRODUCAO_OK"
echo "COMMIT=$COMMIT"
echo "BACKUP=$BACKUP"
echo "NF_RECEIPTS=$final_receipts"
echo "MIGRACOES=0057-prod,0058-prod"
echo "DADOS_COPIADOS=NAO"
echo "ROLLBACK_CODIGO=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT"
