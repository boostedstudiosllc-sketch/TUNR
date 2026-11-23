-- Boost Day: one weekday a week, people who opt in get bonus points for
-- RSVPing to a meet (before it starts) and showing up: check in on site,
-- then confirm they're still there about 20 minutes later. Free to enter,
-- nothing to lose: a loyalty bonus, not a bet.
--
-- Picking the day (every Sunday, by the daily job; admins can change it):
-- the weekdays (Mon–Fri) of the coming week that have meets; each scored
-- by total RSVPs: half the RSVPs those meets have so far, half the average
-- for that weekday over the last 4 weeks. The lowest score wins (the
-- slow day gets the push). Members only see it on the day.
--
--   points_settings.boost_points (10; 0 turns it off), boost_stay_minutes
--   (20), boost_radius_m (400)
--   boost_days            the picked day per week (admins see all; people
--                         see today's through boost_status)
--   boost_entries         who opted in, where they checked in, when paid
--   pick_boost_day(monday)       the Sunday pick (service key)
--   admin_set_boost_day(monday, day) / admin_boost_week(monday)
--   boost_status()               today's boost and where you are with it
--   boost_opt_in()
--   boost_check_in(event, lat, lng)   step 1, at the meet
--   boost_confirm(lat, lng)           step 2, 20+ minutes later → paid
--   queue_boost_reminders()      "tap to finish" once 20 minutes are up
--   boost_morning_alerts()       the Boost Day morning alert (daily job)

alter table public.points_settings
  add column if not exists boost_points integer not null default 10 check (boost_points between 0 and 100),
  add column if not exists boost_stay_minutes integer not null default 20 check (boost_stay_minutes between 5 and 120),
  add column if not exists boost_radius_m integer not null default 400 check (boost_radius_m between 100 and 2000);

alter table public.alert_settings add column if not exists boost boolean not null default true;

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus', 'guess_bonus', 'taco_bonus', 'scratch_buy', 'scratch_win', 'daily_bonus', 'boost_bonus'
));

create table if not exists public.boost_days (
  week_start date primary key check (extract(isodow from week_start) = 1), -- the Monday
  day date not null check (extract(isodow from day) between 1 and 5),
  picked_by text not null default 'auto' check (picked_by in ('auto', 'admin')),
  scores jsonb not null default '{}'::jsonb,
  picked_at timestamptz not null default now(),
  alerted_at timestamptz,
  check (day between week_start and week_start + 4)
);
alter table public.boost_days enable row level security;
drop policy if exists "admins see boost days" on public.boost_days;
create policy "admins see boost days" on public.boost_days for select to authenticated using (public.is_admin());

create table if not exists public.boost_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  opted_in_at timestamptz not null default now(),
  event_id uuid references public.events (id) on delete set null,
  checked_in_at timestamptz,
  check_in_distance_m integer,
  reminded_at timestamptz,
  confirmed_at timestamptz,
  confirm_distance_m integer,
  points integer,
  primary key (user_id, day)
);
create index if not exists boost_entries_waiting_idx on public.boost_entries (checked_in_at) where confirmed_at is null and reminded_at is null;
alter table public.boost_entries enable row level security;
drop policy if exists "you and admins see boost entries" on public.boost_entries;
create policy "you and admins see boost entries" on public.boost_entries for select to authenticated using (user_id = auth.uid() or public.is_admin());

do $$
begin
  execute 'drop trigger if exists log_admin_change on public.boost_days';
  execute 'create trigger log_admin_change after insert or update or delete on public.boost_days for each row execute function public.log_admin_change()';
end $$;

-- Does this meet happen on this day (venue time)? Handles one-offs,
-- 'weekly:WED' and 'monthly:first|second|third|fourth|last:THU'.
create or replace function public.meet_on_day(e public.events, d date)
returns boolean
language sql
stable
as $$
  select case
    when e.recurrence is null then (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date = d
    else d >= (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date
         and (e.recurrence_until is null or d <= e.recurrence_until)
         and upper(split_part(e.recurrence, ':', -1)) = upper(to_char(d, 'DY'))
         and case split_part(e.recurrence, ':', 1)
               when 'weekly' then true
               when 'monthly' then case split_part(e.recurrence, ':', 2)
                 when 'first' then extract(day from d) <= 7
                 when 'second' then extract(day from d) between 8 and 14
                 when 'third' then extract(day from d) between 15 and 21
                 when 'fourth' then extract(day from d) between 22 and 28
                 when 'last' then extract(month from d + 7) <> extract(month from d)
                 else false end
               else false end
  end;
$$;

-- When the meet starts and ends on that day.
create or replace function public.meet_start_on(e public.events, d date)
returns timestamptz
language sql
stable
as $$
  select case when e.recurrence is null then e.start_at
              else (d + (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::time) at time zone coalesce(e.timezone, 'America/New_York') end;
$$;
create or replace function public.meet_end_on(e public.events, d date)
returns timestamptz
language sql
stable
as $$
  select public.meet_start_on(e, d) + coalesce(e.end_at - e.start_at, interval '3 hours');
$$;

-- Total "going" RSVPs for the meets on a day.
create or replace function public.day_rsvps(d date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(r.*), 0)::int
    from public.events e
    join public.rsvps r on r.event_id = e.id and r.status = 'going'
   where not coalesce(e.hidden, false) and public.meet_on_day(e, d);
$$;

-- The Sunday pick for the week starting p_monday. Days without meets are
-- skipped; an admin's pick is never replaced. → { status, day, scores }
create or replace function public.pick_boost_day(p_monday date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  v_meets int;
  v_now int;
  v_past numeric;
  v_score numeric;
  v_best date;
  v_best_score numeric;
  v_scores jsonb := '{}'::jsonb;
  b public.boost_days;
begin
  if extract(isodow from p_monday) <> 1 then
    raise exception 'not_a_monday';
  end if;
  select * into b from public.boost_days where week_start = p_monday;
  if found and b.picked_by = 'admin' then
    return jsonb_build_object('status', 'admin_picked', 'day', b.day);
  end if;
  for i in 0..4 loop
    d := p_monday + i;
    select count(*) into v_meets from public.events e where not coalesce(e.hidden, false) and public.meet_on_day(e, d);
    if v_meets = 0 then
      continue;
    end if;
    v_now := public.day_rsvps(d);
    select avg(public.day_rsvps(d - 7 * k)) into v_past from generate_series(1, 4) k;
    v_score := round(0.5 * v_now + 0.5 * coalesce(v_past, 0), 2);
    v_scores := v_scores || jsonb_build_object(d::text, jsonb_build_object('meets', v_meets, 'rsvps_now', v_now, 'avg_4_weeks', round(coalesce(v_past, 0), 2), 'score', v_score));
    if v_best is null or v_score < v_best_score then
      v_best := d;
      v_best_score := v_score;
    end if;
  end loop;
  if v_best is null then
    delete from public.boost_days where week_start = p_monday and picked_by = 'auto';
    return jsonb_build_object('status', 'no_meets', 'scores', v_scores);
  end if;
  insert into public.boost_days (week_start, day, picked_by, scores) values (p_monday, v_best, 'auto', v_scores)
  on conflict (week_start) do update set day = excluded.day, scores = excluded.scores, picked_at = now()
    where public.boost_days.picked_by = 'auto' and public.boost_days.alerted_at is null;
  return jsonb_build_object('status', 'ok', 'day', v_best, 'scores', v_scores);
end;
$$;
revoke execute on function public.pick_boost_day(date) from public, anon, authenticated;
grant execute on function public.pick_boost_day(date) to service_role;

-- Admins: the week's pick and scores (worked out now if none is saved).
create or replace function public.admin_boost_week(p_monday date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.boost_days;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into b from public.boost_days where week_start = p_monday;
  if not found then
    perform public.pick_boost_day(p_monday);
    select * into b from public.boost_days where week_start = p_monday;
  end if;
  return jsonb_build_object('week_start', p_monday, 'day', b.day, 'picked_by', b.picked_by, 'scores', coalesce(b.scores, '{}'::jsonb), 'alerted', b.alerted_at is not null,
    'entries', (select count(*) from public.boost_entries where day = b.day),
    'paid', (select count(*) from public.boost_entries where day = b.day and confirmed_at is not null));
end;
$$;
revoke execute on function public.admin_boost_week(date) from public, anon;
grant execute on function public.admin_boost_week(date) to authenticated;

create or replace function public.admin_set_boost_day(p_monday date, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if extract(isodow from p_monday) <> 1 or p_day not between p_monday and p_monday + 4 then
    return jsonb_build_object('status', 'bad_day');
  end if;
  if p_day < public.atl_today() then
    return jsonb_build_object('status', 'past');
  end if;
  insert into public.boost_days (week_start, day, picked_by) values (p_monday, p_day, 'admin')
  on conflict (week_start) do update set day = excluded.day, picked_by = 'admin', picked_at = now();
  return jsonb_build_object('status', 'ok', 'day', p_day);
end;
$$;
revoke execute on function public.admin_set_boost_day(date, date) from public, anon;
grant execute on function public.admin_set_boost_day(date, date) to authenticated;

-- Today's boost and where you are with it. Nothing about other days.
create or replace function public.boost_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  en public.boost_entries;
  v_on boolean;
begin
  select * into s from public.points_settings limit 1;
  v_on := coalesce(s.boost_points, 0) > 0 and exists (select 1 from public.boost_days where day = public.atl_today());
  if not v_on then
    return jsonb_build_object('active', false);
  end if;
  select * into en from public.boost_entries where user_id = v_uid and day = public.atl_today();
  return jsonb_build_object(
    'active', true,
    'day', public.atl_today(),
    'points', s.boost_points,
    'stay_minutes', s.boost_stay_minutes,
    'opted_in', en.user_id is not null,
    'event_id', en.event_id,
    'event_title', (select title from public.events where id = en.event_id),
    'checked_in_at', en.checked_in_at,
    'confirm_at', en.checked_in_at + make_interval(mins => s.boost_stay_minutes),
    'confirmed_at', en.confirmed_at,
    'earned', en.points
  );
end;
$$;
grant execute on function public.boost_status() to anon, authenticated;

create or replace function public.boost_opt_in()
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
  if not ((public.boost_status()) ->> 'active')::boolean then
    return jsonb_build_object('status', 'not_today');
  end if;
  insert into public.boost_entries (user_id, day) values (v_uid, public.atl_today()) on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.boost_opt_in() from public, anon;
grant execute on function public.boost_opt_in() to authenticated;

-- Step 1, at the meet: opted in, RSVP'd going before it started, not a
-- host, while it's on (from 15 minutes before to the end), within reach.
create or replace function public.boost_check_in(p_event uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  en public.boost_entries;
  e public.events;
  v_today date := public.atl_today();
  v_start timestamptz;
  v_dist integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not ((public.boost_status()) ->> 'active')::boolean then
    return jsonb_build_object('status', 'not_today');
  end if;
  select * into s from public.points_settings limit 1;
  select * into en from public.boost_entries where user_id = v_uid and day = v_today for update;
  if not found then
    return jsonb_build_object('status', 'not_opted_in');
  end if;
  if en.confirmed_at is not null then
    return jsonb_build_object('status', 'already_paid');
  end if;
  select * into e from public.events where id = p_event and not coalesce(hidden, false);
  if not found or not public.meet_on_day(e, v_today) then
    return jsonb_build_object('status', 'not_today_meet');
  end if;
  if public.is_event_host(p_event) then
    return jsonb_build_object('status', 'own_meet');
  end if;
  v_start := public.meet_start_on(e, v_today);
  if not exists (select 1 from public.rsvps r where r.event_id = p_event and r.user_id = v_uid and r.status = 'going' and r.created_at < v_start) then
    return jsonb_build_object('status', 'no_rsvp');
  end if;
  if now() < v_start - interval '15 minutes' then
    return jsonb_build_object('status', 'too_early', 'starts_at', v_start);
  end if;
  if now() > public.meet_end_on(e, v_today) then
    return jsonb_build_object('status', 'meet_over');
  end if;
  if e.lat is null or p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'need_location');
  end if;
  v_dist := round(public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34);
  if v_dist > s.boost_radius_m then
    return jsonb_build_object('status', 'too_far', 'distance_m', v_dist);
  end if;
  -- Same meet again: keep the first time (the 20 minutes run from it).
  if en.event_id = p_event and en.checked_in_at is not null then
    return jsonb_build_object('status', 'ok', 'confirm_at', en.checked_in_at + make_interval(mins => s.boost_stay_minutes));
  end if;
  update public.boost_entries set event_id = p_event, checked_in_at = now(), check_in_distance_m = v_dist, reminded_at = null
   where user_id = v_uid and day = v_today;
  return jsonb_build_object('status', 'ok', 'confirm_at', now() + make_interval(mins => s.boost_stay_minutes));
end;
$$;
revoke execute on function public.boost_check_in(uuid, double precision, double precision) from public, anon;
grant execute on function public.boost_check_in(uuid, double precision, double precision) to authenticated;

-- Step 2: 20+ minutes later, still at the same meet (or within 30 minutes
-- of its end) → the bonus, once a day.
create or replace function public.boost_confirm(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  en public.boost_entries;
  e public.events;
  v_today date := public.atl_today();
  v_dist integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into s from public.points_settings limit 1;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  select * into en from public.boost_entries where user_id = v_uid and day = v_today for update;
  if not found then
    return jsonb_build_object('status', 'not_opted_in');
  end if;
  if en.confirmed_at is not null then
    return jsonb_build_object('status', 'already_paid', 'earned', en.points);
  end if;
  if en.checked_in_at is null then
    return jsonb_build_object('status', 'not_checked_in');
  end if;
  if now() < en.checked_in_at + make_interval(mins => s.boost_stay_minutes) then
    return jsonb_build_object('status', 'too_soon', 'confirm_at', en.checked_in_at + make_interval(mins => s.boost_stay_minutes));
  end if;
  select * into e from public.events where id = en.event_id;
  if not found or now() > public.meet_end_on(e, v_today) + interval '30 minutes' then
    return jsonb_build_object('status', 'meet_over');
  end if;
  if e.lat is null or p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'need_location');
  end if;
  v_dist := round(public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34);
  if v_dist > s.boost_radius_m then
    return jsonb_build_object('status', 'too_far', 'distance_m', v_dist);
  end if;
  update public.boost_entries set confirmed_at = now(), confirm_distance_m = v_dist, points = s.boost_points
   where user_id = v_uid and day = v_today;
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, s.boost_points, 'boost_bonus', left('Boost Day: ' || coalesce(e.title, 'a meet'), 120));
  perform public.notify(v_uid, 'boost', '🔥 Boost hit! +' || s.boost_points || ' points', 'You showed up to ' || left(coalesce(e.title, 'a meet'), 60) || ' on Boost Day.', 'open:boost', 'boost-paid:' || v_today);
  return jsonb_build_object('status', 'ok', 'earned', s.boost_points);
end;
$$;
revoke execute on function public.boost_confirm(double precision, double precision) from public, anon;
grant execute on function public.boost_confirm(double precision, double precision) to authenticated;

-- "Tap to finish": once the 20 minutes are up (run before alerts go out).
create or replace function public.queue_boost_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.points_settings;
  r record;
  v_n int := 0;
begin
  select * into s from public.points_settings limit 1;
  for r in
    select en.user_id, en.day from public.boost_entries en
     where en.day = public.atl_today() and en.confirmed_at is null and en.reminded_at is null
       and en.checked_in_at is not null and en.checked_in_at + make_interval(mins => s.boost_stay_minutes) <= now()
     for update skip locked
  loop
    perform public.notify(r.user_id, 'boost', '🔥 Tap to finish your Boost check-in', 'Your ' || s.boost_stay_minutes || ' minutes are up. Confirm you''re still at the meet to get +' || s.boost_points || '.', 'open:boost', 'boost-remind:' || r.day);
    update public.boost_entries set reminded_at = now() where user_id = r.user_id and day = r.day;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.queue_boost_reminders() from public, anon, authenticated;
grant execute on function public.queue_boost_reminders() to service_role;

-- The Boost Day morning alert, once (daily job). Everyone with an
-- account, unless they've turned Boost alerts off.
create or replace function public.boost_morning_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.points_settings;
  b public.boost_days;
  v_n int := 0;
begin
  select * into s from public.points_settings limit 1;
  select * into b from public.boost_days where day = public.atl_today() for update;
  if not found or b.alerted_at is not null or coalesce(s.boost_points, 0) = 0 then
    return 0;
  end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe, push)
  select p.id, 'boost', '🔥 It''s Boost Day!', 'Opt in, RSVP to any meet today before it starts, and show up for +' || s.boost_points || ' bonus points.', 'open:boost', 'boost-day:' || b.day,
         coalesce(a.activity, true)
    from public.profiles p
    left join public.alert_settings a on a.user_id = p.id
   where coalesce(a.boost, true) and public.email_confirmed(p.id)
  on conflict (user_id, dedupe) do nothing;
  get diagnostics v_n = row_count;
  update public.boost_days set alerted_at = now() where week_start = b.week_start;
  return v_n;
end;
$$;
revoke execute on function public.boost_morning_alerts() from public, anon, authenticated;
grant execute on function public.boost_morning_alerts() to service_role;
