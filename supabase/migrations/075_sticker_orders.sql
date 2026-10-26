-- Mailed "Scan my build" stickers. A member orders a printed copy of their
-- car's QR sticker; the price shows up front. They pay by card (a payment
-- link the admin sets, e.g. a Stripe Payment Link) or with points. The
-- admin orders the print, marks it paid and sent.
--
--   sticker_settings: on/off, price, the points price (0 = points not
--     taken), the payment link, and the line describing what they get.
--   sticker_orders: one per order, with the mailing address. Members see
--     their own; admins see all. Written only through the functions here.

create table if not exists public.sticker_settings (
  id boolean primary key default true check (id),
  open boolean not null default true,
  price_cents integer not null default 800 check (price_cents between 0 and 100000),
  points_price integer not null default 80 check (points_price between 0 and 100000),
  pay_link text check (pay_link is null or pay_link ~ '^https://[^\s]+$'),
  blurb text not null default 'A printed sticker of your QR code (about 3.5 inches), mailed to you. Arrives in about 1–2 weeks.'
    check (char_length(blurb) <= 300),
  updated_at timestamptz not null default now()
);
insert into public.sticker_settings (id) values (true) on conflict (id) do nothing;
alter table public.sticker_settings enable row level security;

drop policy if exists "sticker settings are public" on public.sticker_settings;
create policy "sticker settings are public"
  on public.sticker_settings for select to anon, authenticated using (true);

drop policy if exists "admins change sticker settings" on public.sticker_settings;
create policy "admins change sticker settings"
  on public.sticker_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.sticker_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  car text not null,
  invite_code text,
  ship_name text not null check (char_length(ship_name) between 2 and 80),
  line1 text not null check (char_length(line1) between 3 and 120),
  line2 text check (char_length(line2) <= 120),
  city text not null check (char_length(city) between 2 and 60),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip text not null check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  paid_with text not null check (paid_with in ('card', 'points')),
  price_cents integer not null default 0,
  points integer not null default 0,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'sent', 'cancelled')),
  tracking text check (char_length(tracking) <= 120),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists sticker_orders_user_idx on public.sticker_orders (user_id, created_at desc);
create index if not exists sticker_orders_status_idx on public.sticker_orders (status, created_at);
alter table public.sticker_orders enable row level security;

drop policy if exists "members see their sticker orders" on public.sticker_orders;
create policy "members see their sticker orders"
  on public.sticker_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Place an order. p_pay: 'card' (then pay with the link) or 'points' (paid
-- now). Returns { status: 'ok', id, paid_with, pay_link?, balance? } or a
-- status saying why not: not_signed_in, unconfirmed, closed, not_your_car,
-- page_off, bad_address, too_many_open, card_off, points_off, too_new
-- (days_left), need_checkins, not_enough (balance, cost).
create or replace function public.order_sticker(
  p_vehicle uuid,
  p_pay text,
  p_name text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_zip text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.sticker_settings;
  v public.vehicles;
  v_id uuid := gen_random_uuid();
  v_car text;
  v_state text := upper(trim(coalesce(p_state, '')));
  v_zip text := trim(coalesce(p_zip, ''));
  v_age_days int;
  v_checkins int;
  v_balance int;
  a record;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.sticker_settings where id;
  if not coalesce(s.open, false) then
    return jsonb_build_object('status', 'closed');
  end if;
  select * into v from public.vehicles where id = p_vehicle;
  if not found or v.owner_id <> v_uid then
    return jsonb_build_object('status', 'not_your_car');
  end if;
  if not coalesce(v.public_page, false) then
    return jsonb_build_object('status', 'page_off');
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(coalesce(p_line1, ''))) < 3
     or char_length(trim(coalesce(p_city, ''))) < 2 or v_state !~ '^[A-Z]{2}$' or v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then
    return jsonb_build_object('status', 'bad_address');
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if (select count(*) from public.sticker_orders
       where user_id = v_uid and status = 'awaiting_payment') >= 3 then
    return jsonb_build_object('status', 'too_many_open');
  end if;
  v_car := left(concat_ws(' ', v.year::text, v.make, v.model), 120);

  if p_pay = 'card' then
    if s.pay_link is null then
      return jsonb_build_object('status', 'card_off');
    end if;
  elsif p_pay = 'points' then
    if s.points_price <= 0 then
      return jsonb_build_object('status', 'points_off');
    end if;
    -- The same bar as other rewards: two weeks in, and two check-ins or a purchase.
    select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
      from auth.users u where u.id = v_uid;
    if coalesce(v_age_days, 0) < 14 then
      return jsonb_build_object('status', 'too_new', 'days_left', 14 - coalesce(v_age_days, 0));
    end if;
    select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
    if v_checkins < 2 and public.spent_cents(v_uid) = 0 then
      return jsonb_build_object('status', 'need_checkins', 'checkins', v_checkins);
    end if;
    select coalesce(sum(delta), 0) into v_balance from public.point_ledger where user_id = v_uid;
    if v_balance < s.points_price then
      return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', s.points_price);
    end if;
  else
    return jsonb_build_object('status', 'bad_payment');
  end if;

  insert into public.sticker_orders (id, user_id, vehicle_id, car, invite_code, ship_name, line1, line2, city, state, zip,
                                     paid_with, price_cents, points, status, paid_at)
  values (v_id, v_uid, p_vehicle, v_car, (select invite_code from public.profiles where id = v_uid),
          left(trim(p_name), 80), left(trim(p_line1), 120), nullif(left(trim(coalesce(p_line2, '')), 120), ''),
          left(trim(p_city), 60), v_state, v_zip,
          p_pay, case when p_pay = 'card' then s.price_cents else 0 end,
          case when p_pay = 'points' then s.points_price else 0 end,
          case when p_pay = 'points' then 'paid' else 'awaiting_payment' end,
          case when p_pay = 'points' then now() end);
  if p_pay = 'points' then
    insert into public.point_ledger (user_id, delta, reason, redemption_id, note)
    values (v_uid, -s.points_price, 'redeem', v_id, left('Mailed QR sticker · ' || v_car, 200));
  end if;

  for a in select id from public.profiles where is_admin loop
    perform public.notify(a.id, 'sticker_order', '📦 Sticker order',
      v_car || ' · ' || case when p_pay = 'points' then s.points_price || ' points (paid)' else 'card, waiting on payment' end,
      null, 'sticker_order:' || v_id);
  end loop;

  return jsonb_build_object('status', 'ok', 'id', v_id, 'paid_with', p_pay,
    'pay_link', case when p_pay = 'card' then s.pay_link end,
    'balance', case when p_pay = 'points' then v_balance - s.points_price end);
end;
$$;

-- A member cancels an order they haven't paid for yet.
create or replace function public.cancel_my_sticker_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sticker_orders set status = 'cancelled', cancelled_at = now()
   where id = p_id and user_id = auth.uid() and status = 'awaiting_payment';
  if not found then
    raise exception 'sticker_order_locked';
  end if;
end;
$$;

-- Admin: move an order along. p_status: paid, sent (with tracking) or
-- cancelled (points come back if it was paid with points). The member gets
-- an alert when it's paid, sent or cancelled.
create or replace function public.admin_sticker_order(p_id uuid, p_status text, p_tracking text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.sticker_orders;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into o from public.sticker_orders where id = p_id for update;
  if not found then
    raise exception 'sticker_order_missing';
  end if;
  if o.status = 'cancelled' or p_status not in ('paid', 'sent', 'cancelled') then
    raise exception 'sticker_order_locked';
  end if;

  if p_status = 'paid' then
    update public.sticker_orders set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_id;
    perform public.notify(o.user_id, 'sticker_order', '📦 Sticker order confirmed',
      'Payment received for your ' || o.car || ' sticker. We''ll let you know when it ships.', null, 'sticker_paid:' || p_id);
  elsif p_status = 'sent' then
    update public.sticker_orders
       set status = 'sent', sent_at = now(), paid_at = coalesce(paid_at, now()),
           tracking = nullif(left(trim(coalesce(p_tracking, '')), 120), '')
     where id = p_id;
    perform public.notify(o.user_id, 'sticker_order', '📦 Your sticker shipped',
      'Your ' || o.car || ' sticker is in the mail' ||
        coalesce('. Tracking: ' || nullif(trim(coalesce(p_tracking, '')), ''), '') || '.', null, 'sticker_sent:' || p_id);
  else
    if o.status = 'sent' then
      raise exception 'sticker_order_locked';
    end if;
    update public.sticker_orders set status = 'cancelled', cancelled_at = now() where id = p_id;
    if o.paid_with = 'points' and o.points > 0 then
      insert into public.point_ledger (user_id, delta, reason, redemption_id, note, created_by)
      values (o.user_id, o.points, 'refund', p_id, left('Sticker order cancelled · ' || o.car, 200), auth.uid());
    end if;
    perform public.notify(o.user_id, 'sticker_order', '📦 Sticker order cancelled',
      'Your ' || o.car || ' sticker order was cancelled' ||
        case when o.paid_with = 'points' then '. Your ' || o.points || ' points are back.' else '.' end,
      null, 'sticker_cancelled:' || p_id);
  end if;
end;
$$;

revoke execute on function public.order_sticker(uuid, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.cancel_my_sticker_order(uuid) from public, anon;
revoke execute on function public.admin_sticker_order(uuid, text, text) from public, anon;
grant execute on function public.order_sticker(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.cancel_my_sticker_order(uuid) to authenticated;
grant execute on function public.admin_sticker_order(uuid, text, text) to authenticated;
