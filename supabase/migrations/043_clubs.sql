-- Clubs: car clubs, crews and photography groups. Anyone with a confirmed
-- email can start one (two a month). Public clubs are open to join; private
-- ones need an owner or admin to accept. Roles: owner (one), admins,
-- members. Each member chooses whether the club shows on their profile.
-- Members get a club chat and see which meets the club is going to.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 3 and 50),
  kind text not null default 'car_club' check (kind in ('car_club', 'crew', 'photo')),
  city text check (char_length(city) <= 60),
  description text check (char_length(description) <= 500),
  logo_url text check (char_length(logo_url) <= 500),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create unique index if not exists clubs_name_unique on public.clubs (lower(name));

create table if not exists public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'member' check (status in ('member', 'requested')),
  show_on_profile boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists club_members_user_idx on public.club_members (user_id);

create table if not exists public.club_messages (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists club_messages_club_idx on public.club_messages (club_id, created_at);

-- 'owner', 'admin', 'member', 'requested' or null.
create or replace function public.club_role(p_club uuid, p_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when m.status = 'requested' then 'requested' else m.role end
  from public.club_members m where m.club_id = p_club and m.user_id = p_user;
$$;

grant execute on function public.club_role(uuid, uuid) to anon, authenticated;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_messages enable row level security;

drop policy if exists "clubs are public" on public.clubs;
create policy "clubs are public" on public.clubs for select to anon, authenticated
  using (not hidden or public.is_admin());
drop policy if exists "confirmed users start clubs" on public.clubs;
create policy "confirmed users start clubs" on public.clubs for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "club admins edit clubs" on public.clubs;
create policy "club admins edit clubs" on public.clubs for update to authenticated
  using (public.club_role(id) in ('owner', 'admin') or public.is_admin())
  with check (public.club_role(id) in ('owner', 'admin') or public.is_admin());
drop policy if exists "owners delete clubs" on public.clubs;
create policy "owners delete clubs" on public.clubs for delete to authenticated
  using (public.club_role(id) = 'owner' or public.is_admin());

-- Membership of a public club is public; a private club's member list is
-- for its members. Your own row (and requests to clubs you run) always.
drop policy if exists "who's in a club" on public.club_members;
create policy "who's in a club" on public.club_members for select to anon, authenticated
  using (
    user_id = auth.uid()
    or (status = 'member' and (
      exists (select 1 from public.clubs c where c.id = club_id and c.visibility = 'public')
      or public.club_role(club_id) in ('owner', 'admin', 'member')
    ))
    or public.club_role(club_id) in ('owner', 'admin')
  );
drop policy if exists "users join clubs" on public.club_members;
create policy "users join clubs" on public.club_members for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "members change their own row" on public.club_members;
create policy "members change their own row" on public.club_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "members leave" on public.club_members;
create policy "members leave" on public.club_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

drop policy if exists "members read the club chat" on public.club_messages;
create policy "members read the club chat" on public.club_messages for select to authenticated
  using (public.club_role(club_id) in ('owner', 'admin', 'member') and not public.has_blocked(user_id));
drop policy if exists "members write in the club chat" on public.club_messages;
create policy "members write in the club chat" on public.club_messages for insert to authenticated
  with check (user_id = auth.uid() and public.club_role(club_id) in ('owner', 'admin', 'member'));
drop policy if exists "members delete their messages" on public.club_messages;
create policy "members delete their messages" on public.club_messages for delete to authenticated
  using (user_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

do $$
declare
  t text;
begin
  foreach t in array array['clubs', 'club_members', 'club_messages'] loop
    execute format('drop trigger if exists a_require_confirmed_email on public.%I', t);
    execute format(
      'create trigger a_require_confirmed_email before insert on public.%I for each row execute function public.require_confirmed_email()',
      t
    );
  end loop;
end $$;

create or replace function public.check_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.clubs c
        where c.created_by = auth.uid() and c.created_at > now() - interval '30 days') >= 2 then
      raise exception 'rate_limit_clubs';
    end if;
    if exists (select 1 from public.clubs c where lower(c.name) = lower(new.name)) then
      raise exception 'club_name_taken';
    end if;
    new.created_at := now();
    new.hidden := false;
    return new;
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not public.is_admin() then
    new.hidden := old.hidden;
  end if;
  return new;
end;
$$;

drop trigger if exists clubs_check on public.clubs;
create trigger clubs_check before insert or update on public.clubs
  for each row execute function public.check_club();

-- The creator becomes the owner.
create or replace function public.club_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.club_members (club_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'member')
  on conflict (club_id, user_id) do update set role = 'owner', status = 'member';
  return new;
end;
$$;

drop trigger if exists clubs_created on public.clubs;
create trigger clubs_created after insert on public.clubs
  for each row execute function public.club_created();

-- Joining: public → member, private → requested. Members may only change
-- whether it shows on their profile; roles go through manage_club_member().
create or replace function public.check_club_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clubs;
begin
  -- Trusted: the SQL editor, this database's own triggers, and
  -- manage_club_member() (which checks roles itself and sets the flag).
  if auth.uid() is null or pg_trigger_depth() > 1
     or current_setting('tunr.managing_club', true) = 'on' then
    return new;
  end if;
  select * into c from public.clubs where id = new.club_id;
  if tg_op = 'INSERT' then
    if c.id is null or c.hidden then
      raise exception 'club_unavailable';
    end if;
    if public.blocked_either_way(c.created_by, new.user_id) then
      raise exception 'club_unavailable';
    end if;
    new.role := 'member';
    new.status := case when c.visibility = 'public' then 'member' else 'requested' end;
    new.joined_at := now();
    return new;
  end if;
  new.club_id := old.club_id;
  new.user_id := old.user_id;
  new.role := old.role;
  new.status := old.status;
  new.joined_at := old.joined_at;
  return new;
end;
$$;

drop trigger if exists club_members_check on public.club_members;
create trigger club_members_check before insert or update on public.club_members
  for each row execute function public.check_club_member();

-- p_action: 'accept', 'remove' (also declines a request), 'make_admin',
-- 'make_member'. Admins accept and remove members; only the owner changes
-- admins or removes one. Nobody removes the owner.
create or replace function public.manage_club_member(p_club uuid, p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.club_role(p_club);
  v_them text := public.club_role(p_club, p_user);
  v_name text := (select name from public.clubs where id = p_club);
begin
  if v_me not in ('owner', 'admin') and not public.is_admin() then
    raise exception 'club_admins_only';
  end if;
  if v_them is null then
    raise exception 'not_a_member';
  end if;
  if v_them = 'owner' then
    raise exception 'cant_change_owner';
  end if;
  perform set_config('tunr.managing_club', 'on', true);
  if p_action = 'accept' then
    update public.club_members set status = 'member', joined_at = now() where club_id = p_club and user_id = p_user;
    perform public.notify(p_user, 'club', 'You''re in ' || v_name, 'Your request to join was accepted.', 'club:' || p_club, 'clubin:' || p_club);
  elsif p_action = 'remove' then
    if v_them = 'admin' and v_me <> 'owner' and not public.is_admin() then
      raise exception 'owner_only';
    end if;
    delete from public.club_members where club_id = p_club and user_id = p_user;
  elsif p_action in ('make_admin', 'make_member') then
    if v_me <> 'owner' and not public.is_admin() then
      raise exception 'owner_only';
    end if;
    update public.club_members set role = case when p_action = 'make_admin' then 'admin' else 'member' end, status = 'member'
    where club_id = p_club and user_id = p_user;
  else
    raise exception 'bad_action';
  end if;
  perform set_config('tunr.managing_club', 'off', true);
end;
$$;

revoke execute on function public.manage_club_member(uuid, uuid, text) from public, anon;
grant execute on function public.manage_club_member(uuid, uuid, text) to authenticated;

-- ============ READS ============
create or replace function public.club_member_count(p_club uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.club_members where club_id = p_club and status = 'member';
$$;

grant execute on function public.club_member_count(uuid) to anon, authenticated;

create or replace view public.clubs_list
with (security_invoker = true) as
select c.id, c.slug, c.name, c.kind, c.city, c.description, c.logo_url, c.visibility, c.created_by, c.created_at, c.hidden,
       public.club_member_count(c.id) as members,
       public.club_role(c.id) as my_role,
       case when public.club_role(c.id) in ('owner', 'admin')
         then (select count(*)::int from public.club_members m where m.club_id = c.id and m.status = 'requested')
         else 0 end as requests
from public.clubs c;

grant select on public.clubs_list to anon, authenticated;

create or replace function public.club_people(p_club uuid)
returns table (user_id uuid, username text, role text, status text, photographer boolean, photographer_verified boolean, joined_at timestamptz, show_on_profile boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, coalesce(p.username, 'someone'),
         m.role, m.status, coalesce(p.is_photographer, false), public.photographer_verified(m.user_id), m.joined_at,
         -- Only your own choice is yours to see.
         case when m.user_id = auth.uid() then m.show_on_profile end
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  left join public.profiles p on p.id = m.user_id
  where m.club_id = p_club
    and not public.has_blocked(m.user_id)
    and (
      (m.status = 'member' and (c.visibility = 'public' or public.club_role(p_club) in ('owner', 'admin', 'member')))
      or public.club_role(p_club) in ('owner', 'admin')
      or m.user_id = auth.uid()
    )
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at;
$$;

grant execute on function public.club_people(uuid) to anon, authenticated;

-- Clubs someone shows on their profile.
create or replace function public.person_clubs(p_user uuid)
returns table (id uuid, slug text, name text, kind text, logo_url text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.kind, c.logo_url, m.role
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  where m.user_id = p_user and m.status = 'member' and not c.hidden
    and (m.show_on_profile or p_user = auth.uid())
    and not public.blocked_either_way(p_user, auth.uid())
  order by m.joined_at;
$$;

grant execute on function public.person_clubs(uuid) to anon, authenticated;

-- Upcoming meets members are going to, most members first. Members only.
create or replace function public.club_meets(p_club uuid)
returns table (event_id uuid, members_going int)
language sql
stable
security definer
set search_path = public
as $$
  select r.event_id, count(*)::int
  from public.rsvps r
  join public.club_members m on m.user_id = r.user_id and m.club_id = p_club and m.status = 'member'
  join public.events e on e.id = r.event_id
  where r.status = 'going'
    and public.club_role(p_club) in ('owner', 'admin', 'member')
    and (e.recurrence is not null or e.start_at > now() - interval '6 hours')
  group by r.event_id
  order by 2 desc
  limit 20;
$$;

grant execute on function public.club_meets(uuid) to authenticated;

create or replace view public.club_messages_with_author
with (security_invoker = true) as
select m.id, m.club_id, m.user_id, m.body, m.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.is_photographer, false) as photographer,
       public.photographer_verified(m.user_id) as photographer_verified,
       public.club_role(m.club_id, m.user_id) as role
from public.club_messages m
left join public.profiles p on p.id = m.user_id;

grant select on public.club_messages_with_author to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_messages') then
    alter publication supabase_realtime add table public.club_messages;
  end if;
end $$;

-- ============ ALERTS ============
create or replace function public.club_member_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clubs;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  rec record;
begin
  if new.status <> 'requested' then
    return new;
  end if;
  select * into c from public.clubs where id = new.club_id;
  for rec in select user_id from public.club_members where club_id = c.id and role in ('owner', 'admin') and status = 'member' loop
    perform public.notify(rec.user_id, 'club', '@' || v_name || ' wants to join ' || c.name,
      'Open the club to accept or decline.', 'club:' || c.id, 'clubreq:' || c.id || ':' || new.user_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists club_members_notify on public.club_members;
create trigger club_members_notify after insert on public.club_members
  for each row execute function public.club_member_notify();

-- Club chat: at most one nudge per member per club per day.
create or replace function public.club_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clubs;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  rec record;
begin
  select * into c from public.clubs where id = new.club_id;
  for rec in select user_id from public.club_members where club_id = c.id and status = 'member' and user_id <> new.user_id loop
    if not public.blocked_either_way(rec.user_id, new.user_id) then
      perform public.notify(rec.user_id, 'club_chat', c.name || ' chat',
        '@' || v_name || ': ' || left(new.body, 120), 'club:' || c.id, 'clubchat:' || c.id || ':' || current_date);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists club_messages_notify on public.club_messages;
create trigger club_messages_notify after insert on public.club_messages
  for each row execute function public.club_message_notify();

-- ============ ADMIN: REPORTS ============
create or replace function public.community_report_queue()
returns table (id bigint, target_type text, target_id text, reason text, created_at timestamptz, reporter text, reports int, preview text, link text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.target_type, r.target_id, r.reason, r.created_at,
         coalesce(p.username, 'someone'),
         (select count(*)::int from public.community_reports r2
           where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.resolved_at is null),
         case r.target_type
           when 'post' then (select left(fp.title, 120) from public.forum_posts fp where fp.id::text = r.target_id)
           when 'comment' then (select left(fc.body, 120) from public.forum_comments fc where fc.id::text = r.target_id)
           when 'forum' then (select f.name from public.forums f where f.id::text = r.target_id)
           when 'club' then (select c.name from public.clubs c where c.id::text = r.target_id)
         end,
         case r.target_type
           when 'post' then 'post:' || r.target_id
           when 'comment' then 'post:' || (select fc.post_id::text from public.forum_comments fc where fc.id::text = r.target_id)
           when 'forum' then 'forum:' || r.target_id
           when 'club' then 'club:' || r.target_id
         end
  from public.community_reports r
  left join public.profiles p on p.id = r.user_id
  where r.resolved_at is null and public.is_admin()
  order by r.created_at desc
  limit 100;
$$;

revoke execute on function public.community_report_queue() from public, anon;
grant execute on function public.community_report_queue() to authenticated;

-- p_action: 'dismiss', or 'remove' (hides the post/comment/forum/club).
create or replace function public.resolve_community_report(p_type text, p_target text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if p_action = 'remove' then
    if p_type = 'post' then update public.forum_posts set removed = true where id::text = p_target;
    elsif p_type = 'comment' then update public.forum_comments set removed = true where id::text = p_target;
    elsif p_type = 'forum' then update public.forums set hidden = true where id::text = p_target;
    elsif p_type = 'club' then update public.clubs set hidden = true where id::text = p_target;
    end if;
  end if;
  update public.community_reports set resolved_at = now()
  where target_type = p_type and target_id = p_target and resolved_at is null;
end;
$$;

revoke execute on function public.resolve_community_report(text, text, text) from public, anon;
grant execute on function public.resolve_community_report(text, text, text) to authenticated;
