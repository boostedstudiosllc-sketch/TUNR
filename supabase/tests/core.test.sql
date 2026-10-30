-- Core accounts and meets: nobody can promote themselves or change other
-- people's things.
begin;

select tests.user('ana');
select tests.user('ben');

select tests.login(tests.id('ana'));
update public.profiles set bio = 'Turbo Civic' where id = tests.id('ana');
select tests.eq((select bio from public.profiles where id = tests.id('ana')), 'Turbo Civic', 'you can edit your own profile');
do $$ begin update public.profiles set is_admin = true where id = auth.uid(); exception when others then null; end $$;
select tests.logout();
select tests.eq((select is_admin from public.profiles where id = tests.id('ana')), false, 'you can''t make yourself an admin');
select tests.login(tests.id('ana'));
do $$ begin update public.profiles set is_member = true, all_access = true where id = auth.uid(); exception when others then null; end $$;
select tests.logout();
select tests.eq((select is_member or all_access from public.profiles where id = tests.id('ana')), false, 'you can''t give yourself membership');
select tests.login(tests.id('ana'));
select tests.blocked_by_rls(format($$ update public.profiles set bio = 'hacked' where id = %L $$, tests.id('ben')), 'you can''t edit someone else''s profile');

-- Meets
select tests.logout();
insert into public.events (id, title, created_by, start_at) values ('00000000-0000-0000-0000-0000000000e2', 'Ben''s meet', tests.id('ben'), now() + interval '2 days');
select tests.login(tests.id('ana'));
select tests.blocked_by_rls($$ update public.events set title = 'Cancelled' where id = '00000000-0000-0000-0000-0000000000e2' $$, 'you can''t edit someone else''s meet');
select tests.blocked_by_rls($$ delete from public.events where id = '00000000-0000-0000-0000-0000000000e2' $$, 'you can''t delete someone else''s meet');
select tests.login(tests.id('ben'));
update public.events set title = 'Ben''s big meet' where id = '00000000-0000-0000-0000-0000000000e2';
select tests.eq((select title from public.events where id = '00000000-0000-0000-0000-0000000000e2'), 'Ben''s big meet', 'the host can edit their meet');

-- Blocks are private.
insert into public.blocks (blocker_id, blocked_id) values (tests.id('ben'), tests.id('ana'));
select tests.login(tests.id('ana'));
select tests.eq((select count(*) from public.blocks)::int, 0, 'you can''t see who blocked you');

-- Uploads go only into your own folder.
select tests.login(tests.id('ana'));
insert into storage.objects (bucket_id, name) values ('event-photos', tests.id('ana') || '/flyer.jpg');
select tests.ok(true, 'you can upload a photo into your own folder');
select tests.blocked_by_rls(format($$ insert into storage.objects (bucket_id, name) values ('event-photos', '%s/flyer.jpg') $$, tests.id('ben')),
  'you can''t upload into someone else''s folder');
select tests.blocked_by_rls(format($$ insert into storage.objects (bucket_id, name) values ('avatars', '%s/me.jpg') $$, tests.id('ben')),
  'nor set someone else''s profile photo');

rollback;
