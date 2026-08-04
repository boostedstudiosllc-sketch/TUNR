-- Reporting + a moderation lever: a hidden flag that pulls a meet out of
-- every client query at the RLS layer (not just the app's own filtering).

alter table public.events add column if not exists hidden boolean not null default false;

drop policy if exists "events are readable by everyone" on public.events;
create policy "events are readable by everyone"
  on public.events for select
  to anon, authenticated
  using (coalesce(hidden, false) = false);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (event_id, reporter_id)
);

alter table public.reports enable row level security;

-- Insert-only from the client; no select policy for anon/authenticated, so
-- reports are readable only from the SQL editor / dashboard (postgres role
-- bypasses RLS). That's the moderation queue for now.
create policy "signed-in users can file a report"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Moderation queue: run this in the SQL editor to review reports.
--   select r.reason, r.note, r.created_at, e.title, e.id as event_id, e.hidden
--   from reports r join events e on e.id = r.event_id
--   order by r.created_at desc;
--
-- To pull a meet down: update events set hidden = true where id = '<event id>';
