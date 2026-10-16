-- Verified photographers (📸✓). The 📸 badge from 037 is self-declared; the
-- check comes from five car owners confirming "they shot my car", or from an
-- admin. Admins can also take it away, which beats any number of
-- confirmations.

create table if not exists public.photographer_confirmations (
  photographer_id uuid not null references auth.users (id) on delete cascade,
  confirmer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photographer_id, confirmer_id),
  constraint photographer_confirmations_not_self check (photographer_id <> confirmer_id)
);

create index if not exists photographer_confirmations_confirmer_idx
  on public.photographer_confirmations (confirmer_id, created_at);

alter table public.photographer_confirmations enable row level security;

-- Who confirmed whom isn't public; the count is (through get_person).
drop policy if exists "users read their own confirmations" on public.photographer_confirmations;
create policy "users read their own confirmations"
  on public.photographer_confirmations for select to authenticated
  using (confirmer_id = auth.uid());

drop policy if exists "car owners confirm photographers" on public.photographer_confirmations;
create policy "car owners confirm photographers"
  on public.photographer_confirmations for insert to authenticated
  with check (confirmer_id = auth.uid());

drop policy if exists "users take back their own confirmations" on public.photographer_confirmations;
create policy "users take back their own confirmations"
  on public.photographer_confirmations for delete to authenticated
  using (confirmer_id = auth.uid());

-- The rules a policy can't say neatly, with errors the app can show.
create or replace function public.check_photographer_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.created_at := now();
  if not exists (select 1 from public.profiles p where p.id = new.photographer_id and p.is_photographer) then
    raise exception 'not_a_photographer';
  end if;
  if not exists (select 1 from public.vehicles v where v.owner_id = new.confirmer_id) then
    raise exception 'needs_a_car';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.photographer_id and b.blocked_id = new.confirmer_id)
       or (b.blocker_id = new.confirmer_id and b.blocked_id = new.photographer_id)
  ) then
    raise exception 'confirmation_blocked';
  end if;
  if (select count(*) from public.photographer_confirmations c
      where c.confirmer_id = new.confirmer_id and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limit_confirmations';
  end if;
  return new;
end;
$$;

drop trigger if exists photographer_confirmations_check on public.photographer_confirmations;
create trigger photographer_confirmations_check
  before insert on public.photographer_confirmations
  for each row execute function public.check_photographer_confirmation();

-- Admin decisions: 'verified' (granted) or 'revoked' (taken away). No row
-- means confirmations decide.
create table if not exists public.photographer_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('verified', 'revoked')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now()
);

alter table public.photographer_grants enable row level security;

create or replace function public.photographer_confirmation_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.photographer_confirmations c where c.photographer_id = p_user;
$$;

grant execute on function public.photographer_confirmation_count(uuid) to anon, authenticated;

create or replace function public.photographer_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_photographer from public.profiles p where p.id = p_user), false)
     and coalesce((select g.status <> 'revoked' from public.photographer_grants g where g.user_id = p_user), true)
     and (
       exists (select 1 from public.photographer_grants g where g.user_id = p_user and g.status = 'verified')
       or public.photographer_confirmation_count(p_user) >= 5
     );
$$;

grant execute on function public.photographer_verified(uuid) to anon, authenticated;

-- p_status: 'verified', 'revoked', or 'auto' (back to counting confirmations).
create or replace function public.set_photographer_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if p_status = 'auto' then
    delete from public.photographer_grants where user_id = p_user;
  elsif p_status in ('verified', 'revoked') then
    insert into public.photographer_grants (user_id, status, decided_by)
    values (p_user, p_status, auth.uid())
    on conflict (user_id) do update
      set status = excluded.status, decided_by = excluded.decided_by, decided_at = now();
    if p_status = 'verified' then
      perform public.notify(p_user, 'photographer', 'You''re a verified photographer 📸✓',
        'TUNR verified your photographer badge.', 'person:' || p_user, 'photographer_verified');
    end if;
  else
    raise exception 'bad_status';
  end if;
end;
$$;

revoke execute on function public.set_photographer_status(uuid, text) from public, anon;
grant execute on function public.set_photographer_status(uuid, text) to authenticated;

-- Tell the photographer: each confirmation, and the fifth one's check mark.
create or replace function public.photographer_confirmed_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce((select username from public.profiles where id = new.confirmer_id), 'Someone');
  v_count int := public.photographer_confirmation_count(new.photographer_id);
begin
  perform public.notify(
    new.photographer_id, 'photographer',
    '@' || v_name || ' confirmed you shot their car',
    case when v_count >= 5 then v_count || ' car owners have confirmed you.'
         else v_count || ' of 5 confirmations for the verified 📸✓ check.' end,
    'person:' || new.photographer_id,
    'confirm:' || new.confirmer_id
  );
  if v_count = 5 and public.photographer_verified(new.photographer_id) then
    perform public.notify(new.photographer_id, 'photographer', 'You''re a verified photographer 📸✓',
      'Five car owners confirmed you shot their cars.', 'person:' || new.photographer_id, 'photographer_verified');
  end if;
  return new;
end;
$$;

drop trigger if exists photographer_confirmations_notify on public.photographer_confirmations;
create trigger photographer_confirmations_notify
  after insert on public.photographer_confirmations
  for each row execute function public.photographer_confirmed_notify();

-- 037's chat view, with the verified check appended.
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
       (public.is_event_host(c.event_id) and public.restricted_on_event(c.user_id, c.event_id)) as author_restricted,
       coalesce(p.is_photographer, false) as photographer,
       public.photographer_verified(c.user_id) as photographer_verified
from public.comments c
left join public.profiles p on p.id = c.user_id
cross join lateral public.comment_reaction_counts(c.id) rc;

grant select on public.comments_with_author to anon, authenticated;

-- 037's profile lookup, plus the check, the count, and whether you've
-- confirmed them yourself.
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
  photographer_status text
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
    case when public.is_admin() then (select g.status from public.photographer_grants g where g.user_id = p.id) end
  from public.profiles p
  where p.id = p_user;
$$;

grant execute on function public.get_person(uuid) to anon, authenticated;
