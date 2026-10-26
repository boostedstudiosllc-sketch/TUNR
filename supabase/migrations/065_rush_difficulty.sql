-- TUNR Rush difficulty levels: Easy (+1), Medium (+2) and Hard (+3).
--
-- Each day (Atlanta time) a player picks one level for points: their first
-- points run of the day locks it in until tomorrow. They get a set number of
-- tries at it (tries_per_day, 0 = unlimited); hitting that level's goal
-- earns its points once. Any other run that day is practice: no points, but
-- it still counts on that level's leaderboard.
--
-- Each level has its own rules (time, goal, traffic, speed, pickups),
-- stored in game_settings.levels and changed by admins in the app. The
-- older single-level columns from 063 are no longer read.

-- ---------- settings ----------

create or replace function public.game_level_ok(l jsonb)
returns boolean
language sql
immutable
as $$
  select l is not null and jsonb_typeof(l) = 'object'
     and (l ->> 'goal')::numeric between 300 and 20000
     and (l ->> 'points')::numeric between 0 and 10
     and (l ->> 'startTime')::numeric between 10 and 180
     and (l ->> 'clockSeconds')::numeric between 0 and 10
     and (l ->> 'crashSeconds')::numeric between 0 and 15
     and (l ->> 'boostSeconds')::numeric between 0 and 10
     and (l ->> 'boostChance')::numeric between 0 and 0.3
     and (l ->> 'clockChance')::numeric between 0 and 0.5
     and (l ->> 'traffic')::numeric between 0.5 and 2.5
     and (l ->> 'startSpeed')::numeric between 10 and 100
     and (l ->> 'ramp')::numeric between 10 and 200
     and (l ->> 'topSpeed')::numeric between 30 and 100
     and (l ->> 'boostSpeed')::numeric between 30 and 130;
$$;

create or replace function public.game_levels_ok(levels jsonb)
returns boolean
language sql
immutable
as $$
  select public.game_level_ok(levels -> 'easy')
     and public.game_level_ok(levels -> 'medium')
     and public.game_level_ok(levels -> 'hard');
$$;

alter table public.game_settings
  add column if not exists tries_per_day integer not null default 3 check (tries_per_day between 0 and 10),
  add column if not exists levels jsonb not null default '{
    "easy":   {"goal": 1500, "points": 1, "startTime": 35, "clockSeconds": 3,   "crashSeconds": 3, "boostSeconds": 3, "boostChance": 0.10, "clockChance": 0.20, "traffic": 0.85, "startSpeed": 35, "ramp": 45, "topSpeed": 75, "boostSpeed": 105},
    "medium": {"goal": 1950, "points": 2, "startTime": 30, "clockSeconds": 2.5, "crashSeconds": 4, "boostSeconds": 3, "boostChance": 0.08, "clockChance": 0.18, "traffic": 1.0,  "startSpeed": 40, "ramp": 40, "topSpeed": 85, "boostSpeed": 115},
    "hard":   {"goal": 2500, "points": 3, "startTime": 26, "clockSeconds": 2,   "crashSeconds": 5, "boostSeconds": 3, "boostChance": 0.06, "clockChance": 0.14, "traffic": 1.15, "startSpeed": 45, "ramp": 35, "topSpeed": 95, "boostSpeed": 125}
  }'::jsonb;

alter table public.game_settings drop constraint if exists game_settings_levels_ok;
alter table public.game_settings add constraint game_settings_levels_ok check (public.game_levels_ok(levels));

-- ---------- runs and the day's pick ----------

alter table public.game_runs
  add column if not exists difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  add column if not exists counts boolean not null default false;

create table if not exists public.game_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  tries integer not null default 0,
  done boolean not null default false,
  primary key (user_id, day)
);

alter table public.game_days enable row level security;

drop policy if exists "users see their own game days" on public.game_days;
create policy "users see their own game days"
  on public.game_days for select
  to authenticated
  using (user_id = auth.uid());
-- Written only through the functions below.

create or replace function public.game_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

-- Start a run. p_for_points: this run is a try at today's points (the
-- first one locks the level for the day). Otherwise it's practice.
-- ok (run_id, counts, today), off, not_signed_in, rate_limited, bad_level,
-- locked (today's level is another one), no_tries, done
drop function if exists public.start_game_run(uuid);
create or replace function public.start_game_run(p_vehicle uuid default null, p_difficulty text default 'medium', p_for_points boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.game_settings;
  d public.game_days;
  v_id uuid;
  v_counts boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into s from public.game_settings;
  if not coalesce(s.enabled, true) then
    return jsonb_build_object('status', 'off');
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    return jsonb_build_object('status', 'bad_level');
  end if;
  if (select count(*) from public.game_runs where user_id = v_uid and started_at > now() - interval '24 hours') >= 100 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_for_points then
    select * into d from public.game_days where user_id = v_uid and day = public.game_today() for update;
    if not found then
      insert into public.game_days (user_id, day, difficulty, tries)
      values (v_uid, public.game_today(), p_difficulty, 0)
      returning * into d;
    end if;
    if d.difficulty <> p_difficulty then
      return jsonb_build_object('status', 'locked', 'today', to_jsonb(d));
    end if;
    if d.done then
      return jsonb_build_object('status', 'done', 'today', to_jsonb(d));
    end if;
    if coalesce(s.tries_per_day, 3) > 0 and d.tries >= s.tries_per_day then
      return jsonb_build_object('status', 'no_tries', 'today', to_jsonb(d));
    end if;
    update public.game_days set tries = tries + 1 where user_id = v_uid and day = d.day returning * into d;
    v_counts := true;
  end if;

  insert into public.game_runs (user_id, vehicle_id, difficulty, counts)
  values (v_uid, (select id from public.vehicles where id = p_vehicle and owner_id = v_uid), p_difficulty, v_counts)
  returning id into v_id;
  delete from public.game_runs where user_id = v_uid and finished_at is null and started_at < now() - interval '1 day';
  return jsonb_build_object('status', 'ok', 'run_id', v_id, 'counts', v_counts, 'today', to_jsonb(d));
end;
$$;

revoke execute on function public.start_game_run(uuid, text, boolean) from public, anon;
grant execute on function public.start_game_run(uuid, text, boolean) to authenticated;

-- Finish a run: checked against that level's speeds; a points try that
-- reaches the level's goal earns its points (once a day).
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
  s public.game_settings;
  lvl jsonb;
  v_secs double precision;
  v_day date := public.game_today();
  v_earned int := 0;
  v_points int;
  v_best int;
begin
  select * into s from public.game_settings;
  select * into r from public.game_runs where id = p_run and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if r.finished_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  lvl := s.levels -> r.difficulty;
  v_secs := extract(epoch from now() - r.started_at);
  if v_secs > 600 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_long');
  end if;
  if coalesce(p_distance, 0) < 0
     or p_distance > v_secs * (greatest((lvl ->> 'topSpeed')::numeric, (lvl ->> 'boostSpeed')::numeric) + 5) + 50
     or coalesce(p_score, 0) < 0 or p_score > p_distance + 50000 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_fast');
  end if;

  update public.game_runs set finished_at = now(), distance = p_distance, score = p_score where id = p_run;

  v_points := coalesce((lvl ->> 'points')::int, 0);
  if r.counts and coalesce(s.enabled, true) and v_points > 0
     and p_distance >= (lvl ->> 'goal')::numeric and public.email_confirmed(v_uid) then
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (v_uid, v_points, 'game_bonus', v_day,
            'TUNR Rush ' || initcap(r.difficulty) || ': ' || p_distance || ' m')
    on conflict do nothing;
    get diagnostics v_earned = row_count;
    if v_earned > 0 then
      v_earned := v_points;
      update public.game_days set done = true where user_id = v_uid and day = v_day;
    end if;
  end if;

  select max(distance) into v_best from public.game_runs
   where user_id = v_uid and finished_at is not null and difficulty = r.difficulty;
  return jsonb_build_object(
    'status', 'ok',
    'earned', v_earned,
    'best', coalesce(v_best, 0),
    'counts', r.counts,
    'today', (select to_jsonb(d) from public.game_days d where d.user_id = v_uid and d.day = v_day)
  );
end;
$$;

-- Today's pick and tries, and your bests per level.
create or replace function public.my_game()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'today', (select to_jsonb(d) from public.game_days d where d.user_id = auth.uid() and d.day = public.game_today()),
    'best', (select coalesce(jsonb_object_agg(difficulty, best), '{}'::jsonb)
               from (select difficulty, max(distance) as best from public.game_runs
                      where user_id = auth.uid() and finished_at is not null group by difficulty) b),
    'week_best', (select coalesce(jsonb_object_agg(difficulty, best), '{}'::jsonb)
                    from (select difficulty, max(distance) as best from public.game_runs
                           where user_id = auth.uid() and finished_at is not null
                             and finished_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
                           group by difficulty) b)
  )
  where auth.uid() is not null;
$$;

-- Leaderboard per level.
drop function if exists public.game_leaderboard(int, text);
create or replace function public.game_leaderboard(p_limit int default 50, p_period text default 'week', p_difficulty text default 'medium')
returns table (
  rank int, user_id uuid, username text, avatar_url text, profile_color text,
  score int, car text, is_me boolean, drivers int
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (g.user_id) g.user_id, g.distance, g.vehicle_id
      from public.game_runs g
     where g.finished_at is not null
       and g.distance > 0
       and g.difficulty = p_difficulty
       and (p_period = 'all'
            or g.finished_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York')
     order by g.user_id, g.distance desc, g.finished_at
  ),
  shown as (
    select b.*, p.username, p.avatar_url, p.profile_color, p.id = auth.uid() as me
      from best b
      join public.profiles p on p.id = b.user_id
     where coalesce(p.username, '') <> ''
       and (not p.hide_from_leaderboards or p.id = auth.uid())
  ),
  ranked as (
    select s.*,
           (rank() over (order by s.distance desc))::int as rnk,
           row_number() over (order by s.distance desc, s.user_id) as rn,
           (count(*) over ())::int as total
      from shown s
  )
  select r.rnk, r.user_id, r.username, r.avatar_url, r.profile_color, r.distance,
         (select trim(coalesce(v.year::text, '') || ' ' || v.make || ' ' || v.model) from public.vehicles v where v.id = r.vehicle_id),
         coalesce(r.me, false), r.total
    from ranked r
   where r.rn <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.me
   order by r.rn;
$$;

revoke execute on function public.game_leaderboard(int, text, text) from public;
grant execute on function public.game_leaderboard(int, text, text) to anon, authenticated;
