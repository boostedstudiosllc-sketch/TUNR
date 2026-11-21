-- Meet awards (127): hosts pick awards, people at the meet enter their car
-- and vote, nobody votes for their own car, results show when voting closes,
-- winners are told once.
begin;

select tests.user('host');
select tests.user('ana');
select tests.user('ben');
select tests.user('far');
select tests.user('rando');
select tests.logout();
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-0000000000a1', 'Show Night', tests.id('host'), now() - interval '30 minutes', now() + interval '2 hours', 'Lot', 33.80, -84.40),
  ('00000000-0000-0000-0000-0000000000a2', 'Next Week', tests.id('host'), now() + interval '7 days', now() + interval '7 days 3 hours', 'Lot', 33.80, -84.40);
insert into public.vehicles (id, owner_id, make, model) values
  ('00000000-0000-0000-0000-0000000000b1', tests.id('ana'), 'Honda', 'Civic'),
  ('00000000-0000-0000-0000-0000000000b2', tests.id('ben'), 'Toyota', 'Supra'),
  ('00000000-0000-0000-0000-0000000000b3', tests.id('rando'), 'Mazda', 'Miata');

-- ---------- hosts set the awards ----------
select tests.login(tests.id('rando'));
select tests.blocked_by_rls($$ insert into public.meet_awards (event_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Best Me') $$, 'only hosts add awards');
select tests.eq((public.meet_awards_view('00000000-0000-0000-0000-0000000000a1'))->>'phase', 'none', 'no awards: nothing to vote on');
select tests.login(tests.id('host'));
insert into public.meet_awards (event_id, name, emoji, preset, sort) values
  ('00000000-0000-0000-0000-0000000000a1', 'Best Build', '🏆', 'best_build', 1),
  ('00000000-0000-0000-0000-0000000000a1', 'Loudest Exhaust', '🔊', null, 2),
  ('00000000-0000-0000-0000-0000000000a2', 'Best Build', '🏆', 'best_build', 1);
select tests.fails($$ insert into public.meet_awards (event_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'best build') $$, 'duplicate', 'no two awards with the same name');
select tests.eq((select count(*) from public.award_presets)::int >= 10, true, 'a starter list of awards');
select tests.eq((public.meet_awards_view('00000000-0000-0000-0000-0000000000a2'))->>'phase', 'soon', 'voting hasn''t opened before the meet');

-- ---------- arriving ----------
select tests.login(tests.id('far'));
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', 34.50, -84.40, null))->>'status', 'too_far', 'you have to be at the meet');
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', null, null, null))->>'status', 'need_location', 'and share where you are');
select tests.login(tests.id('ana'));
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', 33.801, -84.401, '00000000-0000-0000-0000-0000000000b2'))->>'status', 'not_your_car', 'you can only enter your own car');
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', 33.801, -84.401, '00000000-0000-0000-0000-0000000000b1'))->>'status', 'ok', 'at the meet, you enter your car');
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a2', 33.801, -84.401, null))->>'status', 'not_open', 'not before voting opens');
select tests.login(tests.id('ben'));
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', 33.802, -84.399, '00000000-0000-0000-0000-0000000000b2'))->>'status', 'ok', 'a second car enters');
select tests.login(tests.id('rando'));
select tests.eq((public.enter_meet_awards('00000000-0000-0000-0000-0000000000a1', 33.80, -84.40, null))->>'status', 'ok', 'you can be here just to vote');

-- ---------- voting ----------
create temp table aw as select
  (select id from public.meet_awards where event_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Best Build') as build,
  (select id from public.meet_awards where event_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Loudest Exhaust') as loud;
grant select on aw to authenticated, anon;
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b3'))->>'status', 'not_entered', 'only cars entered at the meet');
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b1'))->>'status', 'ok', 'a fan votes');
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b2'))->>'status', 'ok', 'and can change the vote');
select tests.eq((select count(*) from public.meet_award_votes)::int, 1, 'one vote per award per person (you see only yours)');
select tests.login(tests.id('ana'));
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b1'))->>'status', 'own_car', 'nobody votes for their own car');
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b2'))->>'status', 'ok', 'ana votes for ben');
select tests.blocked_by_rls($$ insert into public.meet_award_votes (award_id, user_id, vehicle_id) values ((select loud from aw), auth.uid(), '00000000-0000-0000-0000-0000000000b2') $$, 'votes go through the function only');
select tests.eq((public.meet_awards_view('00000000-0000-0000-0000-0000000000a1'))->'awards'->0->>'votes', null, 'no peeking at the count while voting is open');
select tests.eq(jsonb_array_length((public.meet_awards_view('00000000-0000-0000-0000-0000000000a1'))->'cars'), 2, 'everyone sees the cars in the running');
select tests.login(tests.id('far'));
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b2'))->>'status', 'not_here', 'you have to be here to vote');
select tests.login(tests.id('host'));
select tests.eq(((public.meet_awards_view('00000000-0000-0000-0000-0000000000a1'))->'awards'->0->>'votes')::int, 2, 'hosts see the count live');

-- ---------- closing ----------
select tests.login(tests.id('rando'));
select tests.fails($$ select public.close_meet_awards('00000000-0000-0000-0000-0000000000a1') $$, 'hosts_only', 'only hosts close voting');
select tests.login(tests.id('host'));
select tests.eq((public.close_meet_awards('00000000-0000-0000-0000-0000000000a1'))->>'status', 'ok', 'a host closes it and the winners are announced');
select tests.eq((public.finish_meet_awards('00000000-0000-0000-0000-0000000000a1'))->>'status', 'already', 'winners are told only once');
select tests.fails($$ insert into public.meet_awards (event_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Late Award') $$, 'awards_closed', 'no new awards after voting closes');
select tests.login(tests.id('ana'));
select tests.eq((public.vote_meet_award((select build from aw), '00000000-0000-0000-0000-0000000000b2'))->>'status', 'closed', 'no voting after it closes');
select tests.eq((public.meet_awards_view('00000000-0000-0000-0000-0000000000a1'))->'awards'->0->'winners'->>0, '00000000-0000-0000-0000-0000000000b2', 'everyone sees who won');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('ben') and kind = 'meet_award' and title like '%You won Best Build%'), 'the winner is told');
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('rando') and kind = 'meet_award' and title like '%awards are in%'), 'voters are told the results are in');

rollback;
