-- Delivery price per country, set by the admin at /admin/delivery.
--
-- A country with a row is charged that fee at checkout. A country with no row
-- is "to be confirmed": the buyer is told the cost after ordering.
--
-- Run once in the Supabase SQL editor. Only the server reads and writes this
-- table (with the service role), so row level security is on with no policies.

create table if not exists public.delivery_prices (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  fee_ngn numeric(12, 2) not null check (fee_ngn >= 0),
  updated_at timestamptz not null default now()
);

alter table public.delivery_prices enable row level security;
