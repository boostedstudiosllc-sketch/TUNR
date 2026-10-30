-- Points (045 onward): nothing can be paid twice, and nobody can write
-- their own points. Covers the weekly spin, setup steps, host badges,
-- Guess the Car, photo of the week and locked garage parts.
begin;

select tests.user('ana');
select tests.user('ben');
select tests.user('newbie', false);
select tests.user('boss', true, true);

-- ---------- the ledger itself ----------
select tests.login(tests.id('ana'));
select tests.blocked_by_rls(format($$ insert into public.point_ledger (user_id, delta, reason) values (%L, 1000, 'admin_adjust') $$, tests.id('ana')),
  'you can''t give yourself points');
select tests.blocked_by_rls($$ update public.points_settings set photo_points = 9999 $$, 'only admins change point rates');

-- ---------- weekly spin ----------
select tests.eq((public.spin_wheel())->>'status', 'ok', 'the first spin of the week pays');
select tests.eq((public.spin_wheel())->>'status', 'already', 'a second spin that week doesn''t');
select tests.eq((select count(*) from public.point_ledger where reason = 'spin_bonus')::int, 1, 'one spin row in the ledger');
select tests.login(tests.id('newbie'));
select tests.eq((public.spin_wheel())->>'status', 'unconfirmed', 'unconfirmed users can''t spin');

-- ---------- setup steps ----------
select tests.logout();
update public.profiles set username = 'ana', bio = 'Boosted', avatar_url = 'http://localhost:54321/storage/v1/object/public/avatars/' || tests.id('ana') || '/a.jpg'
 where id = tests.id('ana');
insert into public.vehicles (owner_id, make, model) values (tests.id('ana'), 'Honda', 'Civic');
select tests.login(tests.id('ana'));
select tests.eq(((public.claim_starter_points())->>'added')::int, 15, 'photo (5) and car (10) pay; username and bio pay nothing');
select tests.eq(((public.claim_starter_points())->>'added')::int, 0, 'setup points are paid once');

-- ---------- host badges ----------
select tests.logout();
insert into public.events (title, created_by, start_at) select 'Meet ' || g, tests.id('ben'), now() - g * interval '1 day' from generate_series(1, 5) g;
select tests.login(tests.id('ben'));
select tests.eq(((public.claim_host_badges())->>'added')::int, 10, '5 meets hosted pays 10');
select tests.eq(((public.claim_host_badges())->>'added')::int, 0, 'the host badge pays once');

-- ---------- Guess the Car ----------
select tests.logout();
insert into public.car_puzzles (photo_url, make, model) values
  ('https://upload.wikimedia.org/a.jpg', 'Nissan', 'Skyline GT-R'),
  ('https://upload.wikimedia.org/b.jpg', 'Toyota', 'Supra'),
  ('https://upload.wikimedia.org/c.jpg', 'Mazda', 'RX-7');
select tests.login(tests.id('ana'));
select tests.eq((select count(*) from public.car_puzzles)::int, 0, 'players can''t read the answer list');
select tests.login(null);
select tests.eq((select count(*) from public.car_puzzles)::int, 0, 'nor can signed-out visitors');
select tests.fails($$ select * from public.car_pool() $$, 'permission denied', 'the pool (with answers) isn''t callable from the app');
select tests.ok((public.car_guess_today()) ? 'photo_url' and not (public.car_guess_today()::text ilike '%Skyline%' and public.car_guess_today()::text ilike '%"answer"%'),
  'today''s car comes without its answer');
select tests.ok(not exists (
    select 1 from generate_series(1, 40)
     where public.car_guess_practice()->>'photo_url' = public.car_guess_today()->>'photo_url'),
  'practice never shows today''s car (so its answer can''t be looked up)');
select tests.login(tests.id('ana'));
create temp table pick as select (select x from jsonb_array_elements_text(public.car_guess_today()->'options') x limit 1) choice;
select tests.eq((public.guess_car((select choice from pick), 3))->>'status', 'ok', 'a player can guess today');
select tests.eq((public.guess_car((select choice from pick), 3))->>'status', 'already', 'only one guess a day');
select tests.ok((select count(*) from public.point_ledger where reason = 'guess_bonus') <= 1, 'at most one Guess the Car payout a day');
select tests.blocked_by_rls(format($$ insert into public.car_guesses (user_id, day, puzzle, choice, correct) values (%L, current_date + 1, 'x', 'x', true) $$, tests.id('ana')),
  'guesses can''t be written directly');

-- ---------- photo of the week ----------
select tests.logout();
insert into public.events (id, title, created_by, start_at) values ('00000000-0000-0000-0000-0000000000e1', 'Photo meet', tests.id('boss'), now());
insert into public.meet_photos (id, event_id, user_id, photo_url) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', tests.id('ana'), 'https://x/a.jpg'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', tests.id('ben'), 'https://x/b.jpg');
select tests.login(tests.id('ana'));
select tests.eq((public.vote_photo('00000000-0000-0000-0000-0000000000a1'))->>'status', 'own_photo', 'you can''t vote for your own photo');
select tests.eq((public.vote_photo('00000000-0000-0000-0000-0000000000b1'))->>'status', 'ok', 'you can vote for someone else''s');
select tests.eq((public.vote_photo('00000000-0000-0000-0000-0000000000b1'))->>'status', 'ok', 'voting again just keeps your one vote');
select tests.logout();
select tests.eq((select count(*) from public.photo_votes where user_id = tests.id('ana'))::int, 1, 'one vote per person per week');
select tests.login(tests.id('ana'));
select tests.blocked_by_rls(format($$ insert into public.photo_votes (user_id, week, photo_id) values (%L, current_date - 7, '00000000-0000-0000-0000-0000000000b1') $$, tests.id('ana')),
  'votes can''t be written directly');
select tests.login(tests.id('newbie'));
select tests.eq((public.vote_photo('00000000-0000-0000-0000-0000000000b1'))->>'status', 'unconfirmed', 'unconfirmed users can''t vote');

-- ---------- garage parts ----------
select tests.login(tests.id('ana'));
select tests.fails($$ update public.vehicles set game_rims = 'gold' $$, 'locked_part', 'locked rims can''t be put on without unlocking them');
select tests.fails($$ update public.vehicles set game_glow = 'blue' $$, 'locked_part', 'nor can underglow');

rollback;
