#!/usr/bin/env bash
set -euo pipefail

# Instalador autocontido de Produção.
# O pacote contém release/ (commit aprovado) e migrations/production/.
# Não copia dados, não importa arquivos e não executa rebuild de read models.

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE="$PACKAGE_DIR/release"
MIGRATIONS="$PACKAGE_DIR/migrations/production"
ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
DB="${PROD_DB:-portal_operacoes_prod}"
BUSINESS_DB="${PROD_BUSINESS_DB:-portal_negocio_prod}"
EXPECTED_REF="${PROD_REF:-446faffec27416c51d4c44ee6b13238a56a22e38}"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.23.2/bin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/var/backups/portal-operacoes-prod}"
BACKUP="$BACKUP_ROOT/$STAMP"
WORK="$(mktemp -d /tmp/portal-prod-package.XXXXXX)"
LOCK="/tmp/portal-operacoes-prod-deploy.lock"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
fail() { echo "ERRO: $*" >&2; exit 1; }

[[ "${ALLOW_PRODUCTION_DEPLOY:-}" == "YES" ]] || fail "Produção bloqueada: use ALLOW_PRODUCTION_DEPLOY=YES."
[[ "$ROOT" == *production* && "$SERVICE" == *prod* && "$ENV_FILE" == *prod* ]] || fail "caminho, serviço ou ambiente não são de Produção."
[[ "$DB" == "portal_operacoes_prod" ]] || fail "este pacote só aceita portal_operacoes_prod."
[[ "$BUSINESS_DB" == "portal_negocio_prod" ]] || fail "este pacote só aceita portal_negocio_prod como banco de negócio."
[[ -r "$ENV_FILE" ]] || fail "arquivo de ambiente ilegível: $ENV_FILE"
grep -Eq 'portal_operacoes_prod' "$ENV_FILE" || fail "portal_operacoes_prod não encontrado no ambiente."
grep -Eq 'portal_negocio_prod' "$ENV_FILE" || fail "portal_negocio_prod não encontrado no ambiente."
[[ -d "$RELEASE" && -f "$RELEASE/package.json" ]] || fail "release do pacote incompleto: package.json ausente."
[[ -f "$MIGRATIONS/0057_purchase_sales_monthly_store_prod.sql" ]] || fail "migração produtiva 0057 ausente."
[[ -f "$MIGRATIONS/0058_sb9_monthly_cost_store_prod.sql" ]] || fail "migração produtiva 0058 ausente."
[[ -f "$MIGRATIONS/0059_get_cost_evolution_function_prod.sql" ]] || fail "migração produtiva 0059 ausente."
command -v sudo >/dev/null || fail "sudo indisponível."
command -v psql >/dev/null || fail "psql indisponível."
[[ -x "$NODE_BIN/node" && -x "$NODE_BIN/npx" ]] || fail "Node 22/npx esperados não encontrados."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro deploy de Produção em execução."

sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."
sudo -n cp -a "$ENV_FILE" "$BACKUP/portal-prod.env"
sudo -n chmod 600 "$BACKUP/portal-prod.env"
sudo -n -u postgres pg_dump -Fc --schema-only -d "$DB" > "$BACKUP/database-schema-before.dump"
sudo -n -u postgres pg_dump -Fc --schema-only -d "$BUSINESS_DB" > "$BACKUP/business-database-schema-before.dump"
sudo -n -u postgres pg_dump -Fc -d "$DB" -t public.nf_receipts > "$BACKUP/nf-receipts-before.dump"

before_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
environment="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT value FROM public.portal_schema_info WHERE key='environment'")"
[[ "$environment" == "production" ]] || fail "portal_schema_info não confirma environment=production."

# As migrações são DDL aditivo no único banco autorizado. Nenhuma carga/rebuild é chamado.
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS/0057_purchase_sales_monthly_store_prod.sql"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS/0058_sb9_monthly_cost_store_prod.sql"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$BUSINESS_DB" -f "$MIGRATIONS/0059_get_cost_evolution_function_prod.sql"

after_migration_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$after_migration_receipts" == "$before_receipts" ]] || fail "nf_receipts mudou durante as migrações: antes=$before_receipts depois=$after_migration_receipts"

mkdir -p "$WORK/release"
cp -a "$RELEASE/." "$WORK/release/"
rm -rf "$WORK/release/node_modules"
ln -s "$ROOT/node_modules" "$WORK/release/node_modules"
cd "$WORK/release"
export PATH="$NODE_BIN:$PATH"
export NODE_OPTIONS="--max-old-space-size=1400"
# Carregar o ambiente produtivo para o build e para qualquer configuração
# pública eventualmente disponível. O frontend aceita autenticação própria
# quando as variáveis legadas do Supabase não existem.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
npx --no-install vite build
npx --no-install esbuild server/_core/index.ts \
  --platform=node --packages=external --bundle --format=esm \
  --outdir=dist --alias:@shared=./shared
test -f dist/public/index.html
test -f dist/index.js

if command -v rsync >/dev/null 2>&1; then
  sudo -n rsync -a --delete \
    --exclude=node_modules \
    --exclude=.git \
    "$WORK/release/" "$ROOT/"
else
  # A VM de Produção não possui rsync. O backup completo já foi feito;
  # a cópia preserva node_modules e arquivos de ambiente fora do release.
  while IFS= read -r -d '' entry; do
    sudo -n cp -a "$entry" "$ROOT/"
  done < <(find "$WORK/release" -mindepth 1 -maxdepth 1 \
    ! -name node_modules ! -name .git -print0)
fi

sudo -n systemctl restart "$SERVICE"
sleep 15
sudo -n systemctl is-active --quiet "$SERVICE" || fail "serviço não ficou ativo."
curl -fsS --max-time 30 -o /dev/null -w 'PROD_HTTP=%{http_code}\n' http://127.0.0.1:3001/

final_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$final_receipts" == "$before_receipts" ]] || fail "nf_receipts mudou após o deploy: antes=$before_receipts depois=$final_receipts"

business_function="$(sudo -n -u postgres psql -X -At -d "$BUSINESS_DB" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_cost_evolution' AND pg_get_function_identity_arguments(p.oid)='p_periodo_inicio text, p_periodo_fim text, p_filial text, p_cod_agregado text, p_descricao text'")"
[[ "$business_function" == "1" ]] || fail "get_cost_evolution não foi confirmada no banco de negócio."

echo "PRODUCAO_OK"
echo "REF=$EXPECTED_REF"
echo "BACKUP=$BACKUP"
echo "NF_RECEIPTS=$final_receipts"
echo "MIGRACOES=0057-prod,0058-prod,0059-prod-negocio"
echo "DADOS_COPIADOS=NAO"
echo "REBUILD_EXECUTADO=NAO"
echo "ROLLBACK_CODIGO=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT"
