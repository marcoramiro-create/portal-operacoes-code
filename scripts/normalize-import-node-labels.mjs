import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`update public.application_nodes set label = case node_key
    when 'importacoes-compras-protheus' then 'Importar · Compras e análise Protheus'
    when 'importacoes-empresas' then 'Importar · Empresas'
    when 'importacoes-filiais' then 'Importar · Filiais'
    when 'importacoes-armazens' then 'Importar · Armazéns'
    when 'importacoes-locais-estoque' then 'Importar · Locais de estoque'
    when 'importacoes-unidades' then 'Importar · Unidades'
    when 'importacoes-centros-custo' then 'Importar · Centros de custo'
    when 'importacoes-tipos-produto' then 'Importar · Tipos de produto'
    when 'importacoes-usuarios' then 'Importar · Usuários'
    when 'importacoes-funcionarios' then 'Importar · Funcionários'
    when 'importacoes-fornecedores' then 'Importar · Fornecedores'
    when 'importacoes-produtos' then 'Importar · Produtos'
    when 'importacoes-ativos-empilhadeiras' then 'Importar · Empilhadeiras'
    when 'importacoes-ativos-equipamentos-industria' then 'Importar · Equipamentos da indústria'
    when 'importacoes-ativos-ferramentas' then 'Importar · Ferramentas'
    else label end
    where node_key like 'importacoes-%' and node_key <> 'importacoes'`);
  console.log('labels-normalized');
} finally { await client.end(); }
