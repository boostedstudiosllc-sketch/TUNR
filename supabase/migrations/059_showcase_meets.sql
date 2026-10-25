-- Showcase meets: a host chooses whether their meet is open to every car
-- (the default) or a showcase of nicer cars: modified, exotic, classic,
-- show-quality. Spectators are always welcome at both; at a showcase, cars
-- that don't qualify park in regular parking. The host can add a short
-- "what qualifies" note.

alter table public.events
  add column if not exists meet_style text not null default 'open' check (meet_style in ('open', 'showcase')),
  add column if not exists showcase_note text check (char_length(showcase_note) <= 200);

-- 033's view, with the style and the note appended (the note is hidden on a
-- locked private meet, like the description).
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
  f.issue as issue_flag,
  f.reporters as issue_count,
  e.meet_style,
  case when v.locked then null else e.showcase_note end as showcase_note
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
  -- dealt with yet, if any. Shown as a flag on the meet; the meet stays up.
  select r.reason as issue, count(distinct r.reporter_id)::int as reporters
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
