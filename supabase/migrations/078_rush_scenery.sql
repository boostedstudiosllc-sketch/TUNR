-- TUNR Rush scenery: the desert is free; other places (city, forest,
-- mountains, swamp, arctic, beach, volcano, space) are unlocked once each
-- with reward points. Looks only: the course, traffic and scoring are the
-- same everywhere, so the scenery never changes what a run is worth.
--
--   rush_scenery: what's for sale and the price in points. Admins change
--     prices or take one off sale (Settings → Admin → TUNR Rush).
--   rush_scenery_owned: who has unlocked what.
--   unlock_rush_scenery(id): spends the points and unlocks it, in one go.

create table if not exists public.rush_scenery (
  id text primary key check (id ~ '^[a-z]{2,20}$'),
  name text not null check (char_length(name) between 2 and 30),
  price integer not null check (price between 0 and 100000),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.rush_scenery enable row level security;

drop policy if exists "rush scenery is public" on public.rush_scenery;
create policy "rush scenery is public" on public.rush_scenery for select to anon, authenticated using (true);
drop policy if exists "admins change rush scenery" on public.rush_scenery;
create policy "admins change rush scenery" on public.rush_scenery for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.rush_scenery (id, name, price, sort) values
  ('desert', 'Desert', 0, 0),
  ('city', 'City', 30, 1),
  ('forest', 'Forest', 30, 2),
  ('beach', 'Beach', 30, 3),
  ('mountain', 'Mountains', 40, 4),
  ('swamp', 'Swamp', 40, 5),
  ('arctic', 'Arctic', 50, 6),
  ('volcano', 'Volcano', 60, 7),
  ('space', 'Space', 75, 8)
on conflict (id) do nothing;

create table if not exists public.rush_scenery_owned (
  user_id uuid not null references auth.users (id) on delete cascade,
  scenery text not null references public.rush_scenery (id) on delete cascade,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, scenery)
);
alter table public.rush_scenery_owned enable row level security;

drop policy if exists "players see their scenery" on public.rush_scenery_owned;
create policy "players see their scenery" on public.rush_scenery_owned for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert policy: only unlock_rush_scenery adds rows.

-- Spend the points and unlock. Returns { status: 'ok', balance } or why not:
-- not_signed_in, unconfirmed, not_found, owned, not_enough (balance, cost).
create or replace function public.unlock_rush_scenery(p_scenery text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.rush_scenery;
  v_balance int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.rush_scenery where id = p_scenery and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if s.price = 0 or exists (select 1 from public.rush_scenery_owned where user_id = v_uid and scenery = s.id) then
    return jsonb_build_object('status', 'owned');
  end if;
  select coalesce(sum(delta), 0) into v_balance from public.point_ledger where user_id = v_uid;
  if v_balance < s.price then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', s.price);
  end if;
  insert into public.rush_scenery_owned (user_id, scenery, points) values (v_uid, s.id, s.price);
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, -s.price, 'redeem', left('TUNR Rush scenery: ' || s.name, 200));
  return jsonb_build_object('status', 'ok', 'balance', v_balance - s.price);
end;
$$;

revoke execute on function public.unlock_rush_scenery(text) from public, anon;
grant execute on function public.unlock_rush_scenery(text) to authenticated;
