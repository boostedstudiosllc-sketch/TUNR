-- "Stayed the whole meet": one more point for checking in again near the
-- end. You must have checked in at the start (no later than an hour after
-- the start time), then check in again at the meet's location from 30
-- minutes before the end time the host set until an hour after it (meets
-- often run long). No code is asked for the second one: the first already
-- proved you were there. It doesn't count toward the 3-a-day limit.

alter table public.meet_checkins
  add column if not exists stayed_at timestamptz,
  add column if not exists stay_distance_m integer;

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus'
));

-- ok, not_signed_in, rate_limited, not_found, not_happening, not_checked_in,
-- late_arrival, too_early (with opens_at), already, no_pin, location_needed,
-- weak_location, too_far
create or replace function public.stay_check_in(
  p_event uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  w record;
  c public.meet_checkins;
  v_dist double precision;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if (select count(*) from public.checkin_attempts
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 15 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.checkin_attempts (user_id) values (v_uid);

  select * into e from public.events where id = p_event;
  if not found or e.hidden or not public.can_access_event(p_event) then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- The occurrence that's on now, or the one that ended up to an hour ago.
  select * into w from public.meet_window(p_event, now());
  if w.occurrence is null then
    select * into w from public.meet_window(p_event, now() - interval '60 minutes');
  end if;
  if w.occurrence is null then
    return jsonb_build_object('status', 'not_happening');
  end if;

  select * into c from public.meet_checkins
   where user_id = v_uid and event_id = p_event and occurrence = w.occurrence and voided_at is null;
  if not found then
    return jsonb_build_object('status', 'not_checked_in');
  end if;
  if c.stayed_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  if c.created_at > w.starts + interval '60 minutes' then
    return jsonb_build_object('status', 'late_arrival');
  end if;
  if now() < w.ends - interval '30 minutes' then
    return jsonb_build_object('status', 'too_early', 'opens_at', w.ends - interval '30 minutes');
  end if;
  if now() > w.ends + interval '60 minutes' then
    return jsonb_build_object('status', 'not_happening');
  end if;

  if e.lat is null or e.lng is null then
    return jsonb_build_object('status', 'no_pin');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'location_needed');
  end if;
  if p_accuracy is null or p_accuracy > 150 then
    return jsonb_build_object('status', 'weak_location');
  end if;
  v_dist := public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34;
  if v_dist > 400 then
    return jsonb_build_object('status', 'too_far', 'distance_m', round(v_dist));
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  update public.meet_checkins set stayed_at = now(), stay_distance_m = round(v_dist)
   where id = c.id and stayed_at is null;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  insert into public.point_ledger (user_id, delta, reason, event_id, occurrence)
  values (v_uid, 1, 'stay_bonus', p_event, w.occurrence);

  return jsonb_build_object(
    'status', 'ok',
    'points', 1,
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid)
  );
end;
$$;

revoke execute on function public.stay_check_in(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.stay_check_in(uuid, double precision, double precision, double precision) to authenticated;

-- Removing a check-in also takes back the stay bonus (045 + stay_bonus).
create or replace function public.void_checkin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
  select coalesce(sum(delta), 0) into v_points from public.point_ledger
   where user_id = c.user_id and event_id = c.event_id and occurrence = c.occurrence
     and reason in ('checkin', 'rsvp_bonus', 'stay_bonus');
  if v_points > 0 then
    insert into public.point_ledger (user_id, delta, reason, event_id, occurrence, note, created_by)
    values (c.user_id, -v_points, 'revoke', c.event_id, c.occurrence, 'Check-in removed by TUNR', auth.uid());
  end if;
end;
$$;

-- 050's meet history plus whether you stayed to the end.
drop function if exists public.my_meet_history();
create or replace function public.my_meet_history()
returns table (event_id uuid, title text, city text, day date, rsvp text, checked_in boolean, stayed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select event_id, occurrence as day, stayed_at is not null as stayed
      from public.meet_checkins
     where user_id = auth.uid() and voided_at is null
  ),
  r as (
    select r.event_id, r.status,
           (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date as day
      from public.rsvps r
      join public.events e on e.id = r.event_id
     where r.user_id = auth.uid()
       and e.recurrence is null
       and e.start_at is not null
       and coalesce(e.end_at, e.start_at + interval '4 hours') < now()
  ),
  both_ as (
    select coalesce(c.event_id, r.event_id) as event_id,
           coalesce(c.day, r.day) as day,
           r.status as rsvp,
           c.event_id is not null as checked_in,
           coalesce(c.stayed, false) as stayed
      from c
      full join r on r.event_id = c.event_id and r.day = c.day
  )
  select b.event_id, e.title, e.city, b.day, b.rsvp, b.checked_in, b.stayed
    from both_ b
    join public.events e on e.id = b.event_id
   where not e.hidden
   order by b.day desc
   limit 200;
$$;

revoke execute on function public.my_meet_history() from public, anon;
grant execute on function public.my_meet_history() to authenticated;
