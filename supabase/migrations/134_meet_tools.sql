-- Meet tools (from the owner's list):
--   * Cancel or move a meet: hosts cancel with a reason (or un-cancel), and
--     everyone who RSVP'd is told; moving a meet's time or place tells
--     them too (whichever way it's edited). Cancelled meets show as
--     cancelled and take no new RSVPs.
--   * "Tell me when a part for my car is listed": a new parts listing
--     alerts people whose garage car matches its make, model and years
--     (Alerts → Parts for my car; off switch alert_settings.parts).
--   * "Who's down?": a quick shout (cruise / photos / hang, now / tonight
--     / tomorrow, a rough area) to people nearby; they tap I'M DOWN; the
--     poster turns it into a linkup and everyone down is told it's on.

-- ---------- cancel / move ----------
alter table public.events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200);

create or replace view public.events_public as
select
  e.id, e.slug, e.title, e.host, e.verified, e.city,
  e.start_at, e.end_at, e.recurrence, e.timezone, e.vibe, e.tags,
  e.base_going, e.base_interested, e.created_by, e.created_at,
  e.visibility, e.access_mode, e.hidden,
  v.locked,
  m.status as membership_status,
  case when v.locked then null else e.location end as location,
  case when v.locked then null else e.description end as description,
  case when v.locked then null else e.lng end as lng,
  case when v.locked then null else e.lat end as lat,
  case when v.locked then null else e.photo_url end as photo_url,
  case when v.locked then null else e.source end as source,
  case when v.locked then null else e.source_url end as source_url,
  case when h.is_host then e.passcode else null end as passcode,
  e.recurrence_until,
  -- An account-backed co-host shows under their current username, so a
  -- rename can't leave a stale credit someone else could take.
  coalesce(
    (select array_agg(coalesce(pr.username, c.host) order by c.created_at)
       from public.event_cohosts c
       left join public.profiles pr on pr.id = c.user_id
      where c.event_id = e.id and c.status = 'accepted'),
    '{}'::text[]
  ) as cohosts,
  h.is_host as viewer_is_host,
  case when v.locked then null else e.flyer_url end as flyer_url,
  f.issue as issue_flag,
  f.reporters as issue_count,
  e.meet_style,
  case when v.locked then null else e.showcase_note end as showcase_note,
  e.cancelled_at,
  -- The reason is free text (it can say where the meet went), so a locked
  -- private meet hides it like the description.
  case when v.locked then null else e.cancel_reason end as cancel_reason
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select public.is_event_host(e.id) as is_host
) h
cross join lateral (
  select (
    e.visibility = 'private'
    and not h.is_host
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v
left join lateral (
  -- The discrepancy at least three people have reported and nobody has
  -- dealt with yet, if any. Shown as a flag on the meet; the meet stays up.
  select r.reason as issue, count(distinct r.reporter_id)::int as reporters
  from public.reports r
  where r.event_id = e.id
    and r.resolved_at is null
    and r.reason in ('Cancelled or postponed', 'Wrong date or time', 'Wrong location')
  group by r.reason
  having count(distinct r.reporter_id) >= 3
  order by count(*) desc
  limit 1
) f on true
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- Who to tell about a meet: everyone with a going / interested RSVP. On a
-- private meet only people still let in (owner, approved members, accepted
-- co-hosts): an RSVP left over from before it went private, or from a
-- removed member, mustn't hear where it moved to.
create or replace function public.tell_meet_rsvps(p_event uuid, p_title text, p_body text, p_dedupe text, p_skip uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select distinct rs.user_id
      from public.rsvps rs
      join public.events e on e.id = rs.event_id
     where rs.event_id = p_event and rs.status in ('going', 'interested') and rs.user_id is distinct from p_skip
       and (e.visibility = 'public'
            or rs.user_id = e.created_by
            or exists (select 1 from public.event_members m where m.event_id = e.id and m.user_id = rs.user_id and m.status = 'approved')
            or (e.created_by is not null and exists (select 1 from public.event_cohosts c where c.event_id = e.id and c.user_id = rs.user_id and c.status = 'accepted')))
     limit 2000
  loop
    perform public.notify(r.user_id, 'meet_change', p_title, p_body, 'meet:' || p_event, p_dedupe);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.tell_meet_rsvps(uuid, text, text, text, uuid) from public, anon, authenticated;

-- "Meet moved" alerts sent, so a host re-editing a meet over and over can't
-- keep pinging everyone (three a day per meet). No policies: only the
-- trigger below touches it.
create table if not exists public.meet_change_alerts (
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists meet_change_alerts_idx on public.meet_change_alerts (event_id, created_at);
alter table public.meet_change_alerts enable row level security;
revoke all on public.meet_change_alerts from public, anon, authenticated;

create or replace function public.meet_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := coalesce(new.timezone, 'America/New_York');
  v_when text := to_char(new.start_at at time zone v_tz, 'Dy Mon FMDD, FMHH12:MI AM');
  v_moved boolean;
begin
  if coalesce(new.hidden, false) then
    return new;
  end if;
  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.tell_meet_rsvps(new.id, left('❌ Cancelled: ' || new.title, 120),
      coalesce(nullif(trim(new.cancel_reason), ''), 'The host cancelled this meet.'), 'cancel:' || new.id || ':' || public.atl_today(), auth.uid());
    return new;
  end if;
  if old.cancelled_at is not null and new.cancelled_at is null then
    perform public.tell_meet_rsvps(new.id, left('✅ Back on: ' || new.title, 120), 'It''s happening after all: ' || v_when || '.', 'uncancel:' || new.id || ':' || public.atl_today(), auth.uid());
    return new;
  end if;
  if new.cancelled_at is not null or coalesce(new.end_at, new.start_at + interval '4 hours') < now() then
    return new;
  end if;
  v_moved := new.start_at is distinct from old.start_at
    or coalesce(trim(new.location), '') is distinct from coalesce(trim(old.location), '')
    or (new.lat is not null and old.lat is not null and public.miles_between(new.lat, new.lng, old.lat, old.lng) > 0.2);
  if v_moved and (select count(*) from public.meet_change_alerts where event_id = new.id and created_at > now() - interval '1 day') < 3 then
    insert into public.meet_change_alerts (event_id) values (new.id);
    perform public.tell_meet_rsvps(new.id, left('📅 Meet moved: ' || new.title, 120),
      'Now ' || v_when || coalesce(' at ' || nullif(trim(new.location), ''), '') || '.',
      'moved:' || new.id || ':' || md5(coalesce(new.start_at::text, '') || coalesce(new.location, '')), auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists meet_changed on public.events;
create trigger meet_changed after update of start_at, end_at, location, lat, lng, cancelled_at on public.events
  for each row execute function public.meet_changed();

-- Cancelling goes through cancel_meet (its checks, and the alert limits
-- above); a host's direct update of these columns is ignored.
create or replace function public.guard_meet_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and coalesce(current_setting('tunr.cancel_meet', true), '') <> 'on' then
    new.cancelled_at := old.cancelled_at;
    new.cancel_reason := old.cancel_reason;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_meet_cancel on public.events;
create trigger guard_meet_cancel before update on public.events for each row execute function public.guard_meet_cancel();

-- Hosts (and admins) cancel or un-cancel. → { status }
create or replace function public.cancel_meet(p_event uuid, p_reason text default null, p_undo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events;
begin
  if not (public.is_event_host(p_event) or public.is_admin()) then
    return jsonb_build_object('status', 'not_host');
  end if;
  select * into e from public.events where id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_undo then
    if e.cancelled_at is null then
      return jsonb_build_object('status', 'not_cancelled');
    end if;
    perform set_config('tunr.cancel_meet', 'on', true);
    update public.events set cancelled_at = null, cancel_reason = null where id = p_event;
    perform set_config('tunr.cancel_meet', '', true);
    return jsonb_build_object('status', 'ok');
  end if;
  if e.cancelled_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  if e.recurrence is null and coalesce(e.end_at, e.start_at + interval '4 hours') < now() then
    return jsonb_build_object('status', 'meet_over');
  end if;
  perform set_config('tunr.cancel_meet', 'on', true);
  update public.events set cancelled_at = now(), cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '') where id = p_event;
  perform set_config('tunr.cancel_meet', '', true);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.cancel_meet(uuid, text, boolean) from public, anon;
grant execute on function public.cancel_meet(uuid, text, boolean) to authenticated;

-- No new RSVPs to a cancelled meet (taking one back is fine).
create or replace function public.no_rsvp_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('going', 'interested') and exists (select 1 from public.events where id = new.event_id and cancelled_at is not null) then
    raise exception 'meet_cancelled';
  end if;
  return new;
end;
$$;
drop trigger if exists no_rsvp_cancelled on public.rsvps;
create trigger no_rsvp_cancelled before insert or update of status, event_id on public.rsvps for each row execute function public.no_rsvp_cancelled();

-- ---------- parts for my car ----------
alter table public.alert_settings add column if not exists parts boolean not null default true;

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
       and v.owner_id <> new.seller_id
       and coalesce(a.parts, true)
       and not public.blocked_either_way(v.owner_id, new.seller_id)
       -- At most three a day from the same seller (deleting and relisting
       -- doesn't reset it).
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
drop trigger if exists alert_part_fits on public.listings;
create trigger alert_part_fits after insert on public.listings for each row execute function public.alert_part_fits();

-- ---------- who's down? ----------
create table if not exists public.link_shouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photos', 'cruise', 'hang')),
  when_label text not null check (when_label in ('now', 'tonight', 'tomorrow')),
  area text check (char_length(area) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  linkup_id uuid references public.linkups (id) on delete set null,
  cancelled_at timestamptz
);
create index if not exists link_shouts_live_idx on public.link_shouts (expires_at) where cancelled_at is null;
alter table public.link_shouts enable row level security;
drop policy if exists "people see shouts" on public.link_shouts;
-- Only your own: others see shouts through shouts_near, as a distance, never
-- the stored spot.
create policy "people see shouts" on public.link_shouts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create table if not exists public.link_shout_downs (
  shout_id uuid not null references public.link_shouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shout_id, user_id)
);
alter table public.link_shout_downs enable row level security;
drop policy if exists "you and the poster see who's down" on public.link_shout_downs;
create policy "you and the poster see who's down" on public.link_shout_downs for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.link_shouts s where s.id = shout_id and s.user_id = auth.uid()) or public.is_admin());

-- Post a shout; people nearby with linkup alerts on hear about it.
create or replace function public.post_shout(p_kind text, p_when text, p_area text, p_lat double precision, p_lng double precision, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today date := public.atl_today();
  v_expires timestamptz;
  v_name text;
  rec record;
  v_n int := 0;
  v_when text := case p_when when 'now' then 'right now' when 'tonight' then 'tonight' else 'tomorrow' end;
  v_lat double precision := round(p_lat::numeric, 2);
  v_lng double precision := round(p_lng::numeric, 2);
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if p_kind not in ('photos', 'cruise', 'hang') or p_when not in ('now', 'tonight', 'tomorrow') or p_lat is null or p_lng is null then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if exists (select 1 from public.link_shouts where user_id = v_uid and cancelled_at is null and expires_at > now()) then
    return jsonb_build_object('status', 'already_live');
  end if;
  if (select count(*) from public.link_shouts where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  v_expires := case p_when
    when 'now' then now() + interval '3 hours'
    when 'tonight' then ((v_today + 1) + time '03:00') at time zone 'America/New_York'
    else ((v_today + 2) + time '03:00') at time zone 'America/New_York' end;
  insert into public.link_shouts (user_id, kind, when_label, area, lat, lng, note, expires_at)
  values (v_uid, p_kind, p_when, nullif(left(trim(coalesce(p_area, '')), 80), ''), v_lat, v_lng,
          nullif(left(trim(coalesce(p_note, '')), 140), ''), v_expires)
  returning id into v_id;
  select username into v_name from public.profiles where id = v_uid;
  for rec in
    select s.user_id, public.miles_between(s.lat, s.lng, v_lat, v_lng) as miles
      from public.alert_settings s
     where s.linkups and s.lat is not null and s.lng is not null and s.user_id <> v_uid
       and public.miles_between(s.lat, s.lng, v_lat, v_lng) <= s.radius_miles
       and not public.blocked_either_way(s.user_id, v_uid)
     order by 2
     limit 300
  loop
    perform public.notify(rec.user_id, 'shout', '🙋 Who''s down? ' || public.linkup_kind_label(p_kind) || ' ' || v_when,
      '@' || coalesce(v_name, 'someone') || coalesce(' · ' || nullif(trim(p_area), ''), '') || ' · ' || round(rec.miles::numeric, 0) || ' mi' || coalesce(': ' || nullif(trim(p_note), ''), ''),
      'shout:' || v_id, 'shout:' || v_id);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('status', 'ok', 'id', v_id, 'told', v_n);
end;
$$;
revoke execute on function public.post_shout(text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.post_shout(text, text, text, double precision, double precision, text) to authenticated;

-- I'm down (or not anymore). The poster hears about each new one.
create or replace function public.shout_down(p_shout uuid, p_down boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.link_shouts;
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.link_shouts where id = p_shout;
  if not found or s.cancelled_at is not null or s.expires_at <= now() or public.blocked_either_way(s.user_id, v_uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if s.user_id = v_uid then
    return jsonb_build_object('status', 'own_shout');
  end if;
  if not p_down then
    delete from public.link_shout_downs where shout_id = p_shout and user_id = v_uid;
    return jsonb_build_object('status', 'ok', 'down', false);
  end if;
  insert into public.link_shout_downs (shout_id, user_id) values (p_shout, v_uid) on conflict do nothing;
  if found then
    select username into v_name from public.profiles where id = v_uid;
    perform public.notify(s.user_id, 'shout_down', '🙋 @' || coalesce(v_name, 'someone') || ' is down',
      (select count(*) from public.link_shout_downs where shout_id = p_shout) || ' down so far. Make it a linkup when you''re ready.',
      'shout:' || p_shout, 'shoutdown:' || p_shout || ':' || v_uid);
  end if;
  return jsonb_build_object('status', 'ok', 'down', true);
end;
$$;
revoke execute on function public.shout_down(uuid, boolean) from public, anon;
grant execute on function public.shout_down(uuid, boolean) to authenticated;

-- Live shouts near a spot, with counts. Who's down: the poster only.
create or replace function public.shouts_near(p_lat double precision, p_lng double precision, p_miles integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'when', s.when_label, 'area', s.area, 'note', s.note, 'created_at', s.created_at, 'expires_at', s.expires_at,
      'username', p.username, 'mine', s.user_id = auth.uid(), 'linkup_id', s.linkup_id,
      'miles', case when p_lat is null then null else round(public.miles_between(p_lat, p_lng, s.lat, s.lng)::numeric, 1) end,
      'downs', (select count(*) from public.link_shout_downs d where d.shout_id = s.id),
      'i_am_down', exists (select 1 from public.link_shout_downs d where d.shout_id = s.id and d.user_id = auth.uid()),
      'down_names', case when s.user_id = auth.uid() then (select coalesce(jsonb_agg(pr.username order by d.created_at), '[]'::jsonb) from public.link_shout_downs d join public.profiles pr on pr.id = d.user_id where d.shout_id = s.id) end
    ) as x
    from public.link_shouts s
    join public.profiles p on p.id = s.user_id
    where auth.uid() is not null
      and s.cancelled_at is null and s.expires_at > now()
      and not public.blocked_either_way(s.user_id, auth.uid())
      and (s.user_id = auth.uid() or p_lat is null or public.miles_between(p_lat, p_lng, s.lat, s.lng) <= least(greatest(p_miles, 1), 250))
    limit 50
  ) t;
$$;
revoke execute on function public.shouts_near(double precision, double precision, integer) from public, anon;
grant execute on function public.shouts_near(double precision, double precision, integer) to authenticated;

-- The poster made it a linkup: tell everyone who was down.
create or replace function public.shout_to_linkup(p_shout uuid, p_linkup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.link_shouts;
  l public.linkups;
  r record;
begin
  select * into s from public.link_shouts where id = p_shout and user_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into l from public.linkups where id = p_linkup and user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'not_your_linkup');
  end if;
  update public.link_shouts set linkup_id = p_linkup, cancelled_at = now() where id = p_shout;
  for r in select user_id from public.link_shout_downs where shout_id = p_shout and not public.blocked_either_way(user_id, auth.uid()) loop
    perform public.notify(r.user_id, 'shout_on', '✅ It''s on: ' || public.linkup_kind_label(l.kind) || ' linkup',
      coalesce(l.area, 'Tap to see where') || '. You said you were down.', 'linkup:' || l.id, 'shouton:' || p_shout);
  end loop;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.shout_to_linkup(uuid, uuid) from public, anon;
grant execute on function public.shout_to_linkup(uuid, uuid) to authenticated;

create or replace function public.cancel_shout(p_shout uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.link_shouts set cancelled_at = now() where id = p_shout and user_id = auth.uid() and cancelled_at is null;
$$;
revoke execute on function public.cancel_shout(uuid) from public, anon;
grant execute on function public.cancel_shout(uuid) to authenticated;
