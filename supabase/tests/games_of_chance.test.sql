-- Scratch cards and Taco Tuesday (105).
begin;

select tests.user('ana');
select tests.user('ben');
select tests.user('broke');
select tests.user('newbie', false);
select tests.user('boss', true, true);

-- Some points to play with (claimed, so they count).
insert into public.point_ledger (user_id, delta, reason, note) values (tests.id('ana'), 100, 'admin_adjust', 'test');

-- ---------- scratch cards ----------
select tests.login(tests.id('ana'));
select tests.eq((select count(*) from public.scratch_cards)::int, 0, 'players can''t read the odds table');
select tests.eq(jsonb_array_length((public.scratch_shop())->'cards'), 3, 'the shop lists three cards');
select tests.ok(not ((public.scratch_shop())->'cards'->0 ? 'weights') and ((public.scratch_shop())->'cards'->0 ? 'top'), 'the shop sends each card''s top prize, not its odds');
select tests.logout();
select tests.ok((select bool_and((select sum(w) from unnest(weights) w) = 1000) from public.scratch_cards), 'each card''s odds add up to 1,000');
select tests.login(tests.id('ana'));
create temp table play as select public.buy_scratch('turbo') r;
select tests.eq((select r->>'status' from play), 'ok', 'a card can be bought');
select tests.ok((select (r->>'prize')::int between 1 and 10 from play), 'a Turbo card pays 1-10');
select tests.eq((select count(*) from public.scratch_plays)::int, 1, 'the play is on record');
select tests.logout();
select tests.eq(public.points_balance(tests.id('ana')), 100 - 5 + (select (r->>'prize')::int from play), 'cost and prize both land in the balance');
select tests.login(tests.id('ana'));
select tests.blocked_by_rls(format($$ insert into public.scratch_plays (user_id, card_id, cost, prize) values (%L, 'turbo', 5, 10) $$, tests.id('ana')),
  'plays can''t be written directly');
select tests.blocked_by_rls($$ update public.scratch_cards set weights = '{0,0,0,0,0,0,0,0,0,1000}' where id = 'turbo' $$,
  'players can''t change the odds');
select tests.eq((public.buy_scratch('nope'))->>'status', 'not_found', 'unknown cards are refused');

-- The cheapest card is sold out one day a week (whichever day that is).
select tests.ok(public.scratch_out_day('2026-10-26') between '2026-10-26' and '2026-11-01', 'the sold-out day falls inside the week');
select tests.eq((public.buy_scratch('tuneup'))->>'status',
  case when public.scratch_out_day() = public.atl_today() then 'sold_out' else 'ok' end, 'the Tune-Up card is sold out only on its day');

-- Ten a day.
select public.buy_scratch('supercharged') from generate_series(1, 12);
select tests.eq((select count(*) from public.scratch_plays where (created_at at time zone 'America/New_York')::date = public.atl_today())::int, 10,
  'no more than 10 cards a day');
select tests.eq((public.buy_scratch('turbo'))->>'status', 'daily_limit', 'the 11th is refused');

select tests.login(tests.id('broke'));
select tests.eq((public.buy_scratch('turbo'))->>'status', 'not_enough', 'you need the points to play');
-- One free card a week, no points needed: always a Tune-Up.
create temp table freebie as select public.buy_scratch('supercharged', true) r;
select tests.eq((select r->>'status' from freebie), 'ok', 'the weekly free card needs no points');
select tests.ok((select (r->>'prize')::int between 1 and 5 and (r->>'cost')::int = 0 from freebie), 'it''s a Tune-Up (1-5), whatever card was asked for');
select tests.eq((public.buy_scratch('tuneup', true))->>'status', 'free_used', 'only one free card a week');
select tests.eq(((public.scratch_shop())->>'free_used')::boolean, true, 'the shop shows it''s been used');
select tests.logout();
select tests.eq(public.points_balance(tests.id('broke')), (select (r->>'prize')::int from freebie), 'the free win is in the balance, nothing spent');
select tests.eq((select count(*) from public.point_ledger where user_id = tests.id('broke') and reason = 'scratch_buy')::int, 0, 'no charge for the free card');
select tests.login(tests.id('broke'));
select tests.login(tests.id('newbie'));
select tests.eq((public.buy_scratch('turbo'))->>'status', 'unconfirmed', 'unconfirmed users can''t play');
select tests.login(tests.id('boss'));
update public.points_settings set scratch_on = false;
select tests.login(tests.id('ben'));
select tests.eq((public.buy_scratch('turbo'))->>'status', 'off', 'admins can switch scratch cards off');
select tests.logout();
update public.points_settings set scratch_on = true;

-- The odds really are the owner's: 4,000 Tune-Up plays, 1 or 2 about 85%.
create temp table rolls as
select (select prize from (select c.prizes[i] prize, sum(c.weights[i]) over (order by i) - c.weights[i] lo, sum(c.weights[i]) over (order by i) hi
                              from public.scratch_cards c, generate_subscripts(c.prizes, 1) i where c.id = 'tuneup') t
         where r >= lo and r < hi) prize
  from (select floor(random() * 1000) r from generate_series(1, 4000)) g;
select tests.ok((select avg((prize <= 2)::int) between 0.8 and 0.9 from rolls), 'Tune-Up: a 1 or 2 about 85% of the time');

-- ---------- Taco Tuesday ----------
select tests.login(tests.id('ana'));
select tests.blocked_by_rls($$ insert into public.taco_picks (day, question, line, taco_line, closes_at) values (current_date, 'Will it rain?', 3.5, 2.5, now() + interval '1 hour') $$,
  'only admins set the pick');
select tests.login(tests.id('boss'));
insert into public.taco_picks (day, question, line, taco_line, closes_at)
values (public.atl_today(), 'How many cars at the test meet?', 40.5, 29.5, now() + interval '1 hour');
select tests.login(tests.id('ana'));
select tests.eq((public.taco_pick('more'))->>'status', 'ok', 'a player can pick MORE');
select tests.eq((public.taco_pick('less'))->>'status', 'already', 'the pick is locked once made');
select tests.blocked_by_rls(format($$ insert into public.taco_entries (pick_id, user_id, choice) select id, %L, 'less' from public.taco_picks $$, tests.id('ben')),
  'picks can''t be written directly');
select tests.login(tests.id('ben'));
select tests.eq((public.taco_pick('less'))->>'status', 'ok', 'another player picks LESS');
select tests.eq((public.taco_today())->'pick'->>'my_choice', 'less', 'you see your own pick');
select tests.login(tests.id('newbie'));
select tests.eq((public.taco_pick('more'))->>'status', 'unconfirmed', 'unconfirmed users can''t pick');

-- The pick closes and the admin enters 31: MORE wins.
select tests.logout();
update public.taco_picks set closes_at = now() - interval '1 minute', result = 31;
select tests.login(tests.id('ana'));
select tests.eq((public.taco_today())->'pick'->>'outcome', 'won', 'MORE won');
select tests.eq((public.taco_pick('less'))->>'status', 'closed', 'no picks after it closes');
select tests.logout();
select tests.eq((select delta from public.point_ledger where user_id = tests.id('ana') and reason = 'taco_bonus'), 5, 'the winner gets 5 points');
select tests.eq((select count(*) from public.point_ledger where user_id = tests.id('ben') and reason = 'taco_bonus')::int, 0, 'the loser gets none');
select public.taco_today();
select tests.eq((select count(*) from public.point_ledger where reason = 'taco_bonus')::int, 1, 'settling again doesn''t pay twice');
select tests.eq((select count(*) from public.notifications where user_id = tests.id('ana') and kind = 'taco_win')::int, 1, 'the winner is told');

-- The automatic Tuesday pick: the biggest meet in the next week.
select tests.logout();
delete from public.taco_picks;
insert into public.events (id, title, created_by, start_at) values
  ('00000000-0000-0000-0000-0000000000e5', 'Big Saturday Meet', tests.id('boss'), now() + interval '4 days'),
  ('00000000-0000-0000-0000-0000000000e6', 'Small Meet', tests.id('boss'), now() + interval '3 days');
insert into public.rsvps (user_id, event_id, status) values
  (tests.id('ana'), '00000000-0000-0000-0000-0000000000e5', 'going'),
  (tests.id('ben'), '00000000-0000-0000-0000-0000000000e5', 'going');
select public.make_taco_pick('2026-11-03');  -- a Tuesday
select public.make_taco_pick('2026-11-04');  -- a Wednesday: nothing
select tests.eq((select count(*) from public.taco_picks)::int, 1, 'one pick, made only on a Tuesday');
select tests.eq((select event_id from public.taco_picks), '00000000-0000-0000-0000-0000000000e5'::uuid, 'on the meet with the most going');
select tests.ok((select taco_line < line from public.taco_picks), 'the taco line is lower than the usual line');
select tests.ok((select taco_line % 1 = 0.5 from public.taco_picks), 'half-point lines, so there are no ties');
-- It settles from the going count once the meet starts.
insert into public.taco_entries (pick_id, user_id, choice) select id, tests.id('ana'), 'less' from public.taco_picks;
update public.rsvps set created_at = now() - interval '2 days'; -- (now() is the same all through a test)
update public.events set start_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000000e5';
update public.taco_picks set closes_at = now() - interval '2 hours';
select public.settle_taco_picks();
select tests.eq((select result from public.taco_picks), 2::numeric, 'the result is how many were going at the start');
select tests.ok((select settled_at is not null from public.taco_picks), 'and the pick is settled');

rollback;
