#!/usr/bin/env bash
set -euo pipefail

# Deploy exclusivo da Homologação.
# Nunca reutiliza o diretório da Produção e recusa bancos *_prod.
ROOT="${HOMOLOG_ROOT:-/home/ubuntu/portal-operacoes-homolog}"
SERVICE="${HOMOLOG_SERVICE:-portal-operacoes}"
ENV_FILE="${HOMOLOG_ENV_FILE:-/etc/portal-operacoes/portal.env}"
REF="${HOMOLOG_REF:-origin/main}"

if [[ "$ROOT" == *"prod"* || "$ENV_FILE" == *"prod"* || "$SERVICE" == *"prod"* ]]; then
  echo "ERRO: parâmetros de Homologação apontam para Produção." >&2
  exit 20
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: arquivo de ambiente ausente: $ENV_FILE" >&2
  exit 21
fi
if grep -Eq 'portal_(operacoes|negocio)_prod|portal-prod|PORT=3001' "$ENV_FILE"; then
  echo "ERRO: ambiente de Homologação contém configuração de Produção." >&2
  exit 22
fi

mkdir -p "$(dirname "$ROOT")"
if [[ ! -d "$ROOT/.git" ]]; then
  git clone "${REPO_URL:-https://github.com/marcoramiro-create/portal-operacoes-code.git}" "$ROOT"
fi
cd "$ROOT"
git fetch origin
# Homologação pode acompanhar a linha de desenvolvimento, mas nunca o diretório produtivo.
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
curl -fsS --max-time 30 -o /dev/null -w 'HOMOLOG_HTTP=%{http_code}\n' http://127.0.0.1:3000/
echo "HOMOLOGACAO_OK ref=$(git rev-parse --short HEAD) root=$ROOT"
