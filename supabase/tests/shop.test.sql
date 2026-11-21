-- Merch shop (124): prices from the database, member discount, shipping,
-- stock, Stripe (service key) marks orders paid, admins ship and cancel,
-- buyers only see their own orders.
begin;

select tests.user('buyer');
select tests.user('member');
select tests.user('nosy');
select tests.user('fresh', false);
select tests.user('boss', true, true);
select tests.logout();
update public.profiles set is_member = true where id = tests.id('member');
create temp table p as select
  (select id from public.shop_products where name = 'TUNR Hat') as hat,
  (select id from public.shop_products where name = 'TUNR Shirt') as shirt;
grant select on p to authenticated, anon, service_role;

-- ---------- closed until an admin opens it ----------
select tests.login(tests.id('buyer'));
select tests.eq((select count(*) from public.shop_products)::int, 2, 'a hat and a shirt to start');
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p), 'qty', 1))))->>'status', 'closed', 'the shop starts closed');
select tests.login(tests.id('boss'));
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p), 'qty', 1))))->>'status', 'ok', 'admins can test it while closed');
update public.shop_settings set open = true;
update public.shop_products set stock = '{"M": 2}'::jsonb where name = 'TUNR Shirt';
select tests.login(tests.id('buyer'));
update public.shop_settings set open = false;
update public.shop_products set price_cents = 100;
select tests.eq((select open from public.shop_settings), true, 'members can''t close the shop');
select tests.eq((select price_cents from public.shop_products where name = 'TUNR Hat'), 2500, 'or change prices');

-- ---------- ordering ----------
select tests.eq((public.start_order('[]'::jsonb))->>'status', 'empty', 'an empty cart is refused');
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select shirt from p), 'size', 'XXXL'))))->>'status', 'bad_size', 'only real sizes');
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p), 'qty', 9))))->>'status', 'bad_qty', 'up to 5 of a thing');
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select shirt from p), 'size', 'M', 'qty', 3))))->>'status', 'sold_out', 'can''t buy more than is left');
create temp table o1 as select public.start_order(jsonb_build_array(
  jsonb_build_object('product', (select hat from p), 'qty', 1),
  jsonb_build_object('product', (select shirt from p), 'size', 'M', 'qty', 2))) as r;
grant select on o1 to authenticated, anon, service_role;
select tests.eq((select (r->>'total_cents')::int from o1), 8500, '$25 + 2 × $30, free shipping over $50');
select tests.eq((select (r->>'shipping_cents')::int from o1), 0, 'free shipping over $50');
create temp table o2 as select public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p), 'qty', 1))) as r;
grant select on o2 to authenticated, anon, service_role;
select tests.eq((select (r->>'total_cents')::int from o2), 3000, 'a hat alone pays $5 shipping');
select tests.login(tests.id('member'));
create temp table o3 as select public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p), 'qty', 1))) as r;
grant select on o3 to authenticated, anon, service_role;
select tests.eq((select (r->>'discount_cents')::int from o3), 250, 'TUNR+ members get 10% off');
select tests.eq((select r->>'member_price' from o3), 'true', 'and the order says so');
select tests.login(tests.id('fresh'));
select tests.eq((public.start_order(jsonb_build_array(jsonb_build_object('product', (select hat from p)))))->>'status', 'unconfirmed', 'confirm your email first');
select tests.login(null);
select tests.fails($$ select public.start_order('[]'::jsonb) $$, 'permission denied', 'guests can''t order');
select tests.eq((select count(*) from public.shop_products)::int, 2, 'but can see the products');

-- Writes only through the functions.
select tests.login(tests.id('buyer'));
select tests.blocked_by_rls($$ insert into public.shop_orders (user_id, lines, subtotal_cents, total_cents, status) values (auth.uid(), '[]', 0, 0, 'paid') $$, 'orders can''t be written directly');
update public.shop_orders set status = 'paid' where id = (select (r->>'id')::uuid from o1);
select tests.eq((select status from public.shop_orders where id = (select (r->>'id')::uuid from o1)), 'pending', 'or marked paid by the buyer');
select tests.fails($$ select public.pay_order((select (r->>'id')::uuid from o1), 'cs_x', 8500, 'Me', '{}') $$, 'permission denied', 'only Stripe marks an order paid');

-- ---------- Stripe ----------
select tests.logout();
set local role service_role;
create temp table pay as select
  public.pay_order((select (r->>'id')::uuid from o2), 'cs_2', 2999, 'Ana', '{}') as under,
  public.pay_order((select (r->>'id')::uuid from o1), 'cs_1', 8500, 'Ana Driver', '{"line1": "1 Peachtree St", "city": "Atlanta", "state": "GA", "postal_code": "30303", "country": "US"}') as ok,
  public.pay_order((select (r->>'id')::uuid from o1), 'cs_1', 8500, 'Ana Driver', '{}') as again;
reset role;
select tests.eq((select under->>'status' from pay), 'underpaid', 'paying less than the total doesn''t count');
select tests.eq((select ok->>'status' from pay), 'ok', 'a full payment marks it paid');
select tests.eq((select again->>'status' from pay), 'already', 'a repeated webhook is ignored');
select tests.eq((select (stock->>'M')::int from public.shop_products where name = 'TUNR Shirt'), 0, 'the stock is taken');
select tests.ok(exists (select 1 from public.notifications n join public.profiles pr on pr.id = n.user_id where n.kind = 'shop_order' and pr.is_admin), 'admins are told about the order');

-- ---------- privacy ----------
select tests.login(tests.id('nosy'));
select tests.eq((select count(*) from public.shop_orders)::int, 0, 'nobody sees anyone else''s orders or address');
select tests.fails($$ select public.admin_ship_order((select (r->>'id')::uuid from o1), 'x') $$, 'admins_only', 'only admins ship');
select tests.login(tests.id('buyer'));
select tests.eq((select ship_name from public.shop_orders where id = (select (r->>'id')::uuid from o1)), 'Ana Driver', 'buyers see their own order');

-- ---------- admins ----------
select tests.login(tests.id('boss'));
select tests.eq((public.admin_ship_order((select (r->>'id')::uuid from o2), '1Z'))->>'status', 'not_paid', 'unpaid orders can''t ship');
select tests.eq((public.admin_ship_order((select (r->>'id')::uuid from o1), '1Z999'))->>'status', 'ok', 'admins ship a paid order');
select tests.logout();
select tests.ok(exists (select 1 from public.notifications where user_id = tests.id('buyer') and title like '%shipped%' and body like '%1Z999%'), 'the buyer gets the tracking number');
select tests.login(tests.id('boss'));
select tests.eq((public.admin_cancel_order((select (r->>'id')::uuid from o1)))->>'status', 'cant_cancel', 'shipped orders can''t be cancelled');
select tests.eq((public.admin_cancel_order((select (r->>'id')::uuid from o3)))->>'status', 'ok', 'a waiting order can be cancelled');
select tests.ok(exists (select 1 from public.admin_log where target = 'shop_settings'), 'shop changes go in the admin log');

rollback;
