-- Afunwa Hairline — shipping methods and their rates.
-- Run after delivery-and-saved-address.sql. Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Legacy per-courier fallback prices.
--
--    jsonb keyed by method id — {"easyship": 25000}
--    — so adding a courier later is a code change and not a migration.
--
--    Local shipping is not in here: it stays vendor_profiles.delivery_fee,
--    which is the one price that covers the whole of Nigeria. Pickup is never
--    in here either, being always free.
-- ---------------------------------------------------------------------------
alter table public.vendor_profiles
  add column if not exists shipping_rates jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Which method the buyer actually chose.
--
--    Recorded on the order so the seller knows whether to expect them at the
--    shop, to send a rider, or to book a courier. delivery_fee alongside it
--    already records what that choice cost.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_method text not null default 'local';

alter table public.orders
  drop constraint if exists orders_shipping_method_valid;
alter table public.orders
  add constraint orders_shipping_method_valid
  check (shipping_method in ('pickup', 'local', 'easyship', 'terminal', 'topship', 'gig', 'dhl'));

commit;
