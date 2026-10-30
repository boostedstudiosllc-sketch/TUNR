-- Small helpers the *.test.sql files use. scripts/db-test.sh loads this once
-- after the migrations. Each test file runs in a transaction that's rolled
-- back, so tests never see each other's rows.
--
--   select tests.user('sam');            -- a confirmed user, returns their id
--   select tests.user('new', false);     -- one who hasn't confirmed their email
--   select tests.login(tests.id('sam')); -- now acting as sam (role authenticated)
--   select tests.logout();               -- back to the superuser (no RLS)
--   select tests.ok(<bool>, 'what should be true');
--   select tests.eq(<actual>, <expected>, 'label');
--   select tests.fails($$ <sql> $$, 'error text it should contain', 'label');
--   select tests.blocked_by_rls($$ <insert/update> $$, 'label');

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create table if not exists tests.people (name text primary key, id uuid not null);
grant select on tests.people to anon, authenticated;

create or replace function tests.user(p_name text, p_confirmed boolean default true, p_admin boolean default false)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at) values (v, p_name || '@test.tunr', case when p_confirmed then now() end);
  insert into public.profiles (id, username, is_admin) values (v, p_name, p_admin);
  insert into public.account_status (user_id, confirmed_at) values (v, case when p_confirmed then now() end)
    on conflict (user_id) do update set confirmed_at = excluded.confirmed_at;
  insert into tests.people values (p_name, v);
  return v;
end $$;

create or replace function tests.id(p_name text) returns uuid language sql stable as
  $$ select id from tests.people where name = p_name $$;

create or replace function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', case when p_uid is null then 'anon' else 'authenticated' end, true);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
end $$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function tests.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end $$;

create or replace function tests.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (got %, expected %)', p_label, p_actual, p_expected;
  end if;
  raise notice 'ok - %', p_label;
end $$;

-- The statement must fail, and its error must mention p_expect.
create or replace function tests.fails(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expect in sqlerrm) > 0 then
      raise notice 'ok - %', p_label;
      return;
    end if;
    raise exception 'FAIL: % (failed with "%", expected "%")', p_label, sqlerrm, p_expect;
  end;
  raise exception 'FAIL: % (it worked, expected an error with "%")', p_label, p_expect;
end $$;

-- A write that row-level security should stop: either an RLS error, or no
-- rows touched (an UPDATE/DELETE whose USING hides the row).
create or replace function tests.blocked_by_rls(p_sql text, p_label text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    raise notice 'ok - %', p_label;
    return;
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%permission denied%' then
      raise notice 'ok - %', p_label;
      return;
    end if;
    raise exception 'FAIL: % (failed with "%", expected RLS to stop it)', p_label, sqlerrm;
  end;
  if n = 0 then
    raise notice 'ok - %', p_label;
    return;
  end if;
  raise exception 'FAIL: % (% row(s) changed, expected RLS to stop it)', p_label, n;
end $$;

grant execute on all functions in schema tests to anon, authenticated;
