-- Your own activity, for the rows on your TUNR time slip (StandingCard.jsx):
-- how many check-ins, meets hosted, meet photos, linkups and posts in the
-- last 12 months, the same things the activity score (113) counts.
--
-- Only ever about the signed-in member: attendance stays private, so other
-- people's slips show their class and position, never these counts.
--
--   my_activity() → { checkins, hosted, photos, linkups, posts }

create or replace function public.my_activity()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'checkins', (select count(*) from public.meet_checkins c
                  where c.user_id = auth.uid() and c.voided_at is null and c.created_at >= now() - interval '1 year'),
    'hosted', (select count(*) from public.events e
                where e.created_by = auth.uid() and e.start_at >= now() - interval '1 year' and e.start_at < now()
                  and not coalesce(e.hidden, false)),
    'photos', (select count(*) from public.meet_photos m where m.user_id = auth.uid() and m.created_at >= now() - interval '1 year'),
    'linkups', (select count(*) from public.linkups l where l.user_id = auth.uid() and l.created_at >= now() - interval '1 year'),
    'posts', (select count(*) from public.forum_posts f where f.user_id = auth.uid() and f.created_at >= now() - interval '1 year')
           + (select count(*) from public.forum_comments f where f.user_id = auth.uid() and f.created_at >= now() - interval '1 year')
  ) end;
$$;
revoke execute on function public.my_activity() from public, anon;
grant execute on function public.my_activity() to authenticated;
