#!/usr/bin/env bash
set -euo pipefail

# Inventário somente leitura. Não reinicia serviço, não grava banco e não altera arquivos.
cd /home/ubuntu/portal-operacoes-code

printf '%s\n' '=== SERVIÇOS ==='
sudo systemctl is-active portal-operacoes || true
sudo systemctl is-active portal-operacoes-prod || true

printf '%s\n' '=== PORTAS ==='
sudo ss -ltnp | grep -E ':3000|:3001' || true

printf '%s\n' '=== CÓDIGO E DIRETÓRIOS ==='
pwd
printf 'HEAD='; git rev-parse --short HEAD
printf 'MAIN='; git rev-parse --short origin/main 2>/dev/null || true
sudo systemctl cat portal-operacoes | grep -E 'WorkingDirectory|EnvironmentFile|ExecStart|Environment=' || true
sudo systemctl cat portal-operacoes-prod | grep -E 'WorkingDirectory|EnvironmentFile|ExecStart|Environment=' || true

printf '%s\n' '=== BANCOS CONFIGURADOS (SEM SENHAS) ==='
for env_file in /etc/portal-operacoes/portal.env /etc/portal-operacoes/portal-prod.env; do
  echo "--- $env_file ---"
  sudo awk -F= '/^(PORTAL_DATABASE_URL|BUSINESS_DATABASE_URL)=/ {v=$2; sub(/^[^:]+:\/\//,"",v); sub(/:[^@]*@/,":***@",v); sub(/\?.*$/,"",v); print $1 "=" v}' "$env_file" 2>/dev/null || true
done

printf '%s\n' '=== SCHEMA ABC ==='
for db in portal_operacoes portal_operacoes_prod; do
  echo "--- $db ---"
  sudo -u postgres psql -d "$db" -P pager=off -c "select current_database() as banco, to_regclass('public.sbz_product_curves') as curvas, to_regclass('public.products') as produtos;"
done

printf '%s\n' '=== CURVA ABC DO ITEM 294311 / FILIAIS 0303 ==='
sudo -u postgres psql -d portal_negocio_prod -P pager=off -c "select i.id as import_id, i.\"fileName\", i.status, i.\"importedAt\", a.branch, a.code, a.\"codeOriginal\", a.curve from public.\"inventoryAnalytics\" a join public.\"protheusImports\" i on i.id=a.\"importId\" where i.status='approved' and a.branch in ('0303','303') and (a.code ilike '%294311%' or a.\"codeOriginal\" ilike '%294311%') order by i.\"importedAt\" desc, a.code;"

printf '%s\n' '=== EVOLUÇÃO DO ITEM 294311 ==='
sudo -u postgres psql -d portal_negocio_prod -P pager=off -c "select filial, codigo, cod_agregado, descricao from public.cost_records where codigo ilike '%294311%' or cod_agregado ilike '%294311%' limit 50;" 2>/dev/null || echo 'cost_records não disponível com esse nome/estrutura.'

printf '%s\n' '=== FIM: nenhum dado foi alterado ==='
