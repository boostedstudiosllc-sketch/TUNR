-- "Not going" as an answer, and the meet chat updating live.
--
-- not_going is recorded rather than just deleting the RSVP, so the meet page
-- remembers the answer and later reminders know to skip it. It never counts
-- toward going/interested (event_rsvp_counts filters by status) and never
-- appears in a meet's car list.

alter table public.rsvps drop constraint if exists rsvps_status_check;
alter table public.rsvps
  add constraint rsvps_status_check check (status in ('going', 'interested', 'not_going'));

-- 018's attendee list, without the people who said they aren't coming.
drop view if exists public.event_attendees;
create view public.event_attendees as
select r.event_id, r.status, v.make, v.model, r.created_at
from public.rsvps r
join public.vehicles v on v.id = r.vehicle_id
join public.events e on e.id = r.event_id
where public.can_access_event(r.event_id)
  and not coalesce(e.hidden, false)
  and r.status <> 'not_going';

grant select on public.event_attendees to anon, authenticated;

-- New messages reach open meet pages over Supabase Realtime. Realtime applies
-- the comments select policy per viewer, so private meets and blocked authors
-- stay hidden exactly as they do on a normal read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
     ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
