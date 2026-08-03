-- September 2026 Georgia meets, so the calendar keeps going past August.
-- Recurring meets (Caffeine & Octane, Tin Cup, Locals & Legends, Roswell Cars
-- & Coffee, Street Soldiers) already roll forward on their own.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('uscs-sprint-car-labor-day','USCS Sprint Car Labor Day Spectacular','DixieSpeedway',false,'Dixie Speedway, 150 Dixie Dr','Woodstock, GA','2026-09-05 18:00-04','2026-09-05 23:00-04',null,'America/New_York','Domestic','{"Sprint Cars","Racing","Labor Day"}','Labor Day weekend sprint car racing at Dixie Speedway in Woodstock. Grandstand event — come watch or bring the crew.','allevents.in','https://allevents.in/atlanta/car-shows',-84.5194,34.1015,180,420),
  ('nopi-nationals-2026','NOPI Nationals Motorsports Supershow 2026','NOPINationals',true,'EchoPark Speedway, 1500 Tara Pl','Hampton, GA','2026-09-12 09:00-04','2026-09-13 18:00-04',null,'America/New_York','JDM','{"NOPI","Imports","2 Days","Spectators"}','NOPI Nationals returns to EchoPark Speedway for two full days: show field, competitions, and one of the Southeast''s biggest import gatherings.','allevents.in','https://allevents.in/atlanta/car-shows',-84.3107,33.3856,3100,9800),
  ('buggy-days-2026','52nd Annual Buggy Days Festival','BarnesvilleBuggyDays',false,'320 Thomaston St','Barnesville, GA','2026-09-19 09:00-04','2026-09-19 17:00-04',null,'America/New_York','Domestic','{"Classics","Festival","52nd Annual","Family Friendly"}','Longstanding Barnesville festival with a car show alongside the street fair. Classic American iron and a small-town weekend.','allevents.in','https://allevents.in/atlanta/car-shows',-84.1552,33.0546,220,480),
  ('culture-connection-auto-show','The Culture Connection Auto Show','SweetAuburnMusicFest',false,'214 John Wesley Dobbs Ave NE','Atlanta, GA','2026-09-26 11:00-04','2026-09-26 18:00-04',null,'America/New_York','Exotic','{"Culture","Music Fest","Downtown ATL"}','Auto show inside the Sweet Auburn Music Fest downtown. Cars, music, and the city''s culture scene in one weekend.','allevents.in','https://allevents.in/atlanta/car-shows',-84.3733,33.7550,260,610)
on conflict (slug) do nothing;
