-- Afunwa Hairline — per-zone shipping rates. Safe to re-run.
--
-- {"UKI": {"base": 25000, "perKg": 20000}, "WAF": {...}}
--
-- jsonb rather than columns because the zones are a code-level list that will
-- grow, and nothing queries inside it.
begin;

alter table public.vendor_profiles
  add column if not exists shipping_zones jsonb not null default '{}'::jsonb;

commit;
