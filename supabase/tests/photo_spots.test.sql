-- Photo spots (042 + 116): spot details, saves, and the discover list.
begin;

select tests.user('shooter');
select tests.user('fan');
select tests.user('other');
-- The starter forum (042 seeds it only when an admin exists).
select tests.logout();
insert into public.forums (slug, name, description, icon, created_by)
values ('ga-photo-spots', 'GA Photo Spots', 'Spots', '📸', tests.id('shooter')) on conflict do nothing;

select tests.login(tests.id('shooter'));
insert into public.forum_posts (id, forum_id, user_id, title, tag, place, lat, lng, spot_vibes, spot_best_time, spot_security)
values ('00000000-0000-0000-0000-00000000a001', (select id from public.forums where slug = 'ga-photo-spots'), auth.uid(),
        'Jackson St Bridge', 'spot', 'Jackson St Bridge', 33.7596, -84.3742,
        array['skyline', 'bridge', 'skyline'], 'golden', 'quick');
select tests.eq((select spot_vibes from public.forum_posts where id = '00000000-0000-0000-0000-00000000a001'), array['bridge', 'skyline'], 'vibes are kept once each');
select tests.fails($$ insert into public.forum_posts (forum_id, user_id, title, tag, lat, lng, spot_vibes)
  values ((select id from public.forums where slug = 'ga-photo-spots'), auth.uid(), 'Bad vibes', 'spot', 33.7, -84.3, array['beach']) $$,
  'spot_vibes', 'only known vibes');
select tests.fails($$ insert into public.forum_posts (forum_id, user_id, title, tag, lat, lng, spot_security)
  values ((select id from public.forums where slug = 'ga-photo-spots'), auth.uid(), 'Bad security', 'spot', 33.7, -84.3, 'yolo') $$,
  'spot_security', 'only known security notes');

-- A non-spot post never carries spot details.
insert into public.forum_posts (id, forum_id, user_id, title, tag, spot_vibes, spot_best_time)
values ('00000000-0000-0000-0000-00000000a002', (select id from public.forums where slug = 'ga-photo-spots'), auth.uid(), 'Which lens?', 'question', array['night_lights'], 'night');
select tests.eq((select spot_best_time from public.forum_posts where id = '00000000-0000-0000-0000-00000000a002'), null, 'questions don''t get a best time');
select tests.eq((select cardinality(spot_vibes) from public.forum_posts where id = '00000000-0000-0000-0000-00000000a002'), 0, 'or vibes');

-- ---------- the discover list ----------
select tests.login(null);
select tests.eq((select count(*) from public.photo_spots)::int, 1, 'signed out, spots are listed (only real spots with a pin)');
select tests.eq((select spot_best_time from public.photo_spots), 'golden', 'with their best time');
select tests.eq((select spot_security from public.forum_posts_feed where id = '00000000-0000-0000-0000-00000000a001'), 'quick', 'and the forum post shows the details too');

-- ---------- saving ----------
select tests.login(tests.id('fan'));
insert into public.photo_spot_saves (post_id) values ('00000000-0000-0000-0000-00000000a001');
select tests.eq((select saved from public.photo_spots where id = '00000000-0000-0000-0000-00000000a001'), true, 'a member saves a spot');
select tests.blocked_by_rls($$ insert into public.photo_spot_saves (post_id) values ('00000000-0000-0000-0000-00000000a002') $$, 'only spots can be saved');
select tests.blocked_by_rls($$ insert into public.photo_spot_saves (user_id, post_id) values (tests.id('other'), '00000000-0000-0000-0000-00000000a001') $$, 'nobody saves for someone else');

select tests.login(tests.id('other'));
select tests.eq((select saved from public.photo_spots where id = '00000000-0000-0000-0000-00000000a001'), false, 'someone else hasn''t saved it');
select tests.eq((select saves from public.photo_spots where id = '00000000-0000-0000-0000-00000000a001'), 1, 'but sees how many have');
select tests.eq((select count(*) from public.photo_spot_saves)::int, 0, 'and never who');

-- ---------- only the author edits the details ----------
update public.forum_posts set spot_security = 'chill', spot_vibes = '{}' where id = '00000000-0000-0000-0000-00000000a001';
select tests.logout();
select tests.eq((select spot_security from public.forum_posts where id = '00000000-0000-0000-0000-00000000a001'), 'quick', 'someone else can''t change the details');
select tests.login(tests.id('shooter'));
update public.forum_posts set spot_security = 'ask' where id = '00000000-0000-0000-0000-00000000a001';
select tests.eq((select spot_security from public.forum_posts where id = '00000000-0000-0000-0000-00000000a001'), 'ask', 'the author can');

-- ---------- removed spots leave the list ----------
select tests.logout();
update public.forum_posts set removed = true where id = '00000000-0000-0000-0000-00000000a001';
select tests.login(tests.id('fan'));
select tests.eq((select count(*) from public.photo_spots)::int, 0, 'a removed spot is gone from discover');

rollback;
