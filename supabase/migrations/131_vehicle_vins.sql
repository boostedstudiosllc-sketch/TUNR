-- A garage car's VIN, optional and private. Decoded with NHTSA's free VIN
-- decoder (api/_routes/vin.js, nothing stored there) to fill in the exact
-- year, make, model, trim, body, drivetrain, transmission and engine, so
-- the parts fit check (fitment.js) works from facts, not typing.
--
-- Garage cars are public (they show on profiles), so the VIN lives here:
-- only the owner can see, add, change or delete it. Not even admins read
-- it: a VIN tied to a person is personal information, and a public VIN can
-- be cloned onto a stolen car.

create table if not exists public.vehicle_vins (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  decoded jsonb not null default '{}'::jsonb check (jsonb_typeof(decoded) = 'object' and pg_column_size(decoded) < 4096),
  decoded_at timestamptz not null default now()
);
alter table public.vehicle_vins enable row level security;

drop policy if exists "owners see their VINs" on public.vehicle_vins;
create policy "owners see their VINs" on public.vehicle_vins for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owners add a VIN to their car" on public.vehicle_vins;
create policy "owners add a VIN to their car" on public.vehicle_vins for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));
drop policy if exists "owners change their VINs" on public.vehicle_vins;
create policy "owners change their VINs" on public.vehicle_vins for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));
drop policy if exists "owners remove their VINs" on public.vehicle_vins;
create policy "owners remove their VINs" on public.vehicle_vins for delete to authenticated using (owner_id = auth.uid());

-- Signed-out visitors get nothing, not even an empty list.
revoke all on public.vehicle_vins from anon;
