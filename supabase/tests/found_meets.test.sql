-- Meets found online (125): loaded by the database owner from the finder's
-- file, admins only see and add them, repeats and meets already on TUNR
-- are caught.
begin;

select tests.user('boss', true, true);
select tests.user('driver');
select tests.logout();

create temp table day as select to_char((now() at time zone 'America/New_York') + interval '5 days', 'YYYY-MM-DD') as d;
grant select on day to authenticated, anon;
insert into public.events (title, created_by, start_at, end_at, location, lat, lng) values
  ('Peachtree Cars and Coffee', tests.id('boss'), ((select d from day) || ' 09:00')::timestamp at time zone 'America/New_York', null, 'Somewhere', 33.8, -84.4);

create temp table r1 as select public.import_found_meets(jsonb_build_array(
  jsonb_build_object('title', 'Macon Night Meet', 'kind', 'meet', 'starts_local', (select d from day) || 'T20:00', 'location', 'Macon Mall, Macon, GA', 'city', 'Macon, GA', 'instagram', '@macon.meets', 'source_url', 'https://example.com/macon', 'source_name', 'Example Events'),
  jsonb_build_object('title', 'Peachtree Cars & Coffee', 'starts_local', (select d from day) || 'T09:00', 'location', 'Peachtree Rd', 'source_url', 'https://example.com/ptree'),
  jsonb_build_object('title', 'Old Meet', 'starts_local', '2020-01-01T10:00', 'location', 'Gone', 'source_url', 'https://example.com/old'),
  jsonb_build_object('title', 'Bad Link', 'starts_local', (select d from day) || 'T10:00', 'location', 'Somewhere', 'source_url', 'javascript:alert(1)')
), 'test-1') as r;
select tests.eq((select (r->>'new')::int from r1), 1, 'a new meet is queued');
select tests.eq((select (r->>'already_on_tunr')::int from r1), 1, 'a meet already on TUNR (similar name, same day) is marked');
select tests.eq((select (r->>'skipped')::int from r1), 2, 'past meets and bad links are skipped');
create temp table r2 as select public.import_found_meets(jsonb_build_array(
  jsonb_build_object('title', 'Macon Night Meet', 'starts_local', (select d from day) || 'T20:00', 'location', 'Macon Mall', 'source_url', 'https://example.com/macon2')), 'test-2') as r;
select tests.eq((select (r->>'seen_before')::int from r2), 1, 'the same meet found again isn''t queued twice');
select tests.eq((select instagram from public.found_meets where title = 'Macon Night Meet'), 'macon.meets', 'the host''s Instagram is kept');
select tests.ok(exists (select 1 from public.notifications n join public.profiles p on p.id = n.user_id where n.kind = 'found_meets' and p.is_admin), 'admins are told');

-- Only the database owner loads batches.
select tests.login(tests.id('boss'));
select tests.fails($$ select public.import_found_meets('[]'::jsonb, 'x') $$, 'permission denied', 'not even admins load batches from the app');
select tests.login(tests.id('driver'));
select tests.eq((select count(*) from public.found_meets)::int, 0, 'members can''t see the queue');
select tests.fails($$ select public.admin_add_found_meet((select id from public.found_meets limit 1), 32.8, -83.6) $$, 'admins_only', 'or add from it');
select tests.blocked_by_rls($$ insert into public.found_meets (title, starts_local, location, source_url) values ('Spam', '2030-01-01T10:00', 'x x x', 'https://spam.example') $$, 'or write to it');

-- Admins add or dismiss.
select tests.login(tests.id('boss'));
create temp table added as select public.admin_add_found_meet((select id from public.found_meets where title = 'Macon Night Meet'), 32.86, -83.69, 'Euro') as r;
grant select on added to authenticated;
select tests.eq((select r->>'status' from added), 'ok', 'an admin adds it');
select tests.eq((select source from public.events where id = (select (r->>'event_id')::uuid from added)), 'web', 'it becomes a meet marked as found online');
select tests.eq((select host from public.events where id = (select (r->>'event_id')::uuid from added)), 'macon.meets', 'credited to the host');
select tests.eq(((select start_at from public.events where id = (select (r->>'event_id')::uuid from added)) at time zone 'America/New_York')::time, '20:00'::time, 'at the right local time');
select tests.eq((public.admin_add_found_meet((select id from public.found_meets where title = 'Macon Night Meet'), 32.86, -83.69))->>'status', 'not_found', 'and can''t add it twice');
select public.admin_dismiss_found_meet((select id from public.found_meets where title = 'Peachtree Cars & Coffee'));
select tests.eq((select status from public.found_meets where title = 'Peachtree Cars & Coffee'), 'dismissed', 'or dismisses it');

rollback;
