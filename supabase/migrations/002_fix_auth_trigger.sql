-- Fix: "Database error saving new user" on sign-up.
--
-- An earlier prototype in this project left a trigger on auth.users whose
-- function lives in the public schema and writes to tables that no longer
-- exist. Supabase runs it inside the sign-up transaction, so every new user
-- creation fails. TUNR creates profile rows lazily from the app, so no
-- trigger on auth.users is needed.
--
-- This drops only triggers backed by public-schema functions (i.e. ones added
-- by us / previous experiments). Supabase's own internal triggers use
-- functions in the auth schema and are left untouched.

do $$
declare
  t record;
begin
  for t in
    select tg.tgname, p.proname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace fn on fn.oid = p.pronamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not tg.tgisinternal
      and fn.nspname = 'public'
  loop
    raise notice 'dropping trigger % (function public.%)', t.tgname, t.proname;
    execute format('drop trigger if exists %I on auth.users', t.tgname);
    execute format('drop function if exists public.%I() cascade', t.proname);
  end loop;
end $$;

-- Events carry the timezone their wall-clock times belong to, so a meet at
-- 9:00 AM in Kennesaw reads 9:00 AM to every viewer, anywhere.
alter table public.events
  add column if not exists timezone text not null default 'America/New_York';
