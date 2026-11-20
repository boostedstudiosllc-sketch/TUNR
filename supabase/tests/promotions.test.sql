-- Promoted meets (120): hosts request, Stripe (service key) or an admin turns
-- it on, everyone sees what's promoted, prices come from the database.
begin;

select tests.user('host');
select tests.user('rival');
select tests.user('near');
select tests.user('far');
select tests.user('quiet');
select tests.user('boss', true, true);
select tests.user('fresh', false);

select tests.logout();
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng) values
  ('00000000-0000-0000-0000-0000000000f1', 'Lenox Cars & Coffee', tests.id('host'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Lenox Square', 33.846, -84.362),
  ('00000000-0000-0000-0000-0000000000f2', 'Old meet', tests.id('host'), now() - interval '2 days', now() - interval '2 days' + interval '3 hours', 'Somewhere', 33.8, -84.3);
insert into public.alert_settings (user_id, lat, lng, radius_miles) values
  (tests.id('near'), 33.80, -84.39, 25),
  (tests.id('far'), 32.08, -81.09, 25),   -- Savannah
  (tests.id('quiet'), 33.80, -84.39, 25);
update public.alert_settings set promoted = false where user_id = tests.id('quiet');

-- ---------- asking ----------
select tests.login(tests.id('rival'));
select tests.eq((public.request_promotion('00000000-0000-0000-0000-0000000000f1', 'featured'))->>'status', 'not_host', 'only the meet''s hosts can promote it');
select tests.login(tests.id('host'));
select tests.eq((public.request_promotion('00000000-0000-0000-0000-0000000000f2', 'featured'))->>'status', 'meet_over', 'not a meet that''s over');
select tests.eq((public.request_promotion('00000000-0000-0000-0000-0000000000f1', 'gold'))->>'status', 'bad_package', 'only real packages');
create temp table req as select public.request_promotion('00000000-0000-0000-0000-0000000000f1', 'spotlight') as r;
grant select on req to authenticated, anon, service_role;
select tests.eq((select r->>'status' from req), 'ok', 'the host asks for a Spotlight');
select tests.eq((select (r->>'amount_cents')::int from req), 2900, 'at the database''s price');
select tests.eq((select status from public.meet_promotions where id = (select (r->>'id')::uuid from req)), 'pending', 'waiting for payment');
select tests.eq((select count(*) from public.promoted_meets())::int, 0, 'not promoted until it''s paid');
select tests.blocked_by_rls($$ insert into public.meet_promotions (event_id, package, status) values ('00000000-0000-0000-0000-0000000000f1', 'featured', 'active') $$, 'nobody writes a promotion directly');
select tests.fails($$ select public.activate_promotion((select (r->>'id')::uuid from req), 'cs_fake', 2900) $$, 'permission denied', 'a host can''t mark it paid');
select tests.login(tests.id('fresh'));
select tests.eq((public.request_promotion('00000000-0000-0000-0000-0000000000f1', 'featured'))->>'status', 'unconfirmed', 'confirm your email first');

-- ---------- paying (as Stripe's webhook, with the service key) ----------
select tests.logout();
set local role service_role;
create temp table paid (n int, r jsonb);
insert into paid select 1, public.activate_promotion((select (r->>'id')::uuid from req), 'cs_test_1', 100);
insert into paid select 2, public.activate_promotion((select (r->>'id')::uuid from req), 'cs_test_1', 2900);
insert into paid select 3, public.activate_promotion((select (r->>'id')::uuid from req), 'cs_test_1', 2900);
reset role;
select tests.eq((select r->>'status' from paid where n = 1), 'underpaid', 'paying less than the price doesn''t count');
select tests.eq((select r->>'status' from paid where n = 2), 'ok', 'paid in full turns it on');
select tests.eq((select r->>'status' from paid where n = 3), 'already', 'a repeated webhook does nothing');
select tests.logout();
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('near'))::int, 1, 'Spotlight alerts a member nearby, once');
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('far'))::int, 0, 'not someone in Savannah');
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('quiet'))::int, 0, 'not someone who turned promoted alerts off');
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('host'))::int, 0, 'not the host');
select tests.ok((select ends_at <= now() + interval '3 days 3 hours' from public.meet_promotions where id = (select (r->>'id')::uuid from req)), 'it ends when the meet does');

select tests.login(null);
select tests.eq((select package from public.promoted_meets() where event_id = '00000000-0000-0000-0000-0000000000f1'), 'spotlight', 'everyone sees it''s promoted, signed out too');
select tests.eq((select banner from public.promoted_meets() where event_id = '00000000-0000-0000-0000-0000000000f1'), true, 'with a banner slide');
select tests.eq((select count(*) from public.meet_promotions)::int, 0, 'but not what was paid or by whom');
select tests.login(tests.id('rival'));
select tests.eq((select count(*) from public.meet_promotions)::int, 0, 'other members don''t see the payments either');
select tests.login(tests.id('host'));
select tests.eq((select count(*) from public.meet_promotions)::int, 1, 'the host sees theirs');
select tests.eq((public.request_promotion('00000000-0000-0000-0000-0000000000f1', 'spotlight'))->>'status', 'already', 'no paying twice for the same thing');

-- ---------- admins ----------
select tests.fails($$ select public.admin_grant_promotion('00000000-0000-0000-0000-0000000000f1', 'featured') $$, 'admins_only', 'hosts can''t promote for free');
update public.promo_packages set price_cents = 100; -- RLS: changes nothing for a host
select tests.logout();
select tests.eq((select price_cents from public.promo_packages where id = 'featured'), 1500, 'hosts can''t change prices');
select tests.login(tests.id('boss'));
select tests.eq((public.admin_grant_promotion('00000000-0000-0000-0000-0000000000f1', 'featured'))->>'status', 'ok', 'an admin promotes a meet for free');
update public.promo_packages set price_cents = 1900 where id = 'featured';
select tests.eq((select price_cents from public.promo_packages where id = 'featured'), 1900, 'and sets the prices');
select public.cancel_promotion((select (r->>'id')::uuid from req));
select tests.eq((select package from public.promoted_meets() where event_id = '00000000-0000-0000-0000-0000000000f1'), 'featured', 'cancelling the Spotlight leaves the Featured one');

-- ---------- Spotlight alerts: privacy, moderation, spam, blocks ----------
-- (Found by the security audit, Nov 2026; fixed in 120 before it shipped.)
select tests.logout();
select tests.user('organizer');
select tests.user('helper');
select tests.user('hater');
insert into public.events (id, title, created_by, start_at, end_at, location, lat, lng, visibility) values
  ('00000000-0000-0000-0000-0000000000f3', 'Secret meet', tests.id('organizer'), now() + interval '3 days', now() + interval '3 days 3 hours', '123 Hidden Garage Rd', 33.846, -84.362, 'private'),
  ('00000000-0000-0000-0000-0000000000f4', 'Reported meet', tests.id('organizer'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Spam Lot', 33.846, -84.362, 'public'),
  ('00000000-0000-0000-0000-0000000000f5', 'Double meet', tests.id('organizer'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Double Lot', 33.846, -84.362, 'public'),
  ('00000000-0000-0000-0000-0000000000f6', 'Co-hosted meet', tests.id('organizer'), now() + interval '3 days', now() + interval '3 days 3 hours', 'Co Lot', 33.846, -84.362, 'public');
insert into public.event_cohosts (event_id, host, user_id, status) values ('00000000-0000-0000-0000-0000000000f6', 'helper', tests.id('helper'), 'accepted');
insert into public.alert_settings (user_id, lat, lng, radius_miles) values (tests.id('hater'), 33.80, -84.39, 25);
insert into public.blocks (blocker_id, blocked_id) values (tests.id('hater'), tests.id('helper'));

select tests.login(tests.id('organizer'));
create temp table req2 (k text, id uuid);
grant select on req2 to authenticated, anon, service_role;
insert into req2 select 'private', (public.request_promotion('00000000-0000-0000-0000-0000000000f3', 'spotlight')->>'id')::uuid;
insert into req2 select 'hidden', (public.request_promotion('00000000-0000-0000-0000-0000000000f4', 'spotlight')->>'id')::uuid;
insert into req2 select 'twice1', (public.request_promotion('00000000-0000-0000-0000-0000000000f5', 'spotlight')->>'id')::uuid;
insert into req2 select 'twice2', (public.request_promotion('00000000-0000-0000-0000-0000000000f5', 'spotlight')->>'id')::uuid;
select tests.login(tests.id('helper'));
insert into req2 select 'cohost', (public.request_promotion('00000000-0000-0000-0000-0000000000f6', 'spotlight')->>'id')::uuid;
select tests.logout();
-- A moderator hides the meet after the host opened the checkout, before paying.
update public.events set hidden = true where id = '00000000-0000-0000-0000-0000000000f4';
set local role service_role;
select public.activate_promotion(id, 'cs_audit_' || k, 2900) from req2 order by k;
reset role;

-- Fix: in start_promotion, leave e.location out of the alert body when
-- e.visibility = 'private' (or alert only the meet's title and link).
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and link = 'meet:00000000-0000-0000-0000-0000000000f3' and body like '%123 Hidden Garage Rd%')::int, 0,
  'a Spotlight alert never sends a private meet''s address to strangers');
-- Fix: in activate_promotion/start_promotion, skip the alert (and don't go
-- live) when the meet is hidden or already over at payment time.
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and link = 'meet:00000000-0000-0000-0000-0000000000f4')::int, 0,
  'no Spotlight alert for a meet hidden by moderators before the payment landed');
-- Fix: alert once per meet (dedupe 'promo:' || e.id, or skip when another
-- Spotlight for the meet already has alerted_at), and stop request_promotion
-- handing out a second pending row for a package that's pending or active.
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('near') and link = 'meet:00000000-0000-0000-0000-0000000000f5')::int, 1,
  'two Spotlights bought at once still alert each member only once');
-- Fix: also skip members who block (or are blocked by) any accepted co-host,
-- at least the promotion's created_by.
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and user_id = tests.id('hater') and link = 'meet:00000000-0000-0000-0000-0000000000f6')::int, 0,
  'no Spotlight alert bought by a co-host the member has blocked');
select tests.eq((select count(*) from public.notifications where kind = 'promoted_meet' and link = 'meet:00000000-0000-0000-0000-0000000000f3' and body like 'Private meet%')::int > 0, true,
  'a private meet''s alert still goes out, without the address');
select tests.eq((select status from public.meet_promotions where event_id = '00000000-0000-0000-0000-0000000000f4'), 'pending', 'a hidden meet''s paid promotion doesn''t go live');
select tests.eq((select count(*) from public.notifications n join public.profiles pr on pr.id = n.user_id where n.kind = 'promotion_refund' and pr.is_admin)::int > 0, true, 'and admins are told to refund it');
select tests.eq((select count(distinct id) from req2 where k like 'twice%')::int, 1, 'a second checkout for the same thing reuses the waiting one');

rollback;
