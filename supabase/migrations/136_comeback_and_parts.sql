-- 1. Parts for my car, smarter: a part listed for one trim or chassis
--    (fit_trim, e.g. "G30") only alerts owners whose car says that trim (or
--    says none); and adding a car to the garage tells you about parts already
--    for sale that fit it.
-- 2. Comeback nudges: members away 3, 7, 14 or 30 days get one alert per
--    step, at a random time in the afternoon, with bonus points to claim
--    within 48 hours from the 7-day step on (amounts in points_settings).

-- ---------- 1. parts ----------
-- "M Sport, xDrive, G30" ~ "G30": letters and digits only, either contains the other.
create or replace function public.trim_matches(p_car text, p_listing text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_listing is null or btrim(p_listing) = '' or p_car is null or btrim(p_car) = ''
      or position(regexp_replace(lower(p_listing), '[^a-z0-9]', '', 'g') in regexp_replace(lower(p_car), '[^a-z0-9]', '', 'g')) > 0
      or position(regexp_replace(lower(p_car), '[^a-z0-9]', '', 'g') in regexp_replace(lower(p_listing), '[^a-z0-9]', '', 'g')) > 0;
$$;

-- Same as 134, plus the trim check.
create or replace function public.alert_part_fits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_price text := case when new.price_cents is null then 'make an offer' when new.price_cents = 0 then 'free' else '$' || to_char(new.price_cents / 100.0, 'FM999,999,990.00') end;
begin
  if new.fit_universal or new.fit_make is null or new.fit_model is null or new.status <> 'active' then
    return new;
  end if;
  for r in
    select distinct on (v.owner_id) v.owner_id, trim(concat_ws(' ', v.year::text, v.make, v.model)) as car
      from public.vehicles v
      left join public.alert_settings a on a.user_id = v.owner_id
     where lower(v.make) = lower(new.fit_make)
       and regexp_replace(lower(v.model), '[^a-z0-9]', '', 'g') = regexp_replace(lower(new.fit_model), '[^a-z0-9]', '', 'g')
       and (new.fit_year_from is null or v.year is null or v.year between new.fit_year_from and coalesce(new.fit_year_to, new.fit_year_from))
       and public.trim_matches(v.trim, new.fit_trim)
       and v.owner_id <> new.seller_id
       and coalesce(a.parts, true)
       and not public.blocked_either_way(v.owner_id, new.seller_id)
       and (select count(*) from public.notifications n
             where n.user_id = v.owner_id and n.kind = 'part_for_you'
               and n.dedupe like 'part:' || new.seller_id || ':%'
               and n.created_at > now() - interval '1 day') < 3
     order by v.owner_id, v.is_primary desc nulls last
     limit 300
  loop
    perform public.notify(r.owner_id, 'part_for_you', left('🛒 A part for your ' || r.car, 120),
      left(new.title, 80) || ' · ' || v_price || coalesce(' · ' || new.city, '') || '. Tap to see if it fits.',
      'listing:' || new.id, 'part:' || new.seller_id || ':' || new.id);
  end loop;
  return new;
end;
$$;

-- Parts already for sale that fit a car, for its owner. Active, listed in
-- the last 60 days, not their own, nobody blocked either way.
create or replace function public.parts_fitting(p_vehicle uuid)
returns setof public.listings
language sql
stable
security definer
set search_path = public
as $$
  select l.*
    from public.vehicles v
    join public.listings l
      on lower(l.fit_make) = lower(v.make)
     and regexp_replace(lower(l.fit_model), '[^a-z0-9]', '', 'g') = regexp_replace(lower(v.model), '[^a-z0-9]', '', 'g')
     and (l.fit_year_from is null or v.year is null or v.year between l.fit_year_from and coalesce(l.fit_year_to, l.fit_year_from))
     and public.trim_matches(v.trim, l.fit_trim)
   where v.id = p_vehicle
     and not coalesce(l.fit_universal, false)
     and l.status = 'active'
     and l.created_at > now() - interval '60 days'
     and l.seller_id <> v.owner_id
     and not public.blocked_either_way(l.seller_id, v.owner_id)
   order by l.created_at desc
   limit 50;
$$;
revoke execute on function public.parts_fitting(uuid) from public, anon, authenticated;

-- A car added (or changed to another make, model or year): one alert about
-- the parts already for sale for it.
create or replace function public.alert_parts_for_new_car()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_first public.listings;
  v_car text := trim(concat_ws(' ', new.year::text, new.make, new.model));
begin
  if tg_op = 'UPDATE' and new.make is not distinct from old.make and new.model is not distinct from old.model
     and new.year is not distinct from old.year and new.trim is not distinct from old.trim then
    return new;
  end if;
  if new.make is null or new.model is null
     or not coalesce((select a.parts from public.alert_settings a where a.user_id = new.owner_id), true) then
    return new;
  end if;
  select count(*) into v_n from public.parts_fitting(new.id);
  if v_n = 0 then
    return new;
  end if;
  select * into v_first from public.parts_fitting(new.id) limit 1;
  perform public.notify(new.owner_id, 'part_for_you',
    left(case when v_n = 1 then '🛒 A part for sale fits your ' else '🛒 ' || v_n || ' parts for sale fit your ' end || v_car, 120),
    case when v_n = 1 then left(v_first.title, 80) || '. Tap to see it.' else 'Tap to see them in Parts.' end,
    case when v_n = 1 then 'listing:' || v_first.id else 'listing-fit:' || new.id end,
    'carparts:' || new.id || ':' || md5(coalesce(v_car, '') || coalesce(new.trim, '')));
  return new;
end;
$$;
drop trigger if exists alert_parts_for_new_car on public.vehicles;
create trigger alert_parts_for_new_car after insert or update of make, model, year, trim on public.vehicles
  for each row execute function public.alert_parts_for_new_car();

-- ---------- 2. comeback nudges ----------
alter table public.points_settings
  add column if not exists comeback_on boolean not null default true,
  add column if not exists comeback_points_7 integer not null default 10 check (comeback_points_7 between 0 and 100),
  add column if not exists comeback_points_14 integer not null default 15 check (comeback_points_14 between 0 and 100),
  add column if not exists comeback_points_30 integer not null default 25 check (comeback_points_30 between 0 and 100);

alter table public.alert_settings add column if not exists comeback boolean not null default true;

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus', 'guess_bonus', 'taco_bonus', 'scratch_buy', 'scratch_win', 'daily_bonus', 'boost_bonus',
  'comeback_bonus'
));

-- When each member was last in the app, and how far this absence's nudges got.
create table if not exists public.member_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  away_stage integer not null default 0,
  last_nudge_at timestamptz
);
create index if not exists member_activity_seen on public.member_activity (last_seen_at);
-- Launch: members who signed in during the last 30 days count as just seen,
-- so nobody active gets a "missed you" nudge the day this goes live.
insert into public.member_activity (user_id, last_seen_at)
select id, now() from auth.users where last_sign_in_at > now() - interval '30 days'
on conflict (user_id) do nothing;
alter table public.member_activity enable row level security;
revoke all on public.member_activity from public, anon, authenticated;

-- A nudge, queued for a random afternoon time, then an offer to claim.
create table if not exists public.comeback_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage integer not null check (stage between 1 and 4),
  points integer not null default 0 check (points between 0 and 100),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  link text check (char_length(link) <= 120),
  send_at timestamptz not null,
  sent_at timestamptz,
  expires_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists comeback_offers_due on public.comeback_offers (send_at) where sent_at is null;
create index if not exists comeback_offers_user on public.comeback_offers (user_id, created_at desc);
alter table public.comeback_offers enable row level security;
revoke all on public.comeback_offers from public, anon, authenticated;

-- The app, on open: you're here. Ends the absence, and hands back a points
-- offer that was sent and is still open. → { offer: { id, points, expires_at } | null }
create or replace function public.mark_seen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  o public.comeback_offers;
begin
  if v_uid is null then
    return jsonb_build_object('offer', null);
  end if;
  insert into public.member_activity (user_id, last_seen_at, away_stage)
  values (v_uid, now(), 0)
  on conflict (user_id) do update
    set last_seen_at = now(), away_stage = 0
    where public.member_activity.last_seen_at < now() - interval '5 minutes';
  -- Back before a queued nudge went out: it isn't needed.
  delete from public.comeback_offers where user_id = v_uid and sent_at is null;
  select * into o from public.comeback_offers
   where user_id = v_uid and sent_at is not null and claimed_at is null and points > 0 and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('offer', null);
  end if;
  return jsonb_build_object('offer', jsonb_build_object('id', o.id, 'points', o.points, 'expires_at', o.expires_at));
end;
$$;
revoke execute on function public.mark_seen() from public, anon;
grant execute on function public.mark_seen() to authenticated;

-- Claim the welcome-back points. → { status, earned }
-- status: not_found | already | expired | ok
create or replace function public.claim_comeback(p_offer uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.comeback_offers;
begin
  select * into o from public.comeback_offers where id = p_offer and user_id = auth.uid() and sent_at is not null for update;
  if not found or o.points <= 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  if o.claimed_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  if o.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  update public.comeback_offers set claimed_at = now() where id = o.id;
  -- Claiming is coming back (even straight from the alert, without the app's
  -- mark_seen): the absence ends, so one paid step per absence.
  insert into public.member_activity (user_id, last_seen_at, away_stage)
  values (o.user_id, now(), 0)
  on conflict (user_id) do update set last_seen_at = now(), away_stage = 0;
  delete from public.comeback_offers where user_id = o.user_id and sent_at is null;
  insert into public.point_ledger (user_id, delta, reason, note)
  values (o.user_id, o.points, 'comeback_bonus', 'Welcome back bonus');
  return jsonb_build_object('status', 'ok', 'earned', o.points);
end;
$$;
revoke execute on function public.claim_comeback(uuid) from public, anon;
grant execute on function public.claim_comeback(uuid) to authenticated;

-- A random time this afternoon, Atlanta time (12:00–4:30 PM), or within the
-- hour if that's passed. The 5 PM Instagram run delivers anything left.
create or replace function public.comeback_send_time()
returns timestamptz
language sql
volatile
set search_path = public
as $$
  select greatest(
    ((public.atl_today() + time '12:00') at time zone 'America/New_York') + (random() * interval '270 minutes'),
    now() + (random() * interval '60 minutes'));
$$;

-- Daily job: queue one nudge for each member who's been away long enough
-- for their next step. Steps: 3 days (a reason to look), 7, 14 and 30 days
-- (with points). One step per absence, at most one nudge every 3 days.
-- Only confirmed members, accounts 14+ days old, with the setting on.
-- Points only for members the app has seen (mark_seen): an account known
-- only by its sign-up or last sign-in date gets one nudge without points and
-- nothing more until it opens the app.
create or replace function public.queue_comeback_nudges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.points_settings;
  r record;
  v_points int;
  v_meets int;
  v_parts int;
  v_car text;
  v_hook_title text;
  v_hook_body text;
  v_link text;
  v_lats double precision[];
  v_lngs double precision[];
  v_n int := 0;
begin
  select * into s from public.points_settings limit 1;
  if s is null or not coalesce(s.comeback_on, true) then
    return 0;
  end if;
  -- This week's public meets, worked out once (not per member).
  select coalesce(array_agg(e.lat), '{}'), coalesce(array_agg(e.lng), '{}') into v_lats, v_lngs
    from public.events e
   where not coalesce(e.hidden, false) and e.cancelled_at is null and e.visibility = 'public'
     and e.lat is not null and e.lng is not null
     and exists (select 1 from generate_series(0, 6) d where public.meet_on_day(e, public.atl_today() + d));
  for r in
    select x.*, case
             when x.seen_at < now() - interval '30 days' then 4
             when x.seen_at < now() - interval '14 days' then 3
             when x.seen_at < now() - interval '7 days' then 2
             else 1 end as stage
      from (
        select u.id as user_id, coalesce(m.last_seen_at, u.last_sign_in_at, u.created_at) as seen_at,
               m.user_id is not null as seen_by_app,
               coalesce(m.away_stage, 0) as away_stage, a.lat, a.lng, coalesce(a.radius_miles, 25) as radius
          from auth.users u
          left join public.member_activity m on m.user_id = u.id
          left join public.alert_settings a on a.user_id = u.id
         where u.created_at < now() - interval '14 days'
           and coalesce(m.away_stage, 0) < 4
           and coalesce(m.last_seen_at, u.last_sign_in_at, u.created_at) < now() - interval '3 days'
           and (m.last_nudge_at is null or m.last_nudge_at < now() - interval '3 days')
           and coalesce(a.comeback, true)
           and public.email_confirmed(u.id)
           and not exists (select 1 from public.comeback_offers o where o.user_id = u.id and o.sent_at is null)
      ) x
     -- Each step once per absence; nothing after the 30-day one.
     where case
             when x.seen_at < now() - interval '30 days' then 4
             when x.seen_at < now() - interval '14 days' then 3
             when x.seen_at < now() - interval '7 days' then 2
             else 1 end > x.away_stage
     order by x.seen_at desc
     limit 2000
  loop
    v_points := case when not r.seen_by_app then 0
      when r.stage = 2 then s.comeback_points_7 when r.stage = 3 then s.comeback_points_14 when r.stage = 4 then s.comeback_points_30 else 0 end;
    -- Points at most once a month per member (the nudge still goes out).
    if v_points > 0 and exists (select 1 from public.comeback_offers o where o.user_id = r.user_id and o.points > 0 and o.created_at > now() - interval '30 days') then
      v_points := 0;
    end if;

    -- A reason to come back: meets near them this week, new parts for their
    -- car, or the scene in general.
    v_meets := 0;
    if r.lat is not null and r.lng is not null and cardinality(v_lats) > 0 then
      select count(*) into v_meets from unnest(v_lats, v_lngs) as w(lat, lng)
       where public.miles_between(r.lat, r.lng, w.lat, w.lng) <= r.radius;
    end if;
    select count(*), min(trim(concat_ws(' ', v.year::text, v.make, v.model))) into v_parts, v_car
      from public.vehicles v
      join public.listings l on lower(l.fit_make) = lower(v.make)
       and regexp_replace(lower(l.fit_model), '[^a-z0-9]', '', 'g') = regexp_replace(lower(v.model), '[^a-z0-9]', '', 'g')
       and (l.fit_year_from is null or v.year is null or v.year between l.fit_year_from and coalesce(l.fit_year_to, l.fit_year_from))
       and public.trim_matches(v.trim, l.fit_trim)
     where v.owner_id = r.user_id and l.status = 'active' and l.created_at > r.seen_at and l.seller_id <> r.user_id
       and not coalesce(l.fit_universal, false)
       and not public.blocked_either_way(l.seller_id, r.user_id);

    if v_meets > 0 and (v_parts = 0 or random() < 0.6) then
      v_hook_title := '🏁 ' || v_meets || case when v_meets = 1 then ' meet' else ' meets' end || ' near you this week';
      v_hook_body := 'See who''s going and RSVP';
      v_link := 'tab:discover';
    elsif v_parts > 0 then
      v_hook_title := '🛒 ' || v_parts || ' new ' || case when v_parts = 1 then 'part fits' else 'parts fit' end || ' your ' || v_car;
      v_hook_body := 'Listed since you were last on';
      v_link := 'tab:community';
    else
      v_hook_title := (array['🚗 The Georgia car scene missed you', '🔥 New meets, linkups and builds are up', '👀 See what''s new on TUNR'])[1 + floor(random() * 3)::int];
      v_hook_body := 'Meets, linkups and builds near you';
      v_link := 'tab:discover';
    end if;

    insert into public.comeback_offers (user_id, stage, points, title, body, link, send_at)
    values (r.user_id, r.stage, v_points,
      left(case when v_points > 0 then '🎁 +' || v_points || ' bonus points are waiting for you' else v_hook_title end, 120),
      left(case when v_points > 0 then v_hook_title || '. Open TUNR in the next 48 hours to claim them.' else v_hook_body || '.' end, 300),
      case when v_points > 0 then 'open:comeback' else v_link end,
      public.comeback_send_time());
    -- Never seen by the app: this one nudge is the last until they open it.
    insert into public.member_activity (user_id, last_seen_at, away_stage, last_nudge_at)
    values (r.user_id, r.seen_at, case when r.seen_by_app then r.stage else 4 end, now())
    on conflict (user_id) do update set away_stage = excluded.away_stage, last_nudge_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.queue_comeback_nudges() from public, anon, authenticated;

-- Sends the nudges whose time has come (runs with every alert delivery, the
-- daily job and the 5 PM run). Offers with points stay open 48 hours.
create or replace function public.release_comeback_nudges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.comeback_offers;
  v_n int := 0;
begin
  for o in
    select * from public.comeback_offers
     where sent_at is null and send_at <= now()
     order by send_at
     limit 500
     for update skip locked
  loop
    update public.comeback_offers set sent_at = now(), expires_at = case when o.points > 0 then now() + interval '48 hours' end where id = o.id;
    perform public.notify(o.user_id, 'comeback', o.title, o.body, o.link, 'comeback:' || o.id);
    v_n := v_n + 1;
  end loop;
  -- Old offers go after 60 days.
  delete from public.comeback_offers where created_at < now() - interval '60 days';
  return v_n;
end;
$$;
revoke execute on function public.release_comeback_nudges() from public, anon, authenticated;

-- Admins: how it's going (last 30 days).
create or replace function public.admin_comeback_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  return (
    select jsonb_build_object(
      'sent', count(*) filter (where sent_at is not null),
      'with_points', count(*) filter (where sent_at is not null and points > 0),
      'claimed', count(*) filter (where claimed_at is not null),
      'points_paid', coalesce(sum(points) filter (where claimed_at is not null), 0),
      'came_back', (select count(distinct o.user_id) from public.comeback_offers o join public.member_activity m on m.user_id = o.user_id
                     where o.sent_at > now() - interval '30 days' and m.last_seen_at > o.sent_at),
      'waiting', count(*) filter (where sent_at is null)
    )
    from public.comeback_offers
    where created_at > now() - interval '30 days'
  );
end;
$$;
revoke execute on function public.admin_comeback_stats() from public, anon;
grant execute on function public.admin_comeback_stats() to authenticated;
