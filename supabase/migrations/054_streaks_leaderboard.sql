-- Weekly streaks, a public leaderboard, and points rates scaled so a free
-- shirt takes months of real activity.
--
-- Streak: weeks in a row (Monday–Sunday, Atlanta time) with at least one
-- check-in at a meet. A week isn't lost until it's over, so the streak stays
-- alive while this week has no check-in yet. Milestones pay a small bonus,
-- once per milestone week: 4 → +2, 8 → +3, 12 → +5, 26 → +15, 52 → +30.
-- The leaderboard shows current streaks and this month's check-ins, for
-- members who haven't hidden themselves.

alter table public.profiles
  add column if not exists hide_from_leaderboards boolean not null default false;

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus'
));

-- One bonus per milestone week.
create unique index if not exists point_ledger_streak_once
  on public.point_ledger (user_id, occurrence) where reason = 'streak_bonus';

-- Monday of the week a moment falls in, Atlanta time.
create or replace function public.tunr_week(p_at timestamptz)
returns date
language sql
immutable
as $$
  select date_trunc('week', p_at at time zone 'America/New_York')::date;
$$;

-- A member's streaks: current (alive if it reaches this week or last week),
-- best ever, and whether this week already counts.
create or replace function public.streak_of(p_user uuid)
returns table (current_streak int, best_streak int, this_week boolean)
language sql
stable
security definer
set search_path = public
as $$
  with weeks as (
    select distinct public.tunr_week(created_at) as wk
      from public.meet_checkins
     where user_id = p_user and voided_at is null
  ),
  islands as (
    select wk, wk - (row_number() over (order by wk))::int * 7 as grp from weeks
  ),
  runs as (
    select count(*)::int as len, max(wk) as last_wk from islands group by grp
  ),
  this as (select public.tunr_week(now()) as wk)
  select
    coalesce((select r.len from runs r, this t where r.last_wk >= t.wk - 7 order by r.last_wk desc limit 1), 0),
    coalesce((select max(len) from runs), 0),
    exists (select 1 from weeks w, this t where w.wk = t.wk);
$$;

revoke execute on function public.streak_of(uuid) from public, anon, authenticated;

-- After each check-in: pay the milestone if this week just reached one.
create or replace function public.award_streak_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_streak int;
  v_bonus int;
begin
  select current_streak into v_streak from public.streak_of(new.user_id);
  v_bonus := case v_streak when 4 then 2 when 8 then 3 when 12 then 5 when 26 then 15 when 52 then 30 else 0 end;
  if v_bonus > 0 then
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (new.user_id, v_bonus, 'streak_bonus', public.tunr_week(new.created_at), v_streak || '-week streak')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists meet_checkins_streak on public.meet_checkins;
create trigger meet_checkins_streak
  after insert on public.meet_checkins
  for each row execute function public.award_streak_bonus();

-- Yours, for the Points screen.
create or replace function public.my_streak()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('current', s.current_streak, 'best', s.best_streak, 'this_week', s.this_week,
                            'hidden', (select hide_from_leaderboards from public.profiles where id = auth.uid()))
    from public.streak_of(auth.uid()) s
   where auth.uid() is not null;
$$;

revoke execute on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- 'streaks' (current weekly streak) or 'month' (check-ins this month).
-- Public: shows usernames, photos and the numbers, never where anyone was.
create or replace function public.leaderboard(p_kind text default 'streaks', p_limit int default 50)
returns table (rank int, user_id uuid, username text, avatar_url text, profile_color text, score int, best int, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if p_kind = 'month' then
    return query
    with counts as (
      select c.user_id, count(*)::int as n
        from public.meet_checkins c
       where c.voided_at is null
         and c.created_at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York'
       group by c.user_id
    )
    select (rank() over (order by c.n desc))::int, p.id, p.username, p.avatar_url, p.profile_color, c.n, null::int,
           p.id = auth.uid()
      from counts c
      join public.profiles p on p.id = c.user_id
     where not p.hide_from_leaderboards and coalesce(p.username, '') <> ''
     order by c.n desc, p.username
     limit v_limit;
  else
    return query
    with active as (
      select distinct c.user_id
        from public.meet_checkins c
       where c.voided_at is null and c.created_at >= now() - interval '15 days'
    ),
    scored as (
      select a.user_id, s.current_streak, s.best_streak
        from active a, lateral public.streak_of(a.user_id) s
       where s.current_streak > 0
    )
    select (rank() over (order by s.current_streak desc))::int, p.id, p.username, p.avatar_url, p.profile_color,
           s.current_streak, s.best_streak, p.id = auth.uid()
      from scored s
      join public.profiles p on p.id = s.user_id
     where not p.hide_from_leaderboards and coalesce(p.username, '') <> ''
     order by s.current_streak desc, s.best_streak desc, p.username
     limit v_limit;
  end if;
end;
$$;

revoke execute on function public.leaderboard(text, int) from public;
grant execute on function public.leaderboard(text, int) to anon, authenticated;

-- Saturday nudge from the daily job: a streak of 2+ weeks with no check-in
-- yet this week. Returns how many were sent.
create or replace function public.queue_streak_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_week date := public.tunr_week(now());
begin
  for r in
    select a.user_id, s.current_streak
      from (select distinct user_id from public.meet_checkins
             where voided_at is null and created_at >= now() - interval '15 days') a,
           lateral public.streak_of(a.user_id) s
     where s.current_streak >= 2 and not s.this_week
  loop
    perform public.notify(r.user_id, 'streak', '🔥 Keep your streak alive',
      'Your ' || r.current_streak || '-week streak ends Sunday night. Check in at a meet this weekend to keep it going.',
      null, 'streak:' || v_week);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.queue_streak_reminders() from public, anon, authenticated;
grant execute on function public.queue_streak_reminders() to service_role;

-- ============ RATES ============
-- On the 1-point-per-meet scale, a $30 shirt is about 400 points (months of
-- real activity). Purchases at 1 per $1 and a 50-point membership bonus keep
-- buying or joining from handing out free shirts. Only changed if still at
-- 046's defaults, so an admin's own choice isn't overwritten.
update public.points_settings set points_per_dollar = 1 where points_per_dollar = 10;
update public.points_settings set member_bonus = 50 where member_bonus = 500;
alter table public.points_settings alter column points_per_dollar set default 1;
alter table public.points_settings alter column member_bonus set default 50;
