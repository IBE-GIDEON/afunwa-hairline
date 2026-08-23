-- Afunwa Hairline — allow the aggregated courier method.
-- Run after shipping-methods.sql. Safe to re-run.
--
-- "terminal" is Terminal Africa: one key that quotes DHL, FedEx, Aramex and
-- the local couriers together and charges the cheapest. Without this the
-- constraint from shipping-methods.sql rejects any order placed with it.

begin;

alter table public.orders
  drop constraint if exists orders_shipping_method_valid;

alter table public.orders
  add constraint orders_shipping_method_valid
  check (
    shipping_method in ('pickup', 'local', 'terminal', 'topship', 'gig', 'dhl')
  );

commit;
