-- TUNR+ streak restore: a member who misses a day can bring their Daily
-- Pit Stop streak back, once every 3 months (90 days). It fills the days
-- they missed (no points for those) so today's claim carries on the streak.
-- Only for a streak lost in the last 7 days. TUNR+ is profiles.is_member
-- (021); billing for it comes later.
--
--   pit_stop_status() now also says: lost_streak (the streak that ended, if
--   it can still be brought back), member, can_restore, restore_at (when the
--   next restore is allowed).
--   restore_pit_stop() → { status: ok | not_member | nothing_to_restore |
--     too_soon | not_signed_in, streak, restore_at }

create table if not exists public.pit_stop_restores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  used_at timestamptz not null default now(),
  restored_streak int not null
);
create index if not exists pit_stop_restores_user_idx on public.pit_stop_restores (user_id, used_at desc);
alter table public.pit_stop_restores enable row level security;
drop policy if exists "members see their restores" on public.pit_stop_restores;
create policy "members see their restores" on public.pit_stop_restores for select to authenticated using (user_id = auth.uid());

-- The streak that ended and can still come back: your last pit stop was 2
-- to 7 days ago (yesterday missed, today not claimed yet).
create or replace function public.pit_stop_lost(p_user uuid)
returns table (last_day date, streak int)
language sql
stable
security definer
set search_path = public
as $$
  select d.day, d.streak
    from public.daily_pit_stops d
   where d.user_id = p_user
     and not exists (select 1 from public.daily_pit_stops t where t.user_id = p_user and t.day >= public.atl_today() - 1)
   order by d.day desc
   limit 1;
$$;
revoke execute on function public.pit_stop_lost(uuid) from public, anon, authenticated;

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
  select coalesce(p.is_member, false) into v_member from public.profiles p where p.id = v_uid;
  select max(used_at) + interval '90 days' into v_restore_at from public.pit_stop_restores where user_id = v_uid;
  return jsonb_build_object(
    'on', coalesce(s.daily_points, 0) > 0,
    'today_done', t.day is not null,
    'streak', coalesce(t.streak, y.streak, 0),
    'daily_points', s.daily_points,
    'streak_bonus', s.daily_streak_bonus,
    'lost_streak', v_lost,
    'member', coalesce(v_member, false),
    'can_restore', coalesce(v_member, false) and v_lost > 0 and (v_restore_at is null or v_restore_at <= now()),
    'restore_at', case when v_restore_at > now() then v_restore_at end
  );
end;
$$;
revoke execute on function public.pit_stop_status() from public, anon;
grant execute on function public.pit_stop_status() to authenticated;

create or replace function public.restore_pit_stop()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l record;
  v_restore_at timestamptz;
  v_streak int;
  d date;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not coalesce((select is_member from public.profiles where id = v_uid), false) then
    return jsonb_build_object('status', 'not_member');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  select * into l from public.pit_stop_lost(v_uid);
  if l.last_day is null or l.last_day < public.atl_today() - 7 then
    return jsonb_build_object('status', 'nothing_to_restore');
  end if;
  select max(used_at) + interval '90 days' into v_restore_at from public.pit_stop_restores where user_id = v_uid;
  if v_restore_at > now() then
    return jsonb_build_object('status', 'too_soon', 'restore_at', v_restore_at);
  end if;
  -- Fill the missed days (no points) so the streak runs on to yesterday.
  v_streak := l.streak;
  d := l.last_day + 1;
  while d <= public.atl_today() - 1 loop
    v_streak := v_streak + 1;
    insert into public.daily_pit_stops (user_id, day, streak, points) values (v_uid, d, v_streak, 0);
    d := d + 1;
  end loop;
  insert into public.pit_stop_restores (user_id, restored_streak) values (v_uid, v_streak);
  return jsonb_build_object('status', 'ok', 'streak', v_streak, 'restore_at', now() + interval '90 days');
end;
$$;
revoke execute on function public.restore_pit_stop() from public, anon;
grant execute on function public.restore_pit_stop() to authenticated;
