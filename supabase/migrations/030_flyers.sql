-- Flyers on meets, and reading them with AI.
--
-- A meet can carry the organizer's flyer, shown whole on the meet page (a
-- cover photo crops it). Posting a meet can start from a flyer: the image is
-- uploaded, /api/read-flyer has Claude read it, and the form comes back
-- filled in for the host to check. Each read costs money, so reads are
-- logged here and limited per account.

alter table public.events add column if not exists flyer_url text;

-- 029's view, with flyer_url appended (redacted on a locked private meet,
-- like the photo).
create or replace view public.events_public as
select
  e.id, e.slug, e.title, e.host, e.verified, e.city,
  e.start_at, e.end_at, e.recurrence, e.timezone, e.vibe, e.tags,
  e.base_going, e.base_interested, e.created_by, e.created_at,
  e.visibility, e.access_mode, e.hidden,
  v.locked,
  m.status as membership_status,
  case when v.locked then null else e.location end as location,
  case when v.locked then null else e.description end as description,
  case when v.locked then null else e.lng end as lng,
  case when v.locked then null else e.lat end as lat,
  case when v.locked then null else e.photo_url end as photo_url,
  case when v.locked then null else e.source end as source,
  case when v.locked then null else e.source_url end as source_url,
  case when h.is_host then e.passcode else null end as passcode,
  e.recurrence_until,
  -- An account-backed co-host shows under their current username, so a
  -- rename can't leave a stale credit someone else could take.
  coalesce(
    (select array_agg(coalesce(pr.username, c.host) order by c.created_at)
       from public.event_cohosts c
       left join public.profiles pr on pr.id = c.user_id
      where c.event_id = e.id and c.status = 'accepted'),
    '{}'::text[]
  ) as cohosts,
  h.is_host as viewer_is_host,
  case when v.locked then null else e.flyer_url end as flyer_url
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select public.is_event_host(e.id) as is_host
) h
cross join lateral (
  select (
    e.visibility = 'private'
    and not h.is_host
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- ============ FLYER READS ============
create table if not exists public.flyer_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text not null check (char_length(image_url) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists flyer_reads_user_idx
  on public.flyer_reads (user_id, created_at desc);

alter table public.flyer_reads enable row level security;

-- /api/read-flyer logs the read as the signed-in caller before it calls
-- Claude, so the limit below is checked before anything is spent.
drop policy if exists "users log their own flyer reads" on public.flyer_reads;
create policy "users log their own flyer reads"
  on public.flyer_reads for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "admins read flyer reads" on public.flyer_reads;
create policy "admins read flyer reads"
  on public.flyer_reads for select
  to authenticated
  using (public.is_admin());

-- 10 an hour and 25 a day per account; admins, who add meets from flyers in
-- bulk, aren't limited.
create or replace function public.guard_flyer_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  if new.user_id is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if public.is_admin() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('flyer_reads:' || new.user_id::text));
  if (select count(*) from public.flyer_reads
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.flyer_reads
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 25 then
    raise exception 'rate_limit_flyers' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists flyer_reads_guard on public.flyer_reads;
create trigger flyer_reads_guard
  before insert on public.flyer_reads
  for each row execute function public.guard_flyer_read();
