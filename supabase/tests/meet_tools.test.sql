-- Meet tools (134): cancel / move a meet tells the people who RSVP'd;
-- a new part alerts owners of the car it fits; "who's down?" shouts.
begin;

select tests.user('host');
select tests.user('fan');
select tests.user('maybe');
select tests.user('rando');
select tests.user('fresh', false);
select tests.logout();

-- ---------- cancel / move ----------
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-00000000c001', 'Friday Meet', tests.id('host'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Lenox Square', 33.85, -84.36);
insert into public.rsvps (user_id, event_id, status) values
  (tests.id('fan'), '00000000-0000-0000-0000-00000000c001', 'going'),
  (tests.id('maybe'), '00000000-0000-0000-0000-00000000c001', 'interested');

select tests.login(tests.id('rando'));
select tests.eq((public.cancel_meet('00000000-0000-0000-0000-00000000c001', 'nope'))->>'status', 'not_host', 'only hosts cancel');
select tests.login(tests.id('host'));
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c001';
select tests.logout();
select tests.eq((select count(*) from public.notifications where kind = 'meet_change' and title like '📅 Meet moved%')::int, 2, 'moving it tells everyone who RSVP''d (going and interested)');
select tests.eq((select count(*) from public.notifications where kind = 'meet_change' and user_id = tests.id('host'))::int, 0, 'not the host who moved it');
select tests.login(tests.id('host'));
update public.events set description = 'New details' where id = '00000000-0000-0000-0000-00000000c001';
select tests.logout();
select tests.eq((select count(*) from public.notifications where kind = 'meet_change')::int, 2, 'other edits don''t alert anyone');
select tests.login(tests.id('host'));
select tests.eq((public.cancel_meet('00000000-0000-0000-0000-00000000c001', 'Rain, sorry!'))->>'status', 'ok', 'the host cancels');
select tests.eq((public.cancel_meet('00000000-0000-0000-0000-00000000c001'))->>'status', 'already', 'once');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('fan') and title like '❌ Cancelled%' and body = 'Rain, sorry!'), 'RSVPs are told, with the reason');
select tests.eq((select cancel_reason from public.events_public where id = '00000000-0000-0000-0000-00000000c001'), 'Rain, sorry!', 'everyone sees it''s cancelled and why');
select tests.login(tests.id('rando'));
select tests.fails($$ insert into public.rsvps (user_id, event_id, status) values (auth.uid(), '00000000-0000-0000-0000-00000000c001', 'going') $$, 'meet_cancelled', 'no new RSVPs to a cancelled meet');
select tests.login(tests.id('fan'));
delete from public.rsvps where user_id = auth.uid() and event_id = '00000000-0000-0000-0000-00000000c001';
select tests.eq((select count(*) from public.rsvps where user_id = auth.uid())::int, 0, 'taking an RSVP back still works');
select tests.login(tests.id('host'));
select tests.eq((public.cancel_meet('00000000-0000-0000-0000-00000000c001', null, true))->>'status', 'ok', 'and un-cancels');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('maybe') and title like '✅ Back on%'), 'RSVPs hear it''s back on');

-- ---------- parts for my car ----------
insert into public.vehicles (owner_id, make, model, year) values
  (tests.id('fan'), 'BMW', '540i', 2019),
  (tests.id('maybe'), 'BMW', '540i', 2014),
  (tests.id('rando'), 'Honda', 'Civic', 2019);
update public.alert_settings set parts = true;
insert into public.alert_settings (user_id, parts) values (tests.id('rando'), true) on conflict (user_id) do nothing;
select tests.login(tests.id('host'));
create temp table photo as select 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/' || auth.uid() || '/1.jpg' as url;
grant select on photo to authenticated;
insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from, fit_year_to)
values ('G30 headlight', 'lighting', 'used', 65000, array[(select url from photo)], 'BMW', '540i', 2017, 2020);
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('fan') and kind = 'part_for_you' and title like '%2019 BMW 540i%'), 'the 2019 540i owner hears about it');
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('maybe') and kind = 'part_for_you'), 'not the 2014 (outside the years)');
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('rando') and kind = 'part_for_you'), 'not a Civic');
update public.alert_settings set parts = false where user_id = tests.id('fan');
insert into public.alert_settings (user_id, parts) values (tests.id('fan'), false) on conflict (user_id) do update set parts = false;
select tests.login(tests.id('host'));
insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from)
values ('G30 grille', 'aero', 'used', 9000, array[(select url from photo)], 'BMW', '540i', 2019);
select tests.logout();
select tests.eq((select count(*) from public.notifications where user_id = tests.id('fan') and kind = 'part_for_you')::int, 1, 'turned off: no more part alerts');

-- ---------- who's down? ----------
insert into public.alert_settings (user_id, lat, lng, radius_miles, linkups) values (tests.id('maybe'), 33.80, -84.40, 25, true)
  on conflict (user_id) do update set lat = 33.80, lng = -84.40, radius_miles = 25, linkups = true;
select tests.login(tests.id('fresh'));
select tests.eq((public.post_shout('cruise', 'tonight', 'Midtown', 33.78, -84.38))->>'status', 'unconfirmed', 'confirm your email first');
select tests.login(tests.id('host'));
create temp table sh as select public.post_shout('cruise', 'tonight', 'Midtown', 33.78456, -84.38321, 'Buford Hwy run?') as r;
grant select on sh to authenticated;
select tests.eq((select r->>'status' from sh), 'ok', 'a shout goes out');
select tests.eq((public.post_shout('hang', 'now', 'Midtown', 33.78, -84.38))->>'status', 'already_live', 'one live shout at a time');
select tests.eq((select lat from public.link_shouts where id = (select (r->>'id')::uuid from sh))::numeric, 33.78, 'its spot is rounded (about half a mile)');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('maybe') and kind = 'shout'), 'people nearby with linkup alerts hear it');
select tests.login(tests.id('host'));
select tests.eq((public.shout_down((select (r->>'id')::uuid from sh)))->>'status', 'own_shout', 'not down for your own');
select tests.login(tests.id('maybe'));
select tests.eq((public.shout_down((select (r->>'id')::uuid from sh)))->>'status', 'ok', 'I''m down');
select tests.eq(((public.shouts_near(33.80, -84.40))->0->>'downs')::int, 1, 'everyone sees how many are down');
select tests.eq((public.shouts_near(33.80, -84.40))->0->'down_names', 'null'::jsonb, 'but only the poster sees who');
select tests.eq((select count(*) from public.link_shout_downs where user_id <> auth.uid())::int, 0, 'you only see your own downs');
select tests.blocked_by_rls($$ insert into public.link_shouts (kind, when_label, lat, lng, expires_at) values ('hang', 'now', 1, 1, now() + interval '1 hour') $$, 'shouts go through the function');
select tests.login(tests.id('host'));
select tests.eq((public.shouts_near(33.80, -84.40))->0->'down_names'->>0, 'maybe', 'the poster sees who''s down');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('host') and kind = 'shout_down'), 'and hears about each one');
-- Make it a linkup.
insert into public.linkups (id, user_id, kind, place, area, lat, lng, starts_at, ends_at) values
  ('00000000-0000-0000-0000-00000000c0a1', tests.id('host'), 'cruise', 'QT on Buford Hwy', 'Doraville', 33.89, -84.27, now() + interval '2 hours', now() + interval '4 hours');
select tests.login(tests.id('rando'));
select tests.eq((public.shout_to_linkup((select (r->>'id')::uuid from sh), '00000000-0000-0000-0000-00000000c0a1'))->>'status', 'not_found', 'only the poster');
select tests.login(tests.id('host'));
select tests.eq((public.shout_to_linkup((select (r->>'id')::uuid from sh), '00000000-0000-0000-0000-00000000c0a1'))->>'status', 'ok', 'the poster makes it a linkup');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('maybe') and kind = 'shout_on' and link = 'linkup:00000000-0000-0000-0000-00000000c0a1'), 'everyone who was down hears it''s on');
select tests.login(tests.id('maybe'));
select tests.eq(jsonb_array_length(public.shouts_near(33.80, -84.40)), 0, 'and the shout is done');

-- ---------- abuse and privacy (audit) ----------
select tests.logout();
-- Cancelling only goes through cancel_meet; direct writes are ignored.
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-00000000c011', 'Sunday Meet', tests.id('host'), now() + interval '4 days', now() + interval '4 days 3 hours', 'Perimeter Mall', 33.92, -84.34);
insert into public.rsvps (user_id, event_id, status) values (tests.id('fan'), '00000000-0000-0000-0000-00000000c011', 'going');
select tests.login(tests.id('host'));
update public.events set cancelled_at = now() - interval '1 minute', cancel_reason = 'x' where id = '00000000-0000-0000-0000-00000000c011';
update public.events set cancelled_at = null where id = '00000000-0000-0000-0000-00000000c011';
update public.events set cancelled_at = now() - interval '2 minutes' where id = '00000000-0000-0000-0000-00000000c011';
select tests.ok((select cancelled_at from public.events where id = '00000000-0000-0000-0000-00000000c011') is null, 'a host can''t set cancelled_at directly (only cancel_meet)');
select tests.logout();
select tests.eq((select count(*) from public.notifications where link = 'meet:00000000-0000-0000-0000-00000000c011')::int, 0, 'so toggling it directly alerts nobody');
-- Moving a meet over and over: three alerts a day, then quiet.
select tests.login(tests.id('host'));
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c011';
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c011';
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c011';
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c011';
update public.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '00000000-0000-0000-0000-00000000c011';
select tests.logout();
select tests.eq((select count(*) from public.notifications where user_id = tests.id('fan') and link = 'meet:00000000-0000-0000-0000-00000000c011')::int, 3, 'moving a meet again and again alerts RSVPs at most 3 times a day');
select tests.login(tests.id('fan'));
select tests.blocked_by_rls($$ select * from public.meet_change_alerts $$, 'the alert log isn''t readable');
select tests.logout();

-- Private meets: a leftover RSVP from someone not let in hears nothing.
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng, visibility) values
  ('00000000-0000-0000-0000-00000000c012', 'Secret Meet', tests.id('host'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Lot B', 33.85, -84.36, 'private');
insert into public.rsvps (user_id, event_id, status) values (tests.id('rando'), '00000000-0000-0000-0000-00000000c012', 'going');
select tests.login(tests.id('host'));
update public.events set location = '123 Hidden Rd' where id = '00000000-0000-0000-0000-00000000c012';
select tests.eq((public.cancel_meet('00000000-0000-0000-0000-00000000c012', 'Moved to 9 Quiet Ln, sorry'))->>'status', 'ok', 'the host cancels the private meet');
select tests.logout();
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('rando') and link = 'meet:00000000-0000-0000-0000-00000000c012'), 'a private meet''s changes only go to people let in');
select tests.login(tests.id('rando'));
select tests.ok((select cancel_reason from public.events_public where id = '00000000-0000-0000-0000-00000000c012') is null, 'a locked private meet hides the cancel reason');
select tests.ok((select cancelled_at from public.events_public where id = '00000000-0000-0000-0000-00000000c012') is not null, 'but shows that it''s cancelled');
select tests.logout();

-- An RSVP can't be moved onto a cancelled meet either.
select tests.login(tests.id('maybe'));
select tests.fails($$ update public.rsvps set event_id = '00000000-0000-0000-0000-00000000c012' where user_id = auth.uid() $$, 'meet_cancelled', 'an RSVP can''t be moved onto a cancelled meet');
select tests.logout();

-- Part alerts: three a day from one seller, even listing and deleting over and over.
insert into public.vehicles (owner_id, make, model, year) values (tests.id('rando'), 'BMW', 'M3', 2020);
select tests.login(tests.id('host'));
do $$ begin for i in 1..12 loop
  insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from)
  values ('M3 part ' || i, 'other', 'used', 100, array[(select url from photo)], 'BMW', 'M3', 2020);
  delete from public.listings where seller_id = auth.uid();
end loop; end $$;
select tests.logout();
select tests.eq((select count(*) from public.notifications where user_id = tests.id('rando') and kind = 'part_for_you')::int, 3, 'one seller can send someone at most 3 part alerts a day');

-- Shouts: the stored spot isn't readable by others; downs need a confirmed email;
-- someone blocked after saying they're down isn't told where it's on.
select tests.login(tests.id('host'));
create temp table sh2 as select public.post_shout('photos', 'now', 'Decatur', 33.77456, -84.29621) as r;
grant select on sh2 to authenticated;
select tests.eq((select r->>'status' from sh2), 'ok', 'a second shout goes out');
select tests.login(tests.id('rando'));
select tests.eq((select count(*) from public.link_shouts)::int, 0, 'others can''t read a shout''s spot from the table');
select tests.eq(jsonb_array_length(public.shouts_near(33.80, -84.40)), 1, 'they see it through shouts_near, as a distance');
select tests.eq((public.shout_down((select (r->>'id')::uuid from sh2)))->>'status', 'ok', 'rando is down');
select tests.login(tests.id('fresh'));
select tests.eq((public.shout_down((select (r->>'id')::uuid from sh2)))->>'status', 'unconfirmed', 'confirm your email before saying you''re down');
select tests.logout();
insert into public.blocks (blocker_id, blocked_id) values (tests.id('host'), tests.id('rando'));
insert into public.linkups (id, user_id, kind, place, area, lat, lng, starts_at, ends_at) values
  ('00000000-0000-0000-0000-00000000c0a2', tests.id('host'), 'photos', 'Decatur Square', 'Decatur', 33.77, -84.30, now() + interval '1 hour', now() + interval '3 hours');
select tests.login(tests.id('host'));
select tests.eq((public.shout_to_linkup((select (r->>'id')::uuid from sh2), '00000000-0000-0000-0000-00000000c0a2'))->>'status', 'ok', 'the poster makes it a linkup');
select tests.logout();
select tests.ok(not exists (select 1 from public.notifications where user_id = tests.id('rando') and kind = 'shout_on'), 'someone the poster blocked isn''t told where it''s on');

rollback;
