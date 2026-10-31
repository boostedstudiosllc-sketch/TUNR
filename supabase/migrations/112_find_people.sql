-- Finding people to follow: search by username or name. With nothing typed,
-- the most-followed people. Never people who've blocked you (or you them),
-- and never yourself.
--   search_people(q) → [{ id, username, display_name, avatar_url,
--     followers, cars, i_follow, follows_me }]

create or replace function public.search_people(p_q text default '')
returns table (id uuid, username text, display_name text, avatar_url text, followers int, cars int, i_follow boolean, follows_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(regexp_replace(btrim(coalesce(p_q, '')), '^@', '')) as t)
  select p.id, p.username, p.display_name, p.avatar_url,
         (select count(*) from public.user_follows f where f.followee_id = p.id)::int as followers,
         (select count(*) from public.vehicles v where v.owner_id = p.id)::int as cars,
         exists (select 1 from public.user_follows f where f.follower_id = auth.uid() and f.followee_id = p.id) as i_follow,
         exists (select 1 from public.user_follows f where f.follower_id = p.id and f.followee_id = auth.uid()) as follows_me
    from public.profiles p, q
   where p.username is not null and p.username <> ''
     and p.id is distinct from auth.uid()
     and not public.blocked_either_way(auth.uid(), p.id)
     and (q.t = '' or lower(p.username) like '%' || replace(replace(q.t, '%', ''), '_', '\_') || '%'
                   or lower(coalesce(p.display_name, '')) like '%' || replace(q.t, '%', '') || '%')
   order by (lower(p.username) = q.t) desc,
            (lower(p.username) like q.t || '%') desc,
            followers desc,
            p.username
   limit 25;
$$;
revoke execute on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;
