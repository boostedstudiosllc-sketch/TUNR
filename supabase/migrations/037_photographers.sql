-- Photographers: a 📸 badge anyone can turn on (with a link to their photo
-- page), and saying how you're going to a meet — with your car, as a
-- photographer, or both — so meets show how many of each are coming.

alter table public.profiles add column if not exists is_photographer boolean not null default false;
alter table public.profiles
  add column if not exists photo_page text check (photo_page is null or char_length(photo_page) <= 200);

alter table public.rsvps
  add column if not exists going_as text not null default 'car' check (going_as in ('car', 'photographer', 'both'));

-- 001's counts, with cars and photographers among the people going.
create or replace view public.event_rsvp_counts as
select
  event_id,
  count(*) filter (where status = 'going') as going,
  count(*) filter (where status = 'interested') as interested,
  count(*) filter (where status = 'going' and going_as in ('car', 'both')) as cars,
  count(*) filter (where status = 'going' and going_as in ('photographer', 'both')) as photographers
from public.rsvps
group by event_id;

grant select on public.event_rsvp_counts to anon, authenticated;

-- 036's chat view, with the author's photographer badge appended.
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
       (public.is_event_host(c.event_id) and public.restricted_on_event(c.user_id, c.event_id)) as author_restricted,
       coalesce(p.is_photographer, false) as photographer
from public.comments c
left join public.profiles p on p.id = c.user_id
cross join lateral public.comment_reaction_counts(c.id) rc;

grant select on public.comments_with_author to anon, authenticated;

-- 036's profile lookup, with the photographer badge and page. The return
-- type changes, so it's dropped and made again.
drop function if exists public.get_person(uuid);
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
  unavailable boolean,
  is_photographer boolean,
  photo_page text
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
    exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid()),
    coalesce(p.is_photographer, false),
    p.photo_page
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.get_person(uuid) to anon, authenticated;
