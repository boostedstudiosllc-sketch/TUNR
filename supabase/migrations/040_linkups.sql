-- Linkups: spontaneous get-togethers starting within the next two hours —
-- "heading downtown to shoot, who's coming?". Anyone signed in can post one
-- (no car needed). Public ones show the spot to every signed-in user and
-- anyone can say "I'm in"; private ones show only the kind, area and time
-- until the poster accepts a request. No size cap: at 25 people the poster
-- gets a reminder of the ground rules and admins get a heads-up.
--
-- Everyone posting or joining agrees to the linkup rules once first
-- (linkup_agreements), enforced here rather than only in the app.

-- ============ THE ONE-TIME AGREEMENT ============
create table if not exists public.linkup_agreements (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  version int not null default 1,
  accepted_at timestamptz not null default now()
);

alter table public.linkup_agreements enable row level security;

drop policy if exists "users read their own linkup agreement" on public.linkup_agreements;
create policy "users read their own linkup agreement"
  on public.linkup_agreements for select to authenticated
  using (user_id = auth.uid());

create or replace function public.accept_linkup_terms(p_version int default 1)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.linkup_agreements (user_id, version, accepted_at)
  values (auth.uid(), p_version, now())
  on conflict (user_id) do update set version = excluded.version, accepted_at = now();
$$;

revoke execute on function public.accept_linkup_terms(int) from public, anon;
grant execute on function public.accept_linkup_terms(int) to authenticated;

-- ============ LINKUPS ============
create table if not exists public.linkups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photos', 'cruise', 'hang')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  -- The spot, e.g. "Jackson St Bridge". Hidden on private linkups until you're in.
  place text not null check (char_length(place) between 2 and 120),
  -- The rough area everyone sees, e.g. "Midtown, Atlanta".
  area text check (char_length(area) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  note text check (char_length(note) <= 280),
  going_as text not null default 'car' check (going_as in ('car', 'photographer', 'both')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  big_alerted_at timestamptz,
  constraint linkups_window check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours')
);

create index if not exists linkups_active_idx on public.linkups (ends_at) where cancelled_at is null;
create index if not exists linkups_user_idx on public.linkups (user_id, created_at);

create table if not exists public.linkup_members (
  linkup_id uuid not null references public.linkups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 'in', or 'requested' on a private linkup until the poster accepts.
  status text not null default 'in' check (status in ('in', 'requested')),
  going_as text not null default 'car' check (going_as in ('car', 'photographer', 'both')),
  created_at timestamptz not null default now(),
  primary key (linkup_id, user_id)
);

create index if not exists linkup_members_user_idx on public.linkup_members (user_id);

create table if not exists public.linkup_messages (
  id bigint generated always as identity primary key,
  linkup_id uuid not null references public.linkups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists linkup_messages_linkup_idx on public.linkup_messages (linkup_id, created_at);

-- 'host', 'in', 'requested' or null: the viewer's place in a linkup.
create or replace function public.linkup_role(p_linkup uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.linkups l where l.id = p_linkup and l.user_id = auth.uid()) then 'host'
    else (select m.status from public.linkup_members m where m.linkup_id = p_linkup and m.user_id = auth.uid())
  end;
$$;

grant execute on function public.linkup_role(uuid) to authenticated;

-- Either one blocked the other.
create or replace function public.blocked_either_way(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function public.blocked_either_way(uuid, uuid) from public, anon;
grant execute on function public.blocked_either_way(uuid, uuid) to authenticated;

-- People "in", counting the poster.
create or replace function public.linkup_headcount(p_linkup uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select 1 + (select count(*)::int from public.linkup_members m where m.linkup_id = p_linkup and m.status = 'in');
$$;

grant execute on function public.linkup_headcount(uuid) to authenticated;

alter table public.linkups enable row level security;
alter table public.linkup_members enable row level security;
alter table public.linkup_messages enable row level security;

-- The table itself is for the poster and the people in; everyone else reads
-- linkups_feed, which hides a private linkup's spot.
drop policy if exists "hosts and members read linkups" on public.linkups;
create policy "hosts and members read linkups"
  on public.linkups for select to authenticated
  using (public.linkup_role(id) in ('host', 'in'));

drop policy if exists "anyone signed in posts a linkup" on public.linkups;
create policy "anyone signed in posts a linkup"
  on public.linkups for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "hosts change their linkup" on public.linkups;
create policy "hosts change their linkup"
  on public.linkups for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "hosts delete their linkup" on public.linkups;
create policy "hosts delete their linkup"
  on public.linkups for delete to authenticated
  using (user_id = auth.uid());

-- Posting rules: agreed to the linkup rules, starting within two hours, one
-- live linkup at a time, six a day.
create or replace function public.check_linkup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No uid: the SQL editor or the service role. Nested: this database's own
  -- triggers (the 25-person flag), already trusted.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.linkup_agreements a where a.user_id = auth.uid()) then
      raise exception 'linkup_terms_required';
    end if;
    if new.starts_at < now() - interval '10 minutes' or new.starts_at > now() + interval '2 hours 5 minutes' then
      raise exception 'linkup_starts_within_2_hours';
    end if;
    if exists (select 1 from public.linkups l
               where l.user_id = auth.uid() and l.cancelled_at is null and l.ends_at > now()) then
      raise exception 'linkup_already_live';
    end if;
    if (select count(*) from public.linkups l
        where l.user_id = auth.uid() and l.created_at > now() - interval '1 day') >= 6 then
      raise exception 'rate_limit_linkups';
    end if;
    new.created_at := now();
    new.cancelled_at := null;
    new.big_alerted_at := null;
    return new;
  end if;

  -- Updates: the note, the end time (up to four hours after the start) and
  -- cancelling. Nothing else moves once people have planned around it.
  new.id := old.id;
  new.user_id := old.user_id;
  new.kind := old.kind;
  new.visibility := old.visibility;
  new.place := old.place;
  new.area := old.area;
  new.lat := old.lat;
  new.lng := old.lng;
  new.starts_at := old.starts_at;
  new.created_at := old.created_at;
  new.big_alerted_at := old.big_alerted_at;
  if old.cancelled_at is not null then
    new.cancelled_at := old.cancelled_at;
  elsif new.cancelled_at is not null then
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists linkups_check on public.linkups;
create trigger linkups_check
  before insert or update on public.linkups
  for each row execute function public.check_linkup();

-- ============ MEMBERS ============
drop policy if exists "members read who's in" on public.linkup_members;
create policy "members read who's in"
  on public.linkup_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.linkup_role(linkup_id) = 'host'
    or (status = 'in' and public.linkup_role(linkup_id) = 'in')
  );

drop policy if exists "users join linkups" on public.linkup_members;
create policy "users join linkups"
  on public.linkup_members for insert to authenticated
  with check (user_id = auth.uid());

-- Your own row (how you're coming), or the host accepting a request.
drop policy if exists "members and hosts update membership" on public.linkup_members;
create policy "members and hosts update membership"
  on public.linkup_members for update to authenticated
  using (user_id = auth.uid() or public.linkup_role(linkup_id) = 'host')
  with check (user_id = auth.uid() or public.linkup_role(linkup_id) = 'host');

-- Leaving, or the host declining / removing someone.
drop policy if exists "members leave and hosts remove" on public.linkup_members;
create policy "members leave and hosts remove"
  on public.linkup_members for delete to authenticated
  using (user_id = auth.uid() or public.linkup_role(linkup_id) = 'host');

create or replace function public.check_linkup_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.linkups;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into l from public.linkups where id = new.linkup_id;
  if tg_op = 'INSERT' then
    if l.id is null or l.cancelled_at is not null or l.ends_at < now() then
      raise exception 'linkup_over';
    end if;
    if l.user_id = new.user_id then
      raise exception 'linkup_is_yours';
    end if;
    if not exists (select 1 from public.linkup_agreements a where a.user_id = auth.uid()) then
      raise exception 'linkup_terms_required';
    end if;
    if public.blocked_either_way(l.user_id, new.user_id) then
      raise exception 'linkup_unavailable';
    end if;
    -- Public: straight in. Private: a request, whatever the client sent.
    new.status := case when l.visibility = 'public' then 'in' else 'requested' end;
    new.created_at := now();
    return new;
  end if;

  new.linkup_id := old.linkup_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  -- Only the host decides who's in; members only change how they're coming.
  if auth.uid() <> l.user_id then
    new.status := old.status;
  else
    new.going_as := old.going_as;
  end if;
  return new;
end;
$$;

drop trigger if exists linkup_members_check on public.linkup_members;
create trigger linkup_members_check
  before insert or update on public.linkup_members
  for each row execute function public.check_linkup_member();

-- ============ CHAT ============
drop policy if exists "the group reads its chat" on public.linkup_messages;
create policy "the group reads its chat"
  on public.linkup_messages for select to authenticated
  using (public.linkup_role(linkup_id) in ('host', 'in') and not public.has_blocked(user_id));

drop policy if exists "the group writes in its chat" on public.linkup_messages;
create policy "the group writes in its chat"
  on public.linkup_messages for insert to authenticated
  with check (user_id = auth.uid() and public.linkup_role(linkup_id) in ('host', 'in'));

drop policy if exists "users delete their own linkup messages" on public.linkup_messages;
create policy "users delete their own linkup messages"
  on public.linkup_messages for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.check_linkup_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.created_at := now();
  if not exists (select 1 from public.linkups l
                 where l.id = new.linkup_id and l.ends_at > now() - interval '6 hours') then
    raise exception 'linkup_chat_closed';
  end if;
  if (select count(*) from public.linkup_messages m
      where m.user_id = new.user_id and m.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'rate_limit_messages';
  end if;
  return new;
end;
$$;

drop trigger if exists linkup_messages_check on public.linkup_messages;
create trigger linkup_messages_check
  before insert on public.linkup_messages
  for each row execute function public.check_linkup_message();

create or replace view public.linkup_messages_with_author
with (security_invoker = true) as
select m.id, m.linkup_id, m.user_id, m.body, m.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.is_photographer, false) as photographer,
       public.photographer_verified(m.user_id) as photographer_verified,
       coalesce(p.day_one, false) as day_one,
       p.day_one_number
from public.linkup_messages m
left join public.profiles p on p.id = m.user_id;

grant select on public.linkup_messages_with_author to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'linkup_messages') then
      alter publication supabase_realtime add table public.linkup_messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'linkup_members') then
      alter publication supabase_realtime add table public.linkup_members;
    end if;
  end if;
end $$;

-- ============ WHAT EVERYONE SEES ============
-- Live linkups (and, for the people in them, ones cancelled or just over).
-- Owner-rights view: a private linkup's spot, exact pin and note are blanked
-- for anyone not in it, and the pin is rounded to about a kilometre so
-- "3 mi away" still works. Signed-in users only; blocked either way, it
-- isn't there at all.
create or replace view public.linkups_feed as
select
  l.id,
  l.user_id,
  coalesce(p.username, 'someone') as username,
  coalesce(p.is_photographer, false) as photographer,
  public.photographer_verified(l.user_id) as photographer_verified,
  coalesce(p.day_one, false) as day_one,
  p.day_one_number,
  l.kind,
  l.visibility,
  l.area,
  case when l.visibility = 'public' or r.role in ('host', 'in') then l.place end as place,
  case when l.visibility = 'public' or r.role in ('host', 'in') then l.note end as note,
  case when l.visibility = 'public' or r.role in ('host', 'in') then l.lat else round(l.lat::numeric, 2)::double precision end as lat,
  case when l.visibility = 'public' or r.role in ('host', 'in') then l.lng else round(l.lng::numeric, 2)::double precision end as lng,
  not (l.visibility = 'public' or r.role in ('host', 'in')) as locked,
  l.going_as,
  l.starts_at,
  l.ends_at,
  l.created_at,
  l.cancelled_at,
  public.linkup_headcount(l.id) as headcount,
  case when r.role = 'host' then
    (select count(*)::int from public.linkup_members m where m.linkup_id = l.id and m.status = 'requested')
  else 0 end as requests,
  r.role as my_role
from public.linkups l
left join public.profiles p on p.id = l.user_id
cross join lateral (select public.linkup_role(l.id) as role) r
where auth.uid() is not null
  and not public.blocked_either_way(auth.uid(), l.user_id)
  and (
    (l.cancelled_at is null and l.ends_at > now())
    or (r.role is not null and l.ends_at > now() - interval '6 hours')
  );

revoke all on public.linkups_feed from anon;
grant select on public.linkups_feed to authenticated;

-- Who's in (and, for the host, who's asking), with badges. On a public
-- linkup anyone signed in can see who's going; on a private one, only the
-- people in it.
create or replace function public.linkup_people(p_linkup uuid)
returns table (
  user_id uuid,
  username text,
  status text,
  going_as text,
  is_host boolean,
  photographer boolean,
  photographer_verified boolean,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select l.*, public.linkup_role(l.id) as role
    from public.linkups l
    where l.id = p_linkup
      and auth.uid() is not null
      and not public.blocked_either_way(auth.uid(), l.user_id)
  )
  select v.user_id, coalesce(p.username, 'someone'), 'in', v.going_as, true,
         coalesce(p.is_photographer, false), public.photographer_verified(v.user_id), v.created_at
  from v
  left join public.profiles p on p.id = v.user_id
  where v.role is not null or v.visibility = 'public'
  union all
  select m.user_id, coalesce(p.username, 'someone'), m.status, m.going_as, false,
         coalesce(p.is_photographer, false), public.photographer_verified(m.user_id), m.created_at
  from v
  join public.linkup_members m on m.linkup_id = v.id
  left join public.profiles p on p.id = m.user_id
  where (
      v.role = 'host'
      or m.user_id = auth.uid()
      or (m.status = 'in' and (v.role = 'in' or v.visibility = 'public'))
    )
    and not public.has_blocked(m.user_id);
$$;

revoke execute on function public.linkup_people(uuid) from public, anon;
grant execute on function public.linkup_people(uuid) to authenticated;

-- ============ ALERTS ============
create or replace function public.linkup_kind_label(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind when 'photos' then '📸 Photo' when 'cruise' then '🛣️ Cruise' else '🍔 Hang' end;
$$;

-- Everyone whose alert area covers the spot (nearest 500), except the
-- poster and anyone blocked either way.
create or replace function public.linkup_posted_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  v_mins int := greatest(0, round(extract(epoch from (new.starts_at - now())) / 60)::int);
  rec record;
begin
  for rec in
    select s.user_id, public.miles_between(s.lat, s.lng, new.lat, new.lng) as miles
    from public.alert_settings s
    where s.linkups and s.lat is not null and s.lng is not null
      and s.user_id <> new.user_id
      and public.miles_between(s.lat, s.lng, new.lat, new.lng) <= s.radius_miles
      and not public.blocked_either_way(s.user_id, new.user_id)
    order by 2
    limit 500
  loop
    perform public.notify(
      rec.user_id,
      'linkup_nearby',
      public.linkup_kind_label(new.kind) || ' linkup near you',
      '@' || v_name || ' · ' ||
        case when v_mins < 5 then 'starting now' else 'in ' || v_mins || ' min' end ||
        coalesce(' · ' || new.area, '') || ' · ' || round(rec.miles::numeric, 0) || ' mi' ||
        case when new.visibility = 'private' then ' · private, request to join' else '' end,
      'linkup:' || new.id,
      'linkup:' || new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists linkups_posted_notify on public.linkups;
create trigger linkups_posted_notify
  after insert on public.linkups
  for each row execute function public.linkup_posted_notify();

-- Joins, requests, acceptances, and the 25-person heads-up.
create or replace function public.linkup_member_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.linkups;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  v_host text;
  v_count int;
  rec record;
begin
  select * into l from public.linkups where id = new.linkup_id;
  v_host := coalesce((select username from public.profiles where id = l.user_id), 'the host');

  if tg_op = 'INSERT' then
    perform public.notify(
      l.user_id, 'linkup_activity',
      case when new.status = 'in' then '@' || v_name || ' is in for your linkup'
           else '@' || v_name || ' wants to join your linkup' end,
      case when new.status = 'in' then 'Say hi in the linkup chat.' else 'Open the linkup to accept or decline.' end,
      'linkup:' || l.id,
      'join:' || l.id || ':' || new.user_id
    );
  elsif old.status = 'requested' and new.status = 'in' then
    perform public.notify(
      new.user_id, 'linkup_activity',
      'You''re in — @' || v_host || ' accepted',
      'The spot is unlocked: ' || l.place,
      'linkup:' || l.id,
      'accepted:' || l.id
    );
  end if;

  if new.status = 'in' and l.big_alerted_at is null then
    v_count := public.linkup_headcount(l.id);
    if v_count >= 25 then
      update public.linkups set big_alerted_at = now() where id = l.id;
      perform public.notify(
        l.user_id, 'linkup_big',
        'Your linkup is at 25 people',
        'Big groups get noticed. Stick to public spots, respect property and the police, no street racing or stunts.',
        'linkup:' || l.id,
        'big:' || l.id
      );
      for rec in select id from public.profiles where is_admin loop
        perform public.notify(
          rec.id, 'linkup_big',
          'Linkup at 25 people',
          '@' || v_host || '''s ' || lower(public.linkup_kind_label(l.kind)) || ' linkup' ||
            coalesce(' in ' || l.area, '') || ' has ' || v_count || ' people in.',
          'linkup:' || l.id,
          'big:' || l.id
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists linkup_members_notify on public.linkup_members;
create trigger linkup_members_notify
  after insert or update of status on public.linkup_members
  for each row execute function public.linkup_member_notify();

-- Cancelled: tell everyone who was in or waiting.
create or replace function public.linkup_cancelled_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text := coalesce((select username from public.profiles where id = new.user_id), 'The host');
  rec record;
begin
  if old.cancelled_at is null and new.cancelled_at is not null then
    for rec in select user_id from public.linkup_members where linkup_id = new.id loop
      perform public.notify(rec.user_id, 'linkup_activity', 'Linkup cancelled',
        '@' || v_host || ' called off the ' || lower(public.linkup_kind_label(new.kind)) || ' linkup' ||
          coalesce(' in ' || new.area, '') || '.',
        'linkup:' || new.id, 'cancelled:' || new.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists linkups_cancelled_notify on public.linkups;
create trigger linkups_cancelled_notify
  after update of cancelled_at on public.linkups
  for each row execute function public.linkup_cancelled_notify();

-- Chat: one nudge per person per linkup, so a busy chat isn't a buzzing phone.
create or replace function public.linkup_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.linkups;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  rec record;
begin
  select * into l from public.linkups where id = new.linkup_id;
  for rec in
    select l.user_id as uid
    union
    select m.user_id from public.linkup_members m where m.linkup_id = l.id and m.status = 'in'
  loop
    if rec.uid <> new.user_id and not public.blocked_either_way(rec.uid, new.user_id) then
      perform public.notify(rec.uid, 'linkup_chat', 'New messages in your linkup chat',
        '@' || v_name || ': ' || left(new.body, 120), 'linkup:' || l.id, 'chat:' || l.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists linkup_messages_notify on public.linkup_messages;
create trigger linkup_messages_notify
  after insert on public.linkup_messages
  for each row execute function public.linkup_message_notify();

-- Admin insights: linkups posted and joined, without who.
create or replace function public.linkup_stats()
returns table (posted_7d int, posted_30d int, joins_30d int, biggest_30d int, live_now int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.linkups where created_at > now() - interval '7 days'),
    (select count(*)::int from public.linkups where created_at > now() - interval '30 days'),
    (select count(*)::int from public.linkup_members m join public.linkups l on l.id = m.linkup_id
      where l.created_at > now() - interval '30 days' and m.status = 'in'),
    coalesce((select max(public.linkup_headcount(id)) from public.linkups where created_at > now() - interval '30 days'), 0),
    (select count(*)::int from public.linkups where cancelled_at is null and starts_at <= now() + interval '2 hours' and ends_at > now())
  where public.is_admin();
$$;

revoke execute on function public.linkup_stats() from public, anon;
grant execute on function public.linkup_stats() to authenticated;
