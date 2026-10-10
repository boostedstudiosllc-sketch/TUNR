-- Q4 2026: what's actually still on, and what's new.
--
-- Two halves. First, the recurring meets already listed were each checked for
-- fall 2026, and several were wrong in ways the app couldn't express: a
-- summer series that ended in September kept showing every month, a
-- quarterly meet was listed as monthly, a weekly Saturday meet only ever
-- shows up dated on third Sundays. Recurring meets can now carry a last date
-- (recurrence_until); past it the app treats the series as over.
--
-- Second, new Georgia meets from 2026-10-11 to 2026-12-31. Every one was
-- confirmed by one agent and then independently attacked by another trying
-- to prove it wrong (old year, cancelled, wrong weekday). The dominant
-- failure was stale pages: a "Sat Dec 5" with no year that turned out to be
-- 2020, Lenox "Caffeine and Exotics" listings from 2014-2017, a Suwanee show
-- with only a 2025 edition. None of those are here.
--
-- Research was search-only (page fetching was unavailable), so the sources
-- below are what the search index showed from each page.

-- ============ SEASONAL END ============
alter table public.events
  add column if not exists recurrence_until date;

comment on column public.events.recurrence_until is
  'Last day a recurring series runs this season (inclusive). Null = no end.';

-- Appended at the end so the view can be replaced in place; everything else
-- is 018's definition unchanged, including the hidden/locked redaction.
create or replace view public.events_public as
select
  e.id, e.slug, e.title, e.host, e.verified, e.city,
  e.start_at, e.end_at, e.recurrence, e.timezone, e.vibe, e.tags,
  e.base_going, e.base_interested, e.created_by, e.created_at,
  e.visibility, e.access_mode, e.hidden,
  v.locked,
  m.status as membership_status,
  case when v.locked then null else e.location end as location,
  case when v.locked then null else e.description end as description,
  case when v.locked then null else e.lng end as lng,
  case when v.locked then null else e.lat end as lat,
  case when v.locked then null else e.photo_url end as photo_url,
  case when v.locked then null else e.source end as source,
  case when v.locked then null else e.source_url end as source_url,
  case
    when auth.uid() is not null and e.created_by = auth.uid() then e.passcode
    else null
  end as passcode,
  e.recurrence_until
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select (
    e.visibility = 'private'
    and (auth.uid() is null or e.created_by is distinct from auth.uid())
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- ============ EXISTING MEETS: FALL 2026 CORRECTIONS ============

-- Tin Cup's 2026 season ran first Thursdays April through September
-- (cityofcumming.net, exploregeorgia.org). Nothing in Oct-Dec; the
-- Halloween edition is its own listing (haunted-cruise-in-2026).
update public.events
   set recurrence_until = '2026-09-03',
       description = 'Classic cars and family fun, 6-8 PM on the first Thursday of the month, April through September, at Cumming City Center. Free admission and parking; classic cars enter from 5 PM. The 2026 season has ended; the Halloween edition is listed separately.'
 where slug = 'tin-cup-cruise-in';

-- Seasonal: the 2025 season ran Mar 27 - Nov 6, and 2026 opened Mar 26, so
-- it is expected to close Thu Nov 5. No 2026 post states the end date yet.
update public.events
   set recurrence_until = '2026-11-05',
       description = 'Every Thursday 6-9 PM during the season (late March to early November) at The Outlet Shoppes at Atlanta, hosted by Car Community Connection. Classic muscle and hot rods through to exotics, lifted trucks and JDM builds. Free, all makes and models. Set up in the lot in front of Cancun Mexican Grill on the northeast side. House rules: no burnouts, no loud music, no revving.'
 where slug = 'cruise-in-thursdays-woodstock';

-- Gateway's own 2026 list (gatewayclassiccars.com/caffeine-and-chrome):
-- Oct 31 is a Trunk or Treat edition, there is no November date, and
-- December moves to a Dec 5 Holiday Party — added below as a one-off.
update public.events
   set title = 'Caffeine and Chrome at Gateway Classic Cars',
       recurrence_until = '2026-10-31',
       description = 'Gateway Classic Cars'' monthly Caffeine and Chrome, last Saturday of the month, 9 AM-12 PM at the Cumming showroom. Free. Walk the showroom floor as well as the lot. October 31 is the Trunk or Treat edition; there is no November date, and December is the Holiday Party on Dec 5.',
       source = 'gatewayclassiccars.com',
       source_url = 'https://www.gatewayclassiccars.com/caffeine-and-chrome'
 where slug = 'cars-coffee-alpharetta-gateway';

-- Now quarterly: the organizer's page says "2nd Sunday every 3 months,
-- 9am to 12" (Mar/Jun/Sep/Dec). The only date in the window is Dec 13. The
-- app can't express every-three-months, so it is listed as that one date.
update public.events
   set recurrence = null,
       start_at = '2026-12-13 09:00-05',
       end_at = '2026-12-13 12:00-05',
       location = 'IMAGE Auto Lab, 3885 Miller Rd Ste 1',
       description = 'Quarterly meet on the second Sunday of March, June, September and December, 9 AM-12 PM at IMAGE Auto Lab (formerly Carnoisseur Detail Studio). Truck-heavy but all makes welcome.',
       tags = '{"Quarterly","Trucks","All Makes","Free"}',
       source = 'facebook.com/motorsandmouths',
       source_url = 'https://www.facebook.com/motorsandmouths/'
 where slug = 'motors-and-mouths-columbus';

-- Every dated listing for this meet is a third Sunday, 8-11 AM, hosted by
-- Rocco's European Garage and 967 Coffee Co. (carsandcoffeeevents.com,
-- allevents.in); the "weekly Saturday" came from one undated directory.
-- Fall 2026 dates follow the pattern but no post confirms them yet.
update public.events
   set recurrence = 'monthly:third:SUN',
       start_at = '2026-10-18 08:00-04',
       end_at = '2026-10-18 11:00-04',
       location = 'Roswell Fiesta Complex, 11235 Alpharetta Hwy',
       tags = '{"Monthly","All Makes","Free","Coffee"}',
       description = 'Third Sunday of the month, 8-11 AM at the Roswell Fiesta Complex, hosted by Rocco''s European Garage with coffee from 967 Coffee Co. Free, all enthusiasts welcome.',
       source = 'carsandcoffeeevents.com',
       source_url = 'https://carsandcoffeeevents.com/event/cars-coffee-roswell-2/2026-06-21/'
 where slug = 'roswell-cars-coffee';

-- Metro Motorcar Club's 2026 page: vintage and classic vehicles 20+ years
-- old only, "no exceptions". The old "All Makes" tag would send the wrong
-- people.
update public.events
   set tags = '{"Monthly","Classics 20+ Years","Free","Coffee"}',
       description = 'First Sunday of the month in Roswell, 8-11 AM, rain or shine, in the Panera Bread / Target lot. Show cars must be vintage or classic, 20 years or older; spectators welcome. A calmer alternative to the Caffeine & Octane crowds.'
 where slug = 'worship-roswell-cars-coffee';

-- ============ NEW MEETS, OCT 11 - DEC 31 2026 ============
-- Sources per row. Coordinates were estimated from the street address
-- (no geocoder was reachable), so expect them within a few hundred metres.
--
-- Checked and left out, with the reason, so the next pass doesn't redo it:
--   * Toys for Tots Cruise-In, Tucker ("Sat Dec 5") — the 2020 edition.
--   * Cool Cars & Costumes at the Pony, Brookhaven — no 2026 edition found.
--   * Coffee & Chrome, Hapeville — 2026 season ended Sep 12.
--   * Summit Racing Monday Night Cruise, McDonough — real and weekly, but no
--     street address or fall schedule in any source. Add once confirmed.
--   * Magic City car meetup, Atlanta — one copied listing selling bottle
--     service at a 21+ club; not a verifiable public meet.
--   * Caffeine and Exotics at Lenox — every source is 2014-2017.
--   * Cars for Causes (Johns Creek), Flag City Mustang (Macon, was Mar 14),
--     Cars of the Past (Covington, early October), Christmas Blessing
--     (Monroe), Stars Stripes & White Lines (Hampton, one third-party
--     listing), Jekyll Shrimp & Grits (no 2026 car show), and a dozen
--     cars-and-coffee regulars with no sign of life since 2024.
--   * Nawfside, Fast Lane Performance and @georgia.carmeets post only on
--     Instagram, which isn't searchable from here; nothing dated was found.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, recurrence_until, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  -- City of Acworth calendar, Acworth Tourism and Travel Cobb all agree.
  ('acworth-fall-downtown-classic-car-cruise-2026','Fall Downtown Classic Car Cruise','LakeCityCruisers',false,'Logan Farm Park, 4405 Cherokee St','Acworth, GA','2026-10-31 14:00-04','2026-10-31 19:00-04',null,null,'America/New_York','Domestic','{"Classics","Cruise-In","Free Admission","Charity","Family Friendly"}','The Lake City Cruisers, the City of Acworth and downtown merchants host a classic car cruise at Logan Farm Park, 2-7 PM. Free for spectators; a $5 fee is requested for each cruising vehicle, with proceeds to Horizon Field, a special needs sports facility in Acworth.','acworthtourism.org','https://acworthtourism.org/events/fall-downtown-classic-car-cruise/',-84.6765,34.0695,80,180),

  -- Explore Georgia and Georgia Magazine: first Saturday monthly, 6 PM,
  -- through November. Nov 7 is the last of the season.
  ('cruzin-the-depot-ringgold','Cruzin the Depot','RinggoldCruisers',false,'Historic Ringgold Depot, 155 Depot St','Ringgold, GA','2026-11-07 18:00-05','2026-11-07 20:00-05','monthly:first:SAT','2026-11-07','America/New_York','Domestic','{"Cruise-In","Classics","Free","Family Friendly","Monthly"}','Free, family-friendly cruise-in on Nashville Street in downtown Ringgold on the first Saturday of the month through November, run by the Ringgold Cruisers and Pharoah''s Choo Choo. Dozens of vintage cars and trucks, music from the ''50s to the ''80s, shopping and food. Streets fill from about 5 PM, so arrive early.','exploregeorgia.org','https://exploregeorgia.org/ringgold/events/antique-craft-hobby/cruzin-the-depot-0',-85.1096,34.9161,80,180),

  -- Georgia Cool Cruisers' events page and Vettes of Atlanta both list
  -- "Saturday, November 14th, 2026". One aggregator says Oct 24; the
  -- organizer and the show's history (November is the traditional slot)
  -- say November.
  ('cool-cars-at-briscoe-park-fall-2026','Cool Cars at Briscoe Park: Fall Show','GeorgiaCoolCruisers',false,'Briscoe Park, 2500 Sawyer Pkwy','Snellville, GA','2026-11-14 11:00-05','2026-11-14 15:00-05',null,null,'America/New_York','Domestic','{"Car Show","Classics","Charity","Family Friendly"}','Georgia Cool Cruisers and Snellville Parks & Recreation hold their annual fall Cool Cars show at Briscoe Park, 11 AM-3 PM. Car entry donations go to the Snellville Police Department''s Shop With A Cop program; spectators get in free.','georgiacoolcruisers.org','http://www.georgiacoolcruisers.org/events.html',-84.004,33.868,80,180),

  -- 2026 listing (Nov 14, 2026, 10-3) plus the organizer's own ticket page.
  ('hometown-heroes-and-hotrods-2026','Hometown Heroes and Hotrods Car and Bike Show','FirstRespondersFamilyFdn',false,'Sugar Hill Church, 5091 Nelson Brogdon Blvd','Sugar Hill, GA','2026-11-14 10:00-05','2026-11-14 15:00-05',null,null,'America/New_York','Domestic','{"Car Show","Charity","Judged","Free Spectators","All Makes"}','Annual judged car and bike show at Sugar Hill Church, open to cars, trucks, jeeps, motorcycles and anything else with wheels, with music, food vendors and activities for kids. Spectators get in free; vehicle entry is $25 ($20 for military and first responders). All proceeds benefit the First Responders Family Foundation.','zeffy.com','https://www.zeffy.com/en-US/ticketing/4th-annual-hometown-heroes-and-hotrods-car-and-bike-show',-84.0405,34.1035,60,140),

  -- Gateway's own 2026 Caffeine and Chrome list: "December 5th - Holiday
  -- Party" in place of the last Saturday. Hours not stated; the series'
  -- usual 9-12 is used.
  ('caffeine-and-chrome-holiday-party-2026','Caffeine and Chrome Holiday Party','GatewayClassicCars',false,'Gateway Classic Cars, 2705 Ronald Reagan Blvd Suite 200','Cumming, GA','2026-12-05 09:00-05','2026-12-05 12:00-05',null,null,'America/New_York','Domestic','{"Holiday","Classics","Showroom","Free"}','Gateway Classic Cars'' December Caffeine and Chrome, held as a Holiday Party on Saturday, December 5 instead of the usual last Saturday. Free; walk the showroom floor as well as the lot. Hours follow the monthly series (9 AM-12 PM).','gatewayclassiccars.com','https://www.gatewayclassiccars.com/caffeine-and-chrome',-84.137,34.173,110,250)
on conflict (slug) do nothing;
