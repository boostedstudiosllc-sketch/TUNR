-- Photo spots you can discover: good places to shoot cars, with what kind
-- of shot each one gives, the best time to go and how security treats you.
--
-- Spots are still forum posts tagged 'spot' (042: a name, a pin, up to 4
-- photos, votes, comments), so they keep working in the forums. This adds:
--   forum_posts.spot_vibes     up to 4 of: skyline, industrial, bridge, mural,
--                              nature, rooftop, tunnel, night_lights, rollers,
--                              water, lot
--   forum_posts.spot_best_time sunrise | day | golden | blue | night
--   forum_posts.spot_security  chill (no one bothers you) | quick (shoot fast,
--                              you may get moved on) | ask (get permission)
--   photo_spot_saves           your saved spots (only you see them)
--   photo_spots                the discover list: every live spot with its
--                              cover, score, how many saved it and whether you did

alter table public.forum_posts
  add column if not exists spot_vibes text[] not null default '{}'
    check (cardinality(spot_vibes) <= 4 and spot_vibes <@ array['skyline', 'industrial', 'bridge', 'mural', 'nature', 'rooftop', 'tunnel', 'night_lights', 'rollers', 'water', 'lot']),
  add column if not exists spot_best_time text check (spot_best_time in ('sunrise', 'day', 'golden', 'blue', 'night')),
  add column if not exists spot_security text check (spot_security in ('chill', 'quick', 'ask'));

-- Only spots carry spot details, only the author sets them, and no repeats.
create or replace function public.forum_spot_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is distinct from old.user_id then
    new.spot_vibes := old.spot_vibes;
    new.spot_best_time := old.spot_best_time;
    new.spot_security := old.spot_security;
    return new;
  end if;
  if new.tag <> 'spot' then
    new.spot_vibes := '{}';
    new.spot_best_time := null;
    new.spot_security := null;
  else
    new.spot_vibes := coalesce((select array_agg(distinct v order by v) from unnest(new.spot_vibes) v), '{}');
  end if;
  return new;
end;
$$;
drop trigger if exists forum_spot_fields on public.forum_posts;
create trigger forum_spot_fields before insert or update on public.forum_posts
  for each row execute function public.forum_spot_fields();

create table if not exists public.photo_spot_saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists photo_spot_saves_post_idx on public.photo_spot_saves (post_id);
alter table public.photo_spot_saves enable row level security;

drop policy if exists "people see their saved spots" on public.photo_spot_saves;
create policy "people see their saved spots" on public.photo_spot_saves for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "people save spots" on public.photo_spot_saves;
create policy "people save spots" on public.photo_spot_saves for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.forum_posts p where p.id = post_id and p.tag = 'spot' and not p.removed));
drop policy if exists "people unsave spots" on public.photo_spot_saves;
create policy "people unsave spots" on public.photo_spot_saves for delete to authenticated
  using (user_id = auth.uid());

-- How many people saved each spot, without showing who.
create or replace function public.spot_save_count(p_post uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.photo_spot_saves where post_id = p_post;
$$;
grant execute on function public.spot_save_count(uuid) to anon, authenticated;

create or replace view public.photo_spots
with (security_invoker = true) as
select fp.id, fp.forum_id, fp.title, fp.place, fp.lat, fp.lng, fp.photo_urls,
       left(fp.body, 280) as body,
       fp.spot_vibes, fp.spot_best_time, fp.spot_security,
       fp.user_id, coalesce(pr.username, 'someone') as username, fp.created_at,
       v.score,
       (select count(*)::int from public.forum_comments c where c.post_id = fp.id and not c.removed) as comments,
       public.spot_save_count(fp.id) as saves,
       exists (select 1 from public.photo_spot_saves s where s.post_id = fp.id and s.user_id = auth.uid()) as saved
from public.forum_posts fp
left join public.profiles pr on pr.id = fp.user_id
cross join lateral public.forum_vote_totals('post', fp.id::text) v
where fp.tag = 'spot' and not fp.removed and fp.lat is not null;

grant select on public.photo_spots to anon, authenticated;

-- The forum's post view gets the spot details too (new columns at the end).
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
       (v.score + 1) / power(extract(epoch from (now() - fp.created_at)) / 3600 + 2, 1.5) as hot,
       public.forum_mod(fp.forum_id) as i_mod,
       fp.spot_vibes, fp.spot_best_time, fp.spot_security
from public.forum_posts fp
join public.forums f on f.id = fp.forum_id
left join public.profiles pr on pr.id = fp.user_id
cross join lateral public.forum_vote_totals('post', fp.id::text) v;

grant select on public.forum_posts_feed to anon, authenticated;
