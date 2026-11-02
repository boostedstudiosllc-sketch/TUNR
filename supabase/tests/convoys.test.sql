-- Convoys (115): drive together, see each other live. Positions are only
-- ever visible to members of a running convoy.
begin;

select tests.user('lead');
select tests.user('rider');
select tests.user('stranger');
select tests.user('blocked');
select tests.user('fresh', false); -- email not confirmed

-- ---------- starting and joining ----------
select tests.login(tests.id('fresh'));
select tests.eq((public.start_convoy('Nope'))->>'status', 'unconfirmed', 'confirm your email before starting a convoy');

select tests.login(tests.id('lead'));
create temp table cv as select (public.start_convoy('Sunday cruise')) as r;
grant select on cv to authenticated, anon;
select tests.eq((select r->>'status' from cv), 'ok', 'a confirmed member starts a convoy');
select tests.ok((select r->>'code' from cv) ~ '^[A-Z0-9]{6}$', 'it gets a 6-character code');
select tests.eq((select count(*) from public.convoy_members where convoy_id = (select (r->>'id')::uuid from cv))::int, 1, 'the leader is in it');

select tests.login(tests.id('rider'));
select tests.eq((public.join_convoy('ZZZZZZ'))->>'status', 'not_found', 'a wrong code finds nothing');
select tests.eq((public.join_convoy(lower((select r->>'code' from cv))))->>'status', 'ok', 'the code works, any case');
select tests.eq((public.join_convoy((select r->>'code' from cv)))->>'status', 'ok', 'joining twice is fine');

select tests.logout();
insert into public.blocks (blocker_id, blocked_id) values (tests.id('lead'), tests.id('blocked'));
select tests.login(tests.id('blocked'));
select tests.eq((public.join_convoy((select r->>'code' from cv)))->>'status', 'blocked', 'someone the leader blocked can''t join');

-- ---------- positions ----------
select tests.login(tests.id('rider'));
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 33.78, -84.39, 90, 42, 8))->>'status', 'ok', 'a member shares their position');
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 33.79, -84.39))->>'status', 'too_soon', 'one update every 2 seconds');
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 120, -84.39))->>'status', 'bad_position', 'nonsense coordinates are refused');

select tests.login(tests.id('lead'));
select tests.eq((select count(*) from public.convoy_positions where convoy_id = (select (r->>'id')::uuid from cv))::int, 1, 'the leader sees the rider on the map');
select tests.eq(jsonb_array_length((public.convoy_state((select (r->>'id')::uuid from cv)))->'members'), 2, 'convoy_state lists both members');
select tests.ok(((public.convoy_state((select (r->>'id')::uuid from cv)))->'members'->1->'pos'->>'lat')::float = 33.78, 'with the rider''s position');

select tests.login(tests.id('stranger'));
select tests.eq((select count(*) from public.convoy_positions)::int, 0, 'someone outside the convoy sees no positions');
select tests.eq((select count(*) from public.convoy_members)::int, 0, 'nor who''s in it');
select tests.eq((select count(*) from public.convoys)::int, 0, 'nor the convoy');
select tests.eq(public.convoy_state((select (r->>'id')::uuid from cv)), null, 'convoy_state is empty for them');
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 33.78, -84.39))->>'status', 'not_in_convoy', 'and they can''t put themselves on its map');
select tests.blocked_by_rls($$ insert into public.convoy_positions (convoy_id, user_id, lat, lng) values ((select (r->>'id')::uuid from cv), auth.uid(), 1, 1) $$, 'positions can''t be written directly');
select tests.login(null);
select tests.fails($$ select public.convoy_state((select (r->>'id')::uuid from cv)) $$, 'permission denied', 'signed out, nothing');

-- ---------- stop sharing, leave ----------
select tests.login(tests.id('rider'));
select public.stop_sharing((select (r->>'id')::uuid from cv));
select tests.eq((select count(*) from public.convoy_positions where user_id = tests.id('rider'))::int, 0, 'stop sharing deletes your position');

-- ---------- invites ----------
select tests.eq((public.invite_to_convoy(tests.id('stranger'), (select (r->>'id')::uuid from cv)))->>'status', 'ok', 'a member invites someone');
select tests.eq((public.invite_to_convoy(tests.id('stranger'), (select (r->>'id')::uuid from cv)))->>'status', 'already', 'once');
select tests.eq((public.invite_to_convoy(tests.id('lead'), (select (r->>'id')::uuid from cv)))->>'status', 'already_in', 'not people already in it');
select tests.eq((public.invite_to_convoy(tests.id('blocked'), (select (r->>'id')::uuid from cv)))->>'status', 'blocked', 'not people the leader blocked');
select tests.logout();
select tests.eq((select link from public.notifications where user_id = tests.id('stranger') and kind = 'convoy_invite'), 'convoy:' || (select r->>'code' from cv), 'the invite alert opens the convoy');
select tests.login(tests.id('stranger'));
select tests.eq((public.invite_to_convoy(tests.id('rider'), (select (r->>'id')::uuid from cv)))->>'status', 'not_in_convoy', 'only members invite');

-- ---------- the leader ----------
select tests.login(tests.id('rider'));
select tests.fails($$ select public.end_convoy((select (r->>'id')::uuid from cv)) $$, 'convoy_leader_only', 'only the leader ends a convoy');
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 33.78, -84.39))->>'status', 'ok', 'sharing again');
select tests.login(tests.id('lead'));
select public.leave_convoy((select (r->>'id')::uuid from cv));
select tests.logout();
select tests.eq((select leader_id from public.convoys where id = (select (r->>'id')::uuid from cv)), tests.id('rider'), 'when the leader leaves, the next person leads');
select tests.login(tests.id('rider'));
select public.end_convoy((select (r->>'id')::uuid from cv));
select tests.eq((select count(*) from public.convoy_positions)::int, 0, 'ending it wipes every position');
select tests.eq((public.join_convoy((select r->>'code' from cv)))->>'status', 'not_found', 'and nobody can join an ended convoy');
select tests.eq((public.share_position((select (r->>'id')::uuid from cv), 33.78, -84.39))->>'status', 'not_in_convoy', 'or share into it');

-- ---------- from a linkup ----------
select tests.logout();
insert into public.linkup_agreements (user_id) values (tests.id('lead'));
insert into public.linkups (id, user_id, kind, visibility, place, lat, lng, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000c1', tests.id('lead'), 'cruise', 'private', 'Stone Mountain lot', 33.8, -84.1, now(), now() + interval '2 hours');
select tests.login(tests.id('stranger'));
select tests.eq((public.start_convoy(null, '00000000-0000-0000-0000-0000000000c1'))->>'status', 'not_in_linkup', 'only people in the linkup start its convoy');
select tests.login(tests.id('lead'));
create temp table lc as select (public.start_convoy(null, '00000000-0000-0000-0000-0000000000c1')) as r;
grant select on lc to authenticated, anon;
select tests.eq((select r->>'status' from lc), 'ok', 'the host starts the linkup''s convoy');
select tests.eq((select name from public.convoys where id = (select (r->>'id')::uuid from lc)), 'Stone Mountain lot', 'named after the spot');
select tests.login(tests.id('stranger'));
select tests.eq((public.join_convoy((select r->>'code' from lc)))->>'status', 'not_in_linkup', 'a private linkup''s convoy is for the people in it');
select tests.logout();
insert into public.linkup_members (linkup_id, user_id, status) values ('00000000-0000-0000-0000-0000000000c1', tests.id('rider'), 'in');
select tests.login(tests.id('rider'));
select tests.eq((public.start_convoy(null, '00000000-0000-0000-0000-0000000000c1'))->>'id', (select r->>'id' from lc), 'a second start from the linkup joins the same convoy');

rollback;
