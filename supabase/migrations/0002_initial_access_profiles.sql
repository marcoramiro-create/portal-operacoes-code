insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
cross join public.application_nodes node
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'compras-protheus'
where profile.profile_key = 'operator'
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
cross join public.application_nodes node
where profile.profile_key = 'viewer'
on conflict do nothing;
