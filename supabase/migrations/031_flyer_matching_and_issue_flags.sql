-- Checking meets against each other, and letting anyone flag a problem.
--
-- Every flyer gets a fingerprint (a 64-bit difference hash, as 16 hex
-- characters, computed in the browser). The same flyer posted again — by the
-- host, a repost page, or someone else — lands within a few bits of the
-- original even after Instagram recompresses or resizes it, so it can be
-- matched: a duplicate is caught, and two copies that disagree on the date
-- are flagged.
--
-- Reports gain a "what's right" field, and a discrepancy three people agree
-- on shows on the meet as a warning until an admin deals with it.

alter table public.events
  add column if not exists flyer_hash text
  check (flyer_hash is null or flyer_hash ~ '^[0-9a-f]{16}$');

create index if not exists events_flyer_hash_idx
  on public.events (flyer_hash) where flyer_hash is not null;

alter table public.reports
  add column if not exists suggested text check (char_length(suggested) <= 200);

-- 030's view, with issue_flag appended.
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
  case when v.locked then null else e.flyer_url end as flyer_url,
  f.issue as issue_flag
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
left join lateral (
  -- The discrepancy at least three people have reported and nobody has
  -- dealt with yet, if any. Shown on the meet as a warning.
  select r.reason as issue
  from public.reports r
  where r.event_id = e.id
    and r.resolved_at is null
    and r.reason in ('Cancelled or postponed', 'Wrong date or time', 'Wrong location')
  group by r.reason
  having count(distinct r.reporter_id) >= 3
  order by count(*) desc
  limit 1
) f on true
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- Meets carrying (nearly) the same flyer. Only what the caller could see
-- anyway: public, not hidden, and not locked.
create or replace function public.find_flyer_matches(p_hash text, p_exclude uuid default null)
returns table (id uuid, slug text, title text, host text, start_at timestamptz, recurrence text, distance int)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.host, e.start_at, e.recurrence,
         bit_count(('x' || e.flyer_hash)::bit(64) # ('x' || p_hash)::bit(64))::int as distance
  from public.events e
  where p_hash ~ '^[0-9a-f]{16}$'
    and e.flyer_hash is not null
    and e.visibility = 'public'
    and not coalesce(e.hidden, false)
    and (p_exclude is null or e.id <> p_exclude)
    and bit_count(('x' || e.flyer_hash)::bit(64) # ('x' || p_hash)::bit(64)) <= 6
  order by distance, e.start_at desc nulls last
  limit 5;
$$;

revoke all on function public.find_flyer_matches(text, uuid) from public;
grant execute on function public.find_flyer_matches(text, uuid) to anon, authenticated;

-- The admin queue shows the correction alongside the report.
drop view if exists public.reports_queue;
create view public.reports_queue
with (security_invoker = true) as
select
  r.id,
  r.event_id,
  r.reason,
  r.note,
  r.created_at,
  r.resolved_at,
  r.outcome,
  e.title as event_title,
  e.host as event_host,
  e.city as event_city,
  e.hidden as event_hidden,
  coalesce(p.username, 'someone') as reporter,
  r.suggested,
  e.slug as event_slug
from public.reports r
join public.events e on e.id = r.event_id
left join public.profiles p on p.id = r.reporter_id;

grant select on public.reports_queue to authenticated;
