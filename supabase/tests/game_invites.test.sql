-- Inviting friends into a game room (107).
begin;

select tests.user('ana');
select tests.user('ben');
select tests.user('cat');
select tests.user('newbie', false);

select tests.login(tests.id('ana'));
select tests.eq((public.invite_to_game(tests.id('ben'), 'drift', '7QR7'))->>'status', 'ok', 'a friend can be invited to a room');
select tests.eq((public.invite_to_game(tests.id('ben'), 'drift', '7QR7'))->>'status', 'already', 'the same invite isn''t sent twice');
select tests.eq((public.invite_to_game(tests.id('ana'), 'drift', '7QR7'))->>'status', 'self', 'you can''t invite yourself');
select tests.eq((public.invite_to_game(tests.id('ben'), 'poker', '7QR7'))->>'status', 'bad_game', 'only Arcade games');
select tests.eq((public.invite_to_game(tests.id('ben'), 'drift', 'bad room'))->>'status', 'bad_room', 'only real room codes');
select tests.blocked_by_rls(format($$ insert into public.game_invites (from_user, to_user, game, room) values (%L, %L, 'drift', 'ZZZZ') $$, tests.id('ana'), tests.id('cat')),
  'invites can''t be written directly');

select tests.login(tests.id('ben'));
select tests.eq((select link from public.notifications where kind = 'game_invite'), 'room:drift:7QR7', 'the friend gets an alert that opens the room');
select tests.ok((select title from public.notifications where kind = 'game_invite') like '%@ana%Drift King%', 'it says who and which game');

-- Blocked either way: no invite.
insert into public.blocks (blocker_id, blocked_id) values (tests.id('ben'), tests.id('ana'));
select tests.login(tests.id('ana'));
select tests.eq((public.invite_to_game(tests.id('ben'), 'karts', 'ABCD'))->>'status', 'blocked', 'you can''t invite someone who blocked you');
select tests.login(tests.id('cat'));
select tests.eq((select count(*) from public.game_invites)::int, 0, 'other people can''t see your invites');

select tests.login(tests.id('newbie'));
select tests.eq((public.invite_to_game(tests.id('ben'), 'drift', '7QR7'))->>'status', 'unconfirmed', 'unconfirmed users can''t invite');

-- 30 an hour.
select tests.login(tests.id('cat'));
select public.invite_to_game(tests.id('ana'), 'drag', lpad(g::text, 4, '0')) from generate_series(1, 30) g;
select tests.eq((public.invite_to_game(tests.id('ana'), 'drag', 'ZZZZ'))->>'status', 'rate_limit', 'at most 30 invites an hour');

rollback;
