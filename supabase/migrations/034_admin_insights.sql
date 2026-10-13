-- Admin insights: who's getting traction, and keeping the numbers.
--
-- rsvps only holds each person's current answer, so un-RSVPs, deleted
-- accounts and deleted meets used to erase history. rsvp_log keeps every
-- change permanently and anonymously: which meet (and its host and title at
-- the time), the new answer, and when — never who. Counts survive anything.
--
-- Meet views come from the app's analytics_events ('meet_viewed').
--
-- The admin_* views below return nothing unless the caller is an admin.

create table if not exists public.rsvp_log (
  id bigserial primary key,
  -- No foreign keys: the history outlives the meet.
  event_id uuid not null,
  host text,
  event_title text,
  status text not null check (status in ('going', 'interested', 'not_going', 'removed')),
  previous text,
  created_at timestamptz not null default now()
);

create index if not exists rsvp_log_created_idx on public.rsvp_log (created_at desc);
create index if not exists rsvp_log_host_idx on public.rsvp_log (lower(host), created_at desc);
create index if not exists rsvp_log_event_idx on public.rsvp_log (event_id, created_at desc);

-- Written only by the trigger; nobody reads or writes it directly.
alter table public.rsvp_log enable row level security;

create or replace function public.log_rsvp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_host text;
  v_title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  select host, title into v_host, v_title from public.events where id = v_event;
  insert into public.rsvp_log (event_id, host, event_title, status, previous)
  values (
    v_event,
    v_host,
    v_title,
    case when tg_op = 'DELETE' then 'removed' else new.status end,
    case when tg_op = 'INSERT' then null else old.status end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists rsvps_log on public.rsvps;
create trigger rsvps_log
  after insert or update or delete on public.rsvps
  for each row execute function public.log_rsvp_change();

-- Start the history from what's there today.
insert into public.rsvp_log (event_id, host, event_title, status, created_at)
select r.event_id, e.host, e.title, r.status, r.created_at
from public.rsvps r
join public.events e on e.id = r.event_id
where not exists (select 1 from public.rsvp_log);

create index if not exists analytics_meet_viewed_idx
  on public.analytics_events (created_at desc) where name = 'meet_viewed';

-- ============ THE HEADLINE NUMBERS ============
drop view if exists public.admin_overview;
create view public.admin_overview as
select
  (select count(*) from public.profiles) as accounts,
  (select count(*) from public.profiles where created_at > now() - interval '30 days') as accounts_30d,
  (select count(*) from public.profiles
    where created_at between now() - interval '60 days' and now() - interval '30 days') as accounts_prev_30d,
  (select count(distinct user_id) from public.analytics_events
    where user_id is not null and created_at > now() - interval '7 days') as active_7d,
  (select count(*) from public.rsvp_log
    where status = 'going' and created_at > now() - interval '30 days') as going_30d,
  (select count(*) from public.rsvp_log
    where status = 'going' and created_at between now() - interval '60 days' and now() - interval '30 days') as going_prev_30d,
  (select count(*) from public.analytics_events
    where name = 'meet_viewed' and created_at > now() - interval '30 days') as views_30d,
  (select count(*) from public.analytics_events
    where name = 'meet_viewed' and created_at between now() - interval '60 days' and now() - interval '30 days') as views_prev_30d,
  (select count(*) from public.comments where created_at > now() - interval '30 days') as chat_30d,
  (select count(*) from public.events
    where created_by is not null and created_at > now() - interval '30 days') as meets_posted_30d,
  (select count(*) from public.perk_redemptions where redeemed_at > now() - interval '30 days') as perks_30d,
  (select count(*) from public.verified_hosts) as verified_hosts
where public.is_admin();

grant select on public.admin_overview to authenticated;

-- ============ PER DAY, LAST 60 DAYS ============
drop view if exists public.admin_daily;
create view public.admin_daily as
with days as (
  select generate_series(
    (now() at time zone 'America/New_York')::date - 59,
    (now() at time zone 'America/New_York')::date,
    interval '1 day'
  )::date as day
)
select
  d.day,
  (select count(*) from public.profiles p
    where (p.created_at at time zone 'America/New_York')::date = d.day) as signups,
  (select count(*) from public.rsvp_log l
    where l.status = 'going' and (l.created_at at time zone 'America/New_York')::date = d.day) as going,
  (select count(*) from public.analytics_events a
    where a.name = 'meet_viewed' and (a.created_at at time zone 'America/New_York')::date = d.day) as views,
  (select count(*) from public.comments c
    where (c.created_at at time zone 'America/New_York')::date = d.day) as chat
from days d
where public.is_admin()
order by d.day;

grant select on public.admin_daily to authenticated;

-- ============ HOSTS ============
-- Grouped case-insensitively by the name on the meet. Real RSVPs only: the
-- base counts on imported listings are left out.
drop view if exists public.admin_host_stats;
create view public.admin_host_stats as
with meets as (
  select lower(e.host) as key, e.host, e.id, e.start_at, e.recurrence, e.recurrence_until
  from public.events e
  where not coalesce(e.hidden, false)
),
hosts as (
  select key, max(host) as host, count(*) as meets,
         count(*) filter (
           where start_at > now()
              or (recurrence is not null and (recurrence_until is null or recurrence_until >= current_date))
         ) as upcoming
  from meets group by key
),
current_rsvps as (
  select m.key,
         count(*) filter (where r.status = 'going') as going_now,
         count(*) filter (where r.status = 'interested') as maybe_now,
         count(distinct r.user_id) filter (where r.status in ('going', 'interested')) as audience
  from public.rsvps r join meets m on m.id = r.event_id
  group by m.key
),
history as (
  select lower(host) as key,
         count(*) filter (where status = 'going' and created_at > now() - interval '30 days') as going_30d,
         count(*) filter (where status = 'going'
                            and created_at between now() - interval '60 days' and now() - interval '30 days') as going_prev_30d,
         count(*) filter (where status = 'going') as going_all_time
  from public.rsvp_log where host is not null
  group by lower(host)
),
followers as (
  select lower(host) as key, count(*) as followers,
         count(*) filter (where created_at > now() - interval '30 days') as followers_30d
  from public.follows group by lower(host)
),
views as (
  select m.key, count(*) as views_30d
  from public.analytics_events a
  join meets m on m.id::text = a.props ->> 'eventId'
  where a.name = 'meet_viewed' and a.created_at > now() - interval '30 days'
  group by m.key
),
chat as (
  select m.key, count(*) as chat_30d
  from public.comments c join meets m on m.id = c.event_id
  where c.created_at > now() - interval '30 days'
  group by m.key
)
select
  h.host,
  h.meets,
  h.upcoming,
  coalesce(r.going_now, 0) as going_now,
  coalesce(r.maybe_now, 0) as maybe_now,
  coalesce(r.audience, 0) as audience,
  coalesce(l.going_30d, 0) as going_30d,
  coalesce(l.going_prev_30d, 0) as going_prev_30d,
  coalesce(l.going_all_time, 0) as going_all_time,
  coalesce(f.followers, 0) as followers,
  coalesce(f.followers_30d, 0) as followers_30d,
  coalesce(v.views_30d, 0) as views_30d,
  coalesce(c.chat_30d, 0) as chat_30d,
  exists (select 1 from public.verified_hosts vh
          where public.normalize_host(vh.host) = public.normalize_host(h.host)) as verified
from hosts h
left join current_rsvps r on r.key = h.key
left join history l on l.key = h.key
left join followers f on f.key = h.key
left join views v on v.key = h.key
left join chat c on c.key = h.key
where public.is_admin();

grant select on public.admin_host_stats to authenticated;

-- ============ MEETS ============
-- Upcoming meets and those in the last 30 days.
drop view if exists public.admin_meet_stats;
create view public.admin_meet_stats as
select
  e.id, e.slug, e.title, e.host, e.city, e.start_at, e.recurrence,
  (e.created_by is null) as imported,
  (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going') as going,
  (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'interested') as maybe,
  (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'not_going') as not_going,
  (select count(*) from public.comments c where c.event_id = e.id) as chat,
  (select count(*) from public.analytics_events a
    where a.name = 'meet_viewed' and a.props ->> 'eventId' = e.id::text) as views,
  (select count(*) from public.reports rp where rp.event_id = e.id and rp.resolved_at is null) as open_reports
from public.events e
where public.is_admin()
  and not coalesce(e.hidden, false)
  and (
    e.start_at > now() - interval '30 days'
    or (e.recurrence is not null and (e.recurrence_until is null or e.recurrence_until >= current_date - 30))
  );

grant select on public.admin_meet_stats to authenticated;
