-- TUNR Rush settings admins can change from the app (Settings → Admin →
-- TUNR Rush): turn the game on or off, the daily goal and its points, the
-- clock, crash penalty, boosts, traffic and speeds. One row; the game and
-- the server's run check both read it.
--
-- Also: a spoiler choice per car (none, lip or wing) for the game.

create table if not exists public.game_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  goal_meters integer not null default 3000 check (goal_meters between 500 and 20000),
  daily_points integer not null default 1 check (daily_points between 0 and 10),
  start_seconds integer not null default 60 check (start_seconds between 20 and 180),
  clock_seconds numeric(4, 1) not null default 3 check (clock_seconds between 0 and 10),
  crash_seconds numeric(4, 1) not null default 4 check (crash_seconds between 0 and 15),
  boost_seconds numeric(4, 1) not null default 3 check (boost_seconds between 0 and 10),
  boost_chance integer not null default 8 check (boost_chance between 0 and 30),
  clock_chance integer not null default 22 check (clock_chance between 0 and 50),
  traffic numeric(3, 2) not null default 1 check (traffic between 0.5 and 2),
  -- Meters per second; the app shows MPH.
  top_speed integer not null default 85 check (top_speed between 30 and 100),
  boost_speed integer not null default 115 check (boost_speed between 30 and 130),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.game_settings (id) values (true) on conflict (id) do nothing;

alter table public.game_settings enable row level security;

drop policy if exists "game settings are public" on public.game_settings;
create policy "game settings are public"
  on public.game_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admins change game settings" on public.game_settings;
create policy "admins change game settings"
  on public.game_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.game_settings_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists game_settings_touch on public.game_settings;
create trigger game_settings_touch
  before update on public.game_settings
  for each row execute function public.game_settings_touch();

alter table public.vehicles
  add column if not exists game_spoiler text check (game_spoiler is null or game_spoiler in ('none', 'lip', 'wing'));

-- ok (with run_id), off, not_signed_in, rate_limited
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
  if not coalesce((select enabled from public.game_settings), true) then
    return jsonb_build_object('status', 'off');
  end if;
  if (select count(*) from public.game_runs where user_id = v_uid and started_at > now() - interval '24 hours') >= 100 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.game_runs (user_id, vehicle_id)
  values (v_uid, (select id from public.vehicles where id = p_vehicle and owner_id = v_uid))
  returning id into v_id;
  delete from public.game_runs where user_id = v_uid and finished_at is null and started_at < now() - interval '1 day';
  return jsonb_build_object('status', 'ok', 'run_id', v_id);
end;
$$;

-- The run check now follows the settings: the fastest the car can go (top
-- speed or boost speed, plus a little slack) times the seconds the server
-- saw pass; the goal and points come from the settings too.
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
  v_secs double precision;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_earned int := 0;
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
  v_secs := extract(epoch from now() - r.started_at);
  if v_secs > 600 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_long');
  end if;
  if coalesce(p_distance, 0) < 0
     or p_distance > v_secs * (greatest(coalesce(s.top_speed, 85), coalesce(s.boost_speed, 115)) + 5) + 50
     or coalesce(p_score, 0) < 0 or p_score > p_distance + 50000 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_fast');
  end if;

  update public.game_runs set finished_at = now(), distance = p_distance, score = p_score where id = p_run;

  if coalesce(s.enabled, true) and coalesce(s.daily_points, 1) > 0
     and p_distance >= coalesce(s.goal_meters, 3000) and public.email_confirmed(v_uid) then
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (v_uid, coalesce(s.daily_points, 1), 'game_bonus', v_day, 'TUNR Rush daily drive: ' || p_distance || ' m')
    on conflict do nothing;
    get diagnostics v_earned = row_count;
    if v_earned > 0 then
      v_earned := coalesce(s.daily_points, 1);
    end if;
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
