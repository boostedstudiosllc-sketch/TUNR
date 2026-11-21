-- Meet awards: a host turns on fan-voted awards for their meet or show
-- (Best Build, Best Interior, … or their own), and people at the meet vote
-- for the car that deserves each one.
--
--   award_presets        the starter list hosts pick from
--   meet_awards          a meet's awards (its hosts add and remove them)
--   meet_award_entries   "I'm here" (checked by location) and the car you
--                        brought; cars entered are the ones you can vote for
--   meet_award_votes     one vote per person per award (changeable while open)
--   meet_award_state     closed early by the host; winners announced
--
-- Voting opens 15 minutes before the start and closes an hour after the end
-- (or 4 hours after the start), or when a host closes it. Results show when
-- it closes (hosts see the count live). Nobody votes for their own car.
--
--   meet_awards_view(event)          everything the awards screen needs
--   enter_meet_awards(event, lat, lng, vehicle)
--   vote_meet_award(award, vehicle)
--   close_meet_awards(event)         hosts: close now
--   finish_meet_awards(event)        announces winners once closed (anyone can
--                                    nudge it; it only acts once)

create table if not exists public.award_presets (
  id text primary key,
  name text not null,
  emoji text not null,
  sort integer not null default 0
);
insert into public.award_presets (id, name, emoji, sort) values
  ('best_build', 'Best Build', '🏆', 1),
  ('best_interior', 'Best Interior', '🪑', 2),
  ('best_engine_bay', 'Best Engine Bay', '🔧', 3),
  ('best_exotic', 'Best Supercar / Exotic', '🏎️', 4),
  ('best_jdm', 'Best JDM', '🇯🇵', 5),
  ('best_euro', 'Best Euro', '🇪🇺', 6),
  ('best_domestic', 'Best Muscle / Domestic', '🇺🇸', 7),
  ('best_truck', 'Best Truck / SUV', '🛻', 8),
  ('best_paint', 'Best Paint or Wrap', '🎨', 9),
  ('best_stance', 'Best Stance', '📏', 10),
  ('best_wheels', 'Best Wheels', '🛞', 11),
  ('best_sound', 'Best Sound', '🔊', 12),
  ('best_classic', 'Best Classic', '🕰️', 13),
  ('cleanest_daily', 'Cleanest Daily', '✨', 14),
  ('crowd_favorite', 'Crowd Favorite', '❤️', 15)
on conflict (id) do nothing;
alter table public.award_presets enable row level security;
drop policy if exists "everyone sees the award list" on public.award_presets;
create policy "everyone sees the award list" on public.award_presets for select to anon, authenticated using (true);

create table if not exists public.meet_awards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  emoji text not null default '🏆' check (char_length(emoji) <= 8),
  preset text references public.award_presets (id),
  sort integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists meet_awards_name_once on public.meet_awards (event_id, lower(btrim(name)));
create index if not exists meet_awards_event_idx on public.meet_awards (event_id, sort);
alter table public.meet_awards enable row level security;
drop policy if exists "everyone sees a meet's awards" on public.meet_awards;
create policy "everyone sees a meet's awards" on public.meet_awards for select to anon, authenticated using (true);
drop policy if exists "hosts add awards" on public.meet_awards;
create policy "hosts add awards" on public.meet_awards for insert to authenticated
  with check (public.is_event_host(event_id) or public.is_admin());
drop policy if exists "hosts change awards" on public.meet_awards;
create policy "hosts change awards" on public.meet_awards for update to authenticated
  using (public.is_event_host(event_id) or public.is_admin()) with check (public.is_event_host(event_id) or public.is_admin());
drop policy if exists "hosts remove awards" on public.meet_awards;
create policy "hosts remove awards" on public.meet_awards for delete to authenticated
  using (public.is_event_host(event_id) or public.is_admin());

-- At most 15 awards a meet, and none added once voting has closed.
create or replace function public.check_meet_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.meet_awards where event_id = new.event_id) >= 15 then
    raise exception 'too_many_awards';
  end if;
  if public.meet_awards_phase(new.event_id) = 'closed' then
    raise exception 'awards_closed';
  end if;
  return new;
end;
$$;

create table if not exists public.meet_award_entries (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null, -- null: here to vote, no car entered
  distance_m integer,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.meet_award_entries enable row level security;
drop policy if exists "you see your entry" on public.meet_award_entries;
create policy "you see your entry" on public.meet_award_entries for select to authenticated
  using (user_id = auth.uid() or public.is_event_host(event_id) or public.is_admin());

create table if not exists public.meet_award_votes (
  award_id uuid not null references public.meet_awards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (award_id, user_id)
);
create index if not exists meet_award_votes_vehicle_idx on public.meet_award_votes (award_id, vehicle_id);
alter table public.meet_award_votes enable row level security;
drop policy if exists "you see your votes" on public.meet_award_votes;
create policy "you see your votes" on public.meet_award_votes for select to authenticated using (user_id = auth.uid());

create table if not exists public.meet_award_state (
  event_id uuid primary key references public.events (id) on delete cascade,
  closed_at timestamptz,
  announced_at timestamptz
);
alter table public.meet_award_state enable row level security;
drop policy if exists "everyone sees award state" on public.meet_award_state;
create policy "everyone sees award state" on public.meet_award_state for select to anon, authenticated using (true);

-- 'none' (no awards) | 'soon' | 'open' | 'closed'
create or replace function public.meet_awards_phase(p_event uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.meet_awards where event_id = e.id) then 'none'
    when exists (select 1 from public.meet_award_state s where s.event_id = e.id and s.closed_at is not null and s.closed_at <= now()) then 'closed'
    when now() < e.start_at - interval '15 minutes' then 'soon'
    when now() > coalesce(e.end_at, e.start_at + interval '3 hours') + interval '1 hour' then 'closed'
    else 'open' end
  from public.events e where e.id = p_event;
$$;
grant execute on function public.meet_awards_phase(uuid) to anon, authenticated;

drop trigger if exists check_meet_award on public.meet_awards;
create trigger check_meet_award before insert on public.meet_awards for each row execute function public.check_meet_award();

-- Can this person take part? (Private meets: hosts and approved members.)
create or replace function public.can_join_meet_awards(p_event uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event and not coalesce(e.hidden, false)
       and (coalesce(e.visibility, 'public') <> 'private'
            or e.created_by = p_user
            or exists (select 1 from public.event_cohosts c where c.event_id = e.id and c.user_id = p_user and c.status = 'accepted')
            or exists (select 1 from public.event_members m where m.event_id = e.id and m.user_id = p_user and m.status = 'approved')));
$$;
revoke execute on function public.can_join_meet_awards(uuid, uuid) from public, anon, authenticated;

-- "I'm here": within 600 m of the pin (or checked in for points) while
-- voting is open, optionally entering one of your cars.
create or replace function public.enter_meet_awards(p_event uuid, p_lat double precision, p_lng double precision, p_vehicle uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_dist integer;
  v_checked boolean;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into e from public.events where id = p_event;
  if not found or not public.can_join_meet_awards(p_event, v_uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if public.meet_awards_phase(p_event) <> 'open' then
    return jsonb_build_object('status', 'not_open', 'phase', public.meet_awards_phase(p_event));
  end if;
  if p_vehicle is not null and not exists (select 1 from public.vehicles where id = p_vehicle and owner_id = v_uid) then
    return jsonb_build_object('status', 'not_your_car');
  end if;
  v_checked := exists (select 1 from public.meet_checkins c where c.event_id = p_event and c.user_id = v_uid and c.voided_at is null and c.created_at > now() - interval '12 hours');
  if e.lat is not null and p_lat is not null and p_lng is not null then
    v_dist := round(public.miles_between(p_lat, p_lng, e.lat, e.lng) * 1609.34);
  end if;
  -- Already here: changing the car you entered doesn't need the spot again.
  if not exists (select 1 from public.meet_award_entries where event_id = p_event and user_id = v_uid)
     and not v_checked and (v_dist is null or v_dist > 600) then
    return jsonb_build_object('status', case when v_dist is null then 'need_location' else 'too_far' end, 'distance_m', v_dist);
  end if;
  insert into public.meet_award_entries (event_id, user_id, vehicle_id, distance_m)
  values (p_event, v_uid, p_vehicle, v_dist)
  on conflict (event_id, user_id) do update set vehicle_id = excluded.vehicle_id;
  -- A car taken out of the running loses its votes.
  delete from public.meet_award_votes v using public.meet_awards a
   where v.award_id = a.id and a.event_id = p_event
     and v.vehicle_id in (select id from public.vehicles where owner_id = v_uid)
     and v.vehicle_id is distinct from p_vehicle;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.enter_meet_awards(uuid, double precision, double precision, uuid) from public, anon;
grant execute on function public.enter_meet_awards(uuid, double precision, double precision, uuid) to authenticated;

create or replace function public.vote_meet_award(p_award uuid, p_vehicle uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a public.meet_awards;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into a from public.meet_awards where id = p_award;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if public.meet_awards_phase(a.event_id) <> 'open' then
    return jsonb_build_object('status', 'closed');
  end if;
  if not exists (select 1 from public.meet_award_entries where event_id = a.event_id and user_id = v_uid) then
    return jsonb_build_object('status', 'not_here');
  end if;
  if not exists (select 1 from public.meet_award_entries where event_id = a.event_id and vehicle_id = p_vehicle) then
    return jsonb_build_object('status', 'not_entered');
  end if;
  if exists (select 1 from public.vehicles where id = p_vehicle and owner_id = v_uid) then
    return jsonb_build_object('status', 'own_car');
  end if;
  insert into public.meet_award_votes (award_id, user_id, vehicle_id) values (p_award, v_uid, p_vehicle)
  on conflict (award_id, user_id) do update set vehicle_id = excluded.vehicle_id, voted_at = now();
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.vote_meet_award(uuid, uuid) from public, anon;
grant execute on function public.vote_meet_award(uuid, uuid) to authenticated;

-- Winners of a closed meet (ties share it): [{award_id, vehicle_id, votes}]
create or replace function public.meet_award_winners(p_event uuid)
returns table (award_id uuid, vehicle_id uuid, votes integer)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select v.award_id, v.vehicle_id, count(*)::int as votes
      from public.meet_award_votes v join public.meet_awards a on a.id = v.award_id
     where a.event_id = p_event
     group by v.award_id, v.vehicle_id
  )
  select t.award_id, t.vehicle_id, t.votes from t
   where t.votes = (select max(t2.votes) from t t2 where t2.award_id = t.award_id);
$$;
revoke execute on function public.meet_award_winners(uuid) from public, anon, authenticated;

-- Everything the awards screen needs.
create or replace function public.meet_awards_view(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.meet_awards_phase(p_event);
  v_host boolean := v_uid is not null and (public.is_event_host(p_event) or public.is_admin());
  v_results boolean;
begin
  if not exists (select 1 from public.events where id = p_event and not coalesce(hidden, false)) then
    return jsonb_build_object('phase', 'none');
  end if;
  v_results := v_phase = 'closed' or v_host;
  return jsonb_build_object(
    'phase', v_phase,
    'host', v_host,
    'can_join', v_uid is not null and public.can_join_meet_awards(p_event, v_uid),
    'entered', exists (select 1 from public.meet_award_entries where event_id = p_event and user_id = v_uid),
    'my_vehicle', (select vehicle_id from public.meet_award_entries where event_id = p_event and user_id = v_uid),
    'closes_at', (select coalesce(least(s.closed_at, coalesce(e.end_at, e.start_at + interval '3 hours') + interval '1 hour'), coalesce(e.end_at, e.start_at + interval '3 hours') + interval '1 hour')
                    from public.events e left join public.meet_award_state s on s.event_id = e.id where e.id = p_event),
    'opens_at', (select start_at - interval '15 minutes' from public.events where id = p_event),
    'awards', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'emoji', a.emoji,
        'my_vote', (select v.vehicle_id from public.meet_award_votes v where v.award_id = a.id and v.user_id = v_uid),
        'votes', case when v_results then (select count(*) from public.meet_award_votes v where v.award_id = a.id) end,
        'tally', case when v_results then (select coalesce(jsonb_object_agg(x.vehicle_id, x.n), '{}'::jsonb)
                   from (select v.vehicle_id, count(*) as n from public.meet_award_votes v where v.award_id = a.id group by v.vehicle_id) x) end,
        'winners', case when v_phase = 'closed' then (select coalesce(jsonb_agg(w.vehicle_id), '[]'::jsonb) from public.meet_award_winners(p_event) w where w.award_id = a.id) end
      ) order by a.sort, a.created_at) from public.meet_awards a where a.event_id = p_event), '[]'::jsonb),
    -- The cars in the running (shown to everyone; they're at a public meet).
    'cars', coalesce((select jsonb_agg(jsonb_build_object(
        'vehicle_id', v.id, 'owner_id', v.owner_id, 'username', p.username,
        'car', trim(concat_ws(' ', v.year::text, v.make, v.model)), 'nickname', v.nickname, 'photo_url', v.photo_url
      ) order by en.created_at) from public.meet_award_entries en
        join public.vehicles v on v.id = en.vehicle_id join public.profiles p on p.id = v.owner_id
       where en.event_id = p_event), '[]'::jsonb),
    'voters', (select count(*) from public.meet_award_entries where event_id = p_event)
  );
end;
$$;
grant execute on function public.meet_awards_view(uuid) to anon, authenticated;

create or replace function public.close_meet_awards(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_event_host(p_event) or public.is_admin()) then
    raise exception 'hosts_only';
  end if;
  if public.meet_awards_phase(p_event) <> 'open' then
    return jsonb_build_object('status', 'not_open');
  end if;
  insert into public.meet_award_state (event_id, closed_at) values (p_event, now())
  on conflict (event_id) do update set closed_at = now();
  return public.finish_meet_awards(p_event);
end;
$$;
revoke execute on function public.close_meet_awards(uuid) from public, anon;
grant execute on function public.close_meet_awards(uuid) to authenticated;

-- Once voting has closed: tell each winner (once), and everyone who took part.
create or replace function public.finish_meet_awards(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events;
  w record;
  v_n int := 0;
begin
  if public.meet_awards_phase(p_event) <> 'closed' then
    return jsonb_build_object('status', 'not_closed');
  end if;
  insert into public.meet_award_state (event_id) values (p_event) on conflict (event_id) do nothing;
  update public.meet_award_state set announced_at = now() where event_id = p_event and announced_at is null;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  select * into e from public.events where id = p_event;
  for w in
    select a.name, a.emoji, v.owner_id, trim(concat_ws(' ', v.year::text, v.make, v.model)) as car, x.votes
      from public.meet_award_winners(p_event) x
      join public.meet_awards a on a.id = x.award_id
      join public.vehicles v on v.id = x.vehicle_id
  loop
    perform public.notify(w.owner_id, 'meet_award', w.emoji || ' You won ' || w.name || '!',
      'Your ' || w.car || ' won ' || w.name || ' at ' || left(e.title, 60) || ' (' || w.votes || ' vote' || case when w.votes = 1 then '' else 's' end || ').',
      'meet:' || p_event, 'award-win:' || p_event || ':' || w.name);
    v_n := v_n + 1;
  end loop;
  perform public.notify(en.user_id, 'meet_award', '🏆 The awards are in', 'See who won at ' || left(e.title, 60) || '.', 'meet:' || p_event, 'award-results:' || p_event)
    from public.meet_award_entries en where en.event_id = p_event;
  return jsonb_build_object('status', 'ok', 'winners', v_n);
end;
$$;
grant execute on function public.finish_meet_awards(uuid) to anon, authenticated;

-- For the daily job: announce every meet whose voting closed in the last 3 days.
create or replace function public.finish_all_meet_awards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_n int := 0;
begin
  for v_event in
    select distinct a.event_id from public.meet_awards a join public.events e on e.id = a.event_id
     where coalesce(e.end_at, e.start_at + interval '3 hours') between now() - interval '3 days' and now()
       and not exists (select 1 from public.meet_award_state s where s.event_id = a.event_id and s.announced_at is not null)
  loop
    if (public.finish_meet_awards(v_event) ->> 'status') = 'ok' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.finish_all_meet_awards() from public, anon, authenticated;
grant execute on function public.finish_all_meet_awards() to service_role;
