-- App error log (135): anyone can report, nobody but admins reads, limits hold.
begin;

select tests.user('member');
select tests.user('other');
select tests.user('boss', true, true);
select tests.logout();

select tests.login(tests.id('member'));
select public.report_app_error('Couldn''t follow @atl. (you don''t have access to that)', 'permission denied for table follows [42501]', '/', 'iPhone Safari');
select public.report_app_error('Couldn''t follow @atl. (you don''t have access to that)', 'permission denied for table follows [42501]', '/', 'iPhone Safari');
select public.report_app_error('x', '   ', '/', null);
select tests.fails($$ select * from public.app_errors $$, 'permission denied', 'members can''t read the log');
select tests.fails($$ insert into public.app_errors (shown, detail) values ('a', 'b') $$, 'permission denied', 'or write it directly');
select tests.fails($$ select public.admin_app_errors(7) $$, 'admins_only', 'only admins see it');
select tests.fails($$ select public.admin_clear_app_errors(null) $$, 'admins_only', 'only admins clear it');
select tests.login(null);
select tests.fails($$ select * from public.app_errors $$, 'permission denied', 'nor can signed-out visitors');
select tests.logout();
select tests.eq((select count(*) from public.app_errors)::int, 1, 'the same failure is kept once per 10 minutes; blanks are skipped');
select tests.eq((select user_id from public.app_errors limit 1), tests.id('member'), 'it records who saw it');

-- 30 an hour per person.
select tests.login(tests.id('other'));
select public.report_app_error('shown', 'boom ' || g, null, null) from generate_series(1, 40) g;
select tests.logout();
select tests.eq((select count(*) from public.app_errors where user_id = tests.id('other'))::int, 30, 'at most 30 an hour per person');

-- Signed-out visitors can report too.
select tests.login(null);
select public.report_app_error('shown', 'guest failure', '/join', null);
select tests.logout();
select tests.eq((select count(*) from public.app_errors where user_id is null)::int, 1, 'signed-out visitors can report');

-- Long text is cut, not refused.
select tests.login(tests.id('member'));
select public.report_app_error(repeat('s', 900), repeat('d', 900), repeat('p', 900), repeat('a', 900));
select tests.logout();
select tests.eq((select max(char_length(detail)) from public.app_errors)::int, 400, 'long details are cut to 400');

-- Admins see it grouped and can clear it.
select tests.login(tests.id('boss'));
create temp table seen as select public.admin_app_errors(7) as j;
select tests.logout();
select tests.ok((select bool_or((g->>'detail') = 'permission denied for table follows [42501]' and (g->>'times')::int = 1 and g->'usernames' ? 'member') from seen, jsonb_array_elements(j) g), 'admins see the technical detail, how often, and who');
select tests.login(tests.id('boss'));
create temp table cleared as select public.admin_clear_app_errors('guest failure') as one, public.admin_clear_app_errors(null) as rest;
select tests.logout();
select tests.eq((select one from cleared), 1, 'admins clear one failure');
select tests.ok((select rest from cleared) > 0, 'or everything');
select tests.eq((select count(*) from public.app_errors)::int, 0, 'and it''s gone');

-- One signed-out visitor can't use up everyone's signed-out quota.
select tests.login(null);
select set_config('request.headers', '{"x-real-ip":"203.0.113.9"}', true);
select public.report_app_error('shown', 'flood ' || g, null, null) from generate_series(1, 320) g;
select set_config('request.headers', '{"x-real-ip":"198.51.100.7"}', true);
select public.report_app_error('shown', 'a real guest failure', '/join', null);
select set_config('request.headers', '', true);
select tests.logout();
select tests.ok((select count(*) from public.app_errors where detail like 'flood %') <= 30, 'one signed-out visitor is held to 30 an hour');
select tests.eq((select count(*) from public.app_errors where detail = 'a real guest failure')::int, 1, 'so other visitors'' failures still get logged');

-- Sign-in links, tokens, keys and emails are never stored.
select tests.login(tests.id('member'));
select public.report_app_error(
  'Couldn''t sign in. (a@b.co)',
  'Invalid API Key provided: sk_live_51HabcdefGHIJ; Bearer abc.def.ghi; jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl; password=hunter2; Email address "someone@example.com" is invalid',
  '/reset?code=8f2b1c&access_token=xyz&event=12',
  null);
select tests.logout();
select tests.ok((select bool_and(detail !~* '(sk_live_51|hunter2|eyJ|someone@example|abc\.def)' and shown !~ 'a@b\.co' and page !~ '(8f2b1c|xyz)' and page ~ 'event=12') from public.app_errors where user_id = tests.id('member')), 'secrets and emails are scrubbed before they''re stored');

rollback;
