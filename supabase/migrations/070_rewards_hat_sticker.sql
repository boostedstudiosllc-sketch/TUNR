-- The rewards store: the T-shirt, plus a hat and the Scan my build sticker.
-- Priced at 10 points per $1 of value; admins can change any of it in
-- Settings → Admin → Rewards.

insert into public.rewards (title, description, kind, cost, how_to_claim, stock, per_person, active)
select 'Boosted Studios hat',
       'A $25 hat for our regulars. One size fits most.',
       'merch', 250,
       'Show your claim code at a Boosted meet to pick up your hat. Can''t make one? Message us in the app and we''ll sort out pickup.',
       null, 1, true
 where not exists (select 1 from public.rewards where title = 'Boosted Studios hat');

-- The sticker was waiting on printing; it's on now.
update public.rewards set active = true where title = 'Scan my build sticker';
