insert into public.application_nodes (node_key, label, parent_id, sort_order)
select child.node_key, child.label, parent.id, child.sort_order
from (
  values
    ('almoxarifado-requisicoes', 'Requisições', 10),
    ('almoxarifado-atendimentos', 'Atendimentos', 20),
    ('almoxarifado-movimentacoes', 'Entradas, transferências e inventário', 30),
    ('almoxarifado-estoque', 'Posição de estoque', 40),
    ('almoxarifado-cadastros', 'Cadastros de estoque', 50)
) as child(node_key, label, sort_order)
join public.application_nodes parent on parent.node_key = 'almoxarifado'
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now();

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
cross join public.application_nodes node
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
  and node.node_key in ('almoxarifado', 'almoxarifado-requisicoes', 'almoxarifado-atendimentos', 'almoxarifado-movimentacoes', 'almoxarifado-estoque', 'almoxarifado-cadastros')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
cross join public.application_nodes node
where profile.profile_key in ('manager', 'viewer')
  and node.node_key in ('almoxarifado', 'almoxarifado-requisicoes', 'almoxarifado-atendimentos', 'almoxarifado-movimentacoes', 'almoxarifado-estoque', 'almoxarifado-cadastros')
on conflict do nothing;
