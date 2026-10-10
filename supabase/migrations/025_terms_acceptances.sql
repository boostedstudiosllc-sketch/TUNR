-- A record of every time an account agreed to the terms.
--
-- Until now acceptance lived in the browser and was copied onto the profile
-- only if the profile had none: the time came from the visitor's own clock,
-- the app could overwrite it, a re-acceptance after the terms changed never
-- reached the account, and anyone who signed up through /join or /hosts never
-- passed the terms screen at all. If the terms ever have to be relied on —
-- the release of liability above all — "which version did this person agree
-- to, when, and how" needs an answer that holds up.
--
-- So: an append-only log. The account can add rows for itself and read its
-- own; nobody can edit or delete one through the API. The time is the
-- server's. profiles.tos_version / tos_accepted_at become a read-only copy of
-- the latest row, kept for the app's convenience.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  accepted_at timestamptz not null default now(),
  -- terms_screen: the full terms, scrolled and agreed to.
  -- account_form: the "By continuing you agree…" line beside the sign-up,
  --   log-in and Google buttons.
  -- migrated: carried over from the old profile columns.
  method text not null check (method in ('terms_screen', 'account_form', 'migrated')),
  -- When the device says it happened. Agreeing while signed out is recorded
  -- once the account exists, so this can be earlier than accepted_at. It's the
  -- visitor's clock, so it's kept as evidence, never trusted for anything.
  client_accepted_at timestamptz
);

create index if not exists terms_acceptances_user_idx
  on public.terms_acceptances (user_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

drop policy if exists "users read their own acceptances" on public.terms_acceptances;
create policy "users read their own acceptances"
  on public.terms_acceptances for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users record their own acceptance" on public.terms_acceptances;
create policy "users record their own acceptance"
  on public.terms_acceptances for insert
  to authenticated
  with check (user_id = auth.uid() and method <> 'migrated');

-- The server's clock, whatever the client sent.
create or replace function public.stamp_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists terms_acceptances_stamp on public.terms_acceptances;
create trigger terms_acceptances_stamp
  before insert on public.terms_acceptances
  for each row execute function public.stamp_terms_acceptance();

-- Keep the profile's copy pointing at the latest version agreed to. The
-- profile row may not exist yet for a brand-new account, in which case the
-- guard below fills it in when it's created.
create or replace function public.copy_terms_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('tunr.allow_tos_write', 'on', true);
  update public.profiles
     set tos_version = new.version,
         tos_accepted_at = new.accepted_at
   where id = new.user_id
     and (tos_version is null or tos_version <= new.version);
  perform set_config('tunr.allow_tos_write', '', true);
  return new;
end;
$$;

drop trigger if exists terms_acceptances_copy on public.terms_acceptances;
create trigger terms_acceptances_copy
  after insert on public.terms_acceptances
  for each row execute function public.copy_terms_to_profile();

-- The profile columns stop being the client's to write: the app used to set
-- them directly, with the device's time.
create or replace function public.guard_profile_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.terms_acceptances;
begin
  if auth.uid() is null
     or coalesce(current_setting('tunr.allow_tos_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An acceptance recorded before the profile row existed.
    select * into v_latest
      from public.terms_acceptances
     where user_id = new.id
     order by version desc, accepted_at desc
     limit 1;
    new.tos_version := v_latest.version;
    new.tos_accepted_at := v_latest.accepted_at;
  else
    new.tos_version := old.tos_version;
    new.tos_accepted_at := old.tos_accepted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_terms_guard on public.profiles;
create trigger profiles_terms_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_terms();

-- What the old columns already say, so existing accounts have history. Only
-- once: re-running this migration doesn't duplicate it.
insert into public.terms_acceptances (user_id, version, accepted_at, method)
select p.id, p.tos_version, p.tos_accepted_at, 'migrated'
  from public.profiles p
 where p.tos_version is not null
   and p.tos_accepted_at is not null
   and not exists (
     select 1 from public.terms_acceptances t
      where t.user_id = p.id and t.method = 'migrated'
   );
