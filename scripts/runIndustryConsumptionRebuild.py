#!/usr/bin/env python3
"""Executar com sudo -n python3; não grava nem imprime credenciais."""
from pathlib import Path
from urllib.parse import urlsplit
import os
import pwd
import subprocess
import sys

BASE = Path('/home/ubuntu/portal-operacoes-homolog')
SERVICE = 'portal-operacoes'
NODE = '/home/ubuntu/.nvm/versions/node/v22.23.2/bin/node'

def service_value(prop):
    return subprocess.check_output(['systemctl', 'show', SERVICE, '-p', prop, '--value'], text=True).strip()

if BASE.resolve() != BASE or service_value('WorkingDirectory') != str(BASE):
    sys.exit('ERRO: serviço fora da Homologação autorizada.')
pid = service_value('MainPID')
if not pid.isdigit() or pid == '0':
    sys.exit('ERRO: serviço de Homologação precisa estar ativo para obter seu ambiente.')
env = {}
for entry in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0'):
    key, sep, value = entry.partition(b'=')
    if sep:
        env[key.decode(errors='replace')] = value.decode(errors='replace')
portal = env.get('PORTAL_DATABASE_URL') or env.get('SUPABASE_DATABASE_URL', '')
business = env.get('BUSINESS_DATABASE_URL') or portal
if any(urlsplit(url).path.strip('/') != 'portal_operacoes' for url in (portal, business)):
    sys.exit('ERRO: banco efetivo fora da Homologação autorizada.')
env['NODE_OPTIONS'] = '--max-old-space-size=384'
env['PATH'] = str(Path(NODE).parent) + ':/usr/local/bin:/usr/bin:/bin'
runner = BASE / 'node_modules/tsx/dist/cli.mjs'
entry = BASE / 'scripts/rebuildIndustryConsumption.ts'
if not runner.is_file() or not entry.is_file():
    sys.exit('ERRO: dependências ou comando de reconstrução não encontrados.')
user = pwd.getpwnam('ubuntu')
if os.geteuid() == 0:
    os.initgroups(user.pw_name, user.pw_gid)
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)
os.nice(10)
result = subprocess.run([NODE, str(runner), str(entry)], cwd=BASE, env=env)
sys.exit(result.returncode)
