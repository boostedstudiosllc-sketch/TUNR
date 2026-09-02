-- First perk: Chemical Guys, 10% off with code BOOSTED.
--
-- Worth being precise about what this is. It's a discount code that works at
-- chemicalguys.com, not a partnership Chemical Guys agreed to — so the copy
-- says "works at", never implies an endorsement, and no logo is used. Swap
-- the description the day there's an actual agreement.
--
-- Discount codes are case-insensitive at essentially every checkout, so it's
-- stored uppercase for legibility. If theirs turns out to be case-sensitive,
-- change the value here.

insert into public.partners (slug, name, category, description, website, city, active)
values (
  'chemical-guys',
  'Chemical Guys',
  'detailing',
  'Detailing supplies — soaps, waxes, coatings, applicators. Ships nationwide.',
  'https://www.chemicalguys.com',
  null,
  true
)
on conflict (slug) do nothing;

insert into public.perks
  (partner_id, title, description, discount_text, redemption_type, code, url, terms, active)
select
  p.id,
  '10% off your order',
  'Use the code at checkout on chemicalguys.com. Works on most of the catalogue.',
  '10% off',
  'code',
  'BOOSTED',
  'https://www.chemicalguys.com',
  'Discount applied at checkout. Exclusions may apply — see their site for current terms.',
  true
from public.partners p
where p.slug = 'chemical-guys'
  and not exists (
    select 1 from public.perks pk
    where pk.partner_id = p.id and pk.code = 'BOOSTED'
  );
