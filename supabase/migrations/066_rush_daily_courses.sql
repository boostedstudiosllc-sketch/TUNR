-- TUNR Rush: a new course every day, ghosts, and runs the server replays.
--
--   * Each player gets their own course each day per level, from a seed
--     made of who they are, the day and the level. All their tries that day
--     are on the same course, so they can learn it; nobody can scout it on
--     another account.
--   * The app records your lane changes ("moves"). The server replays the
--     run from the seed and moves (api/rush-finish.js, using the same game
--     engine) and pays points on the distance it gets, not on what the
--     phone says. Phones can no longer finish runs themselves.
--   * Your best run of the day on a level is your ghost on later tries.
--   * Medium and Hard get tougher defaults (tuned with simulated players).

alter table public.game_runs
  add column if not exists seed integer,
  add column if not exists moves jsonb,
  add column if not exists sim_secs numeric(7, 2);

create or replace function public.game_seed(p_user uuid, p_day date, p_difficulty text)
returns integer
language sql
immutable
as $$
  select ((hashtext(p_user::text || ':' || p_day::text || ':' || p_difficulty)::bigint + 2147483648) % 2147483646 + 1)::int;
$$;

-- Same as 065, plus the run's seed.
-- ok (run_id, seed, counts, today), off, not_signed_in, rate_limited,
-- bad_level, locked, no_tries, done
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
  v_seed int;
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

  v_seed := public.game_seed(v_uid, public.game_today(), p_difficulty);
  insert into public.game_runs (user_id, vehicle_id, difficulty, counts, seed)
  values (v_uid, (select id from public.vehicles where id = p_vehicle and owner_id = v_uid), p_difficulty, v_counts, v_seed)
  returning id into v_id;
  delete from public.game_runs where user_id = v_uid and finished_at is null and started_at < now() - interval '1 day';
  return jsonb_build_object('status', 'ok', 'run_id', v_id, 'seed', v_seed, 'counts', v_counts, 'today', to_jsonb(d));
end;
$$;

-- Phones can't finish runs any more; the server does, after replaying.
drop function if exists public.finish_game_run(uuid, int, int);

-- Called only by api/rush-finish.js (service role) with the replayed
-- distance, score and game time. The run can't have finished faster than
-- the game time it took (a few seconds' slack for the network).
-- ok, not_found, already, too_fast, too_long
create or replace function public.finish_game_run_verified(
  p_run uuid,
  p_user uuid,
  p_distance int,
  p_score int,
  p_sim_secs numeric,
  p_moves jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  select * into r from public.game_runs where id = p_run and user_id = p_user for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if r.finished_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  lvl := s.levels -> r.difficulty;
  v_secs := extract(epoch from now() - r.started_at);
  if v_secs > 660 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_long');
  end if;
  if coalesce(p_distance, 0) < 0 or coalesce(p_sim_secs, 0) <= 0
     or v_secs < p_sim_secs - 3
     or p_distance > p_sim_secs * (greatest((lvl ->> 'topSpeed')::numeric, (lvl ->> 'boostSpeed')::numeric) + 5) + 50 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_fast');
  end if;

  update public.game_runs
     set finished_at = now(), distance = p_distance, score = p_score, sim_secs = p_sim_secs, moves = p_moves
   where id = p_run;

  v_points := coalesce((lvl ->> 'points')::int, 0);
  if r.counts and coalesce(s.enabled, true) and v_points > 0
     and p_distance >= (lvl ->> 'goal')::numeric and public.email_confirmed(p_user) then
    -- One game reward a day, whatever the level (point_ledger_game_once_a_day).
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (p_user, v_points, 'game_bonus', v_day,
            'TUNR Rush ' || initcap(r.difficulty) || ': ' || p_distance || ' m')
    on conflict do nothing;
    get diagnostics v_earned = row_count;
    if v_earned > 0 then
      v_earned := v_points;
      update public.game_days set done = true where user_id = p_user and day = v_day;
    end if;
  end if;

  select max(distance) into v_best from public.game_runs
   where user_id = p_user and finished_at is not null and difficulty = r.difficulty;
  return jsonb_build_object(
    'status', 'ok',
    'earned', v_earned,
    'best', coalesce(v_best, 0),
    'counts', r.counts,
    'today', (select to_jsonb(d) from public.game_days d where d.user_id = p_user and d.day = v_day)
  );
end;
$$;

revoke execute on function public.finish_game_run_verified(uuid, uuid, int, int, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.finish_game_run_verified(uuid, uuid, int, int, numeric, jsonb) to service_role;

-- Your best run today on this level's course: the ghost for your next try.
create or replace function public.my_ghost(p_difficulty text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('distance', g.distance, 'moves', g.moves, 'seed', g.seed)
    from public.game_runs g
   where g.user_id = auth.uid()
     and g.difficulty = p_difficulty
     and g.seed = public.game_seed(auth.uid(), public.game_today(), p_difficulty)
     and g.finished_at is not null
     and g.moves is not null
     and g.distance > 0
   order by g.distance desc
   limit 1;
$$;

revoke execute on function public.my_ghost(text) from public, anon;
grant execute on function public.my_ghost(text) to authenticated;

-- Tougher Medium and Hard (see rushEngine.js DEFAULT_LEVELS).
update public.game_settings
   set levels = jsonb_set(jsonb_set(jsonb_set(jsonb_set(levels,
         '{medium,goal}', '1900'), '{medium,clockChance}', '0.14'), '{medium,traffic}', '1.05'), '{hard,goal}', '2600');
