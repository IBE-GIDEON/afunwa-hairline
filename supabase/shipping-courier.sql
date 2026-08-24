-- Afunwa Hairline — allow the manual courier delivery method.
-- Run after shipping-methods.sql. Safe to re-run.
--
-- "courier" is the production courier option shown to buyers. "easyship" and
-- "terminal" stay in the constraint only so older orders remain valid.

begin;

alter table public.orders
  drop constraint if exists orders_shipping_method_valid;

alter table public.orders
  add constraint orders_shipping_method_valid
  check (
    shipping_method in ('pickup', 'local', 'courier', 'easyship', 'terminal', 'topship', 'gig', 'dhl')
  );

commit;
