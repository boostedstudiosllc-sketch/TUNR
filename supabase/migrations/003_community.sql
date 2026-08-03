-- Host claiming, comments, follows, event photos, and analytics.

-- ============ HOST CLAIMING ============
alter table public.events add column if not exists claimed_by uuid references auth.users (id) on delete set null;
alter table public.events add column if not exists claimed_at timestamptz;
alter table public.events add column if not exists photo_url text;

-- A signed-in user can claim an unclaimed event, and the claimant can then
-- edit it. Claims are recorded with a timestamp so they can be audited or
-- reversed from the dashboard.
drop policy if exists "creators can update their events" on public.events;
create policy "creators and claimants can update their events"
  on public.events for update
  to authenticated
  using (created_by = auth.uid() or claimed_by = auth.uid() or claimed_by is null)
  with check (created_by = auth.uid() or claimed_by = auth.uid());

-- ============ COMMENTS ============
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comments_event_idx on public.comments (event_id, created_at desc);

alter table public.comments enable row level security;

create policy "comments are readable by everyone"
  on public.comments for select to anon, authenticated using (true);

create policy "signed-in users can comment"
  on public.comments for insert to authenticated with check (user_id = auth.uid());

create policy "authors can delete their comments"
  on public.comments for delete to authenticated using (user_id = auth.uid());

-- Comment author's handle, without exposing the profiles table join to clients.
create or replace view public.comments_with_author as
select c.id, c.event_id, c.user_id, c.body, c.created_at,
       coalesce(p.username, 'someone') as username
from public.comments c
left join public.profiles p on p.id = c.user_id;

grant select on public.comments_with_author to anon, authenticated;

-- ============ FOLLOWS ============
-- Hosts are names on events rather than accounts, so follows key on the name.
create table if not exists public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  host text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, host)
);

alter table public.follows enable row level security;

create policy "users read their own follows"
  on public.follows for select to authenticated using (user_id = auth.uid());

create policy "users add their own follows"
  on public.follows for insert to authenticated with check (user_id = auth.uid());

create policy "users remove their own follows"
  on public.follows for delete to authenticated using (user_id = auth.uid());

-- Public follower counts per host.
create or replace view public.host_follower_counts as
select host, count(*) as followers
from public.follows
group by host;

grant select on public.host_follower_counts to anon, authenticated;

-- ============ ANALYTICS ============
-- Append-only usage events. Anyone may write; nobody may read from the client
-- (query it from the SQL editor / dashboard).
create table if not exists public.analytics_events (
  id bigserial primary key,
  name text not null,
  props jsonb not null default '{}',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists analytics_name_idx on public.analytics_events (name, created_at desc);

alter table public.analytics_events enable row level security;

create policy "anyone can record analytics"
  on public.analytics_events for insert to anon, authenticated with check (true);

-- ============ EVENT PHOTO STORAGE ============
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

drop policy if exists "event photos are publicly readable" on storage.objects;
create policy "event photos are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-photos');

drop policy if exists "signed-in users can upload event photos" on storage.objects;
create policy "signed-in users can upload event photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos');
