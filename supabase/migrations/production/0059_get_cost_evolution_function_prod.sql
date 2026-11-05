-- 0059_get_cost_evolution_function_prod.sql
-- Produção: define a função legada usada pelo motor de Evolução de Custos.
-- Esta migração contém apenas código SQL; não copia nem altera dados operacionais.

CREATE OR REPLACE FUNCTION public.get_cost_evolution(
  p_periodo_inicio text DEFAULT NULL::text,
  p_periodo_fim text DEFAULT NULL::text,
  p_filial text DEFAULT NULL::text,
  p_cod_agregado text DEFAULT NULL::text,
  p_descricao text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
AS $function$
declare
  v_inicio text := coalesce(p_periodo_inicio, to_char(current_date - interval '6 months', 'YYYYMM'));
  v_fim    text := coalesce(p_periodo_fim, to_char(current_date, 'YYYYMM'));
  result   json;
begin
  select json_build_object(
    'periodos', (
      select coalesce(json_agg(p order by p.period), '[]'::json)
      from (
        select distinct period
        from public.cost_records
        where period between v_inicio and v_fim
      ) p
    ),
    'items', (
      select coalesce(json_agg(it order by it.codigo), '[]'::json)
      from (
        with meses_all as (
          select m.codigo, m.filial, m.period, m.custo_medio
          from public.cost_records m
          where m.period between v_inicio and v_fim
            and m.custo_medio is not null
        ),
        itens as (
          select cr.codigo,
                 cr.filial,
                 max(cr.descricao) as descricao,
                 max(cr.cod_agregado) as cod_agregado
          from public.cost_records cr
          where cr.period between v_inicio and v_fim
            and cr.custo_medio is not null
            and (p_filial is null or cr.filial = p_filial)
            and (p_cod_agregado is null or cr.cod_agregado = p_cod_agregado)
            and (p_descricao is null or cr.descricao ilike '%' || p_descricao || '%')
          group by cr.codigo, cr.filial
        )
        select i.codigo,
               i.filial,
               i.descricao,
               i.cod_agregado,
               coalesce(
                 json_agg(
                   json_build_object('period', m.period, 'custo_medio', m.custo_medio)
                   order by m.period
                 ),
                 '[]'::json
               ) as meses
        from itens i
        left join meses_all m on m.codigo = i.codigo and m.filial = i.filial
        group by i.codigo, i.filial, i.descricao, i.cod_agregado
      ) it
    )
  ) into result;
  return result;
end;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cost_evolution(text, text, text, text, text) TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_prod') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cost_evolution(text, text, text, text, text) TO portal_app_prod';
  END IF;
END $$;
