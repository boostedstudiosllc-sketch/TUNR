-- Finding people (112).
begin;

select tests.user('g30.rollie');
select tests.user('g30.fan');
select tests.user('ana');
select tests.user('blocker');
select tests.logout();
insert into public.user_follows (follower_id, followee_id) values (tests.id('g30.fan'), tests.id('g30.rollie')), (tests.id('ana'), tests.id('g30.rollie'));
insert into public.blocks (blocker_id, blocked_id) values (tests.id('blocker'), tests.id('ana'));

select tests.login(tests.id('ana'));
select tests.eq((select username from public.search_people('g30.rollie') limit 1), 'g30.rollie', 'the exact username comes first');
select tests.eq((select username from public.search_people('@G30.ROLLIE') limit 1), 'g30.rollie', 'with an @ and in capitals too');
select tests.eq((select count(*) from public.search_people('g30'))::int, 2, 'part of a name finds everyone matching');
select tests.ok((select i_follow from public.search_people('g30.rollie') limit 1), 'shows that you already follow them');
select tests.eq((select count(*) from public.search_people('ana'))::int, 0, 'you don''t find yourself');
select tests.eq((select count(*) from public.search_people('blocker'))::int, 0, 'people who blocked you don''t show up');
select tests.eq((select username from public.search_people('') limit 1), 'g30.rollie', 'with nothing typed: the most followed first');
select tests.login(null);
select tests.fails($$ select * from public.search_people('g30') $$, 'permission denied', 'signed-out visitors can''t search people');

rollback;
