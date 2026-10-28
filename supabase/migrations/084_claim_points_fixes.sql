-- Fixes to 083 (claiming points).

-- Voiding a check-in also takes back its points still waiting to be
-- claimed (they'd otherwise stay claimable); points already claimed are
-- taken back with a 'revoke' row, as before.
create or replace function public.void_checkin(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.meet_checkins;
  v_points int;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into c from public.meet_checkins where id = p_id for update;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if c.voided_at is not null then
    raise exception 'checkin_already_voided';
  end if;
  update public.meet_checkins set voided_at = now(), voided_by = auth.uid() where id = p_id;
  delete from public.point_ledger
   where claimed_at is null and user_id = c.user_id and event_id = c.event_id and occurrence = c.occurrence
     and reason in ('checkin', 'rsvp_bonus', 'stay_bonus');
  select coalesce(sum(delta), 0) into v_points from public.point_ledger
   where claimed_at is not null and user_id = c.user_id and event_id = c.event_id and occurrence = c.occurrence
     and reason in ('checkin', 'rsvp_bonus', 'stay_bonus');
  if v_points > 0 then
    insert into public.point_ledger (user_id, delta, reason, event_id, occurrence, note, created_by)
    values (c.user_id, -v_points, 'revoke', c.event_id, c.occurrence, 'Check-in removed by TUNR', auth.uid());
  end if;
end;
$$;

-- One place for the balance rule: claimed points only. New functions that
-- need a balance call this instead of adding up the ledger themselves.
create or replace function public.points_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(delta), 0)::int from public.point_ledger where claimed_at is not null and user_id = p_user;
$$;
revoke execute on function public.points_balance(uuid) from public, anon, authenticated;

-- 083 meant to stamp older rows as claimed when they were earned, but the
-- column default had already stamped them all with the migration's time.
-- Those all share that one timestamp: put their earn time back.
with stamp as (
  select claimed_at as at
  from public.point_ledger
  where claimed_at is not null
  group by claimed_at
  order by count(*) desc
  limit 1
)
update public.point_ledger l
set claimed_at = l.created_at
from stamp
where l.claimed_at = stamp.at and l.created_at < stamp.at;
