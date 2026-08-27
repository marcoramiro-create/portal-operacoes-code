update public.application_nodes child
set node_key = 'cadastros-estrutura-estoque',
    label = 'Estrutura organizacional e estoque',
    parent_id = parent.id,
    sort_order = 50,
    updated_at = now()
from public.application_nodes parent
where child.node_key = 'almoxarifado-cadastros'
  and parent.node_key = 'cadastros'
  and not exists (
    select 1 from public.application_nodes existing
    where existing.node_key = 'cadastros-estrutura-estoque'
  );
