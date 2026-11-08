#!/usr/bin/env bash
set -euo pipefail

# Hotfix "Custos — cache de filtros" para PRODUÇÃO.
# Corrige o carregamento eterno ao voltar o foco nas telas de Custos:
# (1) cache em memória das listas de filtro (agregados levava ~5 s por foco);
# (2) cliente para de refazer as consultas ao foco;
# (3) invalidação do cache na importação/aprovação de custos.
# Copia fontes + dist pré-compilado e reinicia portal-operacoes-prod.
# NÃO altera banco, NÃO copia dados.

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.23.2/bin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/var/backups/portal-operacoes-prod}"
BACKUP="$BACKUP_ROOT/custos-cache-hotfix-$STAMP"
LOCK="/tmp/portal-operacoes-prod-custos-cache.lock"

fail() { echo "ERRO: $*" >&2; exit 1; }
[[ "${ALLOW_PRODUCTION_DEPLOY:-}" == "YES" ]] || fail "Produção bloqueada: use ALLOW_PRODUCTION_DEPLOY=YES."
[[ "$ROOT" == *production* && "$SERVICE" == *prod* && "$ENV_FILE" == *prod* ]] || fail "caminho, serviço ou ambiente não são de Produção."
[[ -f "$PKG_ROOT/server/costFilterCache.ts" ]] || fail "cache ausente."
[[ -f "$PKG_ROOT/server/costEvolutionAnalise.ts" ]] || fail "módulo de análise ausente."
[[ -f "$PKG_ROOT/server/routers/costEvolution.ts" ]] || fail "router ausente."
[[ -f "$PKG_ROOT/client/src/pages/CostEvolution.tsx" ]] || fail "tela ausente."
[[ -f "$PKG_ROOT/dist/index.js" && -f "$PKG_ROOT/dist/public/index.html" ]] || fail "dist pré-compilado ausente no pacote."
command -v sudo >/dev/null || fail "sudo indisponível."

exec 9>"$LOCK"
flock -n 9 || fail "já existe outro deploy de Produção em execução."

sudo -n mkdir -p "$BACKUP"
sudo -n chmod 700 "$BACKUP"
sudo -n bash -c "tar --exclude='./node_modules' -czf '$BACKUP/code-before.tar.gz' -C '$ROOT' ."

sudo -n cp -a "$PKG_ROOT/server/costFilterCache.ts" "$ROOT/server/costFilterCache.ts"
sudo -n cp -a "$PKG_ROOT/server/costEvolutionAnalise.ts" "$ROOT/server/costEvolutionAnalise.ts"
sudo -n cp -a "$PKG_ROOT/server/routers/costEvolution.ts" "$ROOT/server/routers/costEvolution.ts"
sudo -n cp -a "$PKG_ROOT/client/src/pages/CostEvolution.tsx" "$ROOT/client/src/pages/CostEvolution.tsx"
sudo -n cp -a "$PKG_ROOT/client/public/__manus__/version.json" "$ROOT/client/public/__manus__/version.json"
sudo -n rm -rf "$ROOT/dist"
sudo -n cp -a "$PKG_ROOT/dist" "$ROOT/dist"

sudo -n systemctl restart "$SERVICE"
for i in $(seq 1 12); do
  if sudo -n systemctl is-active --quiet "$SERVICE" && curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:3001/; then
    echo "PROD_HTTP=200"
    break
  fi
  [[ "$i" == 12 ]] && fail "serviço/HTTP não estabilizou."
  sleep 5
done

echo "PRODUCAO_CUSTOS_CACHE_HOTFIX_OK"
echo "BACKUP=$BACKUP"
echo "NF_RECEIPTS=$(sudo -n -u postgres psql -X -At -d portal_operacoes_prod -c 'SELECT count(*) FROM public.nf_receipts')"
echo "DADOS_COPIADOS=NAO"
echo "BANCO_ALTERADO=NAO"
echo "ROLLBACK=tar -xzf $BACKUP/code-before.tar.gz -C $ROOT && systemctl restart $SERVICE"
