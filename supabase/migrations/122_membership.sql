-- TUNR+ membership, paid monthly or yearly by card (Stripe subscriptions).
--
-- profiles.is_member (021) stays the switch every perk already checks; this
-- adds the billing behind it. Members get:
--   * members-only shop discounts (021/028, unchanged)
--   * a Pit Stop streak restore once every 30 days (121 said 90; admins can
--     change it: points_settings.member_restore_days)
--   * profile colours, more garage cars and starting a club without
--     inviting friends first (049/058/081's invite unlocks)
--   * every Park Up level open (checked in the app)
-- Finding and joining meets stays free.
--
-- The welcome bonus (046's member_bonus) is switched off: points buy scratch
-- cards, so points for paying would let money buy a chance to win. Admins
-- can turn it back on (Settings → Admin → Purchases) once a lawyer says so.
--
-- Billing details live in memberships (only you and admins see your row);
-- profiles are public, so nothing about payments goes there.
--
--   membership_plans            month / year prices (admins set them)
--   my_membership()             → your status, plan, renew/end date, prices
--   start_membership(p_plan)    → checks you can join; api/membership opens Checkout
--   sync_membership(...)        Stripe's webhook (service key only)
--   admin_set_member(...)       admins: give or take away membership (comps)
--   membership_stats()          admins: how many members, monthly income

create table if not exists public.membership_plans (
  id text primary key check (id in ('month', 'year')),
  name text not null,
  price_cents integer not null check (price_cents between 100 and 100000),
  active boolean not null default true
);
insert into public.membership_plans (id, name, price_cents) values
  ('month', 'Monthly', 499),
  ('year', 'Yearly', 3999)
on conflict (id) do nothing;
alter table public.membership_plans enable row level security;
drop policy if exists "everyone sees membership prices" on public.membership_plans;
create policy "everyone sees membership prices" on public.membership_plans for select to anon, authenticated using (true);
drop policy if exists "admins set membership prices" on public.membership_plans;
create policy "admins set membership prices" on public.membership_plans for update to authenticated using (public.is_admin()) with check (public.is_admin());

update public.points_settings set member_bonus = 0;

alter table public.points_settings
  add column if not exists member_restore_days integer not null default 30 check (member_restore_days between 7 and 365);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  via text not null check (via in ('stripe', 'admin')),
  plan text check (plan in ('month', 'year')),
  status text not null default 'active',
  active_until timestamptz, -- null: no end (an admin comp)
  cancel_at timestamptz, -- they cancelled; it runs until then
  stripe_customer text,
  stripe_subscription text,
  synced_at timestamptz, -- Stripe event time, so an older event can't undo a newer one
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.memberships enable row level security;
drop policy if exists "you and admins see your membership" on public.memberships;
create policy "you and admins see your membership" on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 021's guard (nobody can make themselves a member) lets these functions through.
create or replace function public.guard_profile_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No auth.uid(): the SQL editor, a migration, or Stripe's webhook.
  if auth.uid() is null or coalesce(current_setting('tunr.membership_sync', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_member := false;
    new.member_since := null;
  else
    new.is_member := old.is_member;
    new.member_since := old.member_since;
  end if;
  return new;
end;
$$;

-- Admin changes to prices and memberships go in the admin log (094).
do $$
declare t text;
begin
  foreach t in array array['membership_plans', 'memberships'] loop
    execute format('drop trigger if exists log_admin_change on public.%I', t);
    execute format('create trigger log_admin_change after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t);
  end loop;
end $$;

-- Is this person a member right now? (A lapsed card ends it at active_until,
-- even if Stripe's cancel message never arrives.)
create or replace function public.member_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.all_access
        or (p.is_member and not exists (
              select 1 from public.memberships m
               where m.user_id = p.id and m.active_until is not null and m.active_until <= now()))
      from public.profiles p where p.id = p_user), false);
$$;
revoke execute on function public.member_active(uuid) from public, anon, authenticated;

-- 081's is_member(), now ending with the paid period.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_active(auth.uid());
$$;

create or replace function public.my_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.memberships;
begin
  select * into m from public.memberships where user_id = v_uid;
  return jsonb_build_object(
    'signed_in', v_uid is not null,
    'member', v_uid is not null and public.member_active(v_uid),
    'all_access', coalesce((select all_access from public.profiles where id = v_uid), false),
    'via', m.via,
    'plan', m.plan,
    'active_until', m.active_until,
    'cancel_at', m.cancel_at,
    'can_manage', m.stripe_customer is not null,
    'restore_days', (select member_restore_days from public.points_settings limit 1),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price_cents', price_cents) order by price_cents)
                         from public.membership_plans where active), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.my_membership() to anon, authenticated;

-- Before Checkout: can you join, and at what price (never from the phone).
create or replace function public.start_membership(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  k public.membership_plans;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into k from public.membership_plans where id = p_plan and active;
  if not found then
    return jsonb_build_object('status', 'bad_plan');
  end if;
  -- Already paying by card: change plan or cancel in billing, don't pay twice.
  if public.member_active(v_uid) and exists (
       select 1 from public.memberships where user_id = v_uid and via = 'stripe' and status in ('active', 'trialing', 'past_due')) then
    return jsonb_build_object('status', 'already');
  end if;
  return jsonb_build_object('status', 'ok', 'plan', k.id, 'name', k.name, 'price_cents', k.price_cents,
    'customer', (select stripe_customer from public.memberships where user_id = v_uid));
end;
$$;
revoke execute on function public.start_membership(text) from public, anon;
grant execute on function public.start_membership(text) to authenticated;

-- Stripe's webhook (api/stripe-webhook, service key): a checkout finished or
-- a subscription changed. Active, trialing and past_due (Stripe is retrying
-- the card) count as members until the paid period ends.
create or replace function public.sync_membership(
  p_user uuid, p_status text, p_plan text, p_until timestamptz, p_cancel_at timestamptz,
  p_customer text, p_subscription text, p_event_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.memberships;
  v_on boolean := p_status in ('active', 'trialing', 'past_due');
  v_plan text := case when p_plan in ('month', 'year') then p_plan end;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_member:' || p_user::text));
  select * into m from public.memberships where user_id = p_user;
  if m.synced_at is not null and p_event_at < m.synced_at then
    return jsonb_build_object('status', 'stale'); -- Stripe sent them out of order
  end if;
  -- A cancelled old subscription mustn't end a newer one.
  if not v_on and m.stripe_subscription is not null and p_subscription is not null and m.stripe_subscription <> p_subscription then
    return jsonb_build_object('status', 'other_subscription');
  end if;
  insert into public.memberships as t (user_id, via, plan, status, active_until, cancel_at, stripe_customer, stripe_subscription, synced_at)
  values (p_user, 'stripe', v_plan, coalesce(p_status, 'active'),
          -- Until Stripe says the exact date: a month (or year) and a few days.
          case when v_on then coalesce(p_until, now() + case when v_plan = 'year' then interval '370 days' else interval '35 days' end) else now() end,
          case when v_on then p_cancel_at end, p_customer, p_subscription, p_event_at)
  on conflict (user_id) do update set
    via = 'stripe',
    plan = coalesce(v_plan, t.plan),
    status = coalesce(p_status, t.status),
    active_until = case when v_on then coalesce(p_until, greatest(t.active_until, now() + case when coalesce(v_plan, t.plan) = 'year' then interval '370 days' else interval '35 days' end)) else now() end,
    cancel_at = case when v_on then p_cancel_at end,
    stripe_customer = coalesce(p_customer, t.stripe_customer),
    stripe_subscription = coalesce(p_subscription, t.stripe_subscription),
    synced_at = p_event_at,
    started_at = case when not public.member_active(p_user) and v_on then now() else t.started_at end,
    updated_at = now();
  update public.profiles
     set is_member = v_on,
         member_since = case when v_on then coalesce(member_since, now()) else member_since end
   where id = p_user;
  return jsonb_build_object('status', 'ok', 'member', v_on);
end;
$$;
revoke execute on function public.sync_membership(uuid, text, text, timestamptz, timestamptz, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_membership(uuid, text, text, timestamptz, timestamptz, text, text, timestamptz) to service_role;

-- Admins: give someone membership (for p_days, or with no end) or take it away.
-- A card subscription has to be cancelled in Stripe; this won't touch one.
create or replace function public.admin_set_member(p_username text, p_on boolean, p_days integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  m public.memberships;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select id into v_user from public.profiles where lower(username) = lower(trim(leading '@' from trim(p_username)));
  if v_user is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    return jsonb_build_object('status', 'bad_days');
  end if;
  select * into m from public.memberships where user_id = v_user;
  if m.via = 'stripe' and m.status in ('active', 'trialing', 'past_due') and public.member_active(v_user) then
    return jsonb_build_object('status', 'paying'); -- cancel it in Stripe instead
  end if;
  insert into public.memberships as t (user_id, via, plan, status, active_until, stripe_customer)
  values (v_user, 'admin', null, case when p_on then 'active' else 'canceled' end,
          case when p_on then case when p_days is null then null else now() + make_interval(days => p_days) end else now() end, null)
  on conflict (user_id) do update set
    via = 'admin', plan = null, status = excluded.status, active_until = excluded.active_until, cancel_at = null,
    started_at = case when p_on and not public.member_active(v_user) then now() else t.started_at end,
    updated_at = now();
  perform set_config('tunr.membership_sync', 'on', true);
  update public.profiles
     set is_member = p_on, member_since = case when p_on then coalesce(member_since, now()) else member_since end
   where id = v_user;
  perform set_config('tunr.membership_sync', 'off', true);
  return jsonb_build_object('status', 'ok', 'user_id', v_user);
end;
$$;
revoke execute on function public.admin_set_member(text, boolean, integer) from public, anon;
grant execute on function public.admin_set_member(text, boolean, integer) to authenticated;

create or replace function public.membership_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  return (
    select jsonb_build_object(
      'members', count(*) filter (where public.member_active(m.user_id)),
      'paying', count(*) filter (where m.via = 'stripe' and public.member_active(m.user_id)),
      'free', count(*) filter (where m.via = 'admin' and public.member_active(m.user_id)),
      'cancelling', count(*) filter (where m.cancel_at is not null and public.member_active(m.user_id)),
      'monthly_cents', coalesce(sum(case when m.via = 'stripe' and public.member_active(m.user_id) then
                         case m.plan when 'year' then (select price_cents from public.membership_plans where id = 'year') / 12
                                     else (select price_cents from public.membership_plans where id = 'month') end end), 0),
      'recent', coalesce((
        select jsonb_agg(r order by r.updated_at desc) from (
          select p.username, x.via, x.plan, x.status, x.active_until, x.cancel_at, x.updated_at, public.member_active(x.user_id) as member
            from public.memberships x join public.profiles p on p.id = x.user_id
           order by x.updated_at desc limit 30) r), '[]'::jsonb))
    from public.memberships m);
end;
$$;
revoke execute on function public.membership_stats() from public, anon;
grant execute on function public.membership_stats() to authenticated;

-- 081's invite unlocks: members get them without inviting.
create or replace function public.my_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_member boolean;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  v_count := public.confirmed_invites(v_uid);
  v_member := public.is_member() or public.is_admin();
  return jsonb_build_object(
    'status', 'ok',
    'code', (select invite_code from public.profiles where id = v_uid),
    'confirmed', v_count,
    'pending', (select count(*) from public.profiles p
                 where p.invited_by = v_uid and not public.email_confirmed(p.id)),
    'member', public.is_member(),
    'unlocked', jsonb_build_object(
      'cars', v_count >= 1 or v_member,
      'clubs', v_count >= 1 or v_member,
      'flair', v_count >= 5 or v_member
    ),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'username', p.username,
               'confirmed', public.email_confirmed(p.id),
               'joined', p.invited_at,
               'via', coalesce(p.invited_via, 'link'),
               'car', (select trim(coalesce(v.year::text, '') || ' ' || v.make || ' ' || v.model) from public.vehicles v where v.id = p.invited_vehicle),
               'points', (select r.paid from public.referral_payouts r where r.referred_id = p.id))
             order by p.invited_at desc nulls last)
        from public.profiles p where p.invited_by = v_uid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.guard_profile_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.invite_code is null or auth.uid() is not null then
      new.invite_code := public.gen_invite_code();
    end if;
    if auth.uid() is not null then
      new.invited_by := null;
      new.invited_at := null;
      new.invited_via := null;
      new.invited_vehicle := null;
      new.profile_color := null;
    end if;
    return new;
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.invite_code := old.invite_code;
  if coalesce(current_setting('tunr.claiming_invite', true), '') <> 'on' then
    new.invited_by := old.invited_by;
    new.invited_at := old.invited_at;
    new.invited_via := old.invited_via;
    new.invited_vehicle := old.invited_vehicle;
  end if;
  if new.profile_color is distinct from old.profile_color and new.profile_color is not null
     and public.confirmed_invites(new.id) < 5 and not public.member_active(new.id) then
    raise exception 'invite_to_unlock_flair';
  end if;
  return new;
end;
$$;

create or replace function public.lock_extra_cars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and not public.member_active(new.owner_id)
     and (select count(*) from public.vehicles where owner_id = new.owner_id) = 1
     and public.confirmed_invites(new.owner_id) < 1 then
    raise exception 'invite_to_unlock_cars';
  end if;
  return new;
end;
$$;

create or replace function public.lock_new_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and not public.member_active(new.created_by)
     and not exists (select 1 from public.clubs where created_by = new.created_by)
     and public.confirmed_invites(new.created_by) < 1 then
    raise exception 'invite_to_unlock_clubs';
  end if;
  return new;
end;
$$;

-- 121's streak restore: membership ends with the paid period, and the wait
-- between restores is points_settings.member_restore_days (30 by default).
create or replace function public.pit_stop_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  t public.daily_pit_stops;
  y public.daily_pit_stops;
  l record;
  v_member boolean;
  v_restore_at timestamptz;
  v_lost int := 0;
begin
  if v_uid is null then
    return null;
  end if;
  select * into s from public.points_settings limit 1;
  select * into t from public.daily_pit_stops where user_id = v_uid and day = public.atl_today();
  select * into y from public.daily_pit_stops where user_id = v_uid and day = public.atl_today() - 1;
  select * into l from public.pit_stop_lost(v_uid);
  if l.last_day is not null and l.last_day >= public.atl_today() - 7 then
    v_lost := l.streak;
  end if;
  v_member := public.member_active(v_uid);
  select max(used_at) + make_interval(days => coalesce(s.member_restore_days, 30)) into v_restore_at
    from public.pit_stop_restores where user_id = v_uid;
  return jsonb_build_object(
    'on', coalesce(s.daily_points, 0) > 0,
    'today_done', t.day is not null,
    'streak', coalesce(t.streak, y.streak, 0),
    'daily_points', s.daily_points,
    'streak_bonus', s.daily_streak_bonus,
    'lost_streak', v_lost,
    'member', v_member,
    'restore_days', coalesce(s.member_restore_days, 30),
    'can_restore', v_member and v_lost > 0 and (v_restore_at is null or v_restore_at <= now()),
    'restore_at', case when v_restore_at > now() then v_restore_at end
  );
end;
$$;

create or replace function public.restore_pit_stop()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l record;
  v_days int := coalesce((select member_restore_days from public.points_settings limit 1), 30);
  v_restore_at timestamptz;
  v_streak int;
  d date;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.member_active(v_uid) then
    return jsonb_build_object('status', 'not_member');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  select * into l from public.pit_stop_lost(v_uid);
  if l.last_day is null or l.last_day < public.atl_today() - 7 then
    return jsonb_build_object('status', 'nothing_to_restore');
  end if;
  select max(used_at) + make_interval(days => v_days) into v_restore_at from public.pit_stop_restores where user_id = v_uid;
  if v_restore_at > now() then
    return jsonb_build_object('status', 'too_soon', 'restore_at', v_restore_at);
  end if;
  v_streak := l.streak;
  d := l.last_day + 1;
  while d <= public.atl_today() - 1 loop
    v_streak := v_streak + 1;
    insert into public.daily_pit_stops (user_id, day, streak, points) values (v_uid, d, v_streak, 0);
    d := d + 1;
  end loop;
  insert into public.pit_stop_restores (user_id, restored_streak) values (v_uid, v_streak);
  return jsonb_build_object('status', 'ok', 'streak', v_streak, 'restore_at', now() + make_interval(days => v_days));
end;
$$;
