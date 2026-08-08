-- More Georgia meets, mostly recurring ones.
--
-- The calendar looked thin because only five recurring meets were listed, and
-- the recurrence format could only express "first <weekday> of the month".
-- Half of Georgia's regulars are second-Sunday or last-Saturday meets, so they
-- couldn't be represented at all. src/lib/dates.js now handles
-- monthly:first|second|third|fourth|last, and these use it.
--
-- Sources: shiftatlanta.org and carsandcoffeedirectory.com, with addresses
-- taken from each event's own detail page rather than the index listing —
-- the index had "Caffeine and Chrome" in Cumming, Georgia while its detail
-- page said Dearborn, Michigan, so that one is deliberately not here.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  -- Recurring
  ('varsity-dawsonville-cruise-in','Tuesday Cruise-In at The Varsity','VarsityDawsonville',false,'The Varsity Dawsonville, 73 Bethel Dr','Dawsonville, GA','2026-08-11 16:30-04','2026-08-11 19:30-04','weekly:TUE','America/New_York','Domestic','{"Weekly","Classics","Free","Family Friendly"}','Weekly Tuesday evening cruise-in at The Varsity in Dawsonville, across GA 400 from the outlet mall. Food, classics and an easy midweek meet.','shiftatlanta.org','https://shiftatlanta.org/atlanta-car-events/',-84.095,34.3995,90,210),
  ('worship-roswell-cars-coffee','Worship Roswell Cars & Coffee','WorshipRoswell',false,'1195 Woodstock Rd','Roswell, GA','2026-09-06 08:00-04','2026-09-06 11:00-04','monthly:first:SUN','America/New_York','Domestic','{"Monthly","All Makes","Free","Coffee"}','First Sunday of the month in Roswell, 8-11 AM. A calmer alternative to the Caffeine & Octane crowds.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/worship-roswell-cars-coffee',-84.376,34.0175,70,180),
  ('athens-cars-coffee','Athens Cars & Coffee','AthensCarsAndCoffee',false,'196 Alps Rd','Athens, GA','2026-09-05 09:00-04','2026-09-05 11:00-04','monthly:first:SAT','America/New_York','Domestic','{"Monthly","Classics","College Town"}','First Saturday of the month in Athens, 9-11 AM. Classics and everyday drivers, all welcome.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/athens-cars-coffee',-83.4155,33.9455,80,190),
  ('cars-coffee-alpharetta-gateway','Cars & Coffee Alpharetta','GatewayClassicCars',false,'Gateway Classic Cars, 2705 Ronald Reagan Blvd Suite 200','Cumming, GA','2026-08-29 09:00-04','2026-08-29 12:00-04','monthly:last:SAT','America/New_York','Domestic','{"Monthly","Classics","Showroom","Indoor"}','Last Saturday of the month at the Gateway Classic Cars showroom, 9 AM-12 PM. Walk the showroom floor as well as the lot.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/cars-coffee-alpharetta-gateway-classic-cars',-84.137,34.173,110,250),
  ('motors-and-mouths-columbus','Motors and Mouths Car Meet','MotorsAndMouths',false,'3885 Miller Rd Ste 1','Columbus, GA','2026-08-09 08:00-04','2026-08-09 11:00-04','monthly:second:SUN','America/New_York','Truck','{"Monthly","Trucks","All Makes"}','Second Sunday of the month in Columbus, 8-11 AM. Truck-heavy but all makes welcome.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/motors-and-mouths-car-meet',-84.945,32.523,60,140),
  ('savannah-cars-coffee','Savannah Cars & Coffee','SavannahCarsAndCoffee',false,'4511 Habersham St','Savannah, GA','2026-09-05 07:30-04','2026-09-05 10:30-04','monthly:first:SAT','America/New_York','Domestic','{"Monthly","All Makes","Early Start","Coffee"}','First Saturday of the month in Savannah, 7:30-10:30 AM. Early start beats the heat.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/savannah-cars-coffee',-81.098,32.0355,85,200),
  ('coffee-and-cars-augusta','Coffee and Cars Augusta','CoffeeAndCarsAugusta',false,'735 James Brown Blvd','Augusta, GA','2026-09-05 08:00-04','2026-09-05 11:00-04','monthly:first:SAT','America/New_York','Domestic','{"Monthly","All Makes","Downtown","Coffee"}','First Saturday of the month in downtown Augusta, 8-11 AM. All makes, free to attend.','carsandcoffeedirectory.com','https://www.carsandcoffeedirectory.com/events/coffee-and-cars-augusta',-81.972,33.472,75,175),

  -- One-offs
  ('st-jude-car-truck-bike-show','21st Annual St Jude Car, Truck & Motorcycle Show','StJudeRinggold',false,'Ringgold High School','Ringgold, GA','2026-08-15 08:00-04','2026-08-15 15:00-04',null,'America/New_York','Domestic','{"Charity","21st Annual","Cars & Bikes","All Makes"}','Long-running charity show benefiting St. Jude Children''s Research Hospital, in memory of Rebekah Davis. All makes and models, cars, trucks and bikes.','shiftatlanta.org','https://shiftatlanta.org/atlanta-car-events/',-85.109,34.916,180,400),
  ('road-atlanta-hpde-august','Road Atlanta HPDE Weekend','ChinTrackDays',false,'Michelin Raceway Road Atlanta','Braselton, GA','2026-08-15 08:00-04','2026-08-16 17:30-04',null,'America/New_York','Exotic','{"Track Day","HPDE","2 Days","Drivers"}','Two days of high performance driver education at Michelin Raceway Road Atlanta, presented with Ohlins. A driving event rather than a show - entry is by registration.','shiftatlanta.org','https://shiftatlanta.org/atlanta-car-events/',-83.81,34.147,120,290),
  ('sunset-sundaes-august','Sunset Sundaes','antrieb',false,'Andy''s Frozen Custard, Toco Hills','Atlanta, GA','2026-08-16 19:30-04','2026-08-16 21:00-04',null,'America/New_York','Euro','{"Evening","Food","Chill Vibes","All Makes"}','Evening meet-up from antrieb., alternating Sundays through the summer. Custard, cars and an easy end to the weekend.','shiftatlanta.org','https://shiftatlanta.org/atlanta-car-events/',-84.317,33.818,70,160)
on conflict (slug) do nothing;
