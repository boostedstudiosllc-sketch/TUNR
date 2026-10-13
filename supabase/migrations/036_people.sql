-- People: following each other, removing followers, restricting, and
-- thumbs up / down on chat messages.
--
-- Hosts could already be followed by name (follows). This adds following a
-- person's account. Blocking already hid someone's messages from you and
-- stopped them messaging on your meets; it now also ends any follow between
-- you and stops it being re-made. Restricting is the quiet version: on meets
-- you host, a restricted person's messages are seen only by them and the
-- meet's hosts, and they aren't told.

-- ============ FOLLOWING PEOPLE ============
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_not_self check (follower_id <> followee_id)
);

create index if not exists user_follows_followee_idx on public.user_follows (followee_id, created_at desc);

alter table public.user_follows enable row level security;

-- Either end of a block, in either direction.
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

grant execute on function public.blocked_between(uuid, uuid) to authenticated;

drop policy if exists "people see their own follows" on public.user_follows;
create policy "people see their own follows"
  on public.user_follows for select
  to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

drop policy if exists "people follow as themselves" on public.user_follows;
create policy "people follow as themselves"
  on public.user_follows for insert
  to authenticated
  with check (follower_id = auth.uid() and not public.blocked_between(follower_id, followee_id));

-- Unfollow (your follow) or remove a follower (their follow of you).
drop policy if exists "people unfollow or remove followers" on public.user_follows;
create policy "people unfollow or remove followers"
  on public.user_follows for delete
  to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- A block ends any follow between the two.
create or replace function public.unfollow_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists blocks_unfollow on public.blocks;
create trigger blocks_unfollow
  after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- ============ RESTRICTING ============
create table if not exists public.restrictions (
  restricter_id uuid not null references auth.users (id) on delete cascade,
  restricted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (restricter_id, restricted_id),
  constraint restrictions_not_self check (restricter_id <> restricted_id)
);

alter table public.restrictions enable row level security;

drop policy if exists "people manage their own restrictions" on public.restrictions;
create policy "people manage their own restrictions"
  on public.restrictions for all
  to authenticated
  using (restricter_id = auth.uid())
  with check (restricter_id = auth.uid());

-- The author is restricted by the meet's owner or one of its accepted
-- co-hosts.
create or replace function public.restricted_on_event(p_author uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restrictions r
    where r.restricted_id = p_author
      and r.restricter_id in (
        select e.created_by from public.events e where e.id = p_event and e.created_by is not null
        union
        select c.user_id from public.event_cohosts c
        where c.event_id = p_event and c.status = 'accepted' and c.user_id is not null
      )
  );
$$;

grant execute on function public.restricted_on_event(uuid, uuid) to anon, authenticated;

-- 013's policy, plus: a restricted author's messages reach only themselves
-- and the meet's hosts.
drop policy if exists "comments are readable by everyone" on public.comments;
create policy "comments are readable by everyone"
  on public.comments for select
  to anon, authenticated
  using (
    public.can_access_event(event_id)
    and not public.has_blocked(user_id)
    and (
      user_id = auth.uid()
      or public.is_event_host(event_id)
      or not public.restricted_on_event(user_id, event_id)
    )
  );

drop view if exists public.restricted_accounts;
create view public.restricted_accounts
with (security_invoker = true) as
select r.restricted_id, r.created_at, coalesce(p.username, 'someone') as username
from public.restrictions r
left join public.profiles p on p.id = r.restricted_id;

grant select on public.restricted_accounts to authenticated;

-- ============ THUMBS ON CHAT MESSAGES ============
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_reactions enable row level security;

-- Only on messages you can see. Individual reactions aren't readable; the
-- totals come through comments_with_author.
drop policy if exists "people react to messages they can see" on public.comment_reactions;
create policy "people react to messages they can see"
  on public.comment_reactions for insert
  to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.comments c where c.id = comment_id));

drop policy if exists "people change their own reaction" on public.comment_reactions;
create policy "people change their own reaction"
  on public.comment_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "people take back their own reaction" on public.comment_reactions;
create policy "people take back their own reaction"
  on public.comment_reactions for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "people see their own reactions" on public.comment_reactions;
create policy "people see their own reactions"
  on public.comment_reactions for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.comment_reaction_counts(p_comment uuid)
returns table (ups int, downs int)
language sql
stable
security definer
set search_path = public
as $$
  select count(*) filter (where value = 1)::int, count(*) filter (where value = -1)::int
  from public.comment_reactions where comment_id = p_comment;
$$;

grant execute on function public.comment_reaction_counts(uuid) to anon, authenticated;

-- 024's view, with reactions and the restricted marker appended. Still
-- security_invoker, so the comments policy above decides what's returned.
create or replace view public.comments_with_author
with (security_invoker = true) as
select c.id, c.event_id, c.user_id, c.body, c.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.day_one, false) as day_one,
       p.day_one_number,
       exists (
         select 1 from public.verified_hosts vh
         where vh.user_id = c.user_id and vh.founding
       ) as founding_host,
       rc.ups,
       rc.downs,
       (select r.value from public.comment_reactions r
         where r.comment_id = c.id and r.user_id = auth.uid()) as my_reaction,
       -- Only ever true for the meet's hosts, who see restricted messages.
       (public.is_event_host(c.event_id) and public.restricted_on_event(c.user_id, c.event_id)) as author_restricted
from public.comments c
left join public.profiles p on p.id = c.user_id
cross join lateral public.comment_reaction_counts(c.id) rc;

grant select on public.comments_with_author to anon, authenticated;

-- ============ A PERSON'S PROFILE ============
-- Public facts plus how you and they are connected. Someone who has blocked
-- you comes back as unavailable.
create or replace function public.get_person(p_user uuid)
returns table (
  id uuid,
  username text,
  city text,
  day_one boolean,
  day_one_number int,
  founding_host boolean,
  host_name text,
  joined timestamptz,
  followers int,
  following int,
  i_follow boolean,
  follows_me boolean,
  i_blocked boolean,
  i_restricted boolean,
  unavailable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.city,
    coalesce(p.day_one, false),
    p.day_one_number,
    exists (select 1 from public.verified_hosts vh where vh.user_id = p.id and vh.founding),
    (select vh.host from public.verified_hosts vh where vh.user_id = p.id limit 1),
    p.created_at,
    (select count(*)::int from public.user_follows f where f.followee_id = p.id),
    (select count(*)::int from public.user_follows f where f.follower_id = p.id),
    exists (select 1 from public.user_follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from public.user_follows f where f.follower_id = p.id and f.followee_id = auth.uid()),
    exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id),
    exists (select 1 from public.restrictions r where r.restricter_id = auth.uid() and r.restricted_id = p.id),
    exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid())
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.get_person(uuid) to anon, authenticated;

-- Your followers and who you follow, with names. Only your own lists.
-- mutual: for a follower, whether you follow them back; for someone you
-- follow, whether they follow you.
create or replace function public.my_connections(p_kind text)
returns table (user_id uuid, username text, since timestamptz, mutual boolean)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select case when p_kind = 'followers' then f.follower_id else f.followee_id end as other,
           f.created_at
    from public.user_follows f
    where auth.uid() is not null
      and ((p_kind = 'followers' and f.followee_id = auth.uid())
        or (p_kind = 'following' and f.follower_id = auth.uid()))
  )
  select m.other,
         coalesce(p.username, 'someone'),
         m.created_at,
         exists (
           select 1 from public.user_follows back
           where (p_kind = 'followers' and back.follower_id = auth.uid() and back.followee_id = m.other)
              or (p_kind = 'following' and back.follower_id = m.other and back.followee_id = auth.uid())
         )
  from mine m
  left join public.profiles p on p.id = m.other
  order by m.created_at desc;
$$;

grant execute on function public.my_connections(text) to authenticated;
