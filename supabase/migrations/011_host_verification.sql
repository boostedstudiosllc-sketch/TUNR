-- Host verification, replacing the self-serve claiming that was removed in 010.
--
-- The problem it solves is impersonation. Today anyone can post a meet as
-- 'CaffeineAndOctane', and nothing stops them writing verified = true straight
-- to the REST API with the public anon key — the insert policy only checks
-- created_by. So the badge means nothing and the host name is unowned.
--
-- How it works: a host asks to be verified, the app gives them a one-time
-- code, they put it in their Instagram bio or story, and an admin who can see
-- both the request and the profile approves it. Proving control of the account
-- is the point — the code is worthless to anyone who can't post as that host.
--
-- Once approved the host name is *reserved*: nobody else can post under it,
-- and the verified badge is set by a trigger rather than by the client, so it
-- can't be forged or edited afterwards.

-- ============ ADMIN ============
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Nobody may hand themselves the admin flag: the update policy from 001 lets
-- a user write their own profile row, so guard the column with a trigger.
create or replace function public.guard_profile_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No auth.uid() means this isn't an API request — it's the SQL editor or a
  -- service-role job, both of which are already trusted. Every route a normal
  -- user can reach carries a uid, so the guard still covers them.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
  elsif new.is_admin is distinct from old.is_admin and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_guard on public.profiles;
create trigger profiles_admin_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_admin();

-- ============ VERIFIED HOSTS ============
create table if not exists public.verified_hosts (
  host text primary key,
  user_id uuid references auth.users (id) on delete set null,
  instagram_handle text,
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null
);

alter table public.verified_hosts enable row level security;

drop policy if exists "verified hosts are public" on public.verified_hosts;
create policy "verified hosts are public"
  on public.verified_hosts for select
  to anon, authenticated
  using (true);

drop policy if exists "admins manage verified hosts" on public.verified_hosts;
create policy "admins manage verified hosts"
  on public.verified_hosts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============ REQUESTS ============
create or replace function public.gen_verification_code()
returns text
language sql
volatile
as $$
  select 'TUNR-' || string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31) + 1)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

create table if not exists public.host_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  host text not null,
  instagram_handle text not null,
  code text not null default public.gen_verification_code(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  unique (user_id, host)
);

create index if not exists host_verifications_status_idx
  on public.host_verifications (status, created_at);

alter table public.host_verifications enable row level security;

drop policy if exists "requesters and admins read verifications" on public.host_verifications;
create policy "requesters and admins read verifications"
  on public.host_verifications for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users request verification" on public.host_verifications;
create policy "users request verification"
  on public.host_verifications for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "admins decide verifications" on public.host_verifications;
create policy "admins decide verifications"
  on public.host_verifications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "users withdraw their request" on public.host_verifications;
create policy "users withdraw their request"
  on public.host_verifications for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Approving has to touch verified_hosts and every existing meet by that host,
-- so it runs as one definer function rather than three client round-trips.
create or replace function public.decide_host_verification(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.host_verifications;
begin
  if not public.is_admin() then
    return 'not_admin';
  end if;

  select * into v_req from public.host_verifications where id = p_id;
  if not found then
    return 'not_found';
  end if;

  if not p_approve then
    update public.host_verifications
       set status = 'rejected', note = p_note, decided_at = now(), decided_by = auth.uid()
     where id = p_id;
    return 'rejected';
  end if;

  if exists (
    select 1 from public.verified_hosts
    where host = v_req.host and user_id is distinct from v_req.user_id
  ) then
    return 'host_taken';
  end if;

  insert into public.verified_hosts (host, user_id, instagram_handle, verified_by)
  values (v_req.host, v_req.user_id, v_req.instagram_handle, auth.uid())
  on conflict (host) do update
    set user_id = excluded.user_id,
        instagram_handle = excluded.instagram_handle,
        verified_at = now(),
        verified_by = excluded.verified_by;

  -- The trigger below pins `verified` on update so a client can't forge it.
  -- This is the one caller allowed through; the flag is transaction-local.
  perform set_config('tunr.allow_verified_write', 'on', true);

  update public.events
     set verified = true
   where host = v_req.host
     and (created_by = v_req.user_id or created_by is null);

  update public.host_verifications
     set status = 'approved', note = p_note, decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  return 'approved';
end;
$$;

revoke all on function public.decide_host_verification(uuid, boolean, text) from public;
grant execute on function public.decide_host_verification(uuid, boolean, text) to authenticated;

-- ============ THE BADGE IS NOT THE CLIENT'S TO SET ============
create or replace function public.enforce_event_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rows seeded from the SQL editor have no creator; leave them alone.
  if new.created_by is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- verified only ever changes through decide_host_verification(), which
    -- sets this transaction-local flag on its way in. The host name is pinned
    -- too, so an existing meet can't be renamed onto a reserved handle.
    if coalesce(current_setting('tunr.allow_verified_write', true), '') <> 'on' then
      new.verified := old.verified;
      new.host := old.host;
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.verified_hosts vh
    where vh.host = new.host and vh.user_id is distinct from new.created_by
  ) then
    raise exception 'host_reserved' using errcode = 'P0001';
  end if;

  new.verified := exists (
    select 1 from public.verified_hosts vh
    where vh.host = new.host and vh.user_id = new.created_by
  );

  return new;
end;
$$;

drop trigger if exists events_verification_guard on public.events;
create trigger events_verification_guard
  before insert or update on public.events
  for each row execute function public.enforce_event_verification();

-- ============ ONE MANUAL STEP ============
-- Make yourself an admin. Run this once in the Supabase SQL editor with your
-- own address. It is deliberately not committed here — no reason to put your
-- email in the repository, and granting admin should be a deliberate act.
--
--   update public.profiles set is_admin = true
--    where id = (select id from auth.users where lower(email) = lower('you@example.com'));
--
-- The trigger above blocks self-promotion through the API. It steps aside for
-- statements with no auth.uid(), which is what a SQL editor session is.
