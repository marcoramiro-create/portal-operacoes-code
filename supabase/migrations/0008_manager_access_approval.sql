insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'approve'
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'usuarios-solicitacoes'
where profile.profile_key = 'manager'
on conflict do nothing;
