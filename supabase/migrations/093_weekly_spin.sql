-- The weekly spin: once a week (Monday to Sunday, Atlanta time) everyone
-- can spin a wheel in the checklist for 1–5 points. The server picks the
-- number, so the wheel can't be gamed, and the points land in the balance
-- straight away (the spin is already the "claim").

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus'
));

-- One spin a week: occurrence is that week's Monday.
create unique index if not exists point_ledger_spin_once_a_week
  on public.point_ledger (user_id, occurrence) where reason = 'spin_bonus';

-- This week's Monday, and when the next spin opens (next Monday, midnight Atlanta).
create or replace function public.spin_week()
returns table (week date, next_at timestamptz)
language sql
stable
as $$
  select w, (w + 7)::timestamp at time zone 'America/New_York'
  from (select date_trunc('week', (now() at time zone 'America/New_York'))::date as w) t;
$$;

-- { spun, points (this week's), next_at }
create or replace function public.my_spin()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'spun', l.delta is not null,
    'points', l.delta,
    'next_at', s.next_at
  )
  from public.spin_week() s
  left join public.point_ledger l
    on l.user_id = auth.uid() and l.reason = 'spin_bonus' and l.occurrence = s.week;
$$;
revoke execute on function public.my_spin() from public, anon;
grant execute on function public.my_spin() to authenticated;

-- Spin. { status: 'ok', points, next_at } | { status: 'already', points,
-- next_at } | not_signed_in | unconfirmed
create or replace function public.spin_wheel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  v_points int;
  v_id bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.spin_week();
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  select delta into v_points from public.point_ledger
   where user_id = v_uid and reason = 'spin_bonus' and occurrence = s.week;
  if found then
    return jsonb_build_object('status', 'already', 'points', v_points, 'next_at', s.next_at);
  end if;
  v_points := 1 + floor(random() * 5)::int;
  insert into public.point_ledger (user_id, delta, reason, occurrence, note)
  values (v_uid, v_points, 'spin_bonus', s.week, 'Weekly spin')
  returning id into v_id;
  -- Spinning is the claim: straight into the balance.
  update public.point_ledger set claimed_at = now() where id = v_id;
  return jsonb_build_object('status', 'ok', 'points', v_points, 'next_at', s.next_at);
end;
$$;
revoke execute on function public.spin_wheel() from public, anon;
grant execute on function public.spin_wheel() to authenticated;
