-- Boost Day (132): the Sunday pick (slowest weekday by RSVPs, history
-- mixed in, days without meets skipped, admin picks kept), opting in,
-- the two-step check-in (RSVP before start, on site, 20+ minutes), paid
-- once, hosts excluded, reminders and the morning alert.
begin;

select tests.user('rider');
select tests.user('late');
select tests.user('far');
select tests.user('host');
select tests.user('lazy');
select tests.user('fresh', false);
select tests.user('boss', true, true);
select tests.logout();

-- ---------- the Sunday pick ----------
create temp table wk as select (date_trunc('week', (now() at time zone 'America/New_York')::date + 7))::date as mon;
grant select on wk to authenticated, anon, service_role;
-- Next week: meets on Tuesday (3 going) and Thursday (1 going); none Mon/Wed/Fri.
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-0000000000d2', 'Tuesday Meet', tests.id('host'), ((select mon from wk) + 1 + time '19:00') at time zone 'America/New_York', ((select mon from wk) + 1 + time '22:00') at time zone 'America/New_York', 'Lot', 33.8, -84.4),
  ('00000000-0000-0000-0000-0000000000d4', 'Thursday Meet', tests.id('host'), ((select mon from wk) + 3 + time '19:00') at time zone 'America/New_York', ((select mon from wk) + 3 + time '22:00') at time zone 'America/New_York', 'Lot', 33.8, -84.4);
insert into public.rsvps (user_id, event_id, status) values
  (tests.id('rider'), '00000000-0000-0000-0000-0000000000d2', 'going'),
  (tests.id('late'), '00000000-0000-0000-0000-0000000000d2', 'going'),
  (tests.id('far'), '00000000-0000-0000-0000-0000000000d2', 'going'),
  (tests.id('rider'), '00000000-0000-0000-0000-0000000000d4', 'going');
set local role service_role;
create temp table p1 as select public.pick_boost_day((select mon from wk)) as r;
reset role;
select tests.eq((select (r->>'day')::date from p1), (select mon + 3 from wk), 'the slowest weekday with meets wins (Thursday: 1 RSVP vs 3)');
select tests.eq((select r->'scores' ? ((select mon from wk))::text from p1), false, 'days without meets are skipped');
-- History: the last 4 Thursdays were busy (4 going each) → Tuesday is slower now.
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng)
select ('00000000-0000-0000-0000-0000000001' || lpad(k::text, 2, '0'))::uuid, 'Old Thursday ' || k, null,
       ((select mon from wk) + 3 - 7 * k + time '19:00') at time zone 'America/New_York', null, 'Lot', 33.8, -84.4
  from generate_series(1, 4) k;
insert into public.rsvps (user_id, event_id, status)
select u, ('00000000-0000-0000-0000-0000000001' || lpad(k::text, 2, '0'))::uuid, 'going'
  from generate_series(1, 4) k, unnest(array[tests.id('rider'), tests.id('late'), tests.id('far'), tests.id('lazy')]) u;
set local role service_role;
create temp table p2 as select public.pick_boost_day((select mon from wk)) as r;
reset role;
select tests.eq((select (r->>'day')::date from p2), (select mon + 1 from wk), 'half the last 4 weeks counts too (busy Thursdays → Tuesday)');
select tests.eq((select (r->'scores'->(select (mon + 3)::text from wk)->>'score')::numeric from p2), 2.5, 'Thursday: half of 1 now + half of 4 average = 2.5');

-- Admins see it and can change it; an admin pick isn't replaced.
select tests.login(tests.id('rider'));
select tests.eq((select count(*) from public.boost_days)::int, 0, 'members can''t see the coming Boost Day');
select tests.fails($$ select public.admin_set_boost_day((select mon from wk), (select mon + 2 from wk)) $$, 'admins_only', 'only admins change it');
select tests.login(tests.id('boss'));
select tests.eq(((public.admin_boost_week((select mon from wk)))->>'day')::date, (select mon + 1 from wk), 'admins see the week''s pick');
select tests.eq((public.admin_set_boost_day((select mon from wk), (select mon + 5 from wk)))->>'status', 'bad_day', 'weekdays only');
select tests.eq((public.admin_set_boost_day((select mon from wk), (select mon + 2 from wk)))->>'status', 'ok', 'an admin picks Wednesday');
select tests.logout();
set local role service_role;
create temp table p3 as select public.pick_boost_day((select mon from wk)) as r;
reset role;
select tests.eq((select r->>'status' from p3), 'admin_picked', 'the Sunday job keeps an admin''s pick');

-- ---------- today: make today a Boost Day (whatever day the tests run) ----------
alter table public.boost_days drop constraint if exists boost_days_day_check;
alter table public.boost_days drop constraint if exists boost_days_check;
alter table public.boost_days drop constraint if exists boost_days_week_start_check;
insert into public.boost_days (week_start, day) values (public.atl_today() - 100, public.atl_today());
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-0000000000e1', 'Tonight Meet', tests.id('host'), now() - interval '10 minutes', now() + interval '2 hours', 'Lot', 33.80, -84.40),
  ('00000000-0000-0000-0000-0000000000e2', 'Tomorrow Meet', tests.id('boss'), now() + interval '1 day', now() + interval '1 day 2 hours', 'Lot', 33.80, -84.40);
-- RSVP'd before it started: rider, far, host. 'late' RSVPs after the start.
insert into public.rsvps (user_id, event_id, status, created_at) values
  (tests.id('rider'), '00000000-0000-0000-0000-0000000000e1', 'going', now() - interval '1 day'),
  (tests.id('far'), '00000000-0000-0000-0000-0000000000e1', 'going', now() - interval '1 day'),
  (tests.id('late'), '00000000-0000-0000-0000-0000000000e1', 'going', now());

select tests.login(null);
select tests.eq((public.boost_status())->>'active', 'true', 'everyone can see it''s Boost Day');
select tests.fails($$ select public.boost_opt_in() $$, 'permission denied', 'guests can''t opt in');
select tests.login(tests.id('fresh'));
select tests.eq((public.boost_opt_in())->>'status', 'unconfirmed', 'confirm your email first');

select tests.login(tests.id('rider'));
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.80, -84.40))->>'status', 'not_opted_in', 'opt in first');
select tests.eq((public.boost_opt_in())->>'status', 'ok', 'opting in is free');
select tests.eq((public.boost_status())->>'opted_in', 'true', 'and shows as opted in');
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e2', 33.80, -84.40))->>'status', 'not_today_meet', 'only meets happening today');
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.90, -84.40))->>'status', 'too_far', 'you have to be there');
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', null, null))->>'status', 'need_location', 'and share your location');
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.801, -84.401))->>'status', 'ok', 'checked in at the meet');
select tests.eq((public.boost_confirm(33.801, -84.401))->>'status', 'too_soon', 'confirming needs the 20 minutes');
select tests.eq((select count(*) from public.point_ledger where user_id = auth.uid() and reason = 'boost_bonus')::int, 0, 'nothing paid yet');

select tests.login(tests.id('late'));
select public.boost_opt_in();
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.80, -84.40))->>'status', 'no_rsvp', 'an RSVP made after the start doesn''t count');
select tests.login(tests.id('lazy'));
select public.boost_opt_in();
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.80, -84.40))->>'status', 'no_rsvp', 'no RSVP, no boost');
select tests.login(tests.id('host'));
select public.boost_opt_in();
select tests.eq((public.boost_check_in('00000000-0000-0000-0000-0000000000e1', 33.80, -84.40))->>'status', 'own_meet', 'hosts can''t earn it at their own meet');

-- 25 minutes later: the reminder goes out, then confirming pays once.
select tests.logout();
update public.boost_entries set checked_in_at = now() - interval '25 minutes' where user_id = tests.id('rider');
set local role service_role;
create temp table rem as select public.queue_boost_reminders() as n, public.queue_boost_reminders() as again;
reset role;
select tests.eq((select n from rem), 1, 'a "tap to finish" reminder once the 20 minutes are up');
select tests.eq((select again from rem), 0, 'and only once');
select tests.login(tests.id('rider'));
select tests.eq((public.boost_confirm(33.90, -84.40))->>'status', 'too_far', 'left before confirming: no bonus');
select tests.eq(((public.boost_confirm(33.8005, -84.4005))->>'earned')::int, 10, 'still there: +10');
select tests.eq((public.boost_confirm(33.8005, -84.4005))->>'status', 'already_paid', 'paid once a day');
select tests.eq((select sum(delta)::int from public.point_ledger where user_id = auth.uid() and reason = 'boost_bonus'), 10, 'one +10 in the ledger');
select tests.blocked_by_rls($$ insert into public.boost_entries (user_id, day, confirmed_at, points) values (auth.uid(), public.atl_today() + 1, now(), 99) $$, 'entries can''t be written directly');

-- Privacy.
select tests.login(tests.id('far'));
select tests.eq((select count(*) from public.boost_entries)::int, 0, 'nobody sees anyone else''s check-ins');
select tests.fails($$ select public.queue_boost_reminders() $$, 'permission denied', 'members can''t run the reminders');

-- The morning alert, once.
select tests.logout();
set local role service_role;
create temp table alerts as select public.boost_morning_alerts() as n, public.boost_morning_alerts() as again;
reset role;
select tests.ok((select n from alerts) >= 5, 'the Boost Day alert goes to everyone confirmed');
select tests.eq((select again from alerts), 0, 'once');
select tests.eq((select count(*) from public.notifications where user_id = tests.id('fresh') and kind = 'boost' and title like '%Boost Day%')::int, 0, 'not to unconfirmed accounts');

-- Off switch.
update public.points_settings set boost_points = 0;
select tests.login(tests.id('far'));
select tests.eq((public.boost_status())->>'active', 'false', 'boost points at 0 turns it off');

-- Repeating meets land on the right days.
select tests.logout();
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng, recurrence, recurrence_until) values
  ('00000000-0000-0000-0000-0000000000f8', 'Weekly Wednesday', null, '2026-11-04 19:00-05', '2026-11-04 22:00-05', 'Lot', 33.8, -84.4, 'weekly:WED', '2026-12-31'),
  ('00000000-0000-0000-0000-0000000000f9', 'First Thursday', null, '2026-11-05 18:00-05', '2026-11-05 20:00-05', 'Lot', 33.8, -84.4, 'monthly:first:THU', null),
  ('00000000-0000-0000-0000-0000000000fa', 'Last Friday', null, '2026-11-27 18:00-05', null, 'Lot', 33.8, -84.4, 'monthly:last:FRI', null);
select tests.ok((select public.meet_on_day(e, '2026-11-25') from public.events e where e.title = 'Weekly Wednesday'), 'weekly:WED is on a later Wednesday');
select tests.ok(not (select public.meet_on_day(e, '2026-11-26') from public.events e where e.title = 'Weekly Wednesday'), 'not on a Thursday');
select tests.ok(not (select public.meet_on_day(e, '2027-01-06') from public.events e where e.title = 'Weekly Wednesday'), 'not after the series ends');
select tests.ok(not (select public.meet_on_day(e, '2026-10-28') from public.events e where e.title = 'Weekly Wednesday'), 'not before it starts');
select tests.ok((select public.meet_on_day(e, '2026-12-03') from public.events e where e.title = 'First Thursday'), 'monthly:first:THU on the first Thursday');
select tests.ok(not (select public.meet_on_day(e, '2026-12-10') from public.events e where e.title = 'First Thursday'), 'not the second');
select tests.ok((select public.meet_on_day(e, '2026-12-25') from public.events e where e.title = 'Last Friday'), 'monthly:last:FRI on the last Friday');
select tests.ok(not (select public.meet_on_day(e, '2026-12-18') from public.events e where e.title = 'Last Friday'), 'not the one before');
select tests.eq((select public.meet_start_on(e, '2026-11-25') from public.events e where e.title = 'Weekly Wednesday'), '2026-11-25 19:00-05'::timestamptz, 'starts at its usual time that day');

rollback;
