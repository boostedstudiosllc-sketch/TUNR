-- Telling your own activity apart, and going-over-time for the meet page.
--
-- Each RSVP change is tagged by who made it — an end user or an admin —
-- still without saying which person. The admin numbers count end users
-- only; admins' own going, views and chat are reported separately, so
-- testing the app doesn't inflate a host's traction.
--
-- meet_going_history gives the public meet page its "going" chart: the
-- count after every change, anonymous, for meets the caller can see.

-- True when that account is an admin. Null (signed out, or a deleted
-- account) counts as an end user.
create or replace function public.is_admin_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user), false);
$$;

-- Views call it as the viewer, so viewers need to be able to; it only says
-- whether an account is an admin.
grant execute on function public.is_admin_user(uuid) to anon, authenticated;

alter table public.rsvp_log
  add column if not exists actor text not null default 'user' check (actor in ('user', 'admin'));

create or replace function public.log_rsvp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_host text;
  v_title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  select host, title into v_host, v_title from public.events where id = v_event;
  insert into public.rsvp_log (event_id, host, event_title, status, previous, actor)
  values (
    v_event,
    v_host,
    v_title,
    case when tg_op = 'DELETE' then 'removed' else new.status end,
    case when tg_op = 'INSERT' then null else old.status end,
    case when public.is_admin_user(v_user) then 'admin' else 'user' end
  );
  return coalesce(new, old);
end;
$$;

-- Tag the history so far: 034's backfill copied today's RSVPs with their
-- own timestamps, so those rows can still be matched to the RSVP behind
-- them.
update public.rsvp_log l
   set actor = 'admin'
  from public.rsvps r
 where l.actor = 'user'
   and l.event_id = r.event_id
   and l.created_at = r.created_at
   and public.is_admin_user(r.user_id);

-- ============ THE HEADLINE NUMBERS ============
drop view if exists public.admin_overview;
create view public.admin_overview as
select
  (select count(*) from public.profiles) as accounts,
  (select count(*) from public.profiles where created_at > now() - interval '30 days') as accounts_30d,
  (select count(*) from public.profiles
    where created_at between now() - interval '60 days' and now() - interval '30 days') as accounts_prev_30d,
  (select count(distinct user_id) from public.analytics_events
    where user_id is not null and not public.is_admin_user(user_id)
      and created_at > now() - interval '7 days') as active_7d,
  (select count(*) from public.rsvp_log
    where status = 'going' and actor = 'user' and created_at > now() - interval '30 days') as going_30d,
  (select count(*) from public.rsvp_log
    where status = 'going' and actor = 'user'
      and created_at between now() - interval '60 days' and now() - interval '30 days') as going_prev_30d,
  (select count(*) from public.analytics_events
    where name = 'meet_viewed' and not public.is_admin_user(user_id)
      and created_at > now() - interval '30 days') as views_30d,
  (select count(*) from public.analytics_events
    where name = 'meet_viewed' and not public.is_admin_user(user_id)
      and created_at between now() - interval '60 days' and now() - interval '30 days') as views_prev_30d,
  (select count(*) from public.comments
    where not public.is_admin_user(user_id) and created_at > now() - interval '30 days') as chat_30d,
  (select count(*) from public.events
    where created_by is not null and created_at > now() - interval '30 days') as meets_posted_30d,
  (select count(*) from public.perk_redemptions where redeemed_at > now() - interval '30 days') as perks_30d,
  (select count(*) from public.verified_hosts) as verified_hosts,
  -- Admin accounts' own activity, kept out of everything above.
  (select count(*) from public.rsvp_log
    where status = 'going' and actor = 'admin' and created_at > now() - interval '30 days') as admin_going_30d,
  (select count(*) from public.analytics_events
    where name = 'meet_viewed' and public.is_admin_user(user_id)
      and created_at > now() - interval '30 days') as admin_views_30d,
  (select count(*) from public.comments
    where public.is_admin_user(user_id) and created_at > now() - interval '30 days') as admin_chat_30d
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
    where l.status = 'going' and l.actor = 'user'
      and (l.created_at at time zone 'America/New_York')::date = d.day) as going,
  (select count(*) from public.analytics_events a
    where a.name = 'meet_viewed' and not public.is_admin_user(a.user_id)
      and (a.created_at at time zone 'America/New_York')::date = d.day) as views,
  (select count(*) from public.comments c
    where not public.is_admin_user(c.user_id)
      and (c.created_at at time zone 'America/New_York')::date = d.day) as chat
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
  where not public.is_admin_user(r.user_id)
  group by m.key
),
history as (
  select lower(host) as key,
         count(*) filter (where status = 'going' and created_at > now() - interval '30 days') as going_30d,
         count(*) filter (where status = 'going'
                            and created_at between now() - interval '60 days' and now() - interval '30 days') as going_prev_30d,
         count(*) filter (where status = 'going') as going_all_time
  from public.rsvp_log where host is not null and actor = 'user'
  group by lower(host)
),
followers as (
  select lower(host) as key, count(*) as followers,
         count(*) filter (where created_at > now() - interval '30 days') as followers_30d
  from public.follows where not public.is_admin_user(user_id) group by lower(host)
),
views as (
  select m.key, count(*) as views_30d
  from public.analytics_events a
  join meets m on m.id::text = a.props ->> 'eventId'
  where a.name = 'meet_viewed' and not public.is_admin_user(a.user_id)
    and a.created_at > now() - interval '30 days'
  group by m.key
),
chat as (
  select m.key, count(*) as chat_30d
  from public.comments c join meets m on m.id = c.event_id
  where c.created_at > now() - interval '30 days' and not public.is_admin_user(c.user_id)
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
  (select count(*) from public.rsvps r
    where r.event_id = e.id and r.status = 'going' and not public.is_admin_user(r.user_id)) as going,
  (select count(*) from public.rsvps r
    where r.event_id = e.id and r.status = 'interested' and not public.is_admin_user(r.user_id)) as maybe,
  (select count(*) from public.rsvps r
    where r.event_id = e.id and r.status = 'not_going' and not public.is_admin_user(r.user_id)) as not_going,
  (select count(*) from public.comments c
    where c.event_id = e.id and not public.is_admin_user(c.user_id)) as chat,
  (select count(*) from public.analytics_events a
    where a.name = 'meet_viewed' and a.props ->> 'eventId' = e.id::text
      and not public.is_admin_user(a.user_id)) as views,
  (select count(*) from public.reports rp where rp.event_id = e.id and rp.resolved_at is null) as open_reports
from public.events e
where public.is_admin()
  and not coalesce(e.hidden, false)
  and (
    e.start_at > now() - interval '30 days'
    or (e.recurrence is not null and (e.recurrence_until is null or e.recurrence_until >= current_date - 30))
  );

grant select on public.admin_meet_stats to authenticated;

-- ============ THE MEET PAGE CHART ============
-- The going count over time, ending at the number the meet shows (listed
-- meets start from their base count). Points are (at, going).
create or replace function public.meet_going_history(p_event_id uuid)
returns table (at timestamptz, going int)
language sql
stable
security definer
set search_path = public
as $$
  with meet as (
    select e.id, e.created_at, coalesce(e.base_going, 0) as base
    from public.events e
    where e.id = p_event_id
      and public.can_access_event(e.id)
      and (not coalesce(e.hidden, false) or public.is_admin())
  ),
  changes as (
    select l.created_at as at,
           (case when l.status = 'going' then 1 else 0 end)
         - (case when l.previous = 'going' then 1 else 0 end) as delta,
           l.id
    from public.rsvp_log l
    join meet m on m.id = l.event_id
  )
  select m.created_at as at, m.base::int as going from meet m
  union all
  select c.at, (m.base + sum(c.delta) over (order by c.at, c.id))::int
  from changes c cross join meet m
  order by 1;
$$;

revoke all on function public.meet_going_history(uuid) from public;
grant execute on function public.meet_going_history(uuid) to anon, authenticated;
