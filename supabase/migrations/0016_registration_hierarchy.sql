insert into public.application_nodes (node_key, label, parent_id, sort_order, active)
select child.node_key, child.label, parent.id, child.sort_order, true
from (
  values
    ('cadastros-empresas', 'Empresas', 10),
    ('cadastros-filiais', 'Filiais', 20),
    ('cadastros-armazens', 'Armazéns', 30),
    ('cadastros-locais-estoque', 'Locais de estoque', 40),
    ('cadastros-unidades', 'Unidades', 50),
    ('cadastros-centros-custo', 'Centros de custo', 60),
    ('cadastros-tipos-produto', 'Tipos de produto', 70),
    ('cadastros-usuarios', 'Usuários', 80)
) as child(node_key, label, sort_order)
join public.application_nodes parent on parent.node_key = 'cadastros'
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, active = true, updated_at = now();

update public.application_nodes
set active = false, updated_at = now()
where node_key in ('almoxarifado-cadastros', 'cadastros-estrutura-estoque');

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
cross join public.application_nodes node
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
  and node.node_key in ('cadastros-empresas', 'cadastros-filiais', 'cadastros-armazens', 'cadastros-locais-estoque', 'cadastros-unidades', 'cadastros-centros-custo', 'cadastros-tipos-produto', 'cadastros-usuarios')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
cross join public.application_nodes node
cross join (values ('view'::text), ('manage'::text)) as permission(permission)
where profile.profile_key = 'manager'
  and node.node_key in ('cadastros-empresas', 'cadastros-filiais', 'cadastros-armazens', 'cadastros-locais-estoque', 'cadastros-unidades', 'cadastros-centros-custo', 'cadastros-tipos-produto')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
cross join public.application_nodes node
where profile.profile_key in ('manager', 'viewer')
  and node.node_key in ('cadastros-empresas', 'cadastros-filiais', 'cadastros-armazens', 'cadastros-locais-estoque', 'cadastros-unidades', 'cadastros-centros-custo', 'cadastros-tipos-produto', 'cadastros-usuarios')
on conflict do nothing;
