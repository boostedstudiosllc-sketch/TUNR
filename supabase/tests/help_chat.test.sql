-- 137: help assistant limits.
begin;

select tests.user('asker');
select tests.user('boss', true, true);
select tests.logout();

select tests.login(tests.id('asker'));
select tests.fails($$ select public.use_help_question('user:' || auth.uid()) $$, 'permission denied', 'members can''t spend the quota directly');
select tests.fails($$ select * from public.help_usage $$, 'permission denied', 'or read it');
select tests.fails($$ select public.admin_help_usage() $$, 'admins_only', 'counts are for admins');
select tests.login(null);
select tests.fails($$ select public.use_help_question('visitor:abcdef12') $$, 'permission denied', 'nor can signed-out visitors');
select tests.logout();

-- The server (service key) asks.
create temp table r as select public.use_help_question('user:' || tests.id('asker')) as j;
select tests.eq((select j->>'status' from r), 'ok', 'a question is allowed');
select tests.eq((select (j->>'left')::int from r), 39, '40 a day for members');
select public.use_help_question('user:' || tests.id('asker')) from generate_series(1, 39);
select tests.eq((public.use_help_question('user:' || tests.id('asker')))->>'status', 'rate_limit', 'then the day''s limit');
select public.use_help_question('visitor:abcdef12') from generate_series(1, 10);
select tests.eq((public.use_help_question('visitor:abcdef12'))->>'status', 'rate_limit', 'signed-out visitors get 10');
select tests.eq((public.use_help_question('visitor:zzzzzzzz'))->>'status', 'ok', 'each visitor counts separately');
select tests.eq((public.use_help_question('nonsense'))->>'status', 'bad_request', 'only user:/visitor: ids');
select tests.eq((public.use_help_question('user:x'' or 1=1 --'))->>'status', 'bad_request', 'no odd characters');
-- Everyone together: 1,000 a day.
insert into public.help_usage (day, who, questions) values (public.atl_today(), 'visitor:bulkbulk', 1000)
  on conflict (day, who) do update set questions = 1000;
select tests.eq((public.use_help_question('visitor:freshone'))->>'status', 'busy', 'past 1,000 a day the assistant rests');

select tests.login(tests.id('boss'));
create temp table u as select public.admin_help_usage() as j;
select tests.logout();
select tests.ok((select (j->0->>'questions')::int >= 1000 from u), 'admins see questions per day');

rollback;
