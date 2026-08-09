-- Public attendee lists, showing the car and nothing else.
--
-- The rsvps table stays owner-readable. Opening its select policy would
-- expose user_id, status and vehicle_id for every RSVP, and row level
-- security has no way to hide individual columns. So the list is published
-- through a view instead: it runs with definer rights (it can see every RSVP)
-- and selects only make and model.
--
-- What deliberately does not cross the boundary: who RSVP'd, their username,
-- Instagram handle, avatar, the car's year, build notes, photo, or any id
-- that could be joined back to a person.

drop view if exists public.event_attendees;
create view public.event_attendees as
select
  r.event_id,
  r.status,
  v.make,
  v.model,
  r.created_at
from public.rsvps r
join public.vehicles v on v.id = r.vehicle_id
-- Private meets keep their guest list private too: an attendee list is a
-- side channel into who is going to a meet you were not let into.
where public.can_access_event(r.event_id);

grant select on public.event_attendees to anon, authenticated;

-- No stable per-row identifier is exposed on purpose. profiles.id is public,
-- so anything derived from user_id — a hash included — could be recomputed
-- for every known profile and used to unmask the list. The client keys rows
-- by position instead.

-- ============ NOTE ON HOW ANONYMOUS THIS ACTUALLY IS ============
-- vehicles is publicly readable and carries owner_id, so a rare car in the
-- attendee list can still be traced back to its owner by browsing garages.
-- That is inherent to having public garages at all, and fine for a car
-- community. If the list needs to be genuinely unlinkable, vehicles would
-- have to stop exposing owner_id, which would also remove garages from
-- profiles — a bigger product decision than this migration.
