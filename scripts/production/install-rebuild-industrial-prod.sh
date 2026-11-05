#!/usr/bin/env bash
set -euo pipefail

# Instalador do pacote "Rebuild Industrial Produção".
# Aplica DDL aditivo (0060/0061), atualiza fontes do server/ e client/,
# copia o dist/ pré-compilado do pacote e reinicia o serviço portal-operacoes-prod.
# NÃO copia dados, NÃO roda o rebuild (ele é passo separado, controlado),
# NÃO altera nf_receipts (contagem conferida antes/depois).

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Layout de repositório: o instalador vive em scripts/production/ e o pacote
# é a raiz do repositório (server/, client/, migrations/, scripts/, dist/).
PKG_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
MIGRATIONS="$PKG_ROOT/migrations/production"
ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
DB="${PROD_DB:-portal_operacoes_prod}"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.23.2/bin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/var/backups/portal-operacoes-prod}"
BACKUP="$BACKUP_ROOT/rebuild-industrial-$STAMP"
LOCK="/tmp/portal-operacoes-prod-rebuild-industrial.lock"

fail() { echo "ERRO: $*" >&2; exit 1; }
[[ "${ALLOW_PRODUCTION_DEPLOY:-}" == "YES" ]] || fail "Produção bloqueada: use ALLOW_PRODUCTION_DEPLOY=YES."
[[ "$ROOT" == *production* && "$SERVICE" == *prod* && "$ENV_FILE" == *prod* ]] || fail "caminho, serviço ou ambiente não são de Produção."
[[ "$DB" == "portal_operacoes_prod" ]] || fail "este pacote só aceita portal_operacoes_prod."
[[ -r "$ENV_FILE" ]] || fail "arquivo de ambiente ilegível: $ENV_FILE"
grep -Eq 'portal_operacoes_prod' "$ENV_FILE" || fail "portal_operacoes_prod não encontrado no ambiente."
[[ -f "$PKG_ROOT/server/industryConsumptionStore.ts" ]] || fail "fonte do store ausente."
[[ -f "$MIGRATIONS/0060_economic_indices_prod.sql" ]] || fail "migração 0060 ausente."
[[ -f "$MIGRATIONS/0061_industry_consumption_store_prod.sql" ]] || fail "migração 0061 ausente."
[[ -f "$PACKAGE_DIR/rebuildIndustryConsumptionProd.ts" ]] || fail "runner do rebuild ausente."
[[ -f "$PACKAGE_DIR/runIndustryConsumptionRebuildProd.py" ]] || fail "wrapper do rebuild ausente."
[[ -x "$NODE_BIN/node" && -x "$NODE_BIN/npx" ]] || fail "Node 22/npx esperados não encontrados."
command -v sudo >/dev/null || fail "sudo indisponível."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro deploy de Produção em execução."

sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"
sudo -n cp -a "$ROOT/server/industryConsumptionStore.ts" "$BACKUP/" 2>/dev/null || true
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."

# DDL aditivo idempotente, somente no banco operacional da Produção.
before_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS/0060_economic_indices_prod.sql"
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$MIGRATIONS/0061_industry_consumption_store_prod.sql"
after_migration_receipts="$(sudo -n -u postgres psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.nf_receipts')"
[[ "$after_migration_receipts" == "$before_receipts" ]] || fail "nf_receipts mudou durante o DDL: antes=$before_receipts depois=$after_migration_receipts"

# Fontes atualizadas: store industrial (com fallback 42P01), os 3 módulos
# que o hotfix do Manus já atualizava (mantém a Produção coerente com main)
# e o client (refetch de Custos + Supabase opcional).
sudo -n cp -a "$PKG_ROOT/server/industryConsumptionStore.ts" "$ROOT/server/"
sudo -n cp -a "$PKG_ROOT/server/costEvolutionAnalise.ts" "$ROOT/server/"
sudo -n cp -a "$PKG_ROOT/server/industryCostEvolutionAnalise.ts" "$ROOT/server/"
sudo -n cp -a "$PKG_ROOT/server/economicIndices.ts" "$ROOT/server/"
sudo -n cp -a "$PKG_ROOT/client/public/__manus__/version.json" "$ROOT/client/public/__manus__/version.json"
sudo -n cp -a "$PKG_ROOT/client/src/main.tsx" "$ROOT/client/src/main.tsx"
sudo -n cp -a "$PKG_ROOT/client/src/lib/supabase.ts" "$ROOT/client/src/lib/supabase.ts"
sudo -n cp -a "$PKG_ROOT/client/src/contexts/SupabaseAuthContext.tsx" "$ROOT/client/src/contexts/SupabaseAuthContext.tsx"
sudo -n cp -a "$PKG_ROOT/client/src/components/OneDriveImportSource.tsx" "$ROOT/client/src/components/OneDriveImportSource.tsx"
sudo -n cp -a "$PKG_ROOT/client/src/components/DashboardLayout.tsx" "$ROOT/client/src/components/DashboardLayout.tsx"
sudo -n cp -a "$PKG_ROOT/client/src/pages/CostEvolution.tsx" "$ROOT/client/src/pages/CostEvolution.tsx"
sudo -n cp -a "$PKG_ROOT/client/src/pages/PortalAccess.tsx" "$ROOT/client/src/pages/PortalAccess.tsx"
sudo -n mkdir -p "$ROOT/scripts/production"
sudo -n cp -a "$PACKAGE_DIR/rebuildIndustryConsumptionProd.ts" "$ROOT/scripts/production/"
sudo -n cp -a "$PACKAGE_DIR/runIndustryConsumptionRebuildProd.py" "$ROOT/scripts/production/"
sudo -n chmod 644 "$ROOT/scripts/production/rebuildIndustryConsumptionProd.ts"

# Frontend/backend: usa o dist/ pré-compilado do pacote. A VM tem 1 GB de RAM
# e compilar nela aborta (core dump); compilar é exceção, não regra.
if [[ -f "$PKG_ROOT/dist/index.js" && -f "$PKG_ROOT/dist/public/index.html" ]]; then
  sudo -n rm -rf "$ROOT/dist"
  sudo -n cp -a "$PKG_ROOT/dist" "$ROOT/dist"
else
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
fi

sudo -n systemctl restart "$SERVICE"
for i in $(seq 1 12); do
  if sudo -n systemctl is-active --quiet "$SERVICE" && curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:3001/; then
    echo "PROD_HTTP=200"
    break
  fi
  [[ "$i" == 12 ]] && fail "serviço/HTTP não estabilizou."
  sleep 5
done

echo "PRODUCAO_REBUILD_INDUSTRIAL_INSTALADOR_OK"
echo "BACKUP=$BACKUP"
echo "NF_RECEIPTS=$after_migration_receipts"
echo "DADOS_COPIADOS=NAO"
echo "ROLLBACK=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT && systemctl restart $SERVICE"
echo "PROXIMO_PASSO=sudo -n python3 scripts/production/runIndustryConsumptionRebuildProd.py"
