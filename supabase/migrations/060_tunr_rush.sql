-- TUNR Rush: a driving mini-game in your own car.
--
-- Free to play, rewarded on skill: reach 3,000 m in a run for +1 point, once
-- a day (Atlanta time). Runs are timed by the server: a run is started here,
-- and when it's finished the claimed distance has to be possible in the time
-- that actually passed. A weekly leaderboard shows the best distances.
--
-- Each car can carry a color and body style for the game, so the car you
-- drive looks like yours from behind.

alter table public.vehicles
  add column if not exists game_color text check (game_color is null or game_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists game_body text check (game_body is null or game_body in ('coupe', 'sedan', 'hatch', 'suv', 'truck'));

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus'
));

-- One game point per day.
create unique index if not exists point_ledger_game_once_a_day
  on public.point_ledger (user_id, occurrence) where reason = 'game_bonus';

create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  distance integer,
  score integer
);

create index if not exists game_runs_user_idx on public.game_runs (user_id, started_at desc);
create index if not exists game_runs_best_idx on public.game_runs (finished_at, distance desc) where finished_at is not null;

alter table public.game_runs enable row level security;

drop policy if exists "users see their own runs" on public.game_runs;
create policy "users see their own runs"
  on public.game_runs for select
  to authenticated
  using (user_id = auth.uid());
-- Written only through the functions below.

-- ok (with run_id), not_signed_in, rate_limited
create or replace function public.start_game_run(p_vehicle uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if (select count(*) from public.game_runs where user_id = v_uid and started_at > now() - interval '24 hours') >= 100 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.game_runs (user_id, vehicle_id)
  values (v_uid, (select id from public.vehicles where id = p_vehicle and owner_id = v_uid))
  returning id into v_id;
  -- Old unfinished runs are just clutter.
  delete from public.game_runs where user_id = v_uid and finished_at is null and started_at < now() - interval '1 day';
  return jsonb_build_object('status', 'ok', 'run_id', v_id);
end;
$$;

revoke execute on function public.start_game_run(uuid) from public, anon;
grant execute on function public.start_game_run(uuid) to authenticated;

-- The game's top speed is 90 m/s; anything faster than that over the time
-- the server saw pass can't be a real run. Runs last at most 10 minutes.
-- ok, not_found, already, too_fast, too_long
create or replace function public.finish_game_run(p_run uuid, p_distance int, p_score int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.game_runs;
  v_secs double precision;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_earned int := 0;
  v_best int;
begin
  select * into r from public.game_runs where id = p_run and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if r.finished_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  v_secs := extract(epoch from now() - r.started_at);
  if v_secs > 600 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_long');
  end if;
  if coalesce(p_distance, 0) < 0 or p_distance > v_secs * 90 + 50
     or coalesce(p_score, 0) < 0 or p_score > p_distance + 50000 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_fast');
  end if;

  update public.game_runs set finished_at = now(), distance = p_distance, score = p_score where id = p_run;

  if p_distance >= 3000 and public.email_confirmed(v_uid) then
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (v_uid, 1, 'game_bonus', v_day, 'TUNR Rush daily drive: ' || p_distance || ' m')
    on conflict do nothing;
    get diagnostics v_earned = row_count;
  end if;

  select max(distance) into v_best from public.game_runs where user_id = v_uid and finished_at is not null;
  return jsonb_build_object(
    'status', 'ok',
    'earned', v_earned,
    'best', coalesce(v_best, 0),
    'today_done', exists (select 1 from public.point_ledger where user_id = v_uid and reason = 'game_bonus' and occurrence = v_day)
  );
end;
$$;

revoke execute on function public.finish_game_run(uuid, int, int) from public, anon;
grant execute on function public.finish_game_run(uuid, int, int) to authenticated;

-- Your best, and whether today's point is already in.
create or replace function public.my_game()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'best', coalesce((select max(distance) from public.game_runs where user_id = auth.uid() and finished_at is not null), 0),
    'week_best', coalesce((select max(distance) from public.game_runs
                            where user_id = auth.uid() and finished_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'), 0),
    'today_done', exists (select 1 from public.point_ledger where user_id = auth.uid() and reason = 'game_bonus'
                            and occurrence = (now() at time zone 'America/New_York')::date)
  )
  where auth.uid() is not null;
$$;

revoke execute on function public.my_game() from public, anon;
grant execute on function public.my_game() to authenticated;

-- This week's best distance per driver (Monday–Sunday, Atlanta time).
create or replace function public.game_leaderboard(p_limit int default 50)
returns table (rank int, user_id uuid, username text, avatar_url text, profile_color text, score int, car text, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (g.user_id) g.user_id, g.distance, g.vehicle_id
      from public.game_runs g
     where g.finished_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
       and g.distance > 0
     order by g.user_id, g.distance desc
  )
  select (rank() over (order by b.distance desc))::int, p.id, p.username, p.avatar_url, p.profile_color, b.distance,
         (select trim(coalesce(v.year::text, '') || ' ' || v.make || ' ' || v.model) from public.vehicles v where v.id = b.vehicle_id),
         p.id = auth.uid()
    from best b
    join public.profiles p on p.id = b.user_id
   where not p.hide_from_leaderboards and coalesce(p.username, '') <> ''
   order by b.distance desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke execute on function public.game_leaderboard(int) from public;
grant execute on function public.game_leaderboard(int) to anon, authenticated;
