-- Rewards are mailed, not picked up at meets (the owner's call).
--
--   rewards.ships / sizes: a reward we mail; the shirt asks for a size.
--   reward_redemptions gains the mailing address, size and tracking.
--   redeem_reward(reward, ship) takes the address for a mailed reward.
--   decide_redemption(id, 'fulfilled', tracking) marks it shipped and tells
--     the member, with the tracking number.
--   The hat and shirt get new descriptions (no dollar prices) and their
--   points cover the shipping; the 10-point "Scan my build sticker" reward is
--   retired: the mailed sticker order (075, 80 points, from your car's QR
--   sticker screen) is the one way to get it now, priced to cover printing
--   and postage.

alter table public.rewards
  add column if not exists ships boolean not null default false,
  add column if not exists sizes text[];

alter table public.reward_redemptions
  add column if not exists ship_name text check (char_length(ship_name) <= 80),
  add column if not exists line1 text check (char_length(line1) <= 120),
  add column if not exists line2 text check (char_length(line2) <= 120),
  add column if not exists city text check (char_length(city) <= 60),
  add column if not exists state text check (state ~ '^[A-Z]{2}$'),
  add column if not exists zip text check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  add column if not exists size text check (char_length(size) <= 10),
  add column if not exists tracking text check (char_length(tracking) <= 80);

update public.rewards
   set description = 'The Boosted Studios hat. Worn by the regulars who keep the scene moving, from the first meet of the night to the last one out of the lot. One size fits most.',
       how_to_claim = 'We mail it to you. You''ll get an alert with the tracking number when it ships.',
       ships = true,
       cost = greatest(cost, 300)
 where title = 'Boosted Studios hat';

update public.rewards
   set description = 'Rep the crew. The Boosted Studios tee, for the members who show up, check in and keep TUNR running. Pick your size.',
       how_to_claim = 'We mail it to you. You''ll get an alert with the tracking number when it ships.',
       ships = true,
       sizes = '{S,M,L,XL,2XL}',
       cost = greatest(cost, 350)
 where title = 'Boosted Studios T-shirt';

update public.rewards set active = false where title = 'Scan my build sticker';

-- Redeem. For a mailed reward, p_ship = { name, line1, line2, city, state,
-- zip, size }. Same rules as before; adds bad_address and bad_size.
drop function if exists public.redeem_reward(uuid);
create or replace function public.redeem_reward(p_reward uuid, p_ship jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.rewards;
  v_age_days int;
  v_checkins int;
  v_balance int;
  v_mine int;
  v_spent bigint;
  v_code text;
  v_id uuid := gen_random_uuid();
  v_state text := upper(trim(coalesce(p_ship->>'state', '')));
  v_zip text := trim(coalesce(p_ship->>'zip', ''));
  v_size text := nullif(trim(coalesce(p_ship->>'size', '')), '');
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) and not public.all_access() then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  if coalesce(v_age_days, 0) < 14 and not public.all_access() then
    return jsonb_build_object('status', 'too_new', 'days_left', 14 - coalesce(v_age_days, 0));
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));

  select * into r from public.rewards where id = p_reward and active for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if r.ships then
    if char_length(trim(coalesce(p_ship->>'name', ''))) < 2 or char_length(trim(coalesce(p_ship->>'line1', ''))) < 3
       or char_length(trim(coalesce(p_ship->>'city', ''))) < 2 or v_state !~ '^[A-Z]{2}$' or v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then
      return jsonb_build_object('status', 'bad_address');
    end if;
    if r.sizes is not null and (v_size is null or not (v_size = any (r.sizes))) then
      return jsonb_build_object('status', 'bad_size', 'sizes', r.sizes);
    end if;
  end if;

  -- Buyers who've spent enough don't also need two check-ins.
  v_spent := public.spent_cents(v_uid);
  if r.min_spend_cents > 0 and v_spent < r.min_spend_cents and not public.all_access() then
    return jsonb_build_object('status', 'need_spend', 'spent_cents', v_spent, 'min_spend_cents', r.min_spend_cents);
  end if;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  if v_checkins < 2 and v_spent = 0 and not public.all_access() then
    return jsonb_build_object('status', 'need_checkins', 'checkins', v_checkins);
  end if;

  if r.stock is not null and r.stock <= 0 then
    return jsonb_build_object('status', 'sold_out');
  end if;

  select count(*) into v_mine from public.reward_redemptions
   where user_id = v_uid and reward_id = p_reward and status <> 'cancelled';
  if v_mine >= r.per_person then
    return jsonb_build_object('status', 'limit');
  end if;

  v_balance := public.points_balance(v_uid);
  if v_balance < r.cost then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', r.cost);
  end if;

  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
                 from generate_series(1, 8));
    exit when not exists (select 1 from public.reward_redemptions where claim_code = v_code);
  end loop;

  insert into public.reward_redemptions (id, reward_id, user_id, cost, claim_code, ship_name, line1, line2, city, state, zip, size)
  values (v_id, p_reward, v_uid, r.cost, v_code,
          case when r.ships then left(trim(p_ship->>'name'), 80) end,
          case when r.ships then left(trim(p_ship->>'line1'), 120) end,
          case when r.ships then nullif(left(trim(coalesce(p_ship->>'line2', '')), 120), '') end,
          case when r.ships then left(trim(p_ship->>'city'), 60) end,
          case when r.ships then v_state end,
          case when r.ships then v_zip end,
          case when r.ships then v_size end);
  insert into public.point_ledger (user_id, delta, reason, redemption_id, note)
  values (v_uid, -r.cost, 'redeem', v_id, left(r.title, 200));
  if r.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward;
  end if;
  if r.ships then
    perform public.notify_admins('reward_to_ship', '📦 Reward to mail: ' || r.title,
      coalesce(v_size || ' · ', '') || v_state || ' ' || v_zip || '. Settings → Admin → Reward claims.', 'ship:' || v_id);
  end if;

  return jsonb_build_object('status', 'ok', 'claim_code', v_code, 'ships', r.ships, 'balance', v_balance - r.cost);
end;
$$;
revoke execute on function public.redeem_reward(uuid, jsonb) from public, anon;
grant execute on function public.redeem_reward(uuid, jsonb) to authenticated;

-- The admin queue, now with where to mail it.
drop function if exists public.redemption_queue(text);
create or replace function public.redemption_queue(p_status text default 'pending')
returns table (
  id uuid, claim_code text, status text, cost int, created_at timestamptz,
  reward_title text, user_id uuid, username text, ships boolean,
  ship_name text, line1 text, line2 text, city text, state text, zip text, size text, tracking text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.claim_code, d.status, d.cost, d.created_at, r.title, d.user_id, p.username, r.ships,
         d.ship_name, d.line1, d.line2, d.city, d.state, d.zip, d.size, d.tracking
    from public.reward_redemptions d
    join public.rewards r on r.id = d.reward_id
    left join public.profiles p on p.id = d.user_id
   where public.is_admin() and d.status = p_status
   order by d.created_at desc
   limit 200;
$$;
revoke execute on function public.redemption_queue(text) from public, anon;
grant execute on function public.redemption_queue(text) to authenticated;

-- Shipped (with tracking) or handed over, or cancelled with the points back.
drop function if exists public.decide_redemption(uuid, text);
create or replace function public.decide_redemption(p_id uuid, p_status text, p_tracking text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.reward_redemptions;
  r public.rewards;
  v_tracking text := nullif(left(trim(coalesce(p_tracking, '')), 80), '');
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if p_status not in ('fulfilled', 'cancelled') then
    raise exception 'bad_status: %', p_status;
  end if;

  select * into d from public.reward_redemptions where id = p_id for update;
  if not found then
    raise exception 'redemption_not_found';
  end if;
  if d.status <> 'pending' then
    raise exception 'redemption_already_decided';
  end if;

  update public.reward_redemptions
     set status = p_status, decided_at = now(), decided_by = auth.uid(), tracking = coalesce(v_tracking, tracking)
   where id = p_id;

  select * into r from public.rewards where id = d.reward_id;
  if p_status = 'cancelled' then
    insert into public.point_ledger (user_id, delta, reason, redemption_id, note, created_by)
    values (d.user_id, d.cost, 'refund', d.id, left('Cancelled: ' || coalesce(r.title, 'reward'), 200), auth.uid());
    update public.rewards set stock = stock + 1 where id = d.reward_id and stock is not null;
    perform public.notify(d.user_id, 'reward', 'Reward cancelled, points returned',
      coalesce(r.title, 'Your reward') || ' was cancelled and ' || d.cost || ' points went back to you.', null, null);
  elsif coalesce(r.ships, false) then
    perform public.notify(d.user_id, 'reward', '📦 Your ' || coalesce(r.title, 'reward') || ' shipped',
      case when v_tracking is not null then 'Tracking: ' || v_tracking || '.' else 'It''s on its way to you.' end, null, null);
  else
    perform public.notify(d.user_id, 'reward', '🎁 Reward handed over',
      coalesce(r.title, 'Your reward') || ' is marked as collected. Enjoy!', null, null);
  end if;
end;
$$;
revoke execute on function public.decide_redemption(uuid, text, text) from public, anon;
grant execute on function public.decide_redemption(uuid, text, text) to authenticated;
