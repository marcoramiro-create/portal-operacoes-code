#!/usr/bin/env bash
set -euo pipefail

# Deploy exclusivo da Produção.
# Requer autorização explícita e uma referência imutável diferente de main.
ROOT="${PROD_ROOT:-/home/ubuntu/portal-operacoes-production}"
SERVICE="${PROD_SERVICE:-portal-operacoes-prod}"
ENV_FILE="${PROD_ENV_FILE:-/etc/portal-operacoes/portal-prod.env}"
REF="${PROD_REF:-}"

if [[ "${ALLOW_PRODUCTION_DEPLOY:-}" != "YES" ]]; then
  echo "PRODUÇÃO BLOQUEADA: defina ALLOW_PRODUCTION_DEPLOY=YES somente após homologação aprovada." >&2
  exit 30
fi
if [[ -z "$REF" || "$REF" == "main" || "$REF" == "origin/main" ]]; then
  echo "ERRO: Produção exige PROD_REF imutável (tag ou SHA), nunca main." >&2
  exit 31
fi
if [[ "$ROOT" != *"production"* || "$SERVICE" != *"prod"* || "$ENV_FILE" != *"prod"* ]]; then
  echo "ERRO: caminho/serviço/ambiente de Produção não conferem." >&2
  exit 32
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: arquivo de ambiente ausente: $ENV_FILE" >&2
  exit 33
fi
if ! grep -Eq 'portal_operacoes_prod' "$ENV_FILE" || ! grep -Eq 'portal_negocio_prod' "$ENV_FILE"; then
  echo "ERRO: Produção não aponta simultaneamente para os bancos *_prod esperados." >&2
  exit 34
fi

mkdir -p "$(dirname "$ROOT")"
if [[ ! -d "$ROOT/.git" ]]; then
  git clone "${REPO_URL:-https://github.com/marcoramiro-create/portal-operacoes-code.git}" "$ROOT"
fi
cd "$ROOT"
git fetch origin
git reset --hard "$REF"

export PATH="/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=1400"
npx --no-install vite build
npx --no-install esbuild server/_core/index.ts \
  --platform=node --packages=external --bundle --format=esm \
  --outdir=dist --alias:@shared=./shared

test -f dist/public/index.html
test -f dist/index.js
sudo systemctl restart "$SERVICE"
sleep 15
sudo systemctl is-active "$SERVICE"
curl -fsS --max-time 30 -o /dev/null -w 'PROD_HTTP=%{http_code}\n' http://127.0.0.1:3001/
echo "PRODUCAO_OK ref=$(git rev-parse --short HEAD) root=$ROOT"
