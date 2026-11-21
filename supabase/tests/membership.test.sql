-- TUNR+ membership (122): Stripe (service key) turns it on and off, admins
-- give comps, nobody makes themselves a member, billing details stay private,
-- members get the invite unlocks, and it ends with the paid period.
begin;

select tests.user('payer');
select tests.user('other');
select tests.user('comped');
select tests.user('lapsed');
select tests.user('fresh', false);
select tests.user('boss', true, true);

-- ---------- joining ----------
select tests.login(tests.id('payer'));
select tests.eq((public.my_membership())->>'member', 'false', 'not a member to start');
select tests.eq(jsonb_array_length((public.my_membership())->'plans'), 2, 'monthly and yearly prices are shown');
select tests.eq((public.start_membership('lifetime'))->>'status', 'bad_plan', 'only real plans');
select tests.eq(((public.start_membership('month'))->>'price_cents')::int, 499, 'the price comes from the database');
select tests.login(tests.id('fresh'));
select tests.eq((public.start_membership('month'))->>'status', 'unconfirmed', 'confirm your email first');
select tests.login(null);
select tests.fails($$ select public.start_membership('month') $$, 'permission denied', 'guests can''t start one');
select tests.eq((public.my_membership())->>'member', 'false', 'guests see prices, not a membership');

-- Nobody pays themselves in.
select tests.login(tests.id('payer'));
do $$ begin update public.profiles set is_member = true where id = auth.uid(); exception when others then null; end $$;
select tests.eq(public.is_member(), false, 'you can''t make yourself a member');
select tests.blocked_by_rls($$ insert into public.memberships (user_id, via, status) values (auth.uid(), 'admin', 'active') $$, 'or write a membership row');
select tests.fails($$ select public.sync_membership(auth.uid(), 'active', 'month', null, null, 'cus_x', 'sub_x', now()) $$, 'permission denied', 'or call the Stripe sync');
select tests.fails($$ select public.admin_set_member('payer', true, null) $$, 'admins_only', 'or give yourself a comp');

-- ---------- Stripe ----------
select tests.logout();
set local role service_role;
create temp table s1 as select public.sync_membership(tests_id, 'active', 'month', null, null, 'cus_payer', 'sub_1', now() - interval '1 minute') as r
  from (select id as tests_id from public.profiles where username = 'payer') x;
reset role;
select tests.eq((select r->>'member' from s1), 'true', 'a finished checkout makes you a member');
select tests.login(tests.id('payer'));
select tests.eq(public.is_member(), true, 'and every perk sees it');
select tests.eq((public.my_membership())->>'can_manage', 'true', 'and you can manage billing');
select tests.ok(((public.my_membership())->>'active_until')::timestamptz between now() + interval '34 days' and now() + interval '36 days', 'a month and a few days until Stripe sends the exact date');
select tests.eq((public.start_membership('year'))->>'status', 'already', 'no paying twice');
select tests.eq((select count(*) from public.point_ledger where user_id = auth.uid() and reason = 'member_bonus')::int, 0, 'no points for paying (points buy scratch cards)');
-- Unlocks without inviting anyone.
select tests.eq((public.my_invites())->'unlocked'->>'flair', 'true', 'members get profile colours');
update public.profiles set profile_color = '#A855F7' where id = auth.uid();
select tests.eq((select profile_color from public.profiles where id = auth.uid()), '#A855F7', 'and can set one');
insert into public.vehicles (owner_id, make, model) values (auth.uid(), 'Honda', 'Civic');
insert into public.vehicles (owner_id, make, model) values (auth.uid(), 'Toyota', 'Supra');
select tests.eq((select count(*) from public.vehicles where owner_id = auth.uid())::int, 2, 'and a second car');
insert into public.clubs (slug, name) values ('payer-crew', 'Payer Crew');
select tests.eq((select count(*) from public.clubs where created_by = auth.uid())::int, 1, 'and can start a club');

-- Billing details are private.
select tests.login(tests.id('other'));
select tests.eq((select count(*) from public.memberships)::int, 0, 'nobody sees anyone else''s membership');
select tests.eq((public.my_invites())->'unlocked'->>'flair', 'false', 'non-members still invite to unlock');
insert into public.vehicles (owner_id, make, model) values (auth.uid(), 'Mazda', 'Miata');
select tests.fails($$ insert into public.vehicles (owner_id, make, model) values (auth.uid(), 'Mazda', 'RX-7') $$, 'invite_to_unlock_cars', 'non-members get one car');
select tests.login(tests.id('boss'));
select tests.eq((select stripe_customer from public.memberships where user_id = tests.id('payer')), 'cus_payer', 'admins see it');

-- Renewal date from Stripe; an older message can't undo a newer one.
select tests.logout();
set local role service_role;
create temp table s2 as select
  public.sync_membership(x.id, 'active', 'month', now() + interval '20 days', now() + interval '20 days', 'cus_payer', 'sub_1', now()) as cancel,
  public.sync_membership(x.id, 'canceled', 'month', null, null, 'cus_payer', 'sub_1', now() - interval '30 seconds') as old,
  public.sync_membership(x.id, 'canceled', 'month', null, null, 'cus_payer', 'sub_0', now() + interval '1 second') as other
  from public.profiles x where x.username = 'payer';
reset role;
select tests.eq((select old->>'status' from s2), 'stale', 'an out-of-order Stripe message is ignored');
select tests.eq((select other->>'status' from s2), 'other_subscription', 'an old subscription ending doesn''t end the new one');
select tests.login(tests.id('payer'));
select tests.ok(((public.my_membership())->>'cancel_at') is not null, 'a cancelled plan shows when it ends');
select tests.eq((public.my_membership())->>'member', 'true', 'and runs until then');
select tests.logout();
set local role service_role;
create temp table s3 as select public.sync_membership(x.id, 'canceled', 'month', null, null, 'cus_payer', 'sub_1', now() + interval '2 seconds') as r
  from public.profiles x where x.username = 'payer';
reset role;
select tests.login(tests.id('payer'));
select tests.eq(public.is_member(), false, 'when Stripe ends it, membership ends');
select tests.eq((select is_member from public.profiles where id = auth.uid()), false, 'and the public flag goes off');

-- A lapsed card ends it even if Stripe's message never comes.
select tests.logout();
set local role service_role;
create temp table s4 as select public.sync_membership(x.id, 'active', 'month', now() + interval '10 days', null, 'cus_l', 'sub_l', now()) as r
  from public.profiles x where x.username = 'lapsed';
reset role;
update public.memberships set active_until = now() - interval '1 hour' where user_id = tests.id('lapsed');
select tests.login(tests.id('lapsed'));
select tests.eq(public.is_member(), false, 'membership ends with the paid period');
select tests.eq((public.my_invites())->'unlocked'->>'cars', 'false', 'and so do the unlocks');

-- ---------- admins ----------
select tests.login(tests.id('boss'));
select tests.eq((public.admin_set_member('@Comped', true, 30))->>'status', 'ok', 'admins give a comp by username');
select tests.eq((public.admin_set_member('nobody_here', true, null))->>'status', 'not_found', 'unknown usernames are refused');
select tests.eq((public.admin_set_member('payer', true, 0))->>'status', 'bad_days', 'days must make sense');
select tests.eq(((public.membership_stats())->>'free')::int, 1, 'the stats count comps');
select tests.ok((select count(*) from public.admin_log where target = 'memberships') > 0, 'comps go in the admin log');
select tests.login(tests.id('comped'));
select tests.eq(public.is_member(), true, 'a comp makes you a member');
do $$ begin update public.profiles set is_member = false where id = auth.uid(); exception when others then null; end $$;
select tests.eq((select is_member from public.profiles where id = auth.uid()), true, 'members can''t flip the flag either');
select tests.login(tests.id('boss'));
select tests.eq((public.admin_set_member('comped', false, null))->>'status', 'ok', 'and take it away');
select tests.login(tests.id('comped'));
select tests.eq(public.is_member(), false, 'then it''s gone');
-- After an admin action, the guard is back on for the rest of the request.
do $$ begin update public.profiles set is_member = true where id = auth.uid(); exception when others then null; end $$;
select tests.eq(public.is_member(), false, 'and can''t be taken back by the member');

select tests.login(tests.id('other'));
select tests.fails($$ select public.membership_stats() $$, 'admins_only', 'stats are for admins');
update public.membership_plans set price_cents = 100 where id = 'month';
select tests.eq((select price_cents from public.membership_plans where id = 'month'), 499, 'members can''t change prices');

-- ---------- security audit ----------
-- A renewal that fails (card frozen or removed): Stripe moves the subscription
-- to past_due and has already moved current_period_end to the end of the new,
-- UNPAID month. 122 says past_due counts only "until the paid period ends";
-- a short grace is fine, a whole free month (or forever, if Stripe is set to
-- leave failed subscriptions past_due) isn't.
select tests.logout();
select tests.user('pastdue');
set local role service_role;
create temp table a1 as select public.sync_membership(x.id, 'active', 'month', now() + interval '1 hour', null, 'cus_pd', 'sub_pd', now() - interval '1 minute') as r
  from public.profiles x where x.username = 'pastdue';
create temp table a2 as select public.sync_membership(x.id, 'past_due', 'month', now() + interval '31 days', null, 'cus_pd', 'sub_pd', now()) as r
  from public.profiles x where x.username = 'pastdue';
reset role;
select tests.ok((select active_until from public.memberships where user_id = tests.id('pastdue')) <= now() + interval '1 hour' + interval '7 days',
  'a failed renewal (past_due) doesn''t give the unpaid month free, at most a week''s grace');

-- Admin comps and take-backs are only traceable if the log says whose
-- membership it was. memberships has no "id" column, so row_id is empty, and
-- an UPDATE only lists the changed columns (never user_id).
select tests.logout();
select tests.ok(not exists (select 1 from public.admin_log
                             where target = 'memberships' and coalesce(row_id, changes->>'user_id') is null),
  'every admin change to a membership says whose membership it was');

-- (123) A late "incomplete" doesn't switch a new payer off; an old card
-- subscription ending doesn't remove a free membership.
select tests.logout();
select tests.user('newpayer');
set local role service_role;
create temp table a3 as select
  public.sync_membership(x.id, 'active', 'month', now() + interval '30 days', null, 'cus_np', 'sub_np', now()) as a,
  public.sync_membership(x.id, 'incomplete', 'month', now() + interval '30 days', null, 'cus_np', 'sub_np', now()) as b
  from public.profiles x where x.username = 'newpayer';
reset role;
select tests.eq((select b->>'status' from a3), 'ignored', 'a late "incomplete" is ignored');
select tests.login(tests.id('newpayer'));
select tests.eq(public.is_member(), true, 'and the new payer stays a member');
-- Their card plan was later swapped for a free membership from TUNR.
select tests.logout();
update public.memberships set via = 'admin', status = 'active', active_until = null where user_id = tests.id('newpayer');
set local role service_role;
create temp table a4 as select public.sync_membership(x.id, 'canceled', 'month', null, null, 'cus_np', 'sub_np', now() + interval '5 seconds') as r
  from public.profiles x where x.username = 'newpayer';
reset role;
select tests.eq((select r->>'status' from a4), 'comp_kept', 'an old subscription ending keeps a free membership');
select tests.login(tests.id('newpayer'));
select tests.eq(public.is_member(), true, 'they''re still a member');

rollback;
