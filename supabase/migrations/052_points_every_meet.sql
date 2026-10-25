-- Every meet gives points; boosted meets give more.
--
--   * Any meet: 1 point for checking in (points_settings.base_meet_points),
--     with location and meet hours only. Most meets have no TUNR host to show
--     a code, so none is asked for. To keep it from being farmed, the meet
--     needs a map pin and, for a one-off, has to have been posted at least a
--     day before it starts (no posting a meet and checking in on the spot).
--     No RSVP bonus at this level.
--   * Boosted meets (an admin sets the points, e.g. the owner's own meets):
--     the admin's amount, plus 5 for RSVPing going beforehand, and the host's
--     daily code is required because they're worth more.
-- Everything else from 045 stands: hosts don't earn at their own meet, one
-- check-in per meet per day, 3 a day, attempt limits.

alter table public.points_meets
  add column if not exists points integer not null default 10 check (points between 1 and 1000);

alter table public.points_settings
  add column if not exists base_meet_points integer not null default 1 check (base_meet_points between 0 and 100);

-- Set a meet's boosted points; null (or 0) puts it back to the regular amount.
create or replace function public.set_meet_points(p_event uuid, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if coalesce(p_points, 0) <= 0 then
    delete from public.points_meets where event_id = p_event;
    return;
  end if;
  if p_points > 1000 then
    raise exception 'points_meets_points_check';
  end if;
  insert into public.points_meets (event_id, enabled_by, points) values (p_event, auth.uid(), p_points)
  on conflict (event_id) do update set points = excluded.points, enabled_by = excluded.enabled_by;
end;
$$;

revoke execute on function public.set_meet_points(uuid, int) from public, anon;
grant execute on function public.set_meet_points(uuid, int) to authenticated;

-- 045's switch, kept working for older app versions: on means 10.
create or replace function public.set_points_meet(p_event uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_meet_points(p_event, case when p_on then 10 else null end);
end;
$$;

-- Same as 045, with the two levels described above.
create or replace function public.check_in_at_meet(
  p_event uuid,
  p_code text,
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
  v_boost int;
  v_base int;
  v_dist double precision;
  v_today int;
  v_points int;
  v_bonus int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
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

  select points into v_boost from public.points_meets where event_id = p_event;
  select base_meet_points into v_base from public.points_settings;
  if v_boost is null and coalesce(v_base, 0) <= 0 then
    return jsonb_build_object('status', 'not_points_meet');
  end if;
  if e.created_by = v_uid or public.is_event_host(p_event) then
    return jsonb_build_object('status', 'own_meet');
  end if;

  select * into w from public.meet_window(p_event);
  if w.occurrence is null then
    return jsonb_build_object('status', 'not_happening');
  end if;

  if v_boost is not null then
    if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
       <> public.checkin_code_for(p_event, w.occurrence) then
      return jsonb_build_object('status', 'wrong_code');
    end if;
  elsif e.recurrence is null and e.created_at > e.start_at - interval '24 hours' then
    return jsonb_build_object('status', 'posted_too_late');
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

  if exists (select 1 from public.meet_checkins
              where user_id = v_uid and event_id = p_event and occurrence = w.occurrence) then
    return jsonb_build_object('status', 'already');
  end if;

  select count(*) into v_today from public.meet_checkins
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 3 then
    return jsonb_build_object('status', 'daily_limit');
  end if;

  v_points := coalesce(v_boost, v_base);
  insert into public.meet_checkins (user_id, event_id, occurrence, distance_m)
  values (v_uid, p_event, w.occurrence, round(v_dist));
  insert into public.point_ledger (user_id, delta, reason, event_id, occurrence)
  values (v_uid, v_points, 'checkin', p_event, w.occurrence);

  if v_boost is not null and exists (
    select 1 from public.rsvps r
     where r.user_id = v_uid and r.event_id = p_event
       and r.status = 'going' and r.created_at < w.starts) then
    v_bonus := 5;
    insert into public.point_ledger (user_id, delta, reason, event_id, occurrence)
    values (v_uid, v_bonus, 'rsvp_bonus', p_event, w.occurrence);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'points', v_points + v_bonus,
    'rsvp_bonus', v_bonus > 0,
    'boosted', v_boost is not null,
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid)
  );
end;
$$;
