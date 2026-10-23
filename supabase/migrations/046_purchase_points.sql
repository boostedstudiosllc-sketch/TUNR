-- Points for money spent on Boosted merch, a bonus for becoming a member,
-- and a minimum spend on rewards.
--
-- The shop lives outside TUNR (Square, Depop, in person), so TUNR can't see
-- sales by itself. A buyer adds their order number and amount; an admin
-- checks it against the shop's own records and approves it, or records an
-- in-person sale directly. Each order number counts once.
--
-- A reward can require a minimum amount spent, so merch can only be earned
-- by people whose purchases already paid for it: showing up at meets alone
-- never gets there.

-- ============ SETTINGS ============
create table if not exists public.points_settings (
  id boolean primary key default true check (id),
  points_per_dollar integer not null default 10 check (points_per_dollar between 0 and 1000),
  member_bonus integer not null default 500 check (member_bonus between 0 and 100000),
  updated_at timestamptz not null default now()
);

insert into public.points_settings (id) values (true) on conflict (id) do nothing;

alter table public.points_settings enable row level security;

drop policy if exists "points settings are public" on public.points_settings;
create policy "points settings are public"
  on public.points_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admins change points settings" on public.points_settings;
create policy "admins change points settings"
  on public.points_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============ LEDGER REASONS ============
alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus'
));

create unique index if not exists point_ledger_member_bonus_once
  on public.point_ledger (user_id) where reason = 'member_bonus';

-- ============ PURCHASES ============
create table if not exists public.purchase_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store text not null check (store in ('square', 'depop', 'in_person', 'other')),
  order_ref text not null check (char_length(btrim(order_ref)) between 3 and 60),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  points integer,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);

-- One order, one claim (a rejected claim frees the number for a corrected one).
create unique index if not exists purchase_claims_order_once
  on public.purchase_claims (store, lower(btrim(order_ref))) where status <> 'rejected';
create index if not exists purchase_claims_user_idx on public.purchase_claims (user_id, created_at desc);
create index if not exists purchase_claims_status_idx on public.purchase_claims (status, created_at desc);

alter table public.purchase_claims enable row level security;

drop policy if exists "users see their own purchases" on public.purchase_claims;
create policy "users see their own purchases"
  on public.purchase_claims for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- Written only through the functions below.

-- Approved spending, in cents. Used for the reward minimums.
create or replace function public.spent_cents(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0) from public.purchase_claims
   where user_id = p_user and status = 'approved';
$$;

revoke execute on function public.spent_cents(uuid) from public, anon, authenticated;

-- A buyer adds an order. ok, not_signed_in, unconfirmed, bad_order,
-- bad_amount, rate_limited, duplicate.
create or replace function public.submit_purchase(p_store text, p_order_ref text, p_amount_cents int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if p_store not in ('square', 'depop', 'in_person', 'other')
     or char_length(btrim(coalesce(p_order_ref, ''))) not between 3 and 60 then
    return jsonb_build_object('status', 'bad_order');
  end if;
  if coalesce(p_amount_cents, 0) not between 100 and 1000000 then
    return jsonb_build_object('status', 'bad_amount');
  end if;
  if (select count(*) from public.purchase_claims
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if exists (select 1 from public.purchase_claims
              where store = p_store and lower(btrim(order_ref)) = lower(btrim(p_order_ref))
                and status <> 'rejected') then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.purchase_claims (user_id, store, order_ref, amount_cents)
  values (v_uid, p_store, btrim(p_order_ref), p_amount_cents);
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.submit_purchase(text, text, int) from public, anon;
grant execute on function public.submit_purchase(text, text, int) to authenticated;

-- Points for an approved purchase, at today's rate.
create or replace function public.award_purchase(p_claim uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.purchase_claims;
  v_points int;
begin
  select * into c from public.purchase_claims where id = p_claim;
  v_points := floor(c.amount_cents / 100.0 * (select points_per_dollar from public.points_settings))::int;
  update public.purchase_claims set points = v_points where id = p_claim;
  if v_points > 0 then
    insert into public.point_ledger (user_id, delta, reason, note, created_by)
    values (c.user_id, v_points, 'purchase',
            left('Order ' || c.order_ref || ' ($' || to_char(c.amount_cents / 100.0, 'FM999990.00') || ')', 200),
            auth.uid());
  end if;
  return v_points;
end;
$$;

revoke execute on function public.award_purchase(uuid) from public, anon, authenticated;

-- Approve (optionally correcting the amount to what the shop shows) or reject.
create or replace function public.decide_purchase(p_claim uuid, p_approve boolean, p_amount_cents int default null, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.purchase_claims;
  v_points int := 0;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into c from public.purchase_claims where id = p_claim for update;
  if not found then
    raise exception 'purchase_not_found';
  end if;
  if c.status <> 'pending' then
    raise exception 'purchase_already_decided';
  end if;

  if p_approve then
    if p_amount_cents is not null then
      if p_amount_cents not between 100 and 1000000 then
        raise exception 'purchase_amount_check';
      end if;
      update public.purchase_claims set amount_cents = p_amount_cents where id = p_claim;
    end if;
    update public.purchase_claims
       set status = 'approved', decided_at = now(), decided_by = auth.uid(), note = left(p_note, 200)
     where id = p_claim;
    v_points := public.award_purchase(p_claim);
    perform public.notify(c.user_id, 'reward', '⭐ Purchase points added',
      '+' || v_points || ' points for order ' || c.order_ref || '. Thanks for supporting Boosted!', null, null);
  else
    update public.purchase_claims
       set status = 'rejected', decided_at = now(), decided_by = auth.uid(), note = left(p_note, 200)
     where id = p_claim;
    perform public.notify(c.user_id, 'reward', 'Purchase not matched',
      'We couldn''t match order ' || c.order_ref || '.' ||
      coalesce(' ' || nullif(btrim(p_note), ''), ' Check the order number and amount and add it again.'), null, null);
  end if;
  return v_points;
end;
$$;

revoke execute on function public.decide_purchase(uuid, boolean, int, text) from public, anon;
grant execute on function public.decide_purchase(uuid, boolean, int, text) to authenticated;

-- An admin records a sale for someone (in person at a meet, say). Approved
-- straight away. Returns the points given.
create or replace function public.record_purchase(p_user uuid, p_store text, p_order_ref text, p_amount_cents int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if exists (select 1 from public.purchase_claims
              where store = p_store and lower(btrim(order_ref)) = lower(btrim(p_order_ref))
                and status <> 'rejected') then
    raise exception 'purchase_duplicate';
  end if;
  insert into public.purchase_claims (user_id, store, order_ref, amount_cents, status, decided_at, decided_by)
  values (p_user, p_store, btrim(p_order_ref), p_amount_cents, 'approved', now(), auth.uid())
  returning id into v_id;
  return public.award_purchase(v_id);
end;
$$;

revoke execute on function public.record_purchase(uuid, text, text, int) from public, anon;
grant execute on function public.record_purchase(uuid, text, text, int) to authenticated;

create or replace function public.purchase_queue(p_status text default 'pending')
returns table (
  id uuid, store text, order_ref text, amount_cents int, points int, created_at timestamptz,
  user_id uuid, username text, note text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.store, c.order_ref, c.amount_cents, c.points, c.created_at, c.user_id, p.username, c.note
    from public.purchase_claims c
    left join public.profiles p on p.id = c.user_id
   where public.is_admin() and c.status = p_status
   order by c.created_at desc
   limit 200;
$$;

revoke execute on function public.purchase_queue(text) from public, anon;
grant execute on function public.purchase_queue(text) to authenticated;

-- ============ MEMBERSHIP BONUS ============
-- Once per person, the first time they become a member.
create or replace function public.member_bonus_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus int;
begin
  if new.is_member and not coalesce(old.is_member, false) then
    select member_bonus into v_bonus from public.points_settings;
    if coalesce(v_bonus, 0) > 0 then
      insert into public.point_ledger (user_id, delta, reason, note)
      values (new.id, v_bonus, 'member_bonus', 'Welcome to TUNR membership')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_member_bonus on public.profiles;
create trigger profiles_member_bonus
  after update of is_member on public.profiles
  for each row execute function public.member_bonus_on_join();

-- ============ REWARD MINIMUM SPEND ============
alter table public.rewards
  add column if not exists min_spend_cents integer not null default 0
  check (min_spend_cents between 0 and 10000000);

-- Same as 045 plus the minimum-spend rule (status 'need_spend').
create or replace function public.redeem_reward(p_reward uuid)
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
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  if coalesce(v_age_days, 0) < 14 then
    return jsonb_build_object('status', 'too_new', 'days_left', 14 - coalesce(v_age_days, 0));
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));

  select * into r from public.rewards where id = p_reward and active for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Buyers who've spent enough don't also need two check-ins.
  v_spent := public.spent_cents(v_uid);
  if r.min_spend_cents > 0 and v_spent < r.min_spend_cents then
    return jsonb_build_object('status', 'need_spend', 'spent_cents', v_spent, 'min_spend_cents', r.min_spend_cents);
  end if;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  if v_checkins < 2 and v_spent = 0 then
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

  select coalesce(sum(delta), 0) into v_balance from public.point_ledger where user_id = v_uid;
  if v_balance < r.cost then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', r.cost);
  end if;

  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
                 from generate_series(1, 8));
    exit when not exists (select 1 from public.reward_redemptions where claim_code = v_code);
  end loop;

  insert into public.reward_redemptions (id, reward_id, user_id, cost, claim_code)
  values (v_id, p_reward, v_uid, r.cost, v_code);
  insert into public.point_ledger (user_id, delta, reason, redemption_id, note)
  values (v_uid, -r.cost, 'redeem', v_id, left(r.title, 200));
  if r.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward;
  end if;

  return jsonb_build_object('status', 'ok', 'claim_code', v_code, 'balance', v_balance - r.cost);
end;
$$;

-- Same as 045 plus how much they've spent, for the progress line.
create or replace function public.my_points()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_age_days int;
  v_checkins int;
  v_spent bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  v_spent := public.spent_cents(v_uid);
  return jsonb_build_object(
    'status', 'ok',
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid),
    'earned', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid and delta > 0),
    'checkins', v_checkins,
    'spent_cents', v_spent,
    'account_days', coalesce(v_age_days, 0),
    'can_redeem', coalesce(v_age_days, 0) >= 14 and (v_checkins >= 2 or v_spent > 0) and public.email_confirmed(v_uid)
  );
end;
$$;
