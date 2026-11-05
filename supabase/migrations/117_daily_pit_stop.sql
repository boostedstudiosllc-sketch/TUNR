-- The Daily Pit Stop: open TUNR, tap CLAIM, get a point (once per Atlanta
-- day). Coming back day after day builds a streak, and every 7th day in a
-- row pays a bonus. Named so it's never confused with checking in at a meet.
--
--   points_settings.daily_points        a day's points (default 1; 0 turns it off)
--   points_settings.daily_streak_bonus  extra on every 7th day in a row (default 5)
--   daily_pit_stops                     one row per member per day (they see their own)
--   pit_stop_status() → { on, today_done, streak, daily_points, streak_bonus }
--   claim_pit_stop()  → { status, points, streak, bonus, balance }
--     status: ok | already | off | unconfirmed | not_signed_in
-- The points go straight into the balance, like the weekly spin.

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus', 'guess_bonus', 'taco_bonus', 'scratch_buy', 'scratch_win', 'daily_bonus'
));

alter table public.points_settings
  add column if not exists daily_points integer not null default 1 check (daily_points between 0 and 10),
  add column if not exists daily_streak_bonus integer not null default 5 check (daily_streak_bonus between 0 and 50);

create table if not exists public.daily_pit_stops (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  streak int not null check (streak >= 1),
  points int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_pit_stops enable row level security;
drop policy if exists "members see their pit stops" on public.daily_pit_stops;
create policy "members see their pit stops" on public.daily_pit_stops for select to authenticated
  using (user_id = auth.uid());
-- Written only by claim_pit_stop().

-- Today's streak: today's row, else yesterday's (still alive until tonight), else 0.
create or replace function public.pit_stop_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'on', s.daily_points > 0,
    'today_done', t.day is not null,
    'streak', coalesce(t.streak, y.streak, 0),
    'daily_points', s.daily_points,
    'streak_bonus', s.daily_streak_bonus
  )
    from public.points_settings s
    left join public.daily_pit_stops t on t.user_id = auth.uid() and t.day = public.atl_today()
    left join public.daily_pit_stops y on y.user_id = auth.uid() and y.day = public.atl_today() - 1
   where auth.uid() is not null
   limit 1;
$$;
revoke execute on function public.pit_stop_status() from public, anon;
grant execute on function public.pit_stop_status() to authenticated;

create or replace function public.claim_pit_stop()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  v_day date := public.atl_today();
  v_streak int;
  v_points int;
  v_bonus boolean;
  v_id bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.points_settings limit 1;
  if coalesce(s.daily_points, 0) <= 0 then
    return jsonb_build_object('status', 'off');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if exists (select 1 from public.daily_pit_stops where user_id = v_uid and day = v_day) then
    return jsonb_build_object('status', 'already', 'streak', (select streak from public.daily_pit_stops where user_id = v_uid and day = v_day));
  end if;

  v_streak := 1 + coalesce((select streak from public.daily_pit_stops where user_id = v_uid and day = v_day - 1), 0);
  v_bonus := v_streak % 7 = 0 and s.daily_streak_bonus > 0;
  v_points := s.daily_points + case when v_bonus then s.daily_streak_bonus else 0 end;

  insert into public.daily_pit_stops (user_id, day, streak, points) values (v_uid, v_day, v_streak, v_points);
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, v_points, 'daily_bonus', 'Daily Pit Stop · day ' || v_streak || case when v_bonus then ' (7-day bonus)' else '' end)
  returning id into v_id;
  update public.point_ledger set claimed_at = now() where id = v_id;

  return jsonb_build_object('status', 'ok', 'points', v_points, 'streak', v_streak, 'bonus', v_bonus, 'balance', public.points_balance(v_uid));
end;
$$;
revoke execute on function public.claim_pit_stop() from public, anon;
grant execute on function public.claim_pit_stop() to authenticated;
