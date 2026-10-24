-- Invite friends, unlock features (like Beli).
--
-- Everyone gets an invite code; a friend who signs up through it (and
-- confirms their email, so throwaway sign-ups don't count) is credited to
-- them. Unlocks:
--   1 friend  → more than one car in your garage, and starting a club
--   5 friends → profile flair: a profile color and the Connector badge
-- People who already have a second car or a club keep them. The checks are
-- here in the database, so the app can't be talked past them.

alter table public.profiles
  add column if not exists invite_code text unique,
  add column if not exists invited_by uuid references public.profiles (id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists profile_color text;

alter table public.profiles drop constraint if exists profiles_profile_color_check;
alter table public.profiles add constraint profiles_profile_color_check check (
  profile_color is null or profile_color in
    ('#FF4500', '#FACC15', '#10B981', '#38BDF8', '#A855F7', '#EC4899', '#EF4444', '#F0F0F0')
);

-- Eight characters, no look-alikes.
create or replace function public.gen_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, 8);
$$;

do $$
declare
  r record;
begin
  for r in select id from public.profiles where invite_code is null loop
    loop
      begin
        update public.profiles set invite_code = public.gen_invite_code() where id = r.id;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end $$;

-- Friends who joined through you and confirmed their email.
create or replace function public.confirmed_invites(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles p
   where p.invited_by = p_user and public.email_confirmed(p.id);
$$;

revoke execute on function public.confirmed_invites(uuid) from public, anon, authenticated;

-- New profiles get a code. The code, who invited you and when are only set
-- here and by claim_invite; flair needs 5 friends.
create or replace function public.guard_profile_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.invite_code is null or auth.uid() is not null then
      new.invite_code := public.gen_invite_code();
    end if;
    if auth.uid() is not null then
      new.invited_by := null;
      new.invited_at := null;
      new.profile_color := null;
    end if;
    return new;
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.invite_code := old.invite_code;
  if coalesce(current_setting('tunr.claiming_invite', true), '') <> 'on' then
    new.invited_by := old.invited_by;
    new.invited_at := old.invited_at;
  end if;
  if new.profile_color is distinct from old.profile_color and new.profile_color is not null
     and public.confirmed_invites(new.id) < 5 then
    raise exception 'invite_to_unlock_flair';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invites_guard on public.profiles;
create trigger profiles_invites_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_invites();

-- Called once after signing up through someone's link. ok, not_signed_in,
-- not_found, self, already, too_late.
create or replace function public.claim_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter public.profiles;
  v_me public.profiles;
  v_created timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into v_me from public.profiles where id = v_uid;
  if v_me.invited_by is not null then
    return jsonb_build_object('status', 'already');
  end if;
  select created_at into v_created from auth.users where id = v_uid;
  -- Only new accounts: an old one can't be "invited" to hand out unlocks.
  if v_created < now() - interval '7 days' then
    return jsonb_build_object('status', 'too_late');
  end if;
  select * into v_inviter from public.profiles
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_inviter.id = v_uid then
    return jsonb_build_object('status', 'self');
  end if;

  perform set_config('tunr.claiming_invite', 'on', true);
  update public.profiles set invited_by = v_inviter.id, invited_at = now() where id = v_uid;
  perform set_config('tunr.claiming_invite', 'off', true);

  perform public.notify(v_inviter.id, 'invite', '🎉 A friend joined with your invite',
    coalesce('@' || nullif(v_me.username, ''), 'Someone new') ||
      ' signed up with your link. It counts as soon as they confirm their email.',
    'person:' || v_uid, 'invite:' || v_uid);
  return jsonb_build_object('status', 'ok', 'inviter', v_inviter.username);
end;
$$;

revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- Your code, how many friends count, what's unlocked, and who joined.
create or replace function public.my_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  v_count := public.confirmed_invites(v_uid);
  return jsonb_build_object(
    'status', 'ok',
    'code', (select invite_code from public.profiles where id = v_uid),
    'confirmed', v_count,
    'pending', (select count(*) from public.profiles p
                 where p.invited_by = v_uid and not public.email_confirmed(p.id)),
    'unlocked', jsonb_build_object(
      'cars', v_count >= 1 or public.is_admin(),
      'clubs', v_count >= 1 or public.is_admin(),
      'flair', v_count >= 5 or public.is_admin()
    ),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'confirmed', public.email_confirmed(p.id))
                       order by p.invited_at desc)
        from public.profiles p where p.invited_by = v_uid), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

-- ============ THE LOCKS ============
-- A second car needs a friend. Anyone who already has two or more keeps
-- adding (they had them before this, or unlocked it).
create or replace function public.lock_extra_cars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (select count(*) from public.vehicles where owner_id = new.owner_id) = 1
     and public.confirmed_invites(new.owner_id) < 1 then
    raise exception 'invite_to_unlock_cars';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_invite_lock on public.vehicles;
create trigger vehicles_invite_lock
  before insert on public.vehicles
  for each row execute function public.lock_extra_cars();

-- Starting a club needs a friend, unless you already started one.
create or replace function public.lock_new_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and not exists (select 1 from public.clubs where created_by = new.created_by)
     and public.confirmed_invites(new.created_by) < 1 then
    raise exception 'invite_to_unlock_clubs';
  end if;
  return new;
end;
$$;

drop trigger if exists clubs_invite_lock on public.clubs;
create trigger clubs_invite_lock
  before insert on public.clubs
  for each row execute function public.lock_new_clubs();

-- ============ GET_PERSON ============
-- 044's lookup plus the flair: the profile color and the Connector badge.
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
  bio text,
  profile_color text,
  connector boolean
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
    case when public.is_admin() then (select g.status from public.photographer_grants g where g.user_id = p.id) end,
    p.avatar_url,
    p.bio,
    p.profile_color,
    public.confirmed_invites(p.id) >= 5
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.get_person(uuid) to anon, authenticated;
