-- Password policy (src/lib/passwordRules.js) and photographer checks.
--
--   * Password history: TUNR's server (api/password.js) won't let you reuse
--     any of your last 24 passwords. Before each change it keeps the old
--     password's hash (never the password itself) here. No trigger on
--     auth.users: 002 removed one that broke sign-ups.
--   * Lockout: TUNR's server (api/sign-in.js) counts wrong passwords per
--     email; 10 in a row locks that account for 30 minutes. It also counts
--     per network address, so one source can't hammer many accounts.
--   * Verified photographers: no more five car-owner confirmations; the
--     📸 badge is self-declared, and the ✓ comes only from an admin.
--
-- All tables here are server-only: RLS on, no policies, functions for the
-- service role only.

create table if not exists public.password_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists password_history_user_idx on public.password_history (user_id, created_at desc);
alter table public.password_history enable row level security;

-- The current password's hash plus the ones kept from before: the last 24.
create or replace function public.password_hashes(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  (select u.encrypted_password from auth.users u where u.id = p_user and u.encrypted_password is not null and u.encrypted_password <> '')
  union all
  (select h.hash from public.password_history h where h.user_id = p_user order by h.created_at desc limit 23);
$$;

-- Keep the current password's hash before it's replaced, and only the last 23.
create or replace function public.remember_password(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.password_history (user_id, hash)
  select u.id, u.encrypted_password from auth.users u
   where u.id = p_user and u.encrypted_password is not null and u.encrypted_password <> '';
  delete from public.password_history h
   where h.user_id = p_user
     and h.id not in (select id from public.password_history where user_id = p_user order by created_at desc, id desc limit 23);
end;
$$;

create table if not exists public.login_failures (
  key text primary key, -- "email:<address>" or "ip:<address>"
  failures integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz
);
alter table public.login_failures enable row level security;

-- Minutes left on a lock, or 0.
create or replace function public.login_locked(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select ceil(extract(epoch from (locked_until - now())) / 60)::int
                     from public.login_failures where key = p_key and locked_until > now()), 0);
$$;

-- Count a wrong password. Failures more than a day old start over. At
-- p_max in a row, lock for p_minutes. Returns { failures, locked_minutes }.
create or replace function public.login_failed(p_key text, p_max int, p_minutes int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.login_failures;
begin
  insert into public.login_failures (key, failures, last_failed_at) values (p_key, 0, now())
  on conflict (key) do nothing;
  select * into f from public.login_failures where key = p_key for update;
  if f.last_failed_at < now() - interval '1 day' or (f.locked_until is not null and f.locked_until <= now()) then
    f.failures := 0;
  end if;
  f.failures := f.failures + 1;
  f.locked_until := case when f.failures >= p_max then now() + make_interval(mins => p_minutes) else null end;
  update public.login_failures
     set failures = case when f.failures >= p_max then 0 else f.failures end,
         last_failed_at = now(),
         locked_until = f.locked_until
   where key = p_key;
  return jsonb_build_object('failures', f.failures, 'locked_minutes', case when f.locked_until is null then 0 else p_minutes end);
end;
$$;

-- A correct password (or a password reset) clears the count and any lock.
create or replace function public.login_ok(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_failures where key = p_key;
$$;

revoke execute on function public.password_hashes(uuid) from public, anon, authenticated;
revoke execute on function public.remember_password(uuid) from public, anon, authenticated;
revoke execute on function public.login_locked(text) from public, anon, authenticated;
revoke execute on function public.login_failed(text, int, int) from public, anon, authenticated;
revoke execute on function public.login_ok(text) from public, anon, authenticated;
grant execute on function public.password_hashes(uuid) to service_role;
grant execute on function public.remember_password(uuid) to service_role;
grant execute on function public.login_locked(text) to service_role;
grant execute on function public.login_failed(text, int, int) to service_role;
grant execute on function public.login_ok(text) to service_role;

-- Verified photographers: an admin's say only (no five confirmations).
create or replace function public.photographer_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_photographer from public.profiles p where p.id = p_user), false)
     and exists (select 1 from public.photographer_grants g where g.user_id = p_user and g.status = 'verified');
$$;
