-- Delivery options inside Nigeria, set by the admin at /admin/delivery.
--
-- The buyer picks one of these at checkout. "pickup" is collect-from-the-store
-- and its detail is the store address. Run once in the Supabase SQL editor,
-- after delivery-prices.sql. Only the server reads and writes these tables.

create table if not exists public.delivery_options (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  label text not null,
  detail text not null default '',
  fee_ngn numeric(12, 2) not null default 0 check (fee_ngn >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.delivery_options enable row level security;

insert into public.delivery_options (id, label, detail, fee_ngn, active, sort_order) values
  ('pickup', 'Pickup', '50 Addo Road Delegacy Plaza Ajah, Lagos.', 0, true, 1),
  ('lagos_mainland', 'Lagos Mainland', '', 7000, true, 2),
  ('lagos_island', 'Lagos Island', '', 5000, true, 3),
  ('outside_lagos_pickup_park', 'Outside Lagos (Pickup Park)', '', 8000, true, 4),
  ('outside_lagos_home', 'Outside Lagos (Home Delivery)', '', 13000, true, 5)
on conflict (id) do nothing;

-- The option the buyer chose, shown to the seller on the order.
alter table public.orders
  add column if not exists delivery_option_label text;
