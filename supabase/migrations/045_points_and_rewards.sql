-- Points and rewards: points for showing up at meets, traded for merch and
-- vendor discounts.
--
-- Every reward is guaranteed (spend points, get the thing), never a draw, so
-- this is a loyalty program and not a raffle. The rules are built to be hard
-- to game:
--   * Points only come from checking in AT a meet: during its hours, within
--     about a quarter mile of its pin, with the code the host shows there.
--   * Only meets an admin has switched on ("points meets") pay out, so nobody
--     can post a fake meet and check their friends in.
--   * Hosts don't earn at their own meets. One check-in per meet per day,
--     three a day at most.
--   * RSVPing pays nothing on its own: the bonus for saying you'd come lands
--     only when you check in.
--   * The getting-started bonuses are one-time, and nothing can be redeemed
--     until the account is 14 days old and has checked in at 2 meets.
--   * The ledger is written only by the functions below, never by the app.
-- The check-in keeps only how far you were from the pin, not where you were.

-- ============ POINTS MEETS ============
create table if not exists public.points_meets (
  event_id uuid primary key references public.events (id) on delete cascade,
  enabled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.points_meets enable row level security;

drop policy if exists "points meets are public" on public.points_meets;
create policy "points meets are public"
  on public.points_meets for select
  to anon, authenticated
  using (true);
-- Switched on and off through set_points_meet, admins only.

-- One secret per meet; the check-in code for a day is derived from it, so
-- each occurrence of a weekly meet gets a fresh code. No policies: only the
-- functions here read it.
create table if not exists public.checkin_secrets (
  event_id uuid primary key references public.events (id) on delete cascade,
  secret text not null
);

alter table public.checkin_secrets enable row level security;

-- ============ CHECK-INS ============
create table if not exists public.meet_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  -- The meet's day, in venue time.
  occurrence date not null,
  distance_m integer not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  unique (user_id, event_id, occurrence)
);

create index if not exists meet_checkins_user_idx on public.meet_checkins (user_id, created_at desc);
create index if not exists meet_checkins_event_idx on public.meet_checkins (event_id, occurrence);

alter table public.meet_checkins enable row level security;

drop policy if exists "users see their own check-ins" on public.meet_checkins;
create policy "users see their own check-ins"
  on public.meet_checkins for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create table if not exists public.checkin_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists checkin_attempts_user_idx on public.checkin_attempts (user_id, created_at desc);

alter table public.checkin_attempts enable row level security;

-- ============ LEDGER ============
create table if not exists public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'checkin', 'rsvp_bonus', 'starter_profile', 'starter_car', 'starter_alerts',
    'redeem', 'refund', 'revoke', 'admin_adjust'
  )),
  event_id uuid references public.events (id) on delete set null,
  occurrence date,
  redemption_id uuid,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists point_ledger_user_idx on public.point_ledger (user_id, created_at desc);
create unique index if not exists point_ledger_starter_once
  on public.point_ledger (user_id, reason) where reason like 'starter_%';

alter table public.point_ledger enable row level security;

drop policy if exists "users see their own points" on public.point_ledger;
create policy "users see their own points"
  on public.point_ledger for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ============ REWARDS ============
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (char_length(description) <= 400),
  kind text not null default 'merch' check (kind in ('merch', 'discount', 'experience', 'other')),
  cost integer not null check (cost between 1 and 100000),
  partner_id uuid references public.partners (id) on delete set null,
  how_to_claim text check (char_length(how_to_claim) <= 300),
  -- Null means no limit.
  stock integer check (stock >= 0),
  per_person integer not null default 1 check (per_person between 1 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rewards enable row level security;

drop policy if exists "live rewards are public" on public.rewards;
create policy "live rewards are public"
  on public.rewards for select
  to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "admins manage rewards" on public.rewards;
create policy "admins manage rewards"
  on public.rewards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists rewards_touch_updated_at on public.rewards;
create trigger rewards_touch_updated_at
  before update on public.rewards
  for each row execute function public.touch_updated_at();

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  -- Restrict: a reward someone has redeemed is switched off, not deleted,
  -- so their claim keeps working.
  reward_id uuid not null references public.rewards (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  cost integer not null,
  -- What the winner shows the vendor (or you) to collect.
  claim_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);

create index if not exists reward_redemptions_user_idx on public.reward_redemptions (user_id, created_at desc);
create index if not exists reward_redemptions_status_idx on public.reward_redemptions (status, created_at desc);

alter table public.reward_redemptions enable row level security;

drop policy if exists "users see their own redemptions" on public.reward_redemptions;
create policy "users see their own redemptions"
  on public.reward_redemptions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ============ WHEN A MEET IS ON ============
-- Same calendar rules as src/lib/dates.js: weekly:SAT, monthly:first|second|
-- third|fourth|last:SUN, a series starting on its first date and stopping
-- after recurrence_until.
create or replace function public.meet_occurs_on(e public.events, d date)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(e.timezone, 'America/New_York');
  v_parts text[];
  v_dow int;
  v_nth int;
begin
  if e.start_at is null then
    return false;
  end if;
  if e.recurrence is null then
    return d = (e.start_at at time zone v_tz)::date;
  end if;
  if d < (e.start_at at time zone v_tz)::date
     or (e.recurrence_until is not null and d > e.recurrence_until) then
    return false;
  end if;

  v_parts := string_to_array(e.recurrence, ':');
  if v_parts[1] = 'weekly' then
    v_dow := array_position(array['SUN','MON','TUE','WED','THU','FRI','SAT'], v_parts[2]) - 1;
    return v_dow is not null and extract(dow from d) = v_dow;
  end if;
  if v_parts[1] = 'monthly' then
    v_dow := array_position(array['SUN','MON','TUE','WED','THU','FRI','SAT'], v_parts[3]) - 1;
    if v_dow is null or extract(dow from d) <> v_dow then
      return false;
    end if;
    if v_parts[2] = 'last' then
      return extract(month from d + 7) <> extract(month from d);
    end if;
    v_nth := array_position(array['first','second','third','fourth'], v_parts[2]) - 1;
    return v_nth is not null and (extract(day from d)::int - 1) / 7 = v_nth;
  end if;
  return false;
end;
$$;

-- The occurrence a moment falls in: from 30 minutes before the start to the
-- end (start + 4 hours when no end is listed). Empty when the meet isn't on.
create or replace function public.meet_window(p_event uuid, p_at timestamptz default now())
returns table (occurrence date, starts timestamptz, ends timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.events;
  v_tz text;
  v_start time;
  v_len interval;
  v_day date;
  v_s timestamptz;
  v_e timestamptz;
begin
  select * into e from public.events where id = p_event;
  if not found or e.start_at is null then
    return;
  end if;
  v_tz := coalesce(e.timezone, 'America/New_York');

  if e.recurrence is null then
    v_s := e.start_at;
    v_e := case when e.end_at > e.start_at then e.end_at else e.start_at + interval '4 hours' end;
    if p_at between v_s - interval '30 minutes' and v_e then
      return query select (v_s at time zone v_tz)::date, v_s, v_e;
    end if;
    return;
  end if;

  v_start := (e.start_at at time zone v_tz)::time;
  v_len := case
    when e.end_at is null then interval '4 hours'
    else (e.end_at at time zone v_tz)::time - v_start
  end;
  -- An end time before the start time means it runs past midnight.
  if v_len <= interval '0' then
    v_len := v_len + interval '24 hours';
  end if;

  -- Yesterday's occurrence can still be running after midnight.
  foreach v_day in array array[(p_at at time zone v_tz)::date - 1, (p_at at time zone v_tz)::date] loop
    if public.meet_occurs_on(e, v_day) then
      v_s := (v_day + v_start) at time zone v_tz;
      v_e := v_s + v_len;
      if p_at between v_s - interval '30 minutes' and v_e then
        return query select v_day, v_s, v_e;
        return;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.meet_window(uuid, timestamptz) from public, anon;
grant execute on function public.meet_window(uuid, timestamptz) to authenticated;

-- Six characters, no look-alikes (no 0/O, 1/I/L), fresh for each day.
create or replace function public.checkin_code_for(p_event uuid, p_day date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_hash text;
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i int;
begin
  select secret into v_secret from public.checkin_secrets where event_id = p_event;
  if v_secret is null then
    v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.checkin_secrets (event_id, secret) values (p_event, v_secret)
    on conflict (event_id) do nothing;
    select secret into v_secret from public.checkin_secrets where event_id = p_event;
  end if;
  v_hash := md5(v_secret || ':' || p_day::text);
  for i in 0..5 loop
    v_code := v_code || substr(v_alpha, (('x' || substr(v_hash, i * 4 + 1, 4))::bit(16)::int % 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.checkin_code_for(uuid, date) from public, anon, authenticated;

-- ============ ADMIN: WHICH MEETS PAY POINTS ============
create or replace function public.set_points_meet(p_event uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if p_on then
    insert into public.points_meets (event_id, enabled_by) values (p_event, auth.uid())
    on conflict (event_id) do nothing;
  else
    delete from public.points_meets where event_id = p_event;
  end if;
end;
$$;

revoke execute on function public.set_points_meet(uuid, boolean) from public, anon;
grant execute on function public.set_points_meet(uuid, boolean) to authenticated;

-- The code for the host (owner or co-host) or an admin to show at the meet:
-- today's, so it can go on a sign before the meet starts.
create or replace function public.get_checkin_code(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events;
  v_day date;
begin
  if not (public.is_admin() or public.is_event_host(p_event)) then
    return jsonb_build_object('status', 'not_host');
  end if;
  if not exists (select 1 from public.points_meets where event_id = p_event) then
    return jsonb_build_object('status', 'not_points_meet');
  end if;
  select * into e from public.events where id = p_event;
  select w.occurrence into v_day from public.meet_window(p_event) w;
  if v_day is null then
    v_day := (now() at time zone coalesce(e.timezone, 'America/New_York'))::date;
    if not public.meet_occurs_on(e, v_day) then
      return jsonb_build_object('status', 'not_today');
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'code', public.checkin_code_for(p_event, v_day), 'day', v_day);
end;
$$;

revoke execute on function public.get_checkin_code(uuid) from public, anon;
grant execute on function public.get_checkin_code(uuid) to authenticated;

-- ============ CHECKING IN ============
-- Returns a status the app turns into a message: ok, not_signed_in,
-- unconfirmed, rate_limited, not_found, not_points_meet, own_meet,
-- not_happening, no_pin, location_needed, weak_location, too_far,
-- wrong_code, already, daily_limit.
create or replace function public.check_in_at_meet(
  p_event uuid,
  p_code text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  w record;
  v_dist double precision;
  v_today int;
  v_points int := 10;
  v_bonus int := 0;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  -- Logged before anything is checked, so codes can't be guessed.
  if (select count(*) from public.checkin_attempts
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 15 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.checkin_attempts (user_id) values (v_uid);

  select * into e from public.events where id = p_event;
  if not found or e.hidden or not public.can_access_event(p_event) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not exists (select 1 from public.points_meets where event_id = p_event) then
    return jsonb_build_object('status', 'not_points_meet');
  end if;
  if e.created_by = v_uid or public.is_event_host(p_event) then
    return jsonb_build_object('status', 'own_meet');
  end if;

  select * into w from public.meet_window(p_event);
  if w.occurrence is null then
    return jsonb_build_object('status', 'not_happening');
  end if;

  if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     <> public.checkin_code_for(p_event, w.occurrence) then
    return jsonb_build_object('status', 'wrong_code');
  end if;

  if e.lat is null or e.lng is null then
    return jsonb_build_object('status', 'no_pin');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'location_needed');
  end if;
  if p_accuracy is null or p_accuracy > 150 then
    return jsonb_build_object('status', 'weak_location');
  end if;
  v_dist := public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34;
  if v_dist > 400 then
    return jsonb_build_object('status', 'too_far', 'distance_m', round(v_dist));
  end if;

  -- One person's check-ins and redemptions run one at a time.
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));

  if exists (select 1 from public.meet_checkins
              where user_id = v_uid and event_id = p_event and occurrence = w.occurrence) then
    return jsonb_build_object('status', 'already');
  end if;

  select count(*) into v_today from public.meet_checkins
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 3 then
    return jsonb_build_object('status', 'daily_limit');
  end if;

  insert into public.meet_checkins (user_id, event_id, occurrence, distance_m)
  values (v_uid, p_event, w.occurrence, round(v_dist))
  returning id into v_id;

  insert into public.point_ledger (user_id, delta, reason, event_id, occurrence)
  values (v_uid, v_points, 'checkin', p_event, w.occurrence);

  -- Said they were going before it started.
  if exists (select 1 from public.rsvps r
              where r.user_id = v_uid and r.event_id = p_event
                and r.status = 'going' and r.created_at < w.starts) then
    v_bonus := 5;
    insert into public.point_ledger (user_id, delta, reason, event_id, occurrence)
    values (v_uid, v_bonus, 'rsvp_bonus', p_event, w.occurrence);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'points', v_points + v_bonus,
    'rsvp_bonus', v_bonus > 0,
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid)
  );
end;
$$;

revoke execute on function public.check_in_at_meet(uuid, text, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in_at_meet(uuid, text, double precision, double precision, double precision) to authenticated;

-- ============ GETTING-STARTED BONUSES ============
-- One-time, checked here rather than trusted from the app. Returns which are
-- done and how many points this call added.
create or replace function public.claim_starter_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile boolean;
  v_car boolean;
  v_alerts boolean;
  v_added int := 0;
  v_n int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;

  select coalesce(p.username, '') <> '' and p.avatar_url is not null and coalesce(btrim(p.bio), '') <> ''
    into v_profile from public.profiles p where p.id = v_uid;
  v_profile := coalesce(v_profile, false);
  v_car := exists (select 1 from public.vehicles where owner_id = v_uid);
  v_alerts := exists (select 1 from public.push_subscriptions where user_id = v_uid);

  if public.email_confirmed(v_uid) then
    if v_profile then
      insert into public.point_ledger (user_id, delta, reason) values (v_uid, 10, 'starter_profile')
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_added := v_added + v_n * 10;
    end if;
    if v_car then
      insert into public.point_ledger (user_id, delta, reason) values (v_uid, 10, 'starter_car')
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_added := v_added + v_n * 10;
    end if;
    if v_alerts then
      insert into public.point_ledger (user_id, delta, reason) values (v_uid, 5, 'starter_alerts')
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_added := v_added + v_n * 5;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'added', v_added,
    'confirmed', public.email_confirmed(v_uid),
    'profile', exists (select 1 from public.point_ledger where user_id = v_uid and reason = 'starter_profile'),
    'car', exists (select 1 from public.point_ledger where user_id = v_uid and reason = 'starter_car'),
    'alerts', exists (select 1 from public.point_ledger where user_id = v_uid and reason = 'starter_alerts')
  );
end;
$$;

revoke execute on function public.claim_starter_points() from public, anon;
grant execute on function public.claim_starter_points() to authenticated;

-- ============ BALANCE ============
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
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  return jsonb_build_object(
    'status', 'ok',
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid),
    'earned', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid and delta > 0),
    'checkins', v_checkins,
    'account_days', coalesce(v_age_days, 0),
    'can_redeem', coalesce(v_age_days, 0) >= 14 and v_checkins >= 2 and public.email_confirmed(v_uid)
  );
end;
$$;

revoke execute on function public.my_points() from public, anon;
grant execute on function public.my_points() to authenticated;

-- ============ REDEEMING ============
-- ok, not_signed_in, unconfirmed, too_new, need_checkins, not_found,
-- sold_out, limit, not_enough.
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

  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  if v_checkins < 2 then
    return jsonb_build_object('status', 'need_checkins', 'checkins', v_checkins);
  end if;

  select * into r from public.rewards where id = p_reward and active for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
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

  -- Eight characters from the same no-look-alikes alphabet.
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

revoke execute on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ============ ADMIN TOOLS ============
-- Hand over (fulfilled) or cancel a claim. Cancelling gives the points back
-- and puts the item back in stock.
create or replace function public.decide_redemption(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.reward_redemptions;
  v_title text;
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
     set status = p_status, decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  select title into v_title from public.rewards where id = d.reward_id;
  if p_status = 'cancelled' then
    insert into public.point_ledger (user_id, delta, reason, redemption_id, note, created_by)
    values (d.user_id, d.cost, 'refund', d.id, left('Cancelled: ' || coalesce(v_title, 'reward'), 200), auth.uid());
    update public.rewards set stock = stock + 1 where id = d.reward_id and stock is not null;
    perform public.notify(d.user_id, 'reward', 'Reward cancelled, points returned',
      coalesce(v_title, 'Your reward') || ' was cancelled and ' || d.cost || ' points went back to you.', null, null);
  else
    perform public.notify(d.user_id, 'reward', '🎁 Reward handed over',
      coalesce(v_title, 'Your reward') || ' is marked as collected. Enjoy!', null, null);
  end if;
end;
$$;

revoke execute on function public.decide_redemption(uuid, text) from public, anon;
grant execute on function public.decide_redemption(uuid, text) to authenticated;

-- Take back the points from a check-in that shouldn't have counted.
create or replace function public.void_checkin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.meet_checkins;
  v_points int;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into c from public.meet_checkins where id = p_id for update;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if c.voided_at is not null then
    raise exception 'checkin_already_voided';
  end if;
  update public.meet_checkins set voided_at = now(), voided_by = auth.uid() where id = p_id;
  select coalesce(sum(delta), 0) into v_points from public.point_ledger
   where user_id = c.user_id and event_id = c.event_id and occurrence = c.occurrence
     and reason in ('checkin', 'rsvp_bonus');
  if v_points > 0 then
    insert into public.point_ledger (user_id, delta, reason, event_id, occurrence, note, created_by)
    values (c.user_id, -v_points, 'revoke', c.event_id, c.occurrence, 'Check-in removed by TUNR', auth.uid());
  end if;
end;
$$;

revoke execute on function public.void_checkin(uuid) from public, anon;
grant execute on function public.void_checkin(uuid) to authenticated;

create or replace function public.adjust_points(p_user uuid, p_delta int, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if coalesce(p_delta, 0) = 0 or abs(p_delta) > 10000 then
    raise exception 'bad_points_amount';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'note_required';
  end if;
  insert into public.point_ledger (user_id, delta, reason, note, created_by)
  values (p_user, p_delta, 'admin_adjust', left(btrim(p_note), 200), auth.uid());
end;
$$;

revoke execute on function public.adjust_points(uuid, int, text) from public, anon;
grant execute on function public.adjust_points(uuid, int, text) to authenticated;

-- Claims with who made them, newest first, for the admin page.
create or replace function public.redemption_queue(p_status text default 'pending')
returns table (
  id uuid, claim_code text, status text, cost int, created_at timestamptz,
  reward_title text, user_id uuid, username text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.claim_code, d.status, d.cost, d.created_at, r.title, d.user_id, p.username
    from public.reward_redemptions d
    join public.rewards r on r.id = d.reward_id
    left join public.profiles p on p.id = d.user_id
   where public.is_admin() and d.status = p_status
   order by d.created_at desc
   limit 200;
$$;

revoke execute on function public.redemption_queue(text) from public, anon;
grant execute on function public.redemption_queue(text) to authenticated;

-- Recent check-ins across all meets, so odd patterns stand out.
create or replace function public.recent_checkins()
returns table (
  id uuid, created_at timestamptz, occurrence date, distance_m int, voided boolean,
  event_id uuid, event_title text, user_id uuid, username text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.created_at, c.occurrence, c.distance_m, c.voided_at is not null,
         c.event_id, e.title, c.user_id, p.username
    from public.meet_checkins c
    join public.events e on e.id = c.event_id
    left join public.profiles p on p.id = c.user_id
   where public.is_admin()
   order by c.created_at desc
   limit 200;
$$;

revoke execute on function public.recent_checkins() from public, anon;
grant execute on function public.recent_checkins() to authenticated;
