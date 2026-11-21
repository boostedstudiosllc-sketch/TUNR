-- Parts marketplace (103, 104): who can list, see, change and message.
begin;

select tests.user('seller');
select tests.user('buyer');
select tests.user('stranger');
select tests.user('fresh', false);
select tests.user('boss', true, true);

create temp table photo (url text);
insert into photo values ('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/' || tests.id('seller') || '/1.jpg');
grant select on photo to authenticated;

-- ---------- listing ----------
select tests.login(tests.id('seller'));
insert into public.listings (title, category, condition, price_cents, photos, fit_make, fit_model, fit_year_from, fit_year_to)
values ('Enkei RPF1 17x9', 'wheels', 'used', 80000, array[(select url from photo)], 'Subaru', 'WRX', 2015, 2021);
select tests.eq((select status from public.listings), 'active', 'a new listing goes live');
select tests.eq((select seller_id from public.listings), tests.id('seller'), 'the seller is whoever is signed in');
-- (128) Which car it fits is required.
select tests.fails($$ insert into public.listings (title, category, condition, photos) values ('Mystery part', 'other', 'used', array[(select url from photo)]) $$,
  'fitment_required', 'a part has to say which car it fits');
select tests.fails($$ insert into public.listings (title, category, condition, photos, fit_make, fit_year_from) values ('Half filled', 'other', 'used', array[(select url from photo)], 'Honda', 2004) $$,
  'fitment_required', 'make, model and year, not just some of them');
select tests.fails($$ insert into public.listings (title, category, condition, photos, fit_make, fit_model, fit_year_from) values ('Bad make', 'other', 'used', array[(select url from photo)], 'Yugo-ish', 'X', 2004) $$,
  'violates foreign key', 'the make comes from TUNR''s list');
select tests.fails($$ insert into public.listings (title, category, condition, photos, fit_make, fit_model, fit_year_from, fit_year_to) values ('Backwards', 'other', 'used', array[(select url from photo)], 'Honda', 'Civic', 2010, 2004) $$,
  'listings_fit_years_check', 'years run forwards');
insert into public.listings (title, category, condition, photos, fit_make, fit_model, fit_year_from) values ('S2000 hardtop', 'aero', 'used', array[(select url from photo)], 'Honda', 'S2000', 2004);
select tests.eq((select fit_year_to from public.listings where title = 'S2000 hardtop'), 2004, 'one year means just that year');
insert into public.listings (title, category, condition, photos, fit_universal, fit_make) values ('Bride seat', 'interior', 'used', array[(select url from photo)], true, 'Honda');
select tests.eq((select fit_make from public.listings where title = 'Bride seat'), null, 'a universal part fits any car');
select tests.fails($$ update public.listings set fit_make = null where title = 'S2000 hardtop' $$, 'fitment_required', 'and the fitment can''t be taken off later');
select tests.eq((select count(*) from public.listings_feed where fit_make = 'Subaru' and fit_model = 'WRX' and 2018 between fit_year_from and fit_year_to)::int, 1, 'the feed filters by make, model and year');
delete from public.listings where title in ('S2000 hardtop', 'Bride seat');

select tests.fails($$ insert into public.listings (title, category, condition, photos)
  values ('Spoiler', 'aero', 'used', array['https://evil.example/storage/v1/object/public/event-photos/x.jpg']) $$,
  'listing_photo_not_ours', 'photos from another website are refused');
select tests.fails(format($$ insert into public.listings (title, category, condition, photos)
  values ('Spoiler', 'aero', 'used', array['https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/%s/1.jpg']) $$, tests.id('buyer')),
  'listing_photo_not_ours', 'someone else''s uploaded photo is refused');
select tests.blocked_by_rls(format($$ insert into public.listings (seller_id, title, category, condition, fit_universal, photos)
  values (%1$L, 'Fake', 'other', 'used', true, array['https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/%1$s/1.jpg']) $$, tests.id('buyer')),
  'you can''t list a part as someone else');
select tests.fails($$ update public.listings set status = 'removed' $$, 'admins_remove_listings', 'a seller can''t mark their own listing removed');
update public.listings set seller_id = (select id from tests.people where name = 'buyer');
select tests.eq((select seller_id from public.listings), tests.id('seller'), 'the seller can''t hand the listing to someone else');

select tests.login(tests.id('fresh'));
select tests.fails(format($$ insert into public.listings (title, category, condition, photos)
  values ('Seat', 'interior', 'used', array['https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/event-photos/%s/1.jpg']) $$, tests.id('fresh')),
  'email_unconfirmed', 'people who haven''t confirmed their email can''t list');

-- Ten a day.
select tests.logout();
insert into public.listings (seller_id, title, category, condition, photos)
select tests.id('seller'), 'Part ' || g, 'other', 'used', array[(select url from photo)] from generate_series(1, 9) g;
select tests.login(tests.id('seller'));
select tests.fails($$ insert into public.listings (title, category, condition, photos, fit_universal) values ('One more', 'other', 'used', array[(select url from photo)], true) $$,
  'rate_limit_listings', 'the 11th listing in a day is refused');

-- ---------- seeing ----------
select tests.login(tests.id('buyer'));
select tests.eq((select count(*) from public.listings_feed)::int, 10, 'other members see live listings');
select tests.blocked_by_rls($$ update public.listings set price_cents = 1 $$, 'a buyer can''t change someone''s listing');
select tests.blocked_by_rls($$ delete from public.listings $$, 'a buyer can''t delete someone''s listing');

select tests.login(null);
select tests.eq((select count(*) from public.listings_feed)::int, 0, 'signed-out visitors see no listings');
select tests.blocked_by_rls($$ insert into public.listings (seller_id, title, category, condition, fit_universal, photos) values (gen_random_uuid(), 'x', 'other', 'used', true, array['x']) $$,
  'signed-out visitors can''t list');

-- An admin removes one; it disappears for everyone but the seller and admins.
select tests.login(tests.id('boss'));
update public.listings set status = 'removed' where title = 'Enkei RPF1 17x9';
select tests.login(tests.id('buyer'));
select tests.eq((select count(*) from public.listings where status = 'removed')::int, 0, 'removed listings are hidden from buyers');
select tests.login(tests.id('seller'));
select tests.eq((select count(*) from public.listings where status = 'removed')::int, 1, 'the seller still sees their removed listing');
update public.listings set status = 'active' where status = 'removed';
select tests.eq((select count(*) from public.listings where status = 'removed')::int, 1, 'a seller can''t bring back a removed listing');

-- ---------- chat ----------
select tests.login(tests.id('buyer'));
create temp table chat as select public.start_listing_chat((select id from public.listings where title = 'Part 1')) r;
select tests.eq((select r->>'status' from chat), 'ok', 'a buyer can open a chat');
select tests.eq((public.start_listing_chat((select id from public.listings where title = 'Part 1')))->>'thread', (select r->>'thread' from chat),
  'opening it again reuses the same chat');
insert into public.listing_messages (thread_id, body) values ((select (r->>'thread')::uuid from chat), 'Still have it?');

select tests.login(tests.id('seller'));
select tests.eq((public.start_listing_chat((select id from public.listings where title = 'Part 1')))->>'status', 'own_listing',
  'sellers can''t message themselves');
select tests.eq((select count(*) from public.listing_messages)::int, 1, 'the seller reads the buyer''s message');
insert into public.listing_messages (thread_id, body) values ((select (r->>'thread')::uuid from chat), 'Yes');
select tests.login(tests.id('buyer'));
select tests.eq((select count(*) from public.notifications where user_id = tests.id('buyer') and kind = 'listing_message')::int, 1,
  'the buyer is told about the reply');

select tests.login(tests.id('stranger'));
select tests.eq((select count(*) from public.listing_messages)::int, 0, 'nobody else can read the chat');
select tests.eq((select count(*) from public.listing_threads)::int, 0, 'nobody else can see the chat exists');
select tests.blocked_by_rls(format($$ insert into public.listing_messages (thread_id, body) values (%L, 'hi') $$, (select r->>'thread' from chat)),
  'nobody else can post into the chat');
select tests.blocked_by_rls(format($$ insert into public.listing_threads (listing_id, buyer_id, seller_id)
  select id, %L, seller_id from public.listings_feed limit 1 $$, tests.id('stranger')),
  'chats can only be opened through start_listing_chat');

select tests.login(tests.id('fresh'));
select tests.eq((public.start_listing_chat((select id from public.listings_feed limit 1)))->>'status', 'unconfirmed',
  'unconfirmed users can''t message sellers');

-- Blocking: the seller blocks the buyer; the buyer can't send any more.
select tests.login(tests.id('seller'));
insert into public.blocks (blocker_id, blocked_id) values (tests.id('seller'), tests.id('buyer'));
select tests.login(tests.id('buyer'));
select tests.fails(format($$ insert into public.listing_messages (thread_id, body) values (%L, 'hello?') $$, (select r->>'thread' from chat)),
  'blocked', 'a blocked buyer can''t keep messaging');
select tests.eq((public.start_listing_chat((select id from public.listings where title = 'Part 2')))->>'status', 'blocked',
  'a blocked buyer can''t open new chats with that seller');

-- Sold: no new chats.
select tests.login(tests.id('seller'));
update public.listings set status = 'sold' where title = 'Part 3';
select tests.login(tests.id('stranger'));
select tests.eq((public.start_listing_chat((select id from public.listings where title = 'Part 3')))->>'status', 'sold',
  'a sold part takes no new chats');

rollback;
