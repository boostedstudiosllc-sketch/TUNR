-- 136: trim-aware part alerts, parts for a newly added car, comeback nudges.
begin;

select tests.user('seller');
select tests.user('g30');
select tests.user('f10');
select tests.user('notrim');
select tests.user('newcar');
select tests.user('away7');
select tests.user('away3');
select tests.user('fresh');
select tests.user('unconf', false);
select tests.user('optout');
select tests.user('boss', true, true);
select tests.logout();

-- ---------- trim-aware part alerts ----------
insert into public.vehicles (owner_id, make, model, year, trim) values
  (tests.id('g30'), 'BMW', '540i', 2019, 'M Sport, G30'),
  (tests.id('f10'), 'BMW', '540i', 2019, 'F10'),
  (tests.id('notrim'), 'BMW', '540i', 2019, null);
select tests.login(tests.id('seller'));
create temp table photo as select 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/' || auth.uid() || '/1.jpg' as url;
grant select on photo to authenticated;
insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from, fit_year_to, fit_trim)
values ('G30 adaptive headlight', 'lighting', 'used', 65000, array[(select url from photo)], 'BMW', '540i', 2017, 2020, 'G30');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('g30') and kind = 'part_for_you'), 'a G30 owner hears about a G30 part');
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('f10') and kind = 'part_for_you'), 'an F10 owner doesn''t');
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('notrim') and kind = 'part_for_you'), 'a car with no trim given still hears (the fit check says CHECK FIT)');

-- ---------- adding a car: parts already for sale ----------
select tests.login(tests.id('newcar'));
insert into public.vehicles (owner_id, make, model, year, trim) values (auth.uid(), 'BMW', '540i', 2018, null);
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('newcar') and kind = 'part_for_you' and title like '🛒 A part for sale fits your 2018 BMW 540i' and link like 'listing:%'), 'adding a car tells you about the part already listed for it');
select tests.login(tests.id('seller'));
insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from, fit_year_to)
values ('540i grille', 'aero', 'used', 9000, array[(select url from photo)], 'BMW', '540i', 2017, 2020);
select tests.login(tests.id('newcar'));
update public.vehicles set year = 2019 where owner_id = auth.uid();
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('newcar') and title like '🛒 2 parts for sale fit your 2019 BMW 540i' and link like 'listing-fit:%'), 'changing the year: two parts, a link to them in Parts');
select tests.login(tests.id('newcar'));
update public.vehicles set nickname = 'Blue' where owner_id = auth.uid();
select tests.logout();
select tests.eq((select count(*) from public.notifications where user_id = tests.id('newcar') and kind = 'part_for_you')::int, 3, 'other edits don''t alert again (added car, the new grille, the year change)');
select tests.login(tests.id('seller'));
insert into public.vehicles (owner_id, make, model, year) values (auth.uid(), 'BMW', '540i', 2019);
select tests.logout();
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('seller') and kind = 'part_for_you'), 'never about your own parts');
select tests.login(tests.id('newcar'));
select tests.fails($$ select * from public.parts_fitting((select id from public.vehicles where owner_id = auth.uid())) $$, 'permission denied', 'members can''t call parts_fitting');
select tests.logout();

-- ---------- comeback nudges ----------
update auth.users set created_at = now() - interval '40 days' where id in (tests.id('away7'), tests.id('away3'), tests.id('unconf'), tests.id('optout'));
update auth.users set created_at = now() - interval '5 days' where id = tests.id('fresh');
-- Everyone else was "just here".
insert into public.member_activity (user_id, last_seen_at)
select p.id, now() from tests.people p where p.name not in ('away7', 'away3', 'fresh', 'unconf', 'optout')
on conflict (user_id) do update set last_seen_at = now();
insert into public.member_activity (user_id, last_seen_at) values
  (tests.id('away7'), now() - interval '8 days'),
  (tests.id('away3'), now() - interval '4 days'),
  (tests.id('fresh'), now() - interval '4 days'),
  (tests.id('unconf'), now() - interval '8 days'),
  (tests.id('optout'), now() - interval '8 days');
insert into public.alert_settings (user_id, comeback) values (tests.id('optout'), false)
  on conflict (user_id) do update set comeback = false;

select tests.login(tests.id('away7'));
select tests.fails($$ select public.queue_comeback_nudges() $$, 'permission denied', 'members can''t queue nudges');
select tests.fails($$ select public.release_comeback_nudges() $$, 'permission denied', 'or send them');
select tests.fails($$ select * from public.comeback_offers $$, 'permission denied', 'or read the offers');
select tests.fails($$ insert into public.comeback_offers (user_id, stage, points, title, body, send_at, sent_at, expires_at) values (auth.uid(), 4, 100, 'x', 'y', now(), now(), now() + interval '1 day') $$, 'permission denied', 'or make one');
select tests.fails($$ select * from public.member_activity $$, 'permission denied', 'or read who''s been away');
select tests.logout();

select tests.eq(public.queue_comeback_nudges(), 2, 'two members get a nudge queued');
select tests.ok(exists (select 1 from public.comeback_offers where user_id = tests.id('away7') and stage = 2 and points = 10 and sent_at is null and title = '🎁 +10 bonus points are waiting for you'), '8 days away: the 7-day step, 10 points');
select tests.ok(exists (select 1 from public.comeback_offers where user_id = tests.id('away3') and stage = 1 and points = 0 and link like 'tab:%'), '4 days away: a reason to look, no points');
select tests.ok(not exists (select 1 from public.comeback_offers where user_id in (tests.id('fresh'), tests.id('unconf'), tests.id('optout'))), 'not new accounts, unconfirmed ones, or anyone who turned it off');
select tests.ok((select bool_and(send_at > now() - interval '1 minute') from public.comeback_offers), 'sent at a time still to come');
select tests.eq(public.queue_comeback_nudges(), 0, 'not twice');
select tests.eq((select count(*) from public.notifications where kind = 'comeback')::int, 0, 'nothing goes out before its time');

update public.comeback_offers set send_at = now() - interval '1 minute';
select tests.eq(public.release_comeback_nudges(), 2, 'at its time it goes out');
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('away7') and kind = 'comeback' and link = 'open:comeback'), 'as an alert that opens the claim');
select tests.eq(public.release_comeback_nudges(), 0, 'once');

-- Coming back.
select tests.login(tests.id('away7'));
create temp table seen as select public.mark_seen() as r;
grant select on seen to authenticated;
select tests.eq((select (r->'offer'->>'points')::int from seen), 10, 'opening the app shows the offer');
select tests.eq((public.claim_comeback((select (r->'offer'->>'id')::uuid from seen)))->>'status', 'ok', 'claimed');
select tests.eq((public.claim_comeback((select (r->'offer'->>'id')::uuid from seen)))->>'status', 'already', 'once');
select tests.eq((public.mark_seen())->'offer', 'null'::jsonb, 'and then it''s gone');
select tests.login(tests.id('away3'));
select tests.eq((public.claim_comeback((select (r->'offer'->>'id')::uuid from seen)))->>'status', 'not_found', 'nobody else can claim it');
select tests.eq((public.mark_seen())->'offer', 'null'::jsonb, 'a nudge without points has nothing to claim');
select tests.logout();
select tests.ok(exists (select 1 from public.point_ledger where user_id = tests.id('away7') and reason = 'comeback_bonus' and delta = 10), 'the points are paid');
select tests.eq((select away_stage from public.member_activity where user_id = tests.id('away7')), 0, 'back: the next absence starts over');

-- An expired offer.
insert into public.comeback_offers (user_id, stage, points, title, body, send_at, sent_at, expires_at)
values (tests.id('optout'), 3, 15, 't', 'b', now() - interval '3 days', now() - interval '3 days', now() - interval '1 day');
select tests.login(tests.id('optout'));
select tests.eq((public.mark_seen())->'offer', 'null'::jsonb, 'an expired offer isn''t shown');
select tests.logout();
create temp table expired_id as select id from public.comeback_offers where user_id = tests.id('optout');
grant select on expired_id to authenticated;
select tests.login(tests.id('optout'));
select tests.eq((public.claim_comeback((select id from expired_id)))->>'status', 'expired', 'too late to claim');
select tests.logout();

-- Back before a queued nudge went out: it's dropped.
update public.member_activity set last_seen_at = now() - interval '20 days', away_stage = 2, last_nudge_at = now() - interval '10 days' where user_id = tests.id('away7');
select public.queue_comeback_nudges();
select tests.ok(exists (select 1 from public.comeback_offers where user_id = tests.id('away7') and stage = 3 and points = 0 and sent_at is null), '20 days away: the 14-day step, without points (already paid this month)');
select tests.login(tests.id('away7'));
select public.mark_seen();
select tests.logout();
select tests.ok(not exists (select 1 from public.comeback_offers where user_id = tests.id('away7') and sent_at is null), 'came back first: the queued nudge is dropped');

-- Turned off by admins.
update public.points_settings set comeback_on = false;
update public.member_activity set last_seen_at = now() - interval '40 days', away_stage = 0, last_nudge_at = null where user_id = tests.id('away7');
select tests.eq(public.queue_comeback_nudges(), 0, 'admins can switch it off');
update public.points_settings set comeback_on = true;

-- Admin stats.
select tests.login(tests.id('away3'));
select tests.fails($$ select public.admin_comeback_stats() $$, 'admins_only', 'stats are for admins');
select tests.login(tests.id('boss'));
create temp table st as select public.admin_comeback_stats() as j;
select tests.logout();
select tests.ok((select (j->>'claimed')::int >= 1 and (j->>'points_paid')::int >= 10 from st), 'admins see sent, claimed and points paid');

-- ---------- audit: farming and fairness ----------
-- Claiming straight from the alert (its id is in the notification) without
-- opening the app still ends the absence: one paid step per absence, not
-- 7 + 14 + 30.
select tests.user('sneak');
update auth.users set created_at = now() - interval '40 days' where id = tests.id('sneak');
insert into public.member_activity (user_id, last_seen_at) values (tests.id('sneak'), now() - interval '8 days');
select public.queue_comeback_nudges();
update public.comeback_offers set send_at = now() - interval '1 minute' where user_id = tests.id('sneak');
select public.release_comeback_nudges();
select tests.login(tests.id('sneak'));
select tests.eq((public.claim_comeback((select split_part(dedupe, ':', 2)::uuid from public.notifications where kind = 'comeback' limit 1)))->>'status', 'ok', 'claimed from the alert');
select tests.logout();
select tests.ok((select away_stage = 0 and last_seen_at > now() - interval '1 minute' from public.member_activity where user_id = tests.id('sneak')), 'claiming ends the absence (no second paid step without coming back)');

-- An account nobody has opened the app with (only an old sign-in or
-- sign-up date) gets a nudge, never points, and no paid step later.
select tests.user('dormant');
update auth.users set created_at = now() - interval '40 days', last_sign_in_at = now() - interval '40 days' where id = tests.id('dormant');
select public.queue_comeback_nudges();
select tests.eq((select points from public.comeback_offers where user_id = tests.id('dormant')), 0, 'a never-opened account gets no points');
delete from public.comeback_offers where user_id = tests.id('dormant');
update public.member_activity set last_nudge_at = now() - interval '4 days' where user_id = tests.id('dormant');
select public.queue_comeback_nudges();
select tests.ok(not exists (select 1 from public.comeback_offers where user_id = tests.id('dormant') and points > 0), 'and no paid step later until they open the app');

-- The parts hook doesn't count listings from someone you've blocked.
select tests.user('blocker');
update auth.users set created_at = now() - interval '40 days' where id = tests.id('blocker');
insert into public.blocks (blocker_id, blocked_id) values (tests.id('blocker'), tests.id('seller'));
insert into public.vehicles (owner_id, make, model, year) values (tests.id('blocker'), 'BMW', '540i', 2019);
insert into public.member_activity (user_id, last_seen_at) values (tests.id('blocker'), now() - interval '4 days');
select public.queue_comeback_nudges();
select tests.ok((select title not like '%part%' from public.comeback_offers where user_id = tests.id('blocker')), 'the nudge doesn''t count a blocked seller''s parts');

-- Members who stay away for good don't use up the daily batch: someone
-- newly away still gets their nudge with 2,000 long-gone members ahead.
with u as (
  insert into auth.users (id, email, email_confirmed_at, created_at)
  select gen_random_uuid(), 'gone' || g || '@test.tunr', now(), now() - interval '90 days' from generate_series(1, 2000) g
  returning id)
, s as (insert into public.account_status (user_id, confirmed_at) select id, now() from u on conflict (user_id) do update set confirmed_at = now())
insert into public.member_activity (user_id, last_seen_at, away_stage, last_nudge_at)
select id, now() - interval '60 days', 4, now() - interval '10 days' from u;
select tests.user('late');
update auth.users set created_at = now() - interval '40 days' where id = tests.id('late');
insert into public.member_activity (user_id, last_seen_at) values (tests.id('late'), now() - interval '8 days');
select public.queue_comeback_nudges();
select tests.ok(exists (select 1 from public.comeback_offers where user_id = tests.id('late')), 'long-gone members don''t crowd out the newly away');

-- Signed out, and members changing the amounts.
select tests.login(null);
select tests.fails($$ select public.mark_seen() $$, 'permission denied', 'signed out: no mark_seen');
select tests.fails($$ select public.claim_comeback(gen_random_uuid()) $$, 'permission denied', 'or claim');
select tests.login(tests.id('late'));
select tests.blocked_by_rls($$ update public.points_settings set comeback_points_30 = 100 $$, 'members can''t raise the comeback points');
select tests.logout();
select tests.eq((select comeback_points_30 from public.points_settings limit 1), 25, 'the amount is unchanged');

-- Points at most once a month per member.
delete from public.comeback_offers where user_id = tests.id('away3');
insert into public.comeback_offers (user_id, stage, points, title, body, send_at, sent_at, expires_at, claimed_at, created_at)
values (tests.id('away3'), 2, 10, 't', 'b', now() - interval '10 days', now() - interval '10 days', now() - interval '8 days', now() - interval '9 days', now() - interval '10 days');
update public.member_activity set last_seen_at = now() - interval '8 days', away_stage = 1, last_nudge_at = now() - interval '5 days' where user_id = tests.id('away3');
select public.queue_comeback_nudges();
select tests.ok(exists (select 1 from public.comeback_offers where user_id = tests.id('away3') and sent_at is null and points = 0 and stage = 2), 'a second paid step within 30 days goes out without points');

rollback;
