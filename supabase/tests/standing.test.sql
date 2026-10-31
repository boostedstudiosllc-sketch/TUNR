-- Member since and Top X% (113).
begin;

-- 30 people in Atlanta with 1..30 check-ins each, and a newcomer.
select tests.user('atl' || g) from generate_series(1, 30) g;
select tests.user('newbie');
select tests.user('hidden');
select tests.logout();
insert into public.events (id, title, created_by, start_at) values ('00000000-0000-0000-0000-0000000000e9', 'Meet', tests.id('newbie'), now() + interval '30 days');
insert into public.meet_checkins (user_id, event_id, occurrence, distance_m)
select tests.id('atl' || g), '00000000-0000-0000-0000-0000000000e9', current_date - k, 10
  from generate_series(1, 30) g, generate_series(1, g) k;
insert into public.meet_checkins (user_id, event_id, occurrence, distance_m)
select tests.id('hidden'), '00000000-0000-0000-0000-0000000000e9', current_date - k, 10 from generate_series(1, 40) k;
update public.profiles set hide_from_leaderboards = true where id = tests.id('hidden');

select tests.login(tests.id('newbie'));
select tests.eq((public.profile_standing(tests.id('atl30')))->>'top', '5', 'the most active of 30 is top 5%');
select tests.eq((public.profile_standing(tests.id('atl30')))->>'area', 'Atlanta', 'ranked in their city');
select tests.eq(((public.profile_standing(tests.id('atl30')))->>'rank')::int, 1, 'and is #1 there');
select tests.eq((public.profile_standing(tests.id('atl28')))->>'top', '10', '#3 of 30 is top 10%');
select tests.eq((public.profile_standing(tests.id('atl24')))->>'top', '25', '#7 of 30 is top 25%');
select tests.eq((public.profile_standing(tests.id('atl23')))->>'top', null, '#8 of 30 (27%) is just outside');
select tests.eq((public.profile_standing(tests.id('atl10')))->>'top', null, 'the middle of the pack gets no badge');
select tests.eq((public.profile_standing(tests.id('atl1')))->>'top', null, 'nor does a near-empty account');
select tests.ok((public.profile_standing(tests.id('newbie'))) ? 'member_since', 'everyone has a member since date');
select tests.eq((public.profile_standing(tests.id('hidden')))->>'top', null, 'people hidden from leaderboards get no badge');
select tests.eq(((public.profile_standing(tests.id('atl30')))->>'of')::int, 30, 'and aren''t counted in anyone''s ranking');

-- A small city is ranked against all of TUNR.
select tests.logout();
update public.profiles set city = 'Macon, GA' where id = tests.id('atl29');
select tests.eq((public.profile_standing(tests.id('atl29')))->>'area', 'TUNR', 'a city with few members is ranked across TUNR');

rollback;
