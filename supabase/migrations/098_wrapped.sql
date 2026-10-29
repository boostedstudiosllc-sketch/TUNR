-- TUNR Wrapped: your year on TUNR in one call (meets, streaks, points,
-- photos, games, your ride), for the story-style recap in the app.
-- Counts only your own activity, in Atlanta time.

create or replace function public.my_wrapped(p_year int default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_year int := coalesce(p_year, extract(year from now() at time zone 'America/New_York')::int);
  v_from timestamptz := make_timestamptz(v_year, 1, 1, 0, 0, 0, 'America/New_York');
  v_to timestamptz := make_timestamptz(v_year + 1, 1, 1, 0, 0, 0, 'America/New_York');
  r jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  with
  ci as (
    select c.created_at, c.stayed_at, e.id as event_id, e.title, e.vibe, e.city, e.host
      from public.meet_checkins c
      join public.events e on e.id = c.event_id
     where c.user_id = v_uid and c.voided_at is null and c.created_at >= v_from and c.created_at < v_to
  ),
  weeks as (select distinct public.tunr_week(created_at) as wk from ci),
  runs as (
    select count(*)::int as len
      from (select wk, wk - (row_number() over (order by wk))::int * 7 as grp from weeks) i
     group by grp
  ),
  ledger as (
    select delta, reason from public.point_ledger
     where user_id = v_uid and created_at >= v_from and created_at < v_to
  ),
  -- Everyone's meet count this year, for "top X%".
  everyone as (
    select user_id, count(*) as n from public.meet_checkins
     where voided_at is null and created_at >= v_from and created_at < v_to
     group by user_id
  ),
  car as (
    select year, make, model, game_color, game_body, game_spoiler, game_rims, game_height, game_glow, game_decal
      from public.vehicles where owner_id = v_uid
     order by is_primary desc, created_at limit 1
  )
  select jsonb_build_object(
    'year', v_year,
    'username', (select username from public.profiles where id = v_uid),
    'joined', (select created_at from auth.users where id = v_uid),
    'checkins', (select count(*) from ci),
    'meets', (select count(distinct event_id) from ci),
    'stayed', (select count(*) from ci where stayed_at is not null),
    'cities', (select count(distinct city) from ci where city is not null),
    'top_city', (select city from ci where city is not null group by city order by count(*) desc, city limit 1),
    'top_meet', (select jsonb_build_object('title', title, 'times', count(*)) from ci group by event_id, title order by count(*) desc, title limit 1),
    'top_vibe', (select vibe from ci where vibe is not null group by vibe order by count(*) desc, vibe limit 1),
    'top_host', (select host from ci where host is not null group by host order by count(*) desc, host limit 1),
    'first_meet', (select jsonb_build_object('title', title, 'at', created_at) from ci order by created_at limit 1),
    'busiest_month', (select to_char(date_trunc('month', created_at at time zone 'America/New_York'), 'FMMonth') from ci group by 1 order by count(*) desc, 1 limit 1),
    'best_streak', coalesce((select max(len) from runs), 0),
    'top_percent', (
      select case when (select count(*) from ci) = 0 then null
        else greatest(1, ceil(100.0 * (select count(*) from everyone where n > (select count(*) from ci)) / nullif((select count(*) from everyone), 0))::int) end
    ),
    'rsvps', (select count(*) from public.rsvps where user_id = v_uid and status = 'going' and created_at >= v_from and created_at < v_to),
    'hosted', (select count(*) from public.events where created_by = v_uid and not coalesce(hidden, false) and start_at >= v_from and start_at < v_to),
    'points_earned', coalesce((select sum(delta) from ledger where delta > 0), 0),
    'points_spent', coalesce((select -sum(delta) from ledger where reason = 'redeem'), 0),
    'photos', (select count(*) from public.meet_photos where user_id = v_uid and created_at >= v_from and created_at < v_to),
    'photo_wins', (select count(*) from public.photo_winners where user_id = v_uid and week >= v_from::date - 6 and week < v_to::date),
    'comments', (select count(*) from public.comments where user_id = v_uid and created_at >= v_from and created_at < v_to),
    'linkups', (select count(*) from public.linkups where user_id = v_uid and cancelled_at is null and created_at >= v_from and created_at < v_to),
    'follows', (select count(*) from public.follows where user_id = v_uid and created_at >= v_from and created_at < v_to),
    'clubs', (select count(*) from public.club_members where user_id = v_uid and status = 'member' and joined_at >= v_from and joined_at < v_to),
    'rush_runs', (select count(*) from public.game_runs where user_id = v_uid and finished_at is not null and started_at >= v_from and started_at < v_to),
    'rush_best', (select max(score) from public.game_runs where user_id = v_uid and counts and started_at >= v_from and started_at < v_to),
    'car', (select to_jsonb(car) from car)
  ) into r;
  return r;
end;
$$;
revoke execute on function public.my_wrapped(int) from public, anon;
grant execute on function public.my_wrapped(int) to authenticated;
