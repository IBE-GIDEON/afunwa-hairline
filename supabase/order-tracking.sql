-- Afunwa Hairline — courier tracking on an order.
-- Safe to re-run.
--
-- Deliberately plain text rather than an integration. The seller books with
-- whoever they book with — Easyship, a DHL counter, a rider they know — and
-- puts the number on the order. That works from the first order, with every
-- courier, including the ones that have no API at all.

begin;

alter table public.orders
  add column if not exists tracking_number text;

-- Who is carrying it, as the seller writes it: "DHL", "GIG", "Easyship".
alter table public.orders
  add column if not exists tracking_carrier text;

-- Optional. A link the buyer can open, when the courier gives one.
alter table public.orders
  add column if not exists tracking_url text;

commit;
