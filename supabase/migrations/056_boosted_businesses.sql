-- Boosted Studios: the family of businesses behind TUNR, on their own page
-- in the app (TUNR, Boosted Photography, Boosted Detailing), plus Boosted
-- Detailing's 10% off in Perks.
--
-- The page is data, not code, so the owner can fill in and change websites,
-- Instagram handles and booking links from the app (admins only) without a
-- release. Links are blank until then and simply don't show.

create table if not exists public.boosted_businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text not null default '🏁' check (char_length(icon) <= 8),
  tagline text check (char_length(tagline) <= 80),
  description text check (char_length(description) <= 600),
  website text check (website is null or (website ~ '^https://' and char_length(website) <= 300)),
  booking_url text check (booking_url is null or (booking_url ~ '^https://' and char_length(booking_url) <= 300)),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')),
  phone text check (phone is null or char_length(phone) <= 30),
  -- The partner whose perks show on the card ("10% off for TUNR members").
  partner_slug text,
  sort integer not null default 100,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.boosted_businesses enable row level security;

drop policy if exists "boosted businesses are public" on public.boosted_businesses;
create policy "boosted businesses are public"
  on public.boosted_businesses for select
  to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "admins manage boosted businesses" on public.boosted_businesses;
create policy "admins manage boosted businesses"
  on public.boosted_businesses for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists boosted_businesses_touch_updated_at on public.boosted_businesses;
create trigger boosted_businesses_touch_updated_at
  before update on public.boosted_businesses
  for each row execute function public.touch_updated_at();

insert into public.boosted_businesses (slug, name, icon, tagline, description, email, partner_slug, sort) values
  ('tunr', 'TUNR', '🏁', 'The app for Georgia car meets',
   'Find meets, RSVP, check in for points, post linkups, and connect with the car community. You''re using it now.',
   'boostedstudiosllc@gmail.com', null, 10),
  ('boosted-photography', 'Boosted Photography', '📸', 'Photo and film studio',
   'Car shoots, rolling shots, meet and event coverage, and video. Book a shoot for your build.',
   'boostedstudiosllc@gmail.com', null, 20),
  ('boosted-detailing', 'Boosted Detailing', '🧽', 'Detailing for enthusiasts',
   'Washes, details and paint care so your car is meet-ready. TUNR members get 10% off.',
   'boostedstudiosllc@gmail.com', 'boosted-detailing', 30)
on conflict (slug) do nothing;

-- ============ BOOSTED DETAILING IN PERKS ============
insert into public.partners (slug, name, category, description, website, city, active)
values (
  'boosted-detailing',
  'Boosted Detailing',
  'detailing',
  'Detailing from the team behind TUNR. Washes, details and paint care to get your car meet-ready.',
  null,
  'Atlanta, GA',
  true
)
on conflict (slug) do nothing;

insert into public.perks
  (partner_id, title, description, discount_text, redemption_type, terms, members_only, active)
select
  p.id,
  '10% off any detail',
  'Show this screen when you book or before your detail starts. Free with any TUNR account.',
  '10% off',
  'show_screen',
  'One discount per visit. Can''t be combined with other offers. Boosted Studios Production LLC.',
  false,
  true
from public.partners p
where p.slug = 'boosted-detailing'
  and not exists (select 1 from public.perks pk where pk.partner_id = p.id and pk.discount_text = '10% off');
