-- Fixes from the merch shop security audit (124):
--   * The same item on several cart lines is added up before the stock check
--     and the 5-of-a-thing limit (it could oversell).
--   * A payment for an order an admin cancelled (or one paid short) is kept
--     and admins are told to refund it, instead of vanishing.
-- (api/_lib/stripe.js: shop checkouts are card only and expire after 31
-- minutes.)

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
  -- The same thing on several lines counts as one line (stock, the 5 limit).
  for it in
    select jsonb_build_object('product', x.product, 'size', x.size, 'qty', sum(x.qty))
      from (select e ->> 'product' as product,
                   coalesce(e ->> 'size', (select p.sizes[1] from public.shop_products p where p.id::text = e ->> 'product')) as size,
                   coalesce((e ->> 'qty')::int, 1) as qty
              from jsonb_array_elements(p_items) e) x
     group by x.product, x.size
  loop
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
  -- Paid after an admin cancelled it (the payment page stays open a while):
  -- keep the record and tell admins to refund.
  if o.status = 'cancelled' then
    if o.stripe_session is null then
      update public.shop_orders set stripe_session = p_session, ship_name = left(p_ship_name, 120), ship_address = p_ship_address where id = p_id;
      perform public.notify_admins('shop_order', '⚠️ Paid after it was cancelled: refund in Stripe',
        'An order you cancelled was paid (' || round(coalesce(p_amount_cents, 0) / 100.0, 2) || ' dollars). Refund it in Stripe.', 'shop-late:' || o.id);
    end if;
    return jsonb_build_object('status', 'paid_after_cancel');
  end if;
  if o.status <> 'pending' then
    return jsonb_build_object('status', 'already'); -- Stripe can send a webhook twice
  end if;
  if coalesce(p_amount_cents, 0) < o.total_cents then
    perform public.notify_admins('shop_order', '⚠️ Merch order paid short: check Stripe',
      'An order for ' || round(o.total_cents / 100.0, 2) || ' dollars was paid ' || round(coalesce(p_amount_cents, 0) / 100.0, 2) || '. It wasn''t marked paid; refund it in Stripe.', 'shop-short:' || o.id);
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
