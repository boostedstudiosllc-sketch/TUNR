-- The Daily Pit Stop (117): a point a day, a streak, a bonus every 7th day.
begin;

select tests.user('rider');
select tests.user('fresh', false); -- email not confirmed
select tests.user('streaker');

select tests.login(tests.id('fresh'));
select tests.eq((public.claim_pit_stop())->>'status', 'unconfirmed', 'confirm your email first');

select tests.login(tests.id('rider'));
select tests.eq((public.pit_stop_status())->>'today_done', 'false', 'not claimed yet today');
select tests.eq(((public.claim_pit_stop())->>'points')::int, 1, 'day 1 pays a point');
select tests.eq((public.claim_pit_stop())->>'status', 'already', 'once a day');
select tests.eq((public.pit_stop_status())->>'today_done', 'true', 'and it shows as done');
select tests.eq((select claimed_at is not null from public.point_ledger where user_id = tests.id('rider') and reason = 'daily_bonus'), true, 'straight into the balance, no second CLAIM');

-- Six days in a row already: today is the 7th, with the bonus.
select tests.logout();
insert into public.daily_pit_stops (user_id, day, streak, points)
select tests.id('streaker'), public.atl_today() - k, 7 - k, 1 from generate_series(1, 6) k;
select tests.login(tests.id('streaker'));
select tests.eq(((public.pit_stop_status())->>'streak')::int, 6, 'the streak is alive from yesterday');
create temp table r as select public.claim_pit_stop() as j;
grant select on r to authenticated;
select tests.eq((select (j->>'streak')::int from r), 7, 'day 7');
select tests.eq((select (j->>'points')::int from r), 6, 'pays 1 + the 5-point bonus');
select tests.eq((select j->>'bonus' from r), 'true', 'and says so');

-- A missed day starts over.
select tests.logout();
delete from public.daily_pit_stops where user_id = tests.id('rider');
insert into public.daily_pit_stops (user_id, day, streak, points) values (tests.id('rider'), public.atl_today() - 2, 4, 1);
select tests.login(tests.id('rider'));
select tests.eq(((public.pit_stop_status())->>'streak')::int, 0, 'missing yesterday breaks the streak');
select tests.eq(((public.claim_pit_stop())->>'streak')::int, 1, 'and today starts again at 1');

-- Privacy and writes.
select tests.login(tests.id('streaker'));
select tests.eq((select count(*) from public.daily_pit_stops where user_id = tests.id('rider'))::int, 0, 'nobody sees anyone else''s pit stops');
select tests.blocked_by_rls($$ insert into public.daily_pit_stops (user_id, day, streak, points) values (auth.uid(), public.atl_today() + 1, 99, 50) $$, 'pit stops can''t be written directly');

-- Admins can switch it off.
select tests.logout();
update public.points_settings set daily_points = 0;
select tests.login(tests.id('fresh'));
select tests.logout();
select tests.user('late');
select tests.login(tests.id('late'));
select tests.eq((public.claim_pit_stop())->>'status', 'off', '0 points a day switches it off');
select tests.eq((public.pit_stop_status())->>'on', 'false', 'and the app knows');
select tests.login(null);
select tests.fails($$ select public.claim_pit_stop() $$, 'permission denied', 'signed out, nothing');

rollback;
