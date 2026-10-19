-- Forums: open, Reddit-style discussion. Anyone with a confirmed email can
-- start a forum ("G30 5 Series Fix-It", "GA Photo Spots") — three a week —
-- and post in any. Posts get a tag, 👍/👎 votes and threaded comments; a
-- question's asker can mark the answer that solved it. Photo-spot posts can
-- carry a map pin. Readable by everyone, signed in or not.
--
-- Moderation: a forum's creator moderates it (pin, lock, remove), TUNR
-- admins moderate everything, and anyone signed in can report. Blocked
-- people's posts and comments are hidden from whoever blocked them.

-- ============ FORUMS ============
create table if not exists public.forums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 3 and 40),
  description text check (char_length(description) <= 300),
  icon text not null default '💬' check (char_length(icon) <= 8),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create unique index if not exists forums_name_unique on public.forums (lower(name));

create table if not exists public.forum_follows (
  forum_id uuid not null references public.forums (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (forum_id, user_id)
);

create index if not exists forum_follows_user_idx on public.forum_follows (user_id);

-- ============ POSTS ============
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  forum_id uuid not null references public.forums (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  tag text not null default 'discussion' check (tag in ('question', 'build', 'spot', 'guide', 'discussion')),
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 4),
  -- Photo spots: where it is.
  place text check (char_length(place) <= 120),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  pinned boolean not null default false,
  locked boolean not null default false,
  removed boolean not null default false,
  solved_comment_id bigint
);

create index if not exists forum_posts_forum_idx on public.forum_posts (forum_id, created_at desc);
create index if not exists forum_posts_user_idx on public.forum_posts (user_id, created_at);
create index if not exists forum_posts_spots_idx on public.forum_posts (tag) where lat is not null;

create table if not exists public.forum_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id bigint references public.forum_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  removed boolean not null default false
);

create index if not exists forum_comments_post_idx on public.forum_comments (post_id, created_at);

create table if not exists public.forum_post_votes (
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

create table if not exists public.forum_comment_votes (
  comment_id bigint not null references public.forum_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);

create table if not exists public.community_reports (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('forum', 'post', 'comment', 'club')),
  target_id text not null check (char_length(target_id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (target_type, target_id, user_id)
);

-- ============ WHO MAY DO WHAT ============
create or replace function public.forum_mod(p_forum uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.forums f where f.id = p_forum and f.created_by = auth.uid());
$$;

grant execute on function public.forum_mod(uuid) to anon, authenticated;

alter table public.forums enable row level security;
alter table public.forum_follows enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_post_votes enable row level security;
alter table public.forum_comment_votes enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists "forums are public" on public.forums;
create policy "forums are public" on public.forums for select to anon, authenticated
  using (not hidden or public.is_admin());

drop policy if exists "confirmed users start forums" on public.forums;
create policy "confirmed users start forums" on public.forums for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "mods edit forums" on public.forums;
create policy "mods edit forums" on public.forums for update to authenticated
  using (public.forum_mod(id)) with check (public.forum_mod(id));

drop policy if exists "users read their follows" on public.forum_follows;
create policy "users read their follows" on public.forum_follows for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "users follow forums" on public.forum_follows;
create policy "users follow forums" on public.forum_follows for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "users unfollow forums" on public.forum_follows;
create policy "users unfollow forums" on public.forum_follows for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "posts are public" on public.forum_posts;
create policy "posts are public" on public.forum_posts for select to anon, authenticated
  using (
    (not removed or user_id = auth.uid() or public.forum_mod(forum_id))
    and not public.has_blocked(user_id)
    and exists (select 1 from public.forums f where f.id = forum_id and (not f.hidden or public.is_admin()))
  );
drop policy if exists "users post" on public.forum_posts;
create policy "users post" on public.forum_posts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "authors and mods edit posts" on public.forum_posts;
create policy "authors and mods edit posts" on public.forum_posts for update to authenticated
  using (user_id = auth.uid() or public.forum_mod(forum_id))
  with check (user_id = auth.uid() or public.forum_mod(forum_id));
drop policy if exists "authors and mods delete posts" on public.forum_posts;
create policy "authors and mods delete posts" on public.forum_posts for delete to authenticated
  using (user_id = auth.uid() or public.forum_mod(forum_id));

drop policy if exists "comments are public" on public.forum_comments;
create policy "comments are public" on public.forum_comments for select to anon, authenticated
  using (not public.has_blocked(user_id));
drop policy if exists "users comment" on public.forum_comments;
create policy "users comment" on public.forum_comments for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "users delete their comments" on public.forum_comments;
create policy "users delete their comments" on public.forum_comments for delete to authenticated
  using (user_id = auth.uid());

-- Votes go through vote_forum(); totals come through the views.
drop policy if exists "users read their votes" on public.forum_post_votes;
create policy "users read their votes" on public.forum_post_votes for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "users read their comment votes" on public.forum_comment_votes;
create policy "users read their comment votes" on public.forum_comment_votes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users report" on public.community_reports;
create policy "users report" on public.community_reports for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "admins read reports" on public.community_reports;
create policy "admins read reports" on public.community_reports for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- Confirmed email for everything that writes (041's check, sorting first).
do $$
declare
  t text;
begin
  foreach t in array array['forums', 'forum_posts', 'forum_comments', 'community_reports'] loop
    execute format('drop trigger if exists a_require_confirmed_email on public.%I', t);
    execute format(
      'create trigger a_require_confirmed_email before insert on public.%I for each row execute function public.require_confirmed_email()',
      t
    );
  end loop;
end $$;

-- ============ RULES A POLICY CAN'T SAY ============
create or replace function public.check_forum()
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
    if (select count(*) from public.forums f
        where f.created_by = auth.uid() and f.created_at > now() - interval '7 days') >= 3 then
      raise exception 'rate_limit_forums';
    end if;
    if exists (select 1 from public.forums f where lower(f.name) = lower(new.name)) then
      raise exception 'forum_name_taken';
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

drop trigger if exists forums_check on public.forums;
create trigger forums_check before insert or update on public.forums
  for each row execute function public.check_forum();

create or replace function public.check_forum_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod boolean;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.forums f where f.id = new.forum_id and f.hidden) then
      raise exception 'forum_unavailable';
    end if;
    if (select count(*) from public.forum_posts p
        where p.user_id = auth.uid() and p.created_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate_limit_posts';
    end if;
    new.created_at := now();
    new.edited_at := null;
    new.pinned := false;
    new.locked := false;
    new.removed := false;
    new.solved_comment_id := null;
    if new.tag <> 'spot' then
      new.lat := null;
      new.lng := null;
      new.place := null;
    end if;
    return new;
  end if;

  v_mod := public.forum_mod(old.forum_id);
  new.id := old.id;
  new.forum_id := old.forum_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  -- Moderation is for mods; the content is the author's.
  if not v_mod then
    new.pinned := old.pinned;
    new.locked := old.locked;
    new.removed := old.removed;
  end if;
  if auth.uid() <> old.user_id then
    new.title := old.title;
    new.body := old.body;
    new.tag := old.tag;
    new.photo_urls := old.photo_urls;
    new.place := old.place;
    new.lat := old.lat;
    new.lng := old.lng;
    new.solved_comment_id := old.solved_comment_id;
  else
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    -- The answer has to be a comment on this post.
    if new.solved_comment_id is not null and not exists (
      select 1 from public.forum_comments c where c.id = new.solved_comment_id and c.post_id = old.id
    ) then
      raise exception 'bad_solution';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forum_posts_check on public.forum_posts;
create trigger forum_posts_check before insert or update on public.forum_posts
  for each row execute function public.check_forum_post();

create or replace function public.check_forum_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forum_posts;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into p from public.forum_posts where id = new.post_id;
  if p.id is null or p.removed then
    raise exception 'post_unavailable';
  end if;
  if p.locked then
    raise exception 'post_locked';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.forum_comments c where c.id = new.parent_id and c.post_id = new.post_id
  ) then
    raise exception 'bad_reply';
  end if;
  if (select count(*) from public.forum_comments c
      where c.user_id = auth.uid() and c.created_at > now() - interval '1 minute') >= 8 then
    raise exception 'rate_limit_comments';
  end if;
  new.created_at := now();
  new.removed := false;
  return new;
end;
$$;

drop trigger if exists forum_comments_check on public.forum_comments;
create trigger forum_comments_check before insert on public.forum_comments
  for each row execute function public.check_forum_comment();

-- Mods hide a comment (shown as "removed"); authors just delete theirs.
create or replace function public.remove_forum_comment(p_comment bigint, p_removed boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forum uuid := (select p.forum_id from public.forum_comments c join public.forum_posts p on p.id = c.post_id where c.id = p_comment);
begin
  if not public.forum_mod(v_forum) then
    raise exception 'mods_only';
  end if;
  update public.forum_comments set removed = p_removed where id = p_comment;
end;
$$;

revoke execute on function public.remove_forum_comment(bigint, boolean) from public, anon;
grant execute on function public.remove_forum_comment(bigint, boolean) to authenticated;

-- 👍 = 1, 👎 = -1, 0 takes it back.
create or replace function public.vote_forum(p_kind text, p_id text, p_value int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not public.email_confirmed(auth.uid()) then
    raise exception 'confirm_email_first';
  end if;
  if p_kind = 'post' then
    if p_value = 0 then
      delete from public.forum_post_votes where post_id = p_id::uuid and user_id = auth.uid();
    else
      insert into public.forum_post_votes (post_id, user_id, value) values (p_id::uuid, auth.uid(), sign(p_value))
      on conflict (post_id, user_id) do update set value = excluded.value;
    end if;
  elsif p_kind = 'comment' then
    if p_value = 0 then
      delete from public.forum_comment_votes where comment_id = p_id::bigint and user_id = auth.uid();
    else
      insert into public.forum_comment_votes (comment_id, user_id, value) values (p_id::bigint, auth.uid(), sign(p_value))
      on conflict (comment_id, user_id) do update set value = excluded.value;
    end if;
  else
    raise exception 'bad_vote';
  end if;
end;
$$;

revoke execute on function public.vote_forum(text, text, int) from public, anon;
grant execute on function public.vote_forum(text, text, int) to authenticated;

-- ============ WHAT THE APP READS ============
-- Totals see every vote and follow; who voted or follows stays private.
create or replace function public.forum_vote_totals(p_kind text, p_id text)
returns table (score int, ups int, downs int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind = 'post' then
    return query
      select coalesce(sum(value), 0)::int, (count(*) filter (where value = 1))::int, (count(*) filter (where value = -1))::int
      from public.forum_post_votes where post_id = p_id::uuid;
  else
    return query
      select coalesce(sum(value), 0)::int, (count(*) filter (where value = 1))::int, (count(*) filter (where value = -1))::int
      from public.forum_comment_votes where comment_id = p_id::bigint;
  end if;
end;
$$;

grant execute on function public.forum_vote_totals(text, text) to anon, authenticated;

create or replace function public.forum_follower_count(p_forum uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.forum_follows where forum_id = p_forum;
$$;

grant execute on function public.forum_follower_count(uuid) to anon, authenticated;

create or replace view public.forums_list
with (security_invoker = true) as
select f.id, f.slug, f.name, f.description, f.icon, f.created_by, f.created_at, f.hidden,
       coalesce(p.username, 'someone') as creator,
       public.forum_follower_count(f.id) as followers,
       (select count(*)::int from public.forum_posts fp where fp.forum_id = f.id and not fp.removed) as posts,
       (select max(fp.created_at) from public.forum_posts fp where fp.forum_id = f.id and not fp.removed) as last_post_at,
       exists (select 1 from public.forum_follows ff where ff.forum_id = f.id and ff.user_id = auth.uid()) as i_follow,
       public.forum_mod(f.id) as i_mod
from public.forums f
left join public.profiles p on p.id = f.created_by;

grant select on public.forums_list to anon, authenticated;

create or replace view public.forum_posts_feed
with (security_invoker = true) as
select fp.id, fp.forum_id, f.slug as forum_slug, f.name as forum_name, f.icon as forum_icon,
       fp.user_id, coalesce(pr.username, 'someone') as username,
       coalesce(pr.is_photographer, false) as photographer,
       public.photographer_verified(fp.user_id) as photographer_verified,
       coalesce(pr.day_one, false) as day_one, pr.day_one_number,
       fp.title, fp.body, fp.tag, fp.photo_urls, fp.place, fp.lat, fp.lng,
       fp.created_at, fp.edited_at, fp.pinned, fp.locked, fp.removed, fp.solved_comment_id,
       v.score, v.ups, v.downs,
       (select count(*)::int from public.forum_comments c where c.post_id = fp.id and not c.removed) as comments,
       (select mv.value from public.forum_post_votes mv where mv.post_id = fp.id and mv.user_id = auth.uid()) as my_vote,
       -- Reddit-ish: votes, worn down by age.
       (v.score + 1) / power(extract(epoch from (now() - fp.created_at)) / 3600 + 2, 1.5) as hot,
       public.forum_mod(fp.forum_id) as i_mod
from public.forum_posts fp
join public.forums f on f.id = fp.forum_id
left join public.profiles pr on pr.id = fp.user_id
cross join lateral public.forum_vote_totals('post', fp.id::text) v;

grant select on public.forum_posts_feed to anon, authenticated;

create or replace view public.forum_comments_feed
with (security_invoker = true) as
select c.id, c.post_id, c.parent_id, c.user_id,
       coalesce(pr.username, 'someone') as username,
       coalesce(pr.is_photographer, false) as photographer,
       public.photographer_verified(c.user_id) as photographer_verified,
       case when c.removed then '' else c.body end as body,
       c.removed, c.created_at,
       v.score,
       (select mv.value from public.forum_comment_votes mv where mv.comment_id = c.id and mv.user_id = auth.uid()) as my_vote
from public.forum_comments c
left join public.profiles pr on pr.id = c.user_id
cross join lateral public.forum_vote_totals('comment', c.id::text) v;

grant select on public.forum_comments_feed to anon, authenticated;

-- ============ ALERTS ============
create or replace function public.forum_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forum_posts;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  v_parent uuid;
begin
  select * into p from public.forum_posts where id = new.post_id;
  if p.user_id <> new.user_id and not public.blocked_either_way(p.user_id, new.user_id) then
    perform public.notify(p.user_id, 'forum', '@' || v_name || ' commented on your post',
      left(p.title, 60) || ' — ' || left(new.body, 100), 'post:' || p.id, 'fcomment:' || new.id);
  end if;
  if new.parent_id is not null then
    select user_id into v_parent from public.forum_comments where id = new.parent_id;
    if v_parent is not null and v_parent <> new.user_id and v_parent <> p.user_id
       and not public.blocked_either_way(v_parent, new.user_id) then
      perform public.notify(v_parent, 'forum', '@' || v_name || ' replied to you',
        left(new.body, 120), 'post:' || p.id, 'freply:' || new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forum_comments_notify on public.forum_comments;
create trigger forum_comments_notify after insert on public.forum_comments
  for each row execute function public.forum_comment_notify();

create or replace function public.forum_solved_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answerer uuid;
begin
  if new.solved_comment_id is not null and new.solved_comment_id is distinct from old.solved_comment_id then
    select user_id into v_answerer from public.forum_comments where id = new.solved_comment_id;
    if v_answerer is not null and v_answerer <> new.user_id then
      perform public.notify(v_answerer, 'forum', '✅ Your answer solved it',
        left(new.title, 100), 'post:' || new.id, 'solved:' || new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forum_posts_solved_notify on public.forum_posts;
create trigger forum_posts_solved_notify after update of solved_comment_id on public.forum_posts
  for each row execute function public.forum_solved_notify();

-- ============ STARTER FORUMS ============
-- So the tab isn't empty on day one. Owned by the first admin, if any.
insert into public.forums (slug, name, description, icon, created_by)
select s.slug, s.name, s.description, s.icon, a.id
from (values
  ('ga-photo-spots', 'GA Photo Spots', 'Good places to shoot cars around Georgia. Drop a pin, a photo, and the best time to go.', '📸'),
  ('fix-it', 'Fix-It Garage', 'Something broke? Ask here. Say the year, make, model and what it''s doing.', '🔧'),
  ('builds', 'Build Threads', 'Show your build, from day one to done.', '🏗️'),
  ('meet-talk', 'Meet Talk', 'Meets, cruises, what was good, what''s next.', '🏁')
) as s(slug, name, description, icon)
cross join lateral (select id from public.profiles where is_admin order by created_at limit 1) a
on conflict do nothing;
