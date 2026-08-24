-- Afunwa Hairline — allow the Easyship courier method.
-- Run after shipping-methods.sql. Safe to re-run.
--
-- "easyship" is the only courier option shown to buyers. "terminal" stays in
-- the constraint only so older orders are still valid if they already exist.

begin;

alter table public.orders
  drop constraint if exists orders_shipping_method_valid;

alter table public.orders
  add constraint orders_shipping_method_valid
  check (
    shipping_method in ('pickup', 'local', 'easyship', 'terminal', 'topship', 'gig', 'dhl')
  );

commit;
