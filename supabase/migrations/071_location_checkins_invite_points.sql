-- Two owner corrections:
--
--   1. No check-in codes at meets. Boosted meets, like every meet, are
--      checked by location only: within a quarter mile of the meet's pin,
--      during the meet, with a precise location. p_code stays in the
--      function's signature so older app versions still work; it's ignored.
--   2. Invite points: 1 for the inviter and 1 welcome point for the new
--      member at their first check-in (was 5 and 2), and admins can change
--      both (0 turns one off) in Settings → Admin → Purchases → Rates.

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

  -- No codes: being at the pin during the meet (checked below) is the proof.
  if v_boost is null and e.recurrence is null and e.created_at > e.start_at - interval '24 hours' then
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
    v_bonus := 1;
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

alter table public.points_settings
  add column if not exists referral_points integer not null default 1 check (referral_points between 0 and 20),
  add column if not exists welcome_points integer not null default 1 check (welcome_points between 0 and 20);

update public.points_settings set referral_points = 1, welcome_points = 1;

-- Same as 058, with the amounts from points_settings.
create or replace function public.pay_referral_on_first_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_paid int;
  v_ref int;
  v_welcome int;
begin
  if (select count(*) from public.meet_checkins where user_id = new.user_id and voided_at is null) <> 1 then
    return new;
  end if;
  select invited_by into v_inviter from public.profiles where id = new.user_id;
  if v_inviter is null or exists (select 1 from public.referral_payouts where referred_id = new.user_id) then
    return new;
  end if;
  select coalesce(referral_points, 1), coalesce(welcome_points, 1) into v_ref, v_welcome from public.points_settings;

  select count(*) into v_paid from public.referral_payouts
   where inviter_id = v_inviter and paid
     and created_at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';

  insert into public.referral_payouts (referred_id, inviter_id, paid) values (new.user_id, v_inviter, v_paid < 10 and v_ref > 0)
  on conflict do nothing;

  if v_welcome > 0 then
    insert into public.point_ledger (user_id, delta, reason, note)
    values (new.user_id, v_welcome, 'welcome_bonus', 'Welcome to TUNR: first meet!')
    on conflict do nothing;
  end if;

  if v_paid < 10 and v_ref > 0 then
    insert into public.point_ledger (user_id, delta, reason, note)
    values (v_inviter, v_ref, 'referral_bonus',
            left('@' || coalesce((select username from public.profiles where id = new.user_id), 'a friend') || ' checked in at their first meet', 200));
    perform public.notify(v_inviter, 'reward', '⭐ +' || v_ref || ' referral point' || case when v_ref = 1 then '' else 's' end,
      coalesce('@' || (select username from public.profiles where id = new.user_id), 'Your friend') ||
        ' checked in at their first meet.', 'person:' || new.user_id, 'referral:' || new.user_id);
  end if;
  return new;
end;
$$;
