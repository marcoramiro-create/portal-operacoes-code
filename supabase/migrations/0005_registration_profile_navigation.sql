insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
join public.application_nodes node on node.node_key in ('funcionarios', 'fornecedores', 'produtos')
join (values
  ('operations-admin', 'view'), ('operations-admin', 'manage'),
  ('manager', 'view'), ('manager', 'manage'),
  ('operator', 'view'),
  ('viewer', 'view')
) as permission(profile_key, permission) on permission.profile_key = profile.profile_key
on conflict do nothing;
