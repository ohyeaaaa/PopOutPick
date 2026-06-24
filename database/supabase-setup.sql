-- PopOutPick Supabase setup
-- Run this in the Supabase SQL editor, then add your admin user's UUID to admin_users.

create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table if not exists public.orders (
    id text primary key,
    created_at timestamptz not null default now(),
    customer_name text not null,
    customer_email text not null,
    customer_phone text not null,
    customer_telegram text,
    fulfilment text not null check (fulfilment in ('meetup', 'delivery')),
    meetup jsonb,
    delivery jsonb,
    items jsonb not null default '[]'::jsonb,
    totals jsonb not null default '{}'::jsonb,
    payment jsonb not null default '{}'::jsonb,
    status text not null default 'new'
);

alter table public.orders
add column if not exists customer_telegram text;

create table if not exists public.order_files (
    id bigint generated always as identity primary key,
    order_id text not null references public.orders(id) on delete cascade,
    item_id text,
    part_key text,
    file_role text not null check (file_role in ('design_upload', 'payment_proof')),
    bucket text not null,
    storage_path text not null,
    original_name text,
    content_type text,
    size_bytes bigint,
    created_at timestamptz not null default now()
);

create table if not exists public.checkout_promo_codes (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    label text not null,
    discount_type text not null check (discount_type in ('percent', 'fixed')),
    discount_value numeric(10, 2) not null check (discount_value >= 0),
    active boolean not null default true,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.checkout_time_slots (
    id bigint generated always as identity primary key,
    location_id text not null,
    day_of_week integer not null check (day_of_week between 0 and 6),
    time_label text not null,
    active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (location_id, day_of_week, time_label)
);

create table if not exists public.checkout_blocked_dates (
    id bigint generated always as identity primary key,
    location_id text,
    blocked_date date not null,
    reason text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (location_id, blocked_date)
);

create table if not exists public.homepage_text (
    key text primary key,
    label text not null,
    value text not null,
    multiline boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.checkout_promo_codes enable row level security;
alter table public.checkout_time_slots enable row level security;
alter table public.checkout_blocked_dates enable row level security;
alter table public.homepage_text enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.admin_users
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Public cannot create orders directly" on public.orders;
create policy "Public cannot create orders directly"
on public.orders
for insert
to anon, authenticated
with check (false);

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders"
on public.orders
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
on public.orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can create order files" on public.order_files;
drop policy if exists "Public cannot create order file rows directly" on public.order_files;
create policy "Public cannot create order file rows directly"
on public.order_files
for insert
to anon, authenticated
with check (false);

drop policy if exists "Admins can read order files" on public.order_files;
create policy "Admins can read order files"
on public.order_files
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read promo codes" on public.checkout_promo_codes;
create policy "Admins can read promo codes"
on public.checkout_promo_codes
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert promo codes" on public.checkout_promo_codes;
create policy "Admins can insert promo codes"
on public.checkout_promo_codes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update promo codes" on public.checkout_promo_codes;
create policy "Admins can update promo codes"
on public.checkout_promo_codes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete promo codes" on public.checkout_promo_codes;
create policy "Admins can delete promo codes"
on public.checkout_promo_codes
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage time slots" on public.checkout_time_slots;
create policy "Admins can manage time slots"
on public.checkout_time_slots
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage blocked dates" on public.checkout_blocked_dates;
create policy "Admins can manage blocked dates"
on public.checkout_blocked_dates
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage homepage text" on public.homepage_text;
create policy "Admins can manage homepage text"
on public.homepage_text
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_active_promo_code(p_code text)
returns table (
    code text,
    label text,
    discount_type text,
    discount_value numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select
        checkout_promo_codes.code,
        checkout_promo_codes.label,
        checkout_promo_codes.discount_type,
        checkout_promo_codes.discount_value
    from public.checkout_promo_codes
    where upper(trim(checkout_promo_codes.code)) = upper(trim(p_code))
      and checkout_promo_codes.active = true
      and (checkout_promo_codes.starts_at is null or checkout_promo_codes.starts_at <= now())
      and (checkout_promo_codes.ends_at is null or checkout_promo_codes.ends_at >= now())
    limit 1;
$$;

revoke all on function public.get_active_promo_code(text) from public;
grant execute on function public.get_active_promo_code(text) to anon, authenticated;

create or replace function public.get_checkout_availability()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select jsonb_build_object(
        'timeSlots',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'location_id', location_id,
                'day_of_week', day_of_week,
                'time_label', time_label,
                'sort_order', sort_order
            ) order by location_id, day_of_week, sort_order)
            from public.checkout_time_slots
            where active = true
        ), '[]'::jsonb),
        'blockedDates',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'location_id', location_id,
                'blocked_date', blocked_date
            ) order by blocked_date)
            from public.checkout_blocked_dates
            where active = true
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.get_checkout_availability() from public;
grant execute on function public.get_checkout_availability() to anon, authenticated;

create or replace function public.get_homepage_text()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        jsonb_object_agg(homepage_text.key, homepage_text.value order by homepage_text.sort_order),
        '{}'::jsonb
    )
    from public.homepage_text;
$$;

revoke all on function public.get_homepage_text() from public;
grant execute on function public.get_homepage_text() to anon, authenticated;

create or replace function public.list_order_files_for_admin(p_order_id text)
returns table (
    id bigint,
    order_id text,
    item_id text,
    part_key text,
    file_role text,
    bucket text,
    storage_path text,
    original_name text,
    content_type text,
    size_bytes bigint,
    created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select
        order_files.id,
        order_files.order_id,
        order_files.item_id,
        order_files.part_key,
        order_files.file_role,
        order_files.bucket,
        order_files.storage_path,
        order_files.original_name,
        order_files.content_type,
        order_files.size_bytes,
        order_files.created_at
    from public.order_files
    where order_files.order_id = p_order_id
      and public.is_admin();
$$;

revoke all on function public.list_order_files_for_admin(text) from public;
grant execute on function public.list_order_files_for_admin(text) to authenticated;

drop policy if exists "Public can read active time slots" on public.checkout_time_slots;
drop policy if exists "Public can read active blocked dates" on public.checkout_blocked_dates;

insert into public.checkout_promo_codes (code, label, discount_type, discount_value, active)
values ('POP10', '10% off', 'percent', 10, true)
on conflict (code) do nothing;

insert into public.homepage_text (key, label, value, multiline, sort_order)
values
    ('document_title', 'Browser tab title', 'PopoutPicks Setup - Final Build + Socials', false, 10),
    ('site_brand_name', 'Header brand name', 'PopOutPick', false, 20),
    ('hero_card_title', 'Main card title', 'PopOutPick', false, 100),
    ('hero_card_tagline', 'Main card tagline', 'A better way to store your picks', false, 110),
    ('hero_intro', 'Main intro paragraph', 'Welcome to the PopOutPick configurator! Here you can explore our modular guitar pick holder system, designed for musicians who crave customization and style. Each component is 3D printable and crafted to fit together seamlessly, allowing you to create a personalized pick holder that suits your playing style and aesthetic preferences.', true, 120),
    ('scroll_card_title', 'Scroll animation title', 'Scroll Animation', false, 200),
    ('scroll_card_subtitle', 'Scroll animation subtitle', 'Scroll to rotate the PopOutPick', false, 210),
    ('product_details_title', 'Product details title', 'PRODUCT DETAILS', false, 300),
    ('product_details_body', 'Product details body', '4 Pick Holders, different sizes, whatever design you want. This product will help you remember which pick is which, and make it easy to carry them around. The modular design allows you to customize your pick holder with different colors, patterns, and even add-ons like keychains or clips. Each component is designed to fit together seamlessly, creating a compact and stylish solution for storing your guitar picks. Whether you''re a beginner or a seasoned guitarist, the PopOutPick system offers a fun and functional way to keep your picks organized and easily accessible.', true, 310),
    ('build_button_label', 'Build button label', 'BUILD IT NOW', false, 400)
on conflict (key) do update set
    label = excluded.label,
    multiline = excluded.multiline,
    sort_order = excluded.sort_order;

insert into public.checkout_time_slots (location_id, day_of_week, time_label, sort_order)
select location_id, day_of_week, time_label, sort_order
from (
    values
        ('ntu', 1, '10:00 AM', 1000), ('ntu', 1, '11:00 AM', 1100), ('ntu', 1, '12:00 PM', 1200), ('ntu', 1, '1:00 PM', 1300), ('ntu', 1, '2:00 PM', 1400), ('ntu', 1, '3:00 PM', 1500), ('ntu', 1, '4:00 PM', 1600), ('ntu', 1, '5:00 PM', 1700), ('ntu', 1, '6:00 PM', 1800),
        ('ntu', 2, '10:00 AM', 1000), ('ntu', 2, '11:00 AM', 1100), ('ntu', 2, '12:00 PM', 1200), ('ntu', 2, '1:00 PM', 1300), ('ntu', 2, '2:00 PM', 1400), ('ntu', 2, '3:00 PM', 1500), ('ntu', 2, '4:00 PM', 1600), ('ntu', 2, '5:00 PM', 1700), ('ntu', 2, '6:00 PM', 1800),
        ('ntu', 4, '10:00 AM', 1000), ('ntu', 4, '11:00 AM', 1100), ('ntu', 4, '12:00 PM', 1200), ('ntu', 4, '1:00 PM', 1300), ('ntu', 4, '2:00 PM', 1400), ('ntu', 4, '3:00 PM', 1500), ('ntu', 4, '4:00 PM', 1600), ('ntu', 4, '5:00 PM', 1700), ('ntu', 4, '6:00 PM', 1800),
        ('ntu', 5, '10:00 AM', 1000), ('ntu', 5, '11:00 AM', 1100), ('ntu', 5, '12:00 PM', 1200), ('ntu', 5, '1:00 PM', 1300), ('ntu', 5, '2:00 PM', 1400), ('ntu', 5, '3:00 PM', 1500), ('ntu', 5, '4:00 PM', 1600), ('ntu', 5, '5:00 PM', 1700), ('ntu', 5, '6:00 PM', 1800),
        ('pasir-ris', 1, '7:00 PM', 1900), ('pasir-ris', 1, '8:00 PM', 2000),
        ('pasir-ris', 2, '7:00 PM', 1900), ('pasir-ris', 2, '8:00 PM', 2000),
        ('pasir-ris', 4, '7:00 PM', 1900), ('pasir-ris', 4, '8:00 PM', 2000),
        ('pasir-ris', 5, '7:00 PM', 1900), ('pasir-ris', 5, '8:00 PM', 2000),
        ('pasir-ris', 0, '10:00 AM', 1000), ('pasir-ris', 0, '11:00 AM', 1100), ('pasir-ris', 0, '12:00 PM', 1200), ('pasir-ris', 0, '1:00 PM', 1300), ('pasir-ris', 0, '2:00 PM', 1400), ('pasir-ris', 0, '3:00 PM', 1500), ('pasir-ris', 0, '4:00 PM', 1600), ('pasir-ris', 0, '5:00 PM', 1700), ('pasir-ris', 0, '6:00 PM', 1800), ('pasir-ris', 0, '7:00 PM', 1900), ('pasir-ris', 0, '8:00 PM', 2000),
        ('pasir-ris', 3, '10:00 AM', 1000), ('pasir-ris', 3, '11:00 AM', 1100), ('pasir-ris', 3, '12:00 PM', 1200), ('pasir-ris', 3, '1:00 PM', 1300), ('pasir-ris', 3, '2:00 PM', 1400), ('pasir-ris', 3, '3:00 PM', 1500), ('pasir-ris', 3, '4:00 PM', 1600), ('pasir-ris', 3, '5:00 PM', 1700), ('pasir-ris', 3, '6:00 PM', 1800), ('pasir-ris', 3, '7:00 PM', 1900), ('pasir-ris', 3, '8:00 PM', 2000),
        ('pasir-ris', 6, '10:00 AM', 1000), ('pasir-ris', 6, '11:00 AM', 1100), ('pasir-ris', 6, '12:00 PM', 1200), ('pasir-ris', 6, '1:00 PM', 1300), ('pasir-ris', 6, '2:00 PM', 1400), ('pasir-ris', 6, '3:00 PM', 1500), ('pasir-ris', 6, '4:00 PM', 1600), ('pasir-ris', 6, '5:00 PM', 1700), ('pasir-ris', 6, '6:00 PM', 1800), ('pasir-ris', 6, '7:00 PM', 1900), ('pasir-ris', 6, '8:00 PM', 2000)
) as defaults(location_id, day_of_week, time_label, sort_order)
on conflict (location_id, day_of_week, time_label) do nothing;

create or replace function public.ensure_order_storage_bucket(p_bucket_id text)
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
begin
    if p_bucket_id !~ '^order-[a-z0-9][a-z0-9-]{0,93}$' then
        raise exception 'Invalid order bucket id';
    end if;

    insert into storage.buckets (id, name, public)
    values (p_bucket_id, p_bucket_id, false)
    on conflict (id) do update set public = excluded.public;

    return p_bucket_id;
end;
$$;

revoke all on function public.ensure_order_storage_bucket(text) from public;
revoke execute on function public.ensure_order_storage_bucket(text) from anon, authenticated;
grant execute on function public.ensure_order_storage_bucket(text) to service_role;

create or replace function public.delete_order_storage_bucket(p_bucket_id text)
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
begin
    if p_bucket_id !~ '^order-[a-z0-9][a-z0-9-]{0,93}$' then
        raise exception 'Invalid order bucket id';
    end if;

    delete from storage.objects
    where bucket_id = p_bucket_id;

    delete from storage.buckets
    where id = p_bucket_id;

    return p_bucket_id;
end;
$$;

revoke all on function public.delete_order_storage_bucket(text) from public;
revoke execute on function public.delete_order_storage_bucket(text) from anon, authenticated;
grant execute on function public.delete_order_storage_bucket(text) to service_role;

drop policy if exists "Public can upload order bucket files" on storage.objects;
drop policy if exists "Public cannot upload order bucket files directly" on storage.objects;
create policy "Public cannot upload order bucket files directly"
on storage.objects
for insert
to anon, authenticated
with check (false);

drop policy if exists "Admins can read order bucket files" on storage.objects;
create policy "Admins can read order bucket files"
on storage.objects
for select
to authenticated
using (bucket_id like 'order-%' and public.is_admin());

drop policy if exists "Admins can delete order bucket files" on storage.objects;
create policy "Admins can delete order bucket files"
on storage.objects
for delete
to authenticated
using (bucket_id like 'order-%' and public.is_admin());

drop policy if exists "Public can upload order files" on storage.objects;
drop policy if exists "Admins can read order storage files" on storage.objects;
drop policy if exists "Admins can delete order storage files" on storage.objects;
drop policy if exists "Public can upload design files" on storage.objects;
drop policy if exists "Admins can read payment proofs" on storage.objects;
drop policy if exists "Public can upload payment proofs" on storage.objects;
drop policy if exists "Admins can read design files" on storage.objects;
drop policy if exists "Admins can delete order files" on storage.objects;

-- Existing design-uploads/payment-proofs/order-files buckets are left untouched to avoid deleting old files.
-- After confirming old uploads are no longer needed, remove those buckets in the Supabase dashboard.

-- After creating an admin Auth user, add them like this:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
