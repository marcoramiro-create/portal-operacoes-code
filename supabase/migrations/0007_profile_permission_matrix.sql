delete from public.profile_node_permissions permission
using public.access_profiles profile
where permission.profile_id = profile.id
  and profile.profile_key in ('manager', 'operator', 'viewer');

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
cross join public.application_nodes node
where profile.profile_key in ('manager', 'viewer')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'manage'
from public.access_profiles profile
join public.application_nodes node on node.node_key in ('cadastros', 'funcionarios', 'fornecedores', 'produtos')
where profile.profile_key = 'manager'
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'approve'
from public.access_profiles profile
join public.application_nodes node on node.node_key in ('recebimentos', 'chaves-nf', 'consumo-entregas', 'consumiveis-epis-uniformes', 'ativos-manutencao', 'empilhadeiras', 'equipamentos-industria', 'ferramentas')
where profile.profile_key = 'manager'
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'compras-protheus'
where profile.profile_key = 'operator'
on conflict do nothing;
