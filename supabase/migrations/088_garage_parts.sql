-- Garage parts that cost reward points: the popular add-ons (the big wing,
-- gold / chrome / bronze wheels, slammed and lifted). Bought once, then
-- yours on every car you own. Everything else stays free. Looks only: no
-- game plays differently with them.
--
--   garage_parts: what's for sale, priced in points ("spoiler:wing").
--   garage_parts_owned: who has bought what.
--   unlock_garage_part(id): spends the points and unlocks it, in one go.
--   A vehicle can only be switched to a priced part its owner has.

create table if not exists public.garage_parts (
  id text primary key check (id ~ '^(spoiler|rims|height):[a-z]{2,20}$'),
  name text not null check (char_length(name) between 2 and 30),
  price integer not null check (price between 0 and 100000),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.garage_parts enable row level security;

drop policy if exists "garage parts are public" on public.garage_parts;
create policy "garage parts are public" on public.garage_parts for select to anon, authenticated using (true);
drop policy if exists "admins change garage parts" on public.garage_parts;
create policy "admins change garage parts" on public.garage_parts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.garage_parts (id, name, price, sort) values
  ('spoiler:wing', 'Big wing', 40, 0),
  ('rims:bronze', 'Bronze wheels', 20, 1),
  ('rims:gold', 'Gold wheels', 30, 2),
  ('rims:chrome', 'Chrome wheels', 35, 3),
  ('height:lifted', 'Lift kit', 25, 4),
  ('height:slammed', 'Slammed', 35, 5)
on conflict (id) do nothing;

create table if not exists public.garage_parts_owned (
  user_id uuid not null references auth.users (id) on delete cascade,
  part text not null references public.garage_parts (id) on delete cascade,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, part)
);
alter table public.garage_parts_owned enable row level security;

drop policy if exists "players see their parts" on public.garage_parts_owned;
create policy "players see their parts" on public.garage_parts_owned for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert policy: only unlock_garage_part adds rows.

-- Can this person use this part? Free, not for sale, bought, or all access.
create or replace function public.has_garage_part(p_user uuid, p_part text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.garage_parts where id = p_part and active and price > 0)
      or exists (select 1 from public.garage_parts_owned where user_id = p_user and part = p_part)
      or coalesce((select all_access from public.profiles where id = p_user), false);
$$;

-- Spend the points and unlock. Returns { status: 'ok', balance } or why not:
-- not_signed_in, unconfirmed, not_found, owned, not_enough (balance, cost).
create or replace function public.unlock_garage_part(p_part text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  g public.garage_parts;
  v_balance int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into g from public.garage_parts where id = p_part and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if public.has_garage_part(v_uid, g.id) then
    return jsonb_build_object('status', 'owned');
  end if;
  v_balance := public.points_balance(v_uid);
  if v_balance < g.price then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', g.price);
  end if;
  insert into public.garage_parts_owned (user_id, part, points) values (v_uid, g.id, g.price);
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, -g.price, 'redeem', left('Garage: ' || g.name, 200));
  return jsonb_build_object('status', 'ok', 'balance', v_balance - g.price);
end;
$$;

revoke execute on function public.unlock_garage_part(text) from public, anon;
grant execute on function public.unlock_garage_part(text) to authenticated;

-- A car can't be switched to a priced part its owner hasn't got. Cars that
-- already had one keep it.
create or replace function public.vehicle_parts_guard()
returns trigger
language plpgsql
as $$
declare
  pair text[];
  v text;
begin
  foreach pair slice 1 in array array[['spoiler', 'game_spoiler'], ['rims', 'game_rims'], ['height', 'game_height']] loop
    v := to_jsonb(new) ->> pair[2];
    if v is not null
       and (tg_op = 'INSERT' or (to_jsonb(old) ->> pair[2]) is distinct from v)
       and not public.has_garage_part(new.owner_id, pair[1] || ':' || v) then
      raise exception 'locked_part: unlock % in the garage first.',
        coalesce((select name from public.garage_parts where id = pair[1] || ':' || v), v)
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists vehicle_parts_guard on public.vehicles;
create trigger vehicle_parts_guard before insert or update on public.vehicles
  for each row execute function public.vehicle_parts_guard();
