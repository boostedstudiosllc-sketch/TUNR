-- "Member since" and "Top X% active" on profiles, like a city ranking.
--
-- The activity score counts the last 12 months of real activity:
--   check-in at a meet 10, meet hosted (started, not hidden) 15, meet photo 3,
--   linkup started 4, forum post 2, forum comment 1 and meet chat message 1
--   (those two capped at 100 a year each, so chatting can't buy a rank).
-- People are ranked against others in their city (the part of profiles.city
-- before the comma) with a score; while a city has fewer than 20 of them,
-- against everyone on TUNR. Top 1 / 5 / 10 / 25 % earn the badge, from a
-- score of 30 up (three check-ins), so a near-empty account never gets one.
-- People who hide from leaderboards are left out entirely.
--
--   profile_standing(user) → { member_since, score, rank, of, top, area }

create or replace function public.activity_scores(p_since timestamptz)
returns table (user_id uuid, score int)
language sql
stable
security definer
set search_path = public
as $$
  with parts as (
    select c.user_id, 10 * count(*) as pts from public.meet_checkins c where c.voided_at is null and c.created_at >= p_since group by 1
    union all
    select e.created_by, 15 * count(*) from public.events e
     where e.created_by is not null and e.start_at >= p_since and e.start_at < now() and not coalesce(e.hidden, false) group by 1
    union all
    select m.user_id, 3 * count(*) from public.meet_photos m where m.created_at >= p_since group by 1
    union all
    select l.user_id, 4 * count(*) from public.linkups l where l.created_at >= p_since group by 1
    union all
    select f.user_id, 2 * count(*) from public.forum_posts f where f.created_at >= p_since group by 1
    union all
    select f.user_id, least(count(*), 100) from public.forum_comments f where f.created_at >= p_since group by 1
    union all
    select c.user_id, least(count(*), 100) from public.comments c where c.created_at >= p_since group by 1
  )
  select parts.user_id, sum(pts)::int from parts where parts.user_id is not null group by 1;
$$;
revoke execute on function public.activity_scores(timestamptz) from public, anon, authenticated;

create or replace function public.profile_standing(p_user uuid)
returns jsonb
language plpgsql
volatile -- (it fills a scratch table)
security definer
set search_path = public
as $$
declare
  p public.profiles;
  v_since timestamptz;
  v_area text;
  v_score int;
  v_rank int;
  v_of int;
  v_top int;
begin
  select * into p from public.profiles where id = p_user;
  if not found then
    return null;
  end if;
  select coalesce(u.created_at, p.created_at) into v_since from auth.users u where u.id = p_user;
  if coalesce(p.hide_from_leaderboards, false) then
    return jsonb_build_object('member_since', coalesce(v_since, p.created_at));
  end if;

  create temp table if not exists _standing (user_id uuid, score int, area text) on commit drop;
  delete from _standing;
  insert into _standing
  select s.user_id, s.score, lower(btrim(split_part(coalesce(pr.city, ''), ',', 1)))
    from public.activity_scores(now() - interval '1 year') s
    join public.profiles pr on pr.id = s.user_id
   where s.score > 0 and not coalesce(pr.hide_from_leaderboards, false);

  v_score := coalesce((select score from _standing where user_id = p_user), 0);
  v_area := lower(btrim(split_part(coalesce(p.city, ''), ',', 1)));
  if v_area = '' or (select count(*) from _standing where area = v_area) < 20 then
    v_area := null; -- the whole of TUNR
  end if;
  select count(*) into v_of from _standing where v_area is null or area = v_area;
  select 1 + count(*) into v_rank from _standing where (v_area is null or area = v_area) and score > v_score;

  if v_score >= 30 and v_of > 0 then
    v_top := case
      when v_rank::numeric / v_of <= 0.01 then 1
      when v_rank::numeric / v_of <= 0.05 then 5
      when v_rank::numeric / v_of <= 0.10 then 10
      when v_rank::numeric / v_of <= 0.25 then 25
    end;
  end if;

  return jsonb_build_object(
    'member_since', coalesce(v_since, p.created_at),
    'score', v_score,
    'rank', case when v_score > 0 then v_rank end,
    'of', v_of,
    'top', v_top,
    'area', case when v_area is null then 'TUNR' else initcap(split_part(p.city, ',', 1)) end
  );
end;
$$;
grant execute on function public.profile_standing(uuid) to anon, authenticated;
