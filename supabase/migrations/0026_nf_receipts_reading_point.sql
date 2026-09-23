-- Recebimento corporativo — ponto de leitura (23/09/2026)
-- REGRA DE NEGÓCIO: ao usar a rotina Recebimento, o usuário indica DE ONDE está
-- fazendo a leitura (Descarga / Recebimento / Conferência / Envio ao fiscal).
-- O ponto é registrado em CADA leitura e nunca fica travado no usuário,
-- para suportar rotação de funcionários.
-- O controle de acesso já é feito pela rotina via nó "chaves-nf".

alter table public.nf_receipts
  add column if not exists reading_point text;

-- Históricos anteriores ao controle de pontos ficam marcados como 'recebimento'
-- (o comportamento antigo era uma leitura genérica da chave).
update public.nf_receipts
   set reading_point = 'recebimento'
 where reading_point is null;

alter table public.nf_receipts
  alter column reading_point set not null;

alter table public.nf_receipts
  drop constraint if exists nf_receipts_reading_point_check;

alter table public.nf_receipts
  add constraint nf_receipts_reading_point_check
    check (reading_point in ('descarga','recebimento','conferencia','envio_fiscal'));