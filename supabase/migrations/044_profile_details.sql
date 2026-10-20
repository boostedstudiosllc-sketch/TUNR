-- Profile details: a profile photo and a short bio, shown on your profile and
-- to anyone who opens it. Both columns have existed since 015 but nothing in
-- the app wrote them, so this adds the rules and puts them on get_person:
--   - the photo must be a file in your own folder of the avatars bucket
--     (015 gave that bucket own-folder write/delete policies), never a link
--     to some other site that would see who views your profile;
--   - the bio is short, at most four line breaks, and free of invisible
--     control and text-direction characters.
-- Profiles can also be reported now, and an admin "remove" clears the photo
-- and bio.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;

-- Anything already there that wouldn't pass the new rules. The app never
-- wrote these, so this only catches rows written by hand through the API.
create or replace function public.avatar_url_ok(p_url text, p_user uuid)
returns boolean
language sql
immutable
as $$
  -- A Supabase project's public avatars URL inside the user's own folder.
  -- (http://localhost or 127.0.0.1 is allowed for a local `supabase start`.)
  select p_url is null or (
    char_length(p_url) <= 500
    and p_url ~ ('^(https://[a-z0-9]{20}\.supabase\.co|http://(127\.0\.0\.1|localhost):[0-9]+)/storage/v1/object/public/avatars/'
                 || p_user::text || '/[A-Za-z0-9._-]+$')
  );
$$;

update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and not public.avatar_url_ok(avatar_url, id);

create or replace function public.bio_ok(p_bio text)
returns boolean
language sql
immutable
as $$
  select p_bio is null or (
    char_length(p_bio) <= 160
    -- At most four line breaks, so nobody's bio is a wall of blank lines.
    and p_bio !~ '(\n[^\n]*){5}'
    -- No control characters (other than the line break) and no
    -- text-direction overrides that would flip the text around them.
    and p_bio !~ ('[' || chr(1) || '-' || chr(9) || chr(11) || '-' || chr(31)
                  || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']')
  );
$$;

update public.profiles
   set bio = null
 where bio is not null
   and not public.bio_ok(left(btrim(bio), 160));

update public.profiles
   set bio = nullif(left(btrim(bio), 160), '')
 where bio is not null
   and char_length(bio) > 160;

alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles
  add constraint profiles_avatar_url_check
  check (public.avatar_url_ok(avatar_url, id));

-- 015 allowed 300 characters; a bio under a profile picture reads better at
-- 160, like Instagram's.
alter table public.profiles drop constraint if exists profiles_bio_length_check;
alter table public.profiles
  add constraint profiles_bio_length_check
  check (public.bio_ok(bio));

-- 039's profile lookup, plus the photo and the bio. The return type changes,
-- so it's dropped and made again.
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
  photo_page text,
  photographer_verified boolean,
  photo_confirmations int,
  i_confirmed boolean,
  photographer_status text,
  avatar_url text,
  bio text
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
    p.photo_page,
    public.photographer_verified(p.id),
    public.photographer_confirmation_count(p.id),
    exists (select 1 from public.photographer_confirmations c
            where c.photographer_id = p.id and c.confirmer_id = auth.uid()),
    -- The admin decision, for admins' eyes only.
    case when public.is_admin() then (select g.status from public.photographer_grants g where g.user_id = p.id) end,
    p.avatar_url,
    p.bio
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.get_person(uuid) to anon, authenticated;

-- ============ REPORTING A PROFILE ============
-- A profile photo and bio are public, so they can be reported like a post,
-- and an admin's "remove" clears them.
alter table public.community_reports drop constraint if exists community_reports_target_type_check;
alter table public.community_reports
  add constraint community_reports_target_type_check
  check (target_type in ('forum', 'post', 'comment', 'club', 'profile'));

-- 043's queue, plus profiles.
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
           when 'profile' then (select '@' || coalesce(pp.username, 'someone') || coalesce(' — ' || left(pp.bio, 100), '')
                                from public.profiles pp where pp.id::text = r.target_id)
         end,
         case r.target_type
           when 'post' then 'post:' || r.target_id
           when 'comment' then 'post:' || (select fc.post_id::text from public.forum_comments fc where fc.id::text = r.target_id)
           when 'forum' then 'forum:' || r.target_id
           when 'club' then 'club:' || r.target_id
           when 'profile' then 'person:' || r.target_id
         end
  from public.community_reports r
  left join public.profiles p on p.id = r.user_id
  where r.resolved_at is null and public.is_admin()
  order by r.created_at desc
  limit 100;
$$;

revoke execute on function public.community_report_queue() from public, anon;
grant execute on function public.community_report_queue() to authenticated;

-- 043's resolver, plus profiles: "remove" clears the photo and the bio.
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
    elsif p_type = 'profile' then update public.profiles set avatar_url = null, bio = null where id::text = p_target;
    end if;
  end if;
  update public.community_reports set resolved_at = now()
  where target_type = p_type and target_id = p_target and resolved_at is null;
end;
$$;

revoke execute on function public.resolve_community_report(text, text, text) from public, anon;
grant execute on function public.resolve_community_report(text, text, text) to authenticated;
