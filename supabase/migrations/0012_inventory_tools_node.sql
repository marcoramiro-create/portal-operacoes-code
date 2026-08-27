insert into public.application_nodes (node_key, label, parent_id, sort_order)
select 'almoxarifado-ferramentas', 'Ferramentas e responsabilidades', parent.id, 60
from public.application_nodes parent
where parent.node_key = 'almoxarifado'
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now();

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'almoxarifado-ferramentas'
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'almoxarifado-ferramentas'
where profile.profile_key in ('manager', 'viewer')
on conflict do nothing;
