-- Fixes from the Boost Day security audit (132):
--   * Pop-up meets: a one-off meet posted less than 24 hours before it
--     starts doesn't earn the boost (the same rule as points check-ins).
--   * "RSVP'd before it started" can't be faked: rsvps.created_at is set
--     by the database, and a new going_at records when someone last
--     became Going (switching Maybe → Going late doesn't count).
--   * A meet with half a pin (no longitude) no longer skips the distance
--     check; an unknown distance counts as too far.
--   * Only people who can see a meet (private meets) can check in there.
--   * A meet hidden by moderators stops paying, even after check-in.
--   * day_rsvps (which replays the pick) is server-only.
--   * Check-ins and confirms: at most 30 tries a day; bonus at 0 = off.

alter table public.rsvps add column if not exists going_at timestamptz;
update public.rsvps set going_at = created_at where status = 'going' and going_at is null;

create or replace function public.guard_rsvp_times()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The SQL editor, imports and the service key may set times as they are.
  if auth.uid() is null then
    if tg_op = 'INSERT' then
      new.going_at := case when new.status = 'going' then coalesce(new.going_at, new.created_at, now()) end;
    elsif new.status = 'going' and old.status is distinct from 'going' then
      new.going_at := coalesce(new.going_at, now());
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.going_at := case when new.status = 'going' then now() end;
  else
    new.created_at := old.created_at;
    new.going_at := case
      when new.status <> 'going' then null
      when old.status is distinct from 'going' then now()
      else old.going_at end;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_rsvp_times on public.rsvps;
create trigger guard_rsvp_times before insert or update on public.rsvps for each row execute function public.guard_rsvp_times();

revoke execute on function public.day_rsvps(date) from public, anon, authenticated;
grant execute on function public.day_rsvps(date) to service_role;

alter table public.boost_entries add column if not exists tries integer not null default 0;

create or replace function public.boost_check_in(p_event uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  en public.boost_entries;
  e public.events;
  v_today date := public.atl_today();
  v_start timestamptz;
  v_dist integer;
  v_tries int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not ((public.boost_status()) ->> 'active')::boolean then
    return jsonb_build_object('status', 'not_today');
  end if;
  select * into s from public.points_settings limit 1;
  update public.boost_entries set tries = tries + 1 where user_id = v_uid and day = v_today returning tries into v_tries;
  select * into en from public.boost_entries where user_id = v_uid and day = v_today for update;
  if not found then
    return jsonb_build_object('status', 'not_opted_in');
  end if;
  if v_tries > 30 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  if en.confirmed_at is not null then
    return jsonb_build_object('status', 'already_paid');
  end if;
  select * into e from public.events where id = p_event and not coalesce(hidden, false);
  if not found or not public.can_access_event(p_event) or not public.meet_on_day(e, v_today) then
    return jsonb_build_object('status', 'not_today_meet');
  end if;
  if public.is_event_host(p_event) then
    return jsonb_build_object('status', 'own_meet');
  end if;
  v_start := public.meet_start_on(e, v_today);
  -- Pop-up meets don't count: posted at least a day ahead.
  if e.created_at > v_start - interval '24 hours' then
    return jsonb_build_object('status', 'posted_too_late');
  end if;
  if not exists (select 1 from public.rsvps r where r.event_id = p_event and r.user_id = v_uid and r.status = 'going' and r.going_at < v_start) then
    return jsonb_build_object('status', 'no_rsvp');
  end if;
  if now() < v_start - interval '15 minutes' then
    return jsonb_build_object('status', 'too_early', 'starts_at', v_start);
  end if;
  if now() > public.meet_end_on(e, v_today) then
    return jsonb_build_object('status', 'meet_over');
  end if;
  if e.lat is null or e.lng is null or p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'need_location');
  end if;
  v_dist := round(public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34);
  if v_dist is null or v_dist > s.boost_radius_m then
    return jsonb_build_object('status', 'too_far', 'distance_m', v_dist);
  end if;
  if en.event_id = p_event and en.checked_in_at is not null then
    return jsonb_build_object('status', 'ok', 'confirm_at', en.checked_in_at + make_interval(mins => s.boost_stay_minutes));
  end if;
  update public.boost_entries set event_id = p_event, checked_in_at = now(), check_in_distance_m = v_dist, reminded_at = null
   where user_id = v_uid and day = v_today;
  return jsonb_build_object('status', 'ok', 'confirm_at', now() + make_interval(mins => s.boost_stay_minutes));
end;
$$;

create or replace function public.boost_confirm(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  en public.boost_entries;
  e public.events;
  v_today date := public.atl_today();
  v_dist integer;
  v_tries int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into s from public.points_settings limit 1;
  if coalesce(s.boost_points, 0) = 0 then
    return jsonb_build_object('status', 'not_today');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  update public.boost_entries set tries = tries + 1 where user_id = v_uid and day = v_today returning tries into v_tries;
  select * into en from public.boost_entries where user_id = v_uid and day = v_today for update;
  if not found then
    return jsonb_build_object('status', 'not_opted_in');
  end if;
  if en.confirmed_at is not null then
    return jsonb_build_object('status', 'already_paid', 'earned', en.points);
  end if;
  if v_tries > 30 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  if en.checked_in_at is null then
    return jsonb_build_object('status', 'not_checked_in');
  end if;
  if now() < en.checked_in_at + make_interval(mins => s.boost_stay_minutes) then
    return jsonb_build_object('status', 'too_soon', 'confirm_at', en.checked_in_at + make_interval(mins => s.boost_stay_minutes));
  end if;
  select * into e from public.events where id = en.event_id and not coalesce(hidden, false);
  if not found or now() > public.meet_end_on(e, v_today) + interval '30 minutes' then
    return jsonb_build_object('status', 'meet_over');
  end if;
  if e.lat is null or e.lng is null or p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'need_location');
  end if;
  v_dist := round(public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34);
  if v_dist is null or v_dist > s.boost_radius_m then
    return jsonb_build_object('status', 'too_far', 'distance_m', v_dist);
  end if;
  update public.boost_entries set confirmed_at = now(), confirm_distance_m = v_dist, points = s.boost_points
   where user_id = v_uid and day = v_today;
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, s.boost_points, 'boost_bonus', left('Boost Day: ' || coalesce(e.title, 'a meet'), 120));
  perform public.notify(v_uid, 'boost', '🔥 Boost hit! +' || s.boost_points || ' points', 'You showed up to ' || left(coalesce(e.title, 'a meet'), 60) || ' on Boost Day.', 'open:boost', 'boost-paid:' || v_today);
  return jsonb_build_object('status', 'ok', 'earned', s.boost_points);
end;
$$;
