-- Convoys: drive together and see each other live on a map.
--
-- Someone starts a convoy (on its own, or from a linkup, usually a cruise)
-- and shares its 6-character code or invites people. Each member's phone
-- sends its latest position every few seconds while the convoy screen is
-- open and they've turned sharing on; everyone in the convoy sees everyone
-- else move. Nobody outside the convoy can read a position (RLS), only the
-- latest position is kept (one row per member), and a member's position is
-- deleted the moment they leave, stop sharing or the convoy ends. A convoy
-- ends by itself after 6 hours.
--
--   start_convoy(name, linkup)   → { status, id, code }
--   join_convoy(code)            → { status, id, code }
--   convoy_state(id)             → the convoy, its members and their positions
--   share_position(id, lat, lng, heading, speed_mph, accuracy_m) → { status }
--   stop_sharing(id), leave_convoy(id), end_convoy(id) (the leader)
--   invite_to_convoy(user, id)   → { status } and an alert with a convoy: link

create table if not exists public.convoys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  leader_id uuid not null references auth.users (id) on delete cascade,
  linkup_id uuid references public.linkups (id) on delete set null,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '6 hours',
  ended_at timestamptz
);
create index if not exists convoys_leader_idx on public.convoys (leader_id, created_at desc);
create index if not exists convoys_linkup_idx on public.convoys (linkup_id) where ended_at is null;

create table if not exists public.convoy_members (
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (convoy_id, user_id)
);
create index if not exists convoy_members_user_idx on public.convoy_members (user_id);

-- Only each member's latest position.
create table if not exists public.convoy_positions (
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  heading real check (heading >= 0 and heading < 360),
  speed_mph real check (speed_mph between 0 and 250),
  accuracy_m real check (accuracy_m between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (convoy_id, user_id)
);

create table if not exists public.convoy_invites (
  id bigint generated always as identity primary key,
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (convoy_id, to_user)
);
create index if not exists convoy_invites_from_idx on public.convoy_invites (from_user, created_at desc);

-- Is the signed-in member in this convoy, and is it still running?
create or replace function public.in_live_convoy(p_convoy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.convoy_members m join public.convoys c on c.id = m.convoy_id
     where m.convoy_id = p_convoy and m.user_id = auth.uid() and c.ended_at is null and c.ends_at > now()
  );
$$;
revoke execute on function public.in_live_convoy(uuid) from public, anon;
grant execute on function public.in_live_convoy(uuid) to authenticated;

alter table public.convoys enable row level security;
alter table public.convoy_members enable row level security;
alter table public.convoy_positions enable row level security;
alter table public.convoy_invites enable row level security;

-- Members only. Every write goes through the functions below.
drop policy if exists "members see their convoy" on public.convoys;
create policy "members see their convoy" on public.convoys for select to authenticated
  using (public.in_live_convoy(id));
drop policy if exists "members see who's in" on public.convoy_members;
create policy "members see who's in" on public.convoy_members for select to authenticated
  using (public.in_live_convoy(convoy_id));
drop policy if exists "members see positions" on public.convoy_positions;
create policy "members see positions" on public.convoy_positions for select to authenticated
  using (public.in_live_convoy(convoy_id));
drop policy if exists "people see convoy invites they sent or got" on public.convoy_invites;
create policy "people see convoy invites they sent or got" on public.convoy_invites for select to authenticated
  using (auth.uid() in (from_user, to_user));

-- Live updates to the convoy screen (each subscriber still only gets rows
-- RLS lets them read).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'convoy_positions') then
      alter publication supabase_realtime add table public.convoy_positions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'convoy_members') then
      alter publication supabase_realtime add table public.convoy_members;
    end if;
  end if;
end;
$$;

-- Old positions go: anything from a finished convoy, or older than 15 minutes.
create or replace function public.tidy_convoys()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.convoy_positions p
   using public.convoys c
   where c.id = p.convoy_id and (c.ended_at is not null or c.ends_at <= now() or p.updated_at < now() - interval '15 minutes');
$$;
revoke execute on function public.tidy_convoys() from public, anon, authenticated;

create or replace function public.start_convoy(p_name text default null, p_linkup uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l public.linkups;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_code text;
  v_id uuid;
  c public.convoys;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  perform public.tidy_convoys();

  if p_linkup is not null then
    select * into l from public.linkups where id = p_linkup and cancelled_at is null and ends_at > now();
    if not found then
      return jsonb_build_object('status', 'linkup_over');
    end if;
    if l.user_id <> v_uid and not exists (select 1 from public.linkup_members m where m.linkup_id = l.id and m.user_id = v_uid and m.status = 'in') then
      return jsonb_build_object('status', 'not_in_linkup');
    end if;
    -- One convoy per linkup: if it's already rolling, hop in.
    select * into c from public.convoys where linkup_id = l.id and ended_at is null and ends_at > now() order by created_at limit 1;
    if found then
      insert into public.convoy_members (convoy_id, user_id) values (c.id, v_uid) on conflict do nothing;
      return jsonb_build_object('status', 'ok', 'id', c.id, 'code', c.code, 'joined', true);
    end if;
    v_name := coalesce(v_name, left(l.place, 40));
  end if;

  if (select count(*) from public.convoys where leader_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  if v_name is null then
    select left(coalesce(nullif(username, ''), 'TUNR') || '''s convoy', 40) into v_name from public.profiles where id = v_uid;
  end if;

  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.convoys where code = v_code);
  end loop;
  insert into public.convoys (code, name, leader_id, linkup_id) values (v_code, left(v_name, 40), v_uid, p_linkup) returning id into v_id;
  insert into public.convoy_members (convoy_id, user_id) values (v_id, v_uid);
  return jsonb_build_object('status', 'ok', 'id', v_id, 'code', v_code);
end;
$$;
revoke execute on function public.start_convoy(text, uuid) from public, anon;
grant execute on function public.start_convoy(text, uuid) to authenticated;

create or replace function public.join_convoy(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.convoys;
  l public.linkups;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into c from public.convoys where code = upper(btrim(coalesce(p_code, ''))) and ended_at is null and ends_at > now();
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.convoy_members where convoy_id = c.id and user_id = v_uid) then
    return jsonb_build_object('status', 'ok', 'id', c.id, 'code', c.code);
  end if;
  if public.blocked_either_way(v_uid, c.leader_id) then
    return jsonb_build_object('status', 'blocked');
  end if;
  -- A private linkup's convoy is for the people in it.
  if c.linkup_id is not null then
    select * into l from public.linkups where id = c.linkup_id;
    if found and l.visibility = 'private' and l.user_id <> v_uid
       and not exists (select 1 from public.linkup_members m where m.linkup_id = l.id and m.user_id = v_uid and m.status = 'in') then
      return jsonb_build_object('status', 'not_in_linkup');
    end if;
  end if;
  if (select count(*) from public.convoy_members where convoy_id = c.id) >= 30 then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.convoy_members (convoy_id, user_id) values (c.id, v_uid);
  return jsonb_build_object('status', 'ok', 'id', c.id, 'code', c.code);
end;
$$;
revoke execute on function public.join_convoy(text) from public, anon;
grant execute on function public.join_convoy(text) to authenticated;

-- Everything the convoy screen needs, for members only (else null).
create or replace function public.convoy_state(p_convoy uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'leader_id', c.leader_id, 'linkup_id', c.linkup_id,
    'ends_at', c.ends_at, 'now', now(),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', p.username, 'avatar_url', p.avatar_url, 'joined_at', m.joined_at,
        'car', (select concat_ws(' ', v.year, v.make, v.model) from public.vehicles v where v.owner_id = m.user_id order by v.is_primary desc nulls last, v.created_at limit 1),
        'pos', (select jsonb_build_object('lat', x.lat, 'lng', x.lng, 'heading', x.heading, 'speed_mph', x.speed_mph, 'accuracy_m', x.accuracy_m, 'at', x.updated_at)
                  from public.convoy_positions x where x.convoy_id = c.id and x.user_id = m.user_id)
      ) order by m.joined_at)
        from public.convoy_members m left join public.profiles p on p.id = m.user_id
       where m.convoy_id = c.id), '[]'::jsonb)
  )
    from public.convoys c
   where c.id = p_convoy and public.in_live_convoy(c.id);
$$;
revoke execute on function public.convoy_state(uuid) from public, anon;
grant execute on function public.convoy_state(uuid) to authenticated;

create or replace function public.share_position(p_convoy uuid, p_lat double precision, p_lng double precision,
  p_heading real default null, p_speed_mph real default null, p_accuracy_m real default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.in_live_convoy(p_convoy) then
    return jsonb_build_object('status', 'not_in_convoy');
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('status', 'bad_position');
  end if;
  -- One update every 2 seconds is plenty (and keeps the database calm).
  if exists (select 1 from public.convoy_positions where convoy_id = p_convoy and user_id = v_uid and updated_at > now() - interval '2 seconds') then
    return jsonb_build_object('status', 'too_soon');
  end if;
  insert into public.convoy_positions (convoy_id, user_id, lat, lng, heading, speed_mph, accuracy_m, updated_at)
  values (p_convoy, v_uid, p_lat, p_lng,
          case when p_heading >= 0 and p_heading < 360 then p_heading end,
          case when p_speed_mph >= 0 then least(p_speed_mph, 250) end,
          case when p_accuracy_m >= 0 then least(p_accuracy_m, 10000) end,
          now())
  on conflict (convoy_id, user_id) do update
    set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading, speed_mph = excluded.speed_mph,
        accuracy_m = excluded.accuracy_m, updated_at = excluded.updated_at;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.share_position(uuid, double precision, double precision, real, real, real) from public, anon;
grant execute on function public.share_position(uuid, double precision, double precision, real, real, real) to authenticated;

create or replace function public.stop_sharing(p_convoy uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.convoy_positions where convoy_id = p_convoy and user_id = auth.uid();
$$;
revoke execute on function public.stop_sharing(uuid) from public, anon;
grant execute on function public.stop_sharing(uuid) to authenticated;

-- Leaving takes your position with you. When the leader leaves, the next
-- person to have joined leads; the last one out ends it.
create or replace function public.leave_convoy(p_convoy uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next uuid;
begin
  delete from public.convoy_positions where convoy_id = p_convoy and user_id = v_uid;
  delete from public.convoy_members where convoy_id = p_convoy and user_id = v_uid;
  if not found then
    return;
  end if;
  if exists (select 1 from public.convoys where id = p_convoy and leader_id = v_uid) then
    select user_id into v_next from public.convoy_members where convoy_id = p_convoy order by joined_at limit 1;
    if v_next is null then
      update public.convoys set ended_at = now() where id = p_convoy and ended_at is null;
    else
      update public.convoys set leader_id = v_next where id = p_convoy;
    end if;
  end if;
end;
$$;
revoke execute on function public.leave_convoy(uuid) from public, anon;
grant execute on function public.leave_convoy(uuid) to authenticated;

create or replace function public.end_convoy(p_convoy uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.convoys where id = p_convoy and leader_id = auth.uid()) then
    raise exception 'convoy_leader_only';
  end if;
  update public.convoys set ended_at = now() where id = p_convoy and ended_at is null;
  delete from public.convoy_positions where convoy_id = p_convoy;
end;
$$;
revoke execute on function public.end_convoy(uuid) from public, anon;
grant execute on function public.end_convoy(uuid) to authenticated;

create or replace function public.invite_to_convoy(p_to uuid, p_convoy uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.convoys;
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.in_live_convoy(p_convoy) then
    return jsonb_build_object('status', 'not_in_convoy');
  end if;
  select * into c from public.convoys where id = p_convoy;
  if p_to = v_uid then
    return jsonb_build_object('status', 'self');
  end if;
  if not exists (select 1 from public.profiles where id = p_to) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if public.blocked_either_way(v_uid, p_to) or public.blocked_either_way(c.leader_id, p_to) then
    return jsonb_build_object('status', 'blocked');
  end if;
  if exists (select 1 from public.convoy_members where convoy_id = p_convoy and user_id = p_to) then
    return jsonb_build_object('status', 'already_in');
  end if;
  if (select count(*) from public.convoy_invites where from_user = v_uid and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  insert into public.convoy_invites (convoy_id, from_user, to_user) values (p_convoy, v_uid, p_to) on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  select coalesce(nullif(username, ''), 'someone') into v_name from public.profiles where id = v_uid;
  perform public.notify(p_to, 'convoy_invite', '🚗 @' || v_name || ' wants you in their convoy',
    c.name || '. Tap to join and see each other on the map.', 'convoy:' || c.code, 'cinv:' || c.id || ':' || p_to);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.invite_to_convoy(uuid, uuid) from public, anon;
grant execute on function public.invite_to_convoy(uuid, uuid) to authenticated;
