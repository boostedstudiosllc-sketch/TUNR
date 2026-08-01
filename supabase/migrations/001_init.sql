-- TUNR initial schema: events, rsvps, profiles.
-- Run this in the Supabase SQL Editor (paste whole file, click Run).

-- ============ EVENTS ============
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  host text not null default 'unknown',
  verified boolean not null default false,
  location text not null default 'TBA',
  city text not null default 'Atlanta, GA',
  start_at timestamptz,
  end_at timestamptz,
  recurrence text, -- 'weekly:SAT' | 'monthly:first:SUN' | null
  vibe text not null default 'JDM' check (vibe in ('JDM','Euro','Exotic','Domestic','Truck')),
  tags text[] not null default '{}',
  description text not null default '',
  source text,
  source_url text,
  lng double precision,
  lat double precision,
  base_going integer not null default 0,
  base_interested integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events are readable by everyone"
  on public.events for select
  to anon, authenticated
  using (true);

create policy "signed-in users can post events"
  on public.events for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "creators can update their events"
  on public.events for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "creators can delete their events"
  on public.events for delete
  to authenticated
  using (created_by = auth.uid());

-- ============ RSVPS ============
create table if not exists public.rsvps (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null check (status in ('going','interested')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.rsvps enable row level security;

create policy "users manage their own rsvps: select"
  on public.rsvps for select
  to authenticated
  using (user_id = auth.uid());

create policy "users manage their own rsvps: insert"
  on public.rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users manage their own rsvps: update"
  on public.rsvps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users manage their own rsvps: delete"
  on public.rsvps for delete
  to authenticated
  using (user_id = auth.uid());

-- Public aggregate counts without exposing who RSVP'd.
-- (Owner-rights view: aggregates only, safe to expose.)
create or replace view public.event_rsvp_counts as
select
  event_id,
  count(*) filter (where status = 'going') as going,
  count(*) filter (where status = 'interested') as interested
from public.rsvps
group by event_id;

grant select on public.event_rsvp_counts to anon, authenticated;

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  city text not null default 'Atlanta, GA',
  tos_accepted_at timestamptz,
  tos_version integer,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "users create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============ SEED EVENTS (August 2026, Atlanta area) ============
insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('caffeine-octane-atl','Caffeine & Octane ATL','CaffeineAndOctane',true,'Town Center at Cobb','Kennesaw, GA','2026-08-02 09:00-04','2026-08-02 11:30-04','monthly:first:SUN','Domestic','{"All Makes","Free","Rain or Shine","Monthly"}','America''s largest monthly car show, first Sunday of every month, 9-11:30 AM. Free for spectators and to exhibit. Arrive early for the best spots.','caffeineandoctane.com','https://www.caffeineandoctane.com/c-o-atlanta',-84.588,34.0227,2500,8400),
  ('tin-cup-cruise-in','Tin Cup Cruise-In','CummingCityCenter',true,'Cumming City Center, 423 Canton Rd','Cumming, GA','2026-08-06 18:00-04','2026-08-06 20:00-04','monthly:first:THU','Domestic','{"Classics","Free","First Thursday","Family Friendly"}','Classic cars and family fun, 6-8 PM on the first Thursday of the month at Cumming City Center. Free admission and parking; classic cars enter from 5 PM.','cummingcitycenter.com','https://cummingcitycenter.com/event/tin-cup-cruise-in/',-84.1402,34.2073,220,540),
  ('locals-and-legends','Locals & Legends Weekly','LocalsAndLegends',true,'Sake Japanese Steak & Sushi, 1155 Woodstock Rd','Roswell, GA','2026-08-06 18:00-04','2026-08-06 21:00-04','weekly:THU','JDM','{"Weekly","All Makes","Family Friendly","No Burnouts"}','Every Thursday evening at Sake in Roswell. Sushi, hibachi and drinks while you walk the lot. No hooning, 5 MPH lot speed limit, front two rows left open for diners.','carsandcoffeeevents.com','https://carsandcoffeeevents.com/event/locals-and-legends-weekly-car-meet-sake-in-roswell-ga/',-84.3561,34.0244,120,280),
  ('road-atlanta-trackside','Road Atlanta Trackside Car Show','MichelinRoadAtlanta',true,'Michelin Raceway Road Atlanta','Braselton, GA','2026-08-01 09:00-04','2026-08-01 16:00-04',null,'Euro','{"Trackside","Race Weekend","All Makes"}','Trackside car show during the race weekend at Michelin Raceway Road Atlanta. Show your car with racing as the backdrop.','allevents.in','https://allevents.in/atlanta/car-shows',-83.81,34.147,340,900),
  ('porsche-summer-nights','Porsche Summer Nights','PorscheExperienceATL',true,'Porsche Experience Center, One Porsche Dr','Atlanta, GA','2026-08-15 18:00-04','2026-08-15 22:00-04',null,'Euro','{"Porsche","Demo Laps","DJ","Evening"}','Summer evening at the Porsche Experience Center: demonstration laps, Simulator Lab, drinks and food at the cafe and terrace with a live DJ.','porschedriving.com','https://www.porschedriving.com/atlanta/',-84.4265,33.654,410,1300),
  ('chastain-park-auto-show','Chastain Park Auto Show','ChastainParkAutoShow',false,'Chastain Park','Atlanta, GA','2026-08-16 10:00-04','2026-08-16 15:00-04',null,'Exotic','{"Park Setting","All Makes","Family Friendly"}','Auto show in Atlanta''s Chastain Park. A relaxed Sunday show in one of the city''s biggest greenspaces.','allevents.in','https://allevents.in/atlanta/car-shows',-84.388,33.879,260,720),
  ('auto-crusade-33','Auto Crusade 33 Car Show & Autocross','AutoCrusade',false,'Cumming Fairgrounds, 235 Castleberry Rd','Cumming, GA','2026-08-21 09:00-04','2026-08-21 17:00-04',null,'Domestic','{"Autocross","Show","Weekend"}','Car show plus autocross at the Cumming Fairgrounds. Watch runs or enter your own build.','allevents.in','https://allevents.in/cumming-ga/car-shows',-84.145,34.199,380,860),
  ('shift-for-life','Shift For Life Car & Bike Show','ShiftForLife',false,'The Outlet Shoppes at Atlanta','Woodstock, GA','2026-08-22 10:00-04','2026-08-22 15:00-04',null,'JDM','{"Cars & Bikes","Charity","All Makes"}','Car and bike show at The Outlet Shoppes at Atlanta in Woodstock supporting a good cause.','allevents.in','https://allevents.in/atlanta/car-shows',-84.548,34.073,300,700),
  ('hot-rod-power-fest','HOT ROD Power Fest 2026','HotRodMagazine',true,'EchoPark Speedway','Hampton, GA','2026-08-28 09:00-04','2026-08-29 18:00-04',null,'Domestic','{"HOT ROD","Drags","2 Days","Spectators"}','HOT ROD''s traveling festival hits EchoPark Speedway: drag racing, show field, and vendor midway.','allevents.in','https://allevents.in/atlanta/car-shows',-84.3107,33.3856,3100,8800),
  ('torq-cumming','TORQ at Cumming City Center','TORQ',false,'Cumming City Center, 423 Canton Rd','Cumming, GA','2026-08-22 12:00-04','2026-08-22 15:00-04',null,'Exotic','{"Premium Builds","Exotics","12PM-3PM"}','Experience premium cars, exotic builds and automotive excellence. Saturday, August 22, 12-3 PM at Cumming City Center. Sourced from the host''s flyer via @georgia.carmeets.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.1402,34.2073,85,240),
  ('nalley-bmw-back-to-school','Back to School Giveaway, Nalley BMW','NalleyBMWDecatur',false,'Nalley BMW of Decatur, 1606 Church St','Decatur, GA',null,null,null,'Euro','{"Community Sourced","Giveaway","Date TBC"}','Community-submitted: back-to-school giveaway event at Nalley BMW of Decatur. Not yet confirmed on public listings; check the dealer''s page for the exact date.','nalleybmw.com','https://www.nalleybmw.com/',-84.281,33.79,60,150),
  ('roswell-cars-coffee','Roswell Cars & Coffee','RoswellCarsAndCoffee',true,'11235 Alpharetta Hwy','Roswell, GA','2026-08-01 08:00-04','2026-08-01 10:00-04','weekly:SAT','Domestic','{"All Makes","Weekly","Free","Coffee"}','Weekly Saturday morning meet. Coffee at 967 Coffee Co. All enthusiasts welcome.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/roswell-cars-coffee',-84.3627,34.0232,95,210),
  ('pizza-performance','Pizza & Performance','GeorgiaCarMeets',true,'1740 Cheshire Bridge Rd','Atlanta, GA','2026-08-09 19:00-04','2026-08-09 22:00-04',null,'JDM','{"Evening","Food","All Makes"}','Georgia CarMeets x Magic City Autoclub. Pizza and performance builds on Cheshire Bridge, 7-10 PM. Flyer via @georgia.carmeets.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.356,33.809,180,430),
  ('hightech-shop-showcase','Hightech Shop Showcase','HightechMotorsports',false,'Address shared after RSVP','Atlanta, GA','2026-08-01 18:00-04','2026-08-01 22:00-04',null,'Domestic','{"RSVP Only","Indoor Parking","Private Property"}','Private shop showcase, 6-10 PM: media, cars, people, food, indoor parking. Limited capacity - RSVP via the host''s link; location shared after acceptance. Fully legal event on private property.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.39,33.75,120,300),
  ('eurofed-taco-tuesday','EuroFed Armando''s Taco Tuesday','EuroFed',false,'4190 Abbotts Bridge Rd','Duluth, GA','2026-08-04 19:00-04','2026-08-04 22:00-04',null,'Euro','{"Tacos","Evening","Cool Cars"}','EuroFed presents Taco Tuesday at Armando''s: cool cars, good food, good people. 7-10 PM in Duluth. Flyer via @georgia.carmeets.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.175,34.011,140,320),
  ('millers-ale-house','Miller''s Ale House Car Meet','MillersAleHouseKennesaw',false,'Miller''s Ale House, Chastain Rd NW','Kennesaw, GA','2026-08-11 19:00-04','2026-08-11 22:00-04',null,'JDM','{"Kids Eat Free","Food","Chill Vibes"}','Car meet at Miller''s Ale House Kennesaw, 7-10 PM. Cool cars, great food, chill vibes - kids eat free (restrictions apply). Flyer via @georgia.carmeets.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.574,34.04,90,210),
  ('street-soldiers-mcdonough','Street Soldiers Car & Bike Meet','StreetSoldiers',false,'1120 Towne Center Village Dr','McDonough, GA','2026-08-01 19:00-04','2026-08-01 22:00-04','weekly:SAT','Truck','{"Weekly","Cars & Bikes","No Burnouts"}','Weekly Saturday car and bike meet in McDonough, 7-10 PM. All makes and models welcome. No burnouts, no hooning - respect the spot. Flyer via @georgia.carmeets.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.146,33.447,110,260)
on conflict (slug) do nothing;
