-- Profiles, vehicles and RSVP-with-a-car.
--
-- Reconciled from the target design (tunr_profiles_vehicles.sql) against the
-- schema that already exists. The target was written as CREATE TABLE for
-- profiles and rsvps, both of which are live, so this expresses the same end
-- state as ALTERs and leaves the existing columns alone.
--
-- Deliberately NOT carried over from the target — each would break something
-- live, and each is called out in the notes at the bottom of this file:
--   * renaming events -> meets
--   * profiles.username NOT NULL
--   * dropping profiles.city / tos_accepted_at / tos_version / is_admin
--   * changing the rsvps status vocabulary
--   * replacing the rsvps primary key
--   * making rsvps publicly readable
--   * the "must own a car to RSVP" trigger

-- ============ SHARED: updated_at ============
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============ CAR MAKES ============
-- A lookup table rather than free text: "BMW" / "Bmw" / "bimmer" all being
-- different strings is what breaks a "who's bringing BMWs" filter. Model
-- stays free text — too many to enumerate, and the filter that matters is
-- make. 'Other' is the escape hatch.
create table if not exists public.car_makes (
  name text primary key
);

insert into public.car_makes (name) values
  ('BMW'),('Mercedes-Benz'),('Audi'),('Volkswagen'),('Porsche'),
  ('Toyota'),('Lexus'),('Honda'),('Acura'),('Nissan'),('Infiniti'),
  ('Mazda'),('Subaru'),('Mitsubishi'),('Ford'),('Chevrolet'),
  ('Dodge'),('Tesla'),('Hyundai'),('Kia'),('Genesis'),('Other')
on conflict (name) do nothing;

alter table public.car_makes enable row level security;

drop policy if exists "car makes readable by everyone" on public.car_makes;
create policy "car makes readable by everyone"
  on public.car_makes for select
  to anon, authenticated
  using (true);

-- ============ PROFILES ============
-- Additive only. city, tos_accepted_at, tos_version and is_admin are absent
-- from the target but are all load-bearing here, so they stay.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists instagram_handle text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Stored without the leading @ so it can be used to build a URL directly.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_instagram_handle_check') then
    alter table public.profiles
      add constraint profiles_instagram_handle_check
      check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length_check') then
    alter table public.profiles
      add constraint profiles_bio_length_check check (char_length(bio) <= 300);
  end if;
end
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- The target's update policy had `using` but no `with check`, which lets a
-- caller move their row onto someone else's id. Both halves, always.
drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============ VEHICLES ============
-- A separate table rather than columns on profiles, so multi-car needs no
-- migration later. "One car at launch" is expressed as one *primary* car per
-- owner, which is also the "default car" rule once garages ship.
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  year         int check (year between 1900 and 2100),
  make         text not null references public.car_makes (name),
  model        text not null check (char_length(btrim(model)) between 1 and 60),
  build_notes  text check (char_length(build_notes) <= 500),
  photo_url    text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists one_primary_vehicle_per_owner
  on public.vehicles (owner_id) where is_primary;

create index if not exists vehicles_owner_idx on public.vehicles (owner_id);
create index if not exists vehicles_make_idx on public.vehicles (make);

-- The target defaulted is_primary to true, which makes a second car fail
-- against the unique index above with a constraint error rather than simply
-- not being primary. Instead: the first car an owner adds becomes primary
-- automatically, and marking another one primary demotes the old one.
create or replace function public.maintain_primary_vehicle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.vehicles where owner_id = new.owner_id
  ) then
    new.is_primary := true;
  end if;

  if new.is_primary then
    update public.vehicles
       set is_primary = false
     where owner_id = new.owner_id
       and id <> new.id
       and is_primary;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_maintain_primary on public.vehicles;
create trigger vehicles_maintain_primary
  before insert or update on public.vehicles
  for each row execute function public.maintain_primary_vehicle();

drop trigger if exists vehicles_touch_updated_at on public.vehicles;
create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

alter table public.vehicles enable row level security;

drop policy if exists "vehicles readable by everyone" on public.vehicles;
create policy "vehicles readable by everyone"
  on public.vehicles for select
  to anon, authenticated
  using (true);

drop policy if exists "owners manage their vehicles" on public.vehicles;
create policy "owners manage their vehicles"
  on public.vehicles for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============ RSVPS ============
-- Additive. The table keeps its (user_id, event_id) primary key, its
-- going/interested vocabulary, and its owner-only read policy; see the notes.
alter table public.rsvps
  add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;

-- The attendee list filters on event_id, which is the trailing column of the
-- primary key and therefore not usable as an index prefix. This is the index
-- that query actually needs.
create index if not exists rsvps_event_idx on public.rsvps (event_id, created_at);
create index if not exists rsvps_vehicle_idx on public.rsvps (vehicle_id);

-- You may only bring a car you own.
create or replace function public.enforce_own_vehicle_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id and v.owner_id = new.user_id
  ) then
    raise exception 'vehicle_not_owned' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists rsvps_vehicle_ownership on public.rsvps;
create trigger rsvps_vehicle_ownership
  before insert or update on public.rsvps
  for each row execute function public.enforce_own_vehicle_on_rsvp();

-- ============ RLS, ASSERTED ============
-- Policies are inert if row level security is switched off, so state it
-- rather than assume it.
alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.rsvps    enable row level security;
alter table public.comments enable row level security;
alter table public.follows  enable row level security;

-- ============ STORAGE ============
-- Avatars and car photos. Public read so a car shows up for anyone browsing
-- a meet; writes restricted to a folder named after the uploader's user id,
-- so nobody can overwrite someone else's image.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

drop policy if exists "profile images are publicly readable" on storage.objects;
create policy "profile images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('avatars', 'vehicle-photos'));

drop policy if exists "users write their own profile images" on storage.objects;
create policy "users write their own profile images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'vehicle-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users replace their own profile images" on storage.objects;
create policy "users replace their own profile images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('avatars', 'vehicle-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete their own profile images" on storage.objects;
create policy "users delete their own profile images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'vehicle-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============ ATTENDEE LIST ============
-- The payoff: a meet's going list rendered as cars rather than names.
-- event_id, not meet_id — the table is events here.
--
--   select p.username, p.display_name, p.instagram_handle, p.avatar_url,
--          v.year, v.make, v.model, v.build_notes, v.photo_url
--     from public.rsvps r
--     join public.profiles p on p.id = r.user_id
--     left join public.vehicles v on v.id = r.vehicle_id
--    where r.event_id = :event_id
--      and r.status = 'going'
--    order by r.created_at;
--
-- Note this only returns other people's rows once the rsvps select policy is
-- opened up — see below.

-- ============ NOT DONE, ON PURPOSE ============
-- 1. rsvps stay owner-readable. The target made them world-readable, which is
--    what an attendee list needs, but the published privacy policy says who
--    RSVP'd is not published. That is a product and policy decision, not a
--    schema one.
-- 2. No "must own a car to RSVP" trigger. It would reject every RSVP until
--    the user adds a car, and the app fires RSVPs optimistically and swallows
--    write errors, so the button would say GOING while nothing was saved.
-- 3. status stays ('going','interested'). The target's
--    ('going','maybe','cancelled') would break every RSVP write and the whole
--    saved/interested UI.
-- 4. The primary key stays (user_id, event_id) rather than a surrogate id.
--    Nothing needs the surrogate, and swapping it rewrites the table.
