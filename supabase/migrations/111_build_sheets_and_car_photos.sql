-- The build page: each car gets a proper build sheet and its own photos.
--
--   vehicles gains the build sheet: nickname, trim / chassis code, engine,
--     drivetrain, transmission, horsepower, torque, stage, the mods (a list
--     of { cat, name }), what's next, and owned-since year.
--   vehicle_photos: up to 24 photos per car, in order, with a caption. Anyone
--     can see them (like the cars themselves); only the car's owner adds,
--     reorders or removes them, and only photos uploaded to their own
--     vehicle-photos folder.

alter table public.vehicles
  add column if not exists nickname text check (char_length(nickname) <= 40),
  add column if not exists trim text check (char_length(trim) <= 40),
  add column if not exists engine text check (char_length(engine) <= 60),
  add column if not exists drivetrain text check (drivetrain in ('RWD', 'FWD', 'AWD', '4WD')),
  add column if not exists transmission text check (transmission in ('Manual', 'Automatic', 'DCT', 'CVT', 'Sequential')),
  add column if not exists horsepower integer check (horsepower between 1 and 5000),
  add column if not exists torque integer check (torque between 1 and 5000),
  add column if not exists stage text check (stage in ('stock', 'mild', 'stage1', 'stage2', 'stage3', 'built')),
  add column if not exists mods jsonb not null default '[]'::jsonb check (jsonb_typeof(mods) = 'array' and jsonb_array_length(mods) <= 60),
  add column if not exists next_up text check (char_length(next_up) <= 300),
  add column if not exists owned_since integer check (owned_since between 1950 and 2100);

-- Swear words starred out, as everywhere else people type.
do $$
begin
  if to_regprocedure('public.clean_columns()') is not null then
    drop trigger if exists clean_build_sheet on public.vehicles;
    create trigger clean_build_sheet before insert or update of nickname, trim, engine, next_up on public.vehicles
      for each row execute function public.clean_columns('nickname', 'trim', 'engine', 'next_up');
  end if;
end;
$$;

-- Each mod: { cat, name }, a known category and a short name.
create or replace function public.check_vehicle_mods()
returns trigger
language plpgsql
as $$
declare
  m jsonb;
begin
  for m in select * from jsonb_array_elements(new.mods) loop
    if jsonb_typeof(m) <> 'object'
       or coalesce(m->>'cat', '') not in ('engine', 'suspension', 'wheels', 'exterior', 'interior', 'audio', 'other')
       or char_length(coalesce(m->>'name', '')) not between 1 and 80 then
      raise exception 'bad_mod';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists check_vehicle_mods on public.vehicles;
create trigger check_vehicle_mods before insert or update of mods on public.vehicles
  for each row execute function public.check_vehicle_mods();

-- A photo in this project's vehicle-photos bucket, in the owner's folder.
create or replace function public.vehicle_photo_ok(p_url text, p_user uuid)
returns boolean
language sql
immutable
as $$
  select char_length(p_url) <= 500
     and p_url ~ ('^(https://[a-z0-9]{20}\.supabase\.co|http://(127\.0\.0\.1|localhost):[0-9]+)/storage/v1/object/public/vehicle-photos/'
                  || p_user::text || '/[A-Za-z0-9._-]+$');
$$;

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  caption text check (char_length(caption) <= 140),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_photos_car_idx on public.vehicle_photos (vehicle_id, sort, created_at);
alter table public.vehicle_photos enable row level security;

drop policy if exists "anyone sees car photos" on public.vehicle_photos;
create policy "anyone sees car photos" on public.vehicle_photos for select to anon, authenticated using (true);
drop policy if exists "owners add car photos" on public.vehicle_photos;
create policy "owners add car photos" on public.vehicle_photos for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));
drop policy if exists "owners change car photos" on public.vehicle_photos;
create policy "owners change car photos" on public.vehicle_photos for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owners remove car photos" on public.vehicle_photos;
create policy "owners remove car photos" on public.vehicle_photos for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Photos from your own folder only, 24 a car; the car and owner can't change.
create or replace function public.check_vehicle_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.vehicle_id := old.vehicle_id;
    new.owner_id := old.owner_id;
    new.url := old.url;
    return new;
  end if;
  if auth.uid() is not null and not public.vehicle_photo_ok(new.url, new.owner_id) then
    raise exception 'car_photo_not_ours';
  end if;
  if (select count(*) from public.vehicle_photos where vehicle_id = new.vehicle_id) >= 24 then
    raise exception 'too_many_car_photos';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists check_vehicle_photo on public.vehicle_photos;
create trigger check_vehicle_photo before insert or update on public.vehicle_photos
  for each row execute function public.check_vehicle_photo();

do $$
begin
  if to_regprocedure('public.clean_columns()') is not null then
    drop trigger if exists clean_text on public.vehicle_photos;
    create trigger clean_text before insert or update of caption on public.vehicle_photos
      for each row execute function public.clean_columns('caption');
  end if;
end;
$$;

-- Bring each car's existing photo into its gallery as the first one.
insert into public.vehicle_photos (vehicle_id, owner_id, url, sort)
select v.id, v.owner_id, v.photo_url, 0
  from public.vehicles v
 where v.photo_url is not null
   and not exists (select 1 from public.vehicle_photos p where p.vehicle_id = v.id);

-- The "Scan my build" page gets the build sheet and the photos too.
create or replace function public.get_build_page(p_vehicle uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id, 'year', v.year, 'make', v.make, 'model', v.model,
    'build_notes', v.build_notes, 'photo_url', v.photo_url, 'public_page', v.public_page,
    'nickname', v.nickname, 'trim', v.trim, 'engine', v.engine, 'drivetrain', v.drivetrain,
    'transmission', v.transmission, 'horsepower', v.horsepower, 'torque', v.torque, 'stage', v.stage,
    'mods', v.mods, 'next_up', v.next_up, 'owned_since', v.owned_since,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'url', ph.url, 'caption', ph.caption) order by ph.sort, ph.created_at)
                          from public.vehicle_photos ph where ph.vehicle_id = v.id), '[]'::jsonb),
    'owner', jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
                                'profile_color', p.profile_color, 'city', p.city),
    'is_mine', v.owner_id = auth.uid(),
    'other_cars', (select count(*) from public.vehicles o where o.owner_id = v.owner_id and o.id <> v.id)
  )
    from public.vehicles v
    join public.profiles p on p.id = v.owner_id
   where v.id = p_vehicle
     and (v.public_page or v.owner_id = auth.uid());
$$;
revoke execute on function public.get_build_page(uuid) from public;
grant execute on function public.get_build_page(uuid) to anon, authenticated;
