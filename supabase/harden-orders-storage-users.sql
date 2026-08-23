-- Afunwa Hairline — security hardening. Run once in the Supabase SQL editor.
--
-- Three holes, each reachable with nothing but the anon key that ships inside
-- the browser bundle, plus one policy the seller needs in order to deliver.

begin;

-- ---------------------------------------------------------------------------
-- 1. Orders: a buyer could write their own order row, and pick the total AND
--    the payment status while doing it.
--
--    The policy checked buyer_id and nothing else, and payment_status is plain
--    text with no constraint. So a signed-in buyer could insert an order for a
--    155,000 naira wig with total_amount 1 and payment_status 'paid_to_vendor'
--    and it would appear in the seller's list as settled, with Dispatch
--    enabled — money that never moved.
--
--    Nothing in the app inserts an order from the browser. Every real checkout
--    goes through /api/orders, /api/orders/sync or /api/flutterwave/initialize,
--    all of which use the service role and bypass RLS. The policy was pure
--    attack surface.
-- ---------------------------------------------------------------------------
drop policy if exists "Buyers can create their own orders" on public.orders;
revoke insert on public.orders from authenticated, anon;

-- Even a bug in our own server code can no longer invent a payment state that
-- the interface would render as paid.
alter table public.orders
  drop constraint if exists orders_payment_status_valid;

alter table public.orders
  add constraint orders_payment_status_valid
  check (
    payment_status in (
      'awaiting_seller_confirmation',
      'pay_on_delivery',
      'awaiting_vendor_payment',
      'paid_to_vendor',
      'awaiting_card_payment',
      'paid_by_card'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Storage: the write policies checked only which bucket, never who owned
--    the file. Uploads use upsert, so any signed-in visitor could overwrite
--    the seller's product photographs by writing to the same path.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can upload store assets" on storage.objects;
drop policy if exists "Users can update store assets" on storage.objects;
-- And the ones this file itself creates, so running it twice is not an error.
drop policy if exists "Users can upload their own store assets" on storage.objects;
drop policy if exists "Users can update their own store assets" on storage.objects;

create policy "Users can upload their own store assets"
on storage.objects for insert
to authenticated
with check (bucket_id = 'store-assets' and owner = auth.uid());

create policy "Users can update their own store assets"
on storage.objects for update
to authenticated
using (bucket_id = 'store-assets' and owner = auth.uid())
with check (bucket_id = 'store-assets' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Users: the seller could not read the name or phone number of anyone who
--    ordered from them. The only select policy on public.users is "your own
--    row", and an order carries a delivery address but no contact details —
--    so this is what stands between an order arriving and being deliverable.
--
--    Written as a security definer function so the policy does not have to
--    read public.orders through that table's own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_buyer_of_current_seller(buyer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.vendor_profiles vp on vp.id = o.vendor_id
    where o.buyer_id = buyer
      and vp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_buyer_of_current_seller(uuid) from public, anon;
grant execute on function public.is_buyer_of_current_seller(uuid) to authenticated;

drop policy if exists "Sellers can view their buyers" on public.users;

create policy "Sellers can view their buyers"
on public.users for select
to authenticated
using (public.is_buyer_of_current_seller(id));

commit;
