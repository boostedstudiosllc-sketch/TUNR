-- TUNR Rush leaderboard, shown when a run ends: this week's or all-time
-- best distance per driver. The caller's own row always comes back (even
-- outside the top, or if they hide from leaderboards, which only they
-- see), along with how many drivers are on the board.

drop function if exists public.game_leaderboard(int);

create or replace function public.game_leaderboard(p_limit int default 50, p_period text default 'week')
returns table (
  rank int, user_id uuid, username text, avatar_url text, profile_color text,
  score int, car text, is_me boolean, drivers int
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (g.user_id) g.user_id, g.distance, g.vehicle_id
      from public.game_runs g
     where g.finished_at is not null
       and g.distance > 0
       and (p_period = 'all'
            or g.finished_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York')
     order by g.user_id, g.distance desc, g.finished_at
  ),
  shown as (
    select b.*, p.username, p.avatar_url, p.profile_color, p.id = auth.uid() as me
      from best b
      join public.profiles p on p.id = b.user_id
     where coalesce(p.username, '') <> ''
       and (not p.hide_from_leaderboards or p.id = auth.uid())
  ),
  ranked as (
    select s.*,
           (rank() over (order by s.distance desc))::int as rnk,
           row_number() over (order by s.distance desc, s.user_id) as rn,
           (count(*) over ())::int as total
      from shown s
  )
  select r.rnk, r.user_id, r.username, r.avatar_url, r.profile_color, r.distance,
         (select trim(coalesce(v.year::text, '') || ' ' || v.make || ' ' || v.model) from public.vehicles v where v.id = r.vehicle_id),
         coalesce(r.me, false), r.total
    from ranked r
   where r.rn <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.me
   order by r.rn;
$$;

revoke execute on function public.game_leaderboard(int, text) from public;
grant execute on function public.game_leaderboard(int, text) to anon, authenticated;
