-- Host badges: hosting meets on TUNR earns a badge and points at 5 (+10),
-- 10 (+25) and 25 (+50) meets. A meet counts once it has started and
-- wasn't taken down. The points are paid when the app checks (the
-- checklist calls claim_host_badges()), and wait there to be claimed.

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus'
));

-- Each milestone pays once (its note, "Hosted 5 meets", is unique per person).
create unique index if not exists point_ledger_host_once
  on public.point_ledger (user_id, note) where reason = 'host_bonus';

-- Meets someone has hosted (started, not taken down).
create or replace function public.meets_hosted(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.events
   where created_by = p_user and start_at < now() and not coalesce(hidden, false);
$$;
grant execute on function public.meets_hosted(uuid) to anon, authenticated;

-- { hosted, level: 0 | 5 | 10 | 25, next } for anyone's profile.
create or replace function public.host_badge(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'hosted', h,
    'level', case when h >= 25 then 25 when h >= 10 then 10 when h >= 5 then 5 else 0 end,
    'next', case when h >= 25 then null when h >= 10 then 25 when h >= 5 then 10 else 5 end
  )
  from (select public.meets_hosted(p_user) as h) t;
$$;
grant execute on function public.host_badge(uuid) to anon, authenticated;

-- Pay any milestones you've reached. Returns { added, hosted }.
create or replace function public.claim_host_badges()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hosted int;
  v_added int := 0;
  m record;
begin
  if v_uid is null then
    return jsonb_build_object('added', 0, 'hosted', 0);
  end if;
  v_hosted := public.meets_hosted(v_uid);
  for m in select * from (values (5, 10), (10, 25), (25, 50)) as t(at, pts) loop
    if v_hosted >= m.at then
      insert into public.point_ledger (user_id, delta, reason, note)
      values (v_uid, m.pts, 'host_bonus', 'Hosted ' || m.at || ' meets')
      on conflict do nothing;
      if found then
        v_added := v_added + m.pts;
      end if;
    end if;
  end loop;
  return jsonb_build_object('added', v_added, 'hosted', v_hosted);
end;
$$;
revoke execute on function public.claim_host_badges() from public, anon;
grant execute on function public.claim_host_badges() to authenticated;
