-- The TUNR merch shop: buy a hat or shirt by card (Stripe Checkout, which
-- also takes the shipping address). TUNR+ members get a discount.
--
--   shop_settings     open or not, shipping, free shipping over, member discount
--   shop_products     what's for sale: name, price, photo, sizes, stock per size
--   shop_orders       orders: lines, totals, shipping address, status, tracking
--
--   start_order(items)  as the buyer: checks everything, prices it (never from
--                       the phone), makes a pending order; api/shop opens Checkout
--   pay_order(...)      Stripe's webhook (service key): paid, stock taken
--   admin_ship_order / admin_cancel_order   admins (refunds are done in Stripe)
--
-- No points for buying: points buy scratch cards, so points for money would
-- let money buy a chance to win (see 122).

create table if not exists public.shop_settings (
  id boolean primary key default true check (id),
  open boolean not null default false,
  shipping_cents integer not null default 500 check (shipping_cents between 0 and 5000),
  free_shipping_over_cents integer check (free_shipping_over_cents is null or free_shipping_over_cents between 0 and 100000),
  member_discount_pct integer not null default 10 check (member_discount_pct between 0 and 50),
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id, free_shipping_over_cents) values (true, 5000) on conflict (id) do nothing;
alter table public.shop_settings enable row level security;
drop policy if exists "everyone sees the shop settings" on public.shop_settings;
create policy "everyone sees the shop settings" on public.shop_settings for select to anon, authenticated using (true);
drop policy if exists "admins change the shop settings" on public.shop_settings;
create policy "admins change the shop settings" on public.shop_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 500),
  price_cents integer not null check (price_cents between 100 and 100000),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 500 and photo_url ~ '^(https://[a-z0-9]{20}\.supabase\.co|http://(127\.0\.0\.1|localhost):[0-9]+)/storage/v1/object/public/')),
  emoji text not null default '🛍️' check (char_length(emoji) <= 8),
  -- Sizes in order; one entry 'One size' for hats and the like.
  sizes text[] not null default array['One size'] check (cardinality(sizes) between 1 and 10),
  -- Left per size ({"M": 4}); a size not listed has no limit.
  stock jsonb not null default '{}'::jsonb check (jsonb_typeof(stock) = 'object'),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.shop_products (name, description, price_cents, emoji, sizes, sort)
select * from (values
  ('TUNR Hat', 'Embroidered TUNR logo, adjustable strap.', 2500, '🧢', array['One size'], 1),
  ('TUNR Shirt', 'Soft cotton tee with the TUNR logo.', 3000, '👕', array['S', 'M', 'L', 'XL', '2XL'], 2)
) v(name, description, price_cents, emoji, sizes, sort)
where not exists (select 1 from public.shop_products);
alter table public.shop_products enable row level security;
drop policy if exists "everyone sees what's for sale" on public.shop_products;
create policy "everyone sees what's for sale" on public.shop_products for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "admins manage products" on public.shop_products;
create policy "admins manage products" on public.shop_products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'cancelled')),
  -- [{product_id, name, size, qty, unit_cents}]
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  member_price boolean not null default false,
  stripe_session text unique,
  ship_name text,
  ship_address jsonb,
  tracking text check (char_length(tracking) <= 200),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz
);
create index if not exists shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_status_idx on public.shop_orders (status, created_at desc);
alter table public.shop_orders enable row level security;
drop policy if exists "buyers and admins see orders" on public.shop_orders;
create policy "buyers and admins see orders" on public.shop_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['shop_settings', 'shop_products', 'shop_orders'] loop
    execute format('drop trigger if exists log_admin_change on public.%I', t);
    execute format('create trigger log_admin_change after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t);
  end loop;
end $$;

-- What's left of one size (null: no limit).
create or replace function public.shop_left(p_stock jsonb, p_size text)
returns integer
language sql
immutable
as $$
  select case when p_stock ? p_size then greatest((p_stock ->> p_size)::int, 0) end;
$$;

-- p_items: [{product, size, qty}]. Prices, discount and shipping come from
-- the database. → { status, id, lines, subtotal_cents, discount_cents,
-- shipping_cents, total_cents, member_price }
create or replace function public.start_order(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.shop_settings;
  it jsonb;
  pr public.shop_products;
  v_qty int;
  v_size text;
  v_member boolean;
  v_unit int;
  v_lines jsonb := '[]'::jsonb;
  v_sub int := 0;
  v_full int := 0;
  v_ship int;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.shop_settings limit 1;
  if not coalesce(s.open, false) and not public.is_admin() then
    return jsonb_build_object('status', 'closed');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    return jsonb_build_object('status', 'empty');
  end if;
  if (select count(*) from public.shop_orders where user_id = v_uid and status = 'pending' and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  v_member := public.member_active(v_uid);
  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from public.shop_products where id = (it ->> 'product')::uuid and active;
    if not found then
      return jsonb_build_object('status', 'not_for_sale');
    end if;
    v_size := coalesce(it ->> 'size', pr.sizes[1]);
    if not v_size = any (pr.sizes) then
      return jsonb_build_object('status', 'bad_size', 'product', pr.name);
    end if;
    v_qty := coalesce((it ->> 'qty')::int, 1);
    if v_qty not between 1 and 5 then
      return jsonb_build_object('status', 'bad_qty');
    end if;
    if public.shop_left(pr.stock, v_size) is not null and public.shop_left(pr.stock, v_size) < v_qty then
      return jsonb_build_object('status', 'sold_out', 'product', pr.name, 'size', v_size, 'left', public.shop_left(pr.stock, v_size));
    end if;
    v_unit := case when v_member then round(pr.price_cents * (100 - s.member_discount_pct) / 100.0)::int else pr.price_cents end;
    v_full := v_full + pr.price_cents * v_qty;
    v_sub := v_sub + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object('product_id', pr.id, 'name', pr.name, 'size', v_size, 'qty', v_qty, 'unit_cents', v_unit);
  end loop;
  v_ship := case when s.free_shipping_over_cents is not null and v_sub >= s.free_shipping_over_cents then 0 else s.shipping_cents end;
  insert into public.shop_orders (user_id, lines, subtotal_cents, discount_cents, shipping_cents, total_cents, member_price)
  values (v_uid, v_lines, v_full, v_full - v_sub, v_ship, v_sub + v_ship, v_member)
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id, 'lines', v_lines, 'subtotal_cents', v_full,
    'discount_cents', v_full - v_sub, 'shipping_cents', v_ship, 'total_cents', v_sub + v_ship, 'member_price', v_member);
end;
$$;
revoke execute on function public.start_order(jsonb) from public, anon;
grant execute on function public.start_order(jsonb) to authenticated;

-- Stripe's webhook (service key): paid in full → paid, stock taken, admins told.
create or replace function public.pay_order(p_id uuid, p_session text, p_amount_cents integer, p_ship_name text, p_ship_address jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.shop_orders;
  ln jsonb;
  v_short boolean := false;
begin
  select * into o from public.shop_orders where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if o.status <> 'pending' then
    return jsonb_build_object('status', 'already'); -- Stripe can send a webhook twice
  end if;
  if coalesce(p_amount_cents, 0) < o.total_cents then
    return jsonb_build_object('status', 'underpaid');
  end if;
  update public.shop_orders
     set status = 'paid', paid_at = now(), stripe_session = p_session,
         ship_name = left(p_ship_name, 120), ship_address = p_ship_address
   where id = p_id;
  -- Take the stock (sizes with a limit only).
  for ln in select * from jsonb_array_elements(o.lines) loop
    update public.shop_products p
       set stock = p.stock || jsonb_build_object(ln ->> 'size', (p.stock ->> (ln ->> 'size'))::int - (ln ->> 'qty')::int)
     where p.id = (ln ->> 'product_id')::uuid and p.stock ? (ln ->> 'size');
    if exists (select 1 from public.shop_products p where p.id = (ln ->> 'product_id')::uuid
                and p.stock ? (ln ->> 'size') and (p.stock ->> (ln ->> 'size'))::int < 0) then
      v_short := true;
    end if;
  end loop;
  perform public.notify_admins('shop_order', case when v_short then '⚠️ Merch order (short on stock)' else '🛍️ New merch order' end,
    (select string_agg((l ->> 'qty') || '× ' || (l ->> 'name') || ' (' || (l ->> 'size') || ')', ', ') from jsonb_array_elements(o.lines) l)
      || '. Ship it from Settings → Admin → Merch shop.',
    'shop:' || o.id);
  if o.user_id is not null then
    perform public.notify(o.user_id, 'shop_order', '🛍️ Order received', 'Thanks! We''ll let you know when it ships.', 'open:shop', 'shop-paid:' || o.id);
  end if;
  return jsonb_build_object('status', 'ok', 'short', v_short);
end;
$$;
revoke execute on function public.pay_order(uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.pay_order(uuid, text, integer, text, jsonb) to service_role;

create or replace function public.admin_ship_order(p_id uuid, p_tracking text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.shop_orders;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into o from public.shop_orders where id = p_id for update;
  if not found or o.status <> 'paid' then
    return jsonb_build_object('status', 'not_paid');
  end if;
  update public.shop_orders set status = 'shipped', shipped_at = now(), tracking = nullif(left(trim(p_tracking), 200), '') where id = p_id;
  if o.user_id is not null then
    perform public.notify(o.user_id, 'shop_order', '📦 Your TUNR merch shipped',
      case when nullif(trim(p_tracking), '') is null then 'It''s on the way.' else 'Tracking: ' || left(trim(p_tracking), 200) end,
      'open:shop', 'shop-shipped:' || o.id);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.admin_ship_order(uuid, text) from public, anon;
grant execute on function public.admin_ship_order(uuid, text) to authenticated;

-- Cancel an order (refund any payment in Stripe yourself). Paid stock goes back.
create or replace function public.admin_cancel_order(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.shop_orders;
  ln jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into o from public.shop_orders where id = p_id for update;
  if not found or o.status in ('cancelled', 'shipped') then
    return jsonb_build_object('status', 'cant_cancel');
  end if;
  if o.status = 'paid' then
    for ln in select * from jsonb_array_elements(o.lines) loop
      update public.shop_products p
         set stock = p.stock || jsonb_build_object(ln ->> 'size', (p.stock ->> (ln ->> 'size'))::int + (ln ->> 'qty')::int)
       where p.id = (ln ->> 'product_id')::uuid and p.stock ? (ln ->> 'size');
    end loop;
  end if;
  update public.shop_orders set status = 'cancelled' where id = p_id;
  return jsonb_build_object('status', 'ok', 'was', o.status);
end;
$$;
revoke execute on function public.admin_cancel_order(uuid) from public, anon;
grant execute on function public.admin_cancel_order(uuid) to authenticated;
