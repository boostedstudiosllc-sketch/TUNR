-- Fixes the takedown lever and gives it a screen.
--
-- Two problems:
--
-- 1. `hidden` stopped working. 005 enforced it in the events select policy,
--    then 008 replaced that policy wholesale to add private meets and did not
--    carry the check across. events_public never had it either. So a hidden
--    meet has been fully visible ever since — and the terms promise reported
--    content is "reviewed within 24 hours and removed if it breaks these
--    terms", which was not something the database could actually do.
--
-- 2. Reports had no select policy at all, by design at the time: the queue was
--    "run a query in the SQL editor". That is not a promise anyone keeps daily.

-- ============ HIDDEN ACTUALLY HIDES ============
-- Admins still see hidden meets, otherwise nobody could review or restore one.
drop policy if exists "public events are readable by everyone" on public.events;
create policy "public events are readable by everyone"
  on public.events for select
  to anon, authenticated
  using (
    (visibility = 'public' or public.can_access_event(id))
    and (not coalesce(hidden, false) or public.is_admin())
  );

drop view if exists public.events_public;
create view public.events_public as
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
  case
    when auth.uid() is not null and e.created_by = auth.uid() then e.passcode
    else null
  end as passcode
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select (
    e.visibility = 'private'
    and (auth.uid() is null or e.created_by is distinct from auth.uid())
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- A pulled meet shouldn't keep publishing its guest list either.
drop view if exists public.event_attendees;
create view public.event_attendees as
select r.event_id, r.status, v.make, v.model, r.created_at
from public.rsvps r
join public.vehicles v on v.id = r.vehicle_id
join public.events e on e.id = r.event_id
where public.can_access_event(r.event_id)
  and not coalesce(e.hidden, false);

grant select on public.event_attendees to anon, authenticated;

-- ============ THE QUEUE ============
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references auth.users (id) on delete set null;
alter table public.reports add column if not exists outcome text
  check (outcome is null or outcome in ('removed', 'dismissed'));

create index if not exists reports_open_idx on public.reports (created_at desc) where resolved_at is null;

drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports"
  on public.reports for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins resolve reports" on public.reports;
create policy "admins resolve reports"
  on public.reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Everything the queue screen needs in one read.
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
  coalesce(p.username, 'someone') as reporter
from public.reports r
join public.events e on e.id = r.event_id
left join public.profiles p on p.id = r.reporter_id;

grant select on public.reports_queue to authenticated;

-- Taking a meet down is an admin action on someone else's row, which the
-- creator-only update policy can't express — hence a definer function.
create or replace function public.moderate_event(p_event_id uuid, p_hidden boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return 'not_admin';
  end if;

  update public.events set hidden = p_hidden where id = p_event_id;
  if not found then
    return 'not_found';
  end if;

  -- Close any open reports on it, recording what was decided.
  update public.reports
     set resolved_at = now(),
         resolved_by = auth.uid(),
         outcome = case when p_hidden then 'removed' else 'dismissed' end
   where event_id = p_event_id
     and resolved_at is null;

  return case when p_hidden then 'removed' else 'restored' end;
end;
$$;

revoke all on function public.moderate_event(uuid, boolean) from public;
grant execute on function public.moderate_event(uuid, boolean) to authenticated;
