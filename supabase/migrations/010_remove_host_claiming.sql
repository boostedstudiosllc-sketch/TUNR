-- Removes host claiming from a database that ran the original 003.
--
-- 003 was edited after the fact to drop claiming, but the live database had
-- already run the earlier version, and the migration runner baselines 003 as
-- "already applied" — so that edit would never reach it. Hence this file.
--
-- What it closes: the old update policy read
--   using (created_by = auth.uid() or claimed_by is null)
-- which let any signed-in account edit any unclaimed meet, including the
-- seeded ones. Safe to run on a database that never had claiming.

drop policy if exists "creators and claimants can update their events" on public.events;

drop policy if exists "creators can update their events" on public.events;
create policy "creators can update their events"
  on public.events for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

alter table public.events drop column if exists claimed_by;
alter table public.events drop column if exists claimed_at;
