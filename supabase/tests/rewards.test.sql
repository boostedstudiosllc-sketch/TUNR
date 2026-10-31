-- Rewards (045 onward, mailed since 110): paying with points, the address
-- for mailed ones, and admins shipping or cancelling.
begin;

select tests.user('ana');
select tests.user('boss', true, true);
update public.profiles set all_access = true where id = tests.id('ana'); -- skip the account-age and check-in rules
insert into public.point_ledger (user_id, delta, reason, note) values (tests.id('ana'), 1000, 'admin_adjust', 'test');

create temp table r as select id, title, cost, ships, sizes from public.rewards where title in ('Boosted Studios hat', 'Boosted Studios T-shirt', 'Scan my build sticker');
grant select on r to authenticated;
select tests.ok((select bool_and(ships) from r where title <> 'Scan my build sticker'), 'the hat and shirt are mailed');
select tests.ok((select bool_and(description !~ '\$') from public.rewards where title like 'Boosted Studios%'), 'no dollar prices in the descriptions');
select tests.ok(not (select active from public.rewards where title = 'Scan my build sticker'), 'the 10-point sticker is retired (mailed sticker orders instead)');
select tests.ok((select points_price from public.sticker_settings) >= 50, 'a mailed sticker costs enough points to cover printing and postage');

select tests.login(tests.id('ana'));
select tests.eq((public.redeem_reward((select id from r where title = 'Boosted Studios hat')))->>'status', 'bad_address', 'a mailed reward needs an address');
select tests.eq((public.redeem_reward((select id from r where title = 'Boosted Studios hat'), '{"name":"Ana","line1":"1 Main St","city":"Atlanta","state":"ga","zip":"3030"}'))->>'status', 'bad_address', 'a bad ZIP is refused');
select tests.eq((public.redeem_reward((select id from r where title = 'Boosted Studios T-shirt'), '{"name":"Ana","line1":"1 Main St","city":"Atlanta","state":"GA","zip":"30303"}'))->>'status', 'bad_size', 'the shirt needs a size');
select tests.eq((public.redeem_reward((select id from r where title = 'Boosted Studios T-shirt'), '{"name":"Ana","line1":"1 Main St","city":"Atlanta","state":"ga","zip":"30303","size":"L"}'))->>'status', 'ok', 'with an address and size it goes through');
select tests.eq((select state || ' ' || size from public.reward_redemptions), 'GA L', 'the address and size are saved');
select tests.blocked_by_rls($$ update public.reward_redemptions set status = 'fulfilled' $$, 'members can''t mark their own reward shipped');
select tests.fails($$ select public.decide_redemption((select id from public.reward_redemptions), 'fulfilled', 'X1') $$, 'admins_only', 'only admins ship rewards');

select tests.login(tests.id('boss'));
select tests.eq((select line1 from public.redemption_queue('pending')), '1 Main St', 'admins see where to mail it');
select public.decide_redemption((select id from public.reward_redemptions), 'fulfilled', '9400 1000 0000 0000 0000 00');
select tests.logout();
select tests.eq((select tracking from public.reward_redemptions), '9400 1000 0000 0000 0000 00', 'the tracking number is kept');
select tests.ok((select title from public.notifications where user_id = tests.id('ana') and kind = 'reward') like '%shipped%', 'the member is told it shipped');
select tests.ok((select body from public.notifications where user_id = tests.id('ana') and kind = 'reward') like '%9400%', 'with the tracking number');

rollback;
