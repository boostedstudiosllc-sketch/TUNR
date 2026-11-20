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

-- ---------- TUNR+ streak restore (121) ----------
select tests.logout();
select tests.user('member');
select tests.user('free');
update public.profiles set is_member = true where id = tests.id('member');
-- Both had a 12-day streak that ended 3 days ago (missed 2 days).
insert into public.daily_pit_stops (user_id, day, streak, points)
select u, public.atl_today() - 3 - k, 12 - k, 1 from (values (tests.id('member')), (tests.id('free'))) v(u), generate_series(0, 11) k;
select tests.login(tests.id('free'));
select tests.eq(((public.pit_stop_status())->>'lost_streak')::int, 12, 'the app knows a 12-day streak ended');
select tests.eq((public.pit_stop_status())->>'can_restore', 'false', 'but only TUNR+ members can restore it');
select tests.eq((public.restore_pit_stop())->>'status', 'not_member', 'a free member is told so');
select tests.login(tests.id('member'));
select tests.eq((public.pit_stop_status())->>'can_restore', 'true', 'a member can restore it');
create temp table rs as select public.restore_pit_stop() as r;
grant select on rs to authenticated;
select tests.eq((select (r->>'streak')::int from rs), 14, 'the streak runs on through the missed days');
select tests.eq(((public.pit_stop_status())->>'streak')::int, 14, 'and shows as alive');
select tests.eq((select sum(points)::int from public.daily_pit_stops where user_id = tests.id('member') and day >= public.atl_today() - 2), 0, 'no points for the days missed');
select tests.eq(((public.claim_pit_stop())->>'streak')::int, 15, 'today''s claim carries it on');
-- Lose it again: too soon.
select tests.logout();
delete from public.daily_pit_stops where user_id = tests.id('member') and day >= public.atl_today() - 2;
select tests.login(tests.id('member'));
select tests.eq((public.restore_pit_stop())->>'status', 'too_soon', 'once every 3 months');
select tests.ok((public.pit_stop_status())->>'restore_at' is not null, 'and the app says when the next one is');
-- A streak lost too long ago can't come back.
select tests.logout();
delete from public.pit_stop_restores where user_id = tests.id('member');
delete from public.daily_pit_stops where user_id = tests.id('member');
insert into public.daily_pit_stops (user_id, day, streak, points) values (tests.id('member'), public.atl_today() - 20, 30, 1);
select tests.login(tests.id('member'));
select tests.eq((public.restore_pit_stop())->>'status', 'nothing_to_restore', 'only a streak lost in the last week');
select tests.blocked_by_rls($$ insert into public.pit_stop_restores (user_id, restored_streak) values (auth.uid(), 1) $$, 'restores can''t be written directly');

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
