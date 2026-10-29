-- Profile counts: meets someone went to (checked in at), meets they
-- posted, and their posts. Counts only, for anyone's profile.

create or replace function public.profile_counts(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'went', (select count(distinct event_id) from public.meet_checkins where user_id = p_user and voided_at is null),
    'meets', (select count(*) from public.events where created_by = p_user and not coalesce(hidden, false)),
    'posts', (select count(*) from public.forum_posts where user_id = p_user and not removed)
  );
$$;
grant execute on function public.profile_counts(uuid) to anon, authenticated;
