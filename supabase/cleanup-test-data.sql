-- Clean out test data before launch.
--
-- Run in Supabase > SQL Editor, ONE STEP AT A TIME (select a step, then Run).
-- This cannot be undone.
--
-- Keeps:   your store, your products, the photos they use, everyone's
--          accounts, and the delivery prices and options.
-- Removes: every order (and each order's review), and resets the store's
--          sales count and rating to zero.


-- STEP 1. Look first. Changes nothing.
select
  (select count(*) from public.orders) as orders,
  (select count(*) from public.reviews) as reviews,
  (select count(*) from public.products) as products,
  (select count(*) from storage.objects where bucket_id = 'store-assets') as stored_files;


-- STEP 2. Delete every order. Their reviews are removed with them, and the
-- rating trigger then resets each store's rating to 0.
begin;
delete from public.orders;
update public.vendor_profiles set total_sales = 0;
commit;


-- STEP 3. List photos that no product, store or profile uses. Changes nothing.
-- Supabase does not allow deleting stored files with SQL, so delete these in
-- Storage > store-assets (tick the files with these names, then Delete).
with used_urls as (
  select jsonb_array_elements_text(photo_urls) as url
  from public.products
  where jsonb_typeof(photo_urls) = 'array'
  union
  select photo_url from public.products where photo_url is not null
  union
  select store_photo_url from public.vendor_profiles where store_photo_url is not null
  union
  select profile_photo_url from public.users where profile_photo_url is not null
),
used_paths as (
  select split_part(url, '/store-assets/', 2) as path
  from used_urls
  where url like '%/store-assets/%'
)
select
  o.name as file,
  o.created_at as uploaded,
  pg_size_pretty(coalesce((o.metadata ->> 'size')::bigint, 0)) as size
from storage.objects o
where o.bucket_id = 'store-assets'
  and o.name not in (select path from used_paths where path <> '')
order by o.created_at;


-- STEP 4 (optional, only if you want an EMPTY shop). Deletes every product.
-- Leave this commented out unless you mean it.
-- delete from public.products;
