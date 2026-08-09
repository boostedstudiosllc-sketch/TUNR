-- Cobb Car Meets x Fastlane Car Club pop-up, 8 Aug 2026.
--
-- Worth noting how this one arrived: it was announced on Instagram nine
-- minutes before it was passed to me, for a meet starting that evening. No
-- aggregator, directory or search result had it, and none would have in time.
-- Same-day pop-ups are precisely the category that only host-posting can
-- cover, which is the argument for getting hosts onto the app rather than
-- scraping harder.
--
-- Coordinates geocoded from the flyer's address, not estimated.
-- The flyer states "NO REVVING - NO BURNOUTS", so it clears the content
-- policy on its face.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('cobb-saturday-night-pop-up-aug8','Saturday Night Pop Up','CobbCarMeets',false,'2911 George Busbee Pkwy NW','Kennesaw, GA','2026-08-08 20:00-04','2026-08-08 23:30-04',null,'America/New_York','Euro','{"Pop Up","Evening","No Revving","No Burnouts"}','Cobb Car Meets x Fastlane Car Club Saturday night pop-up in Kennesaw, 8-11:30 PM. House rules from the hosts: no revving, no burnouts. Announced same-day via @cobbcarmeets.','instagram.com/cobbcarmeets','https://www.instagram.com/cobbcarmeets/',-84.56993,34.02475,60,140)
on conflict (slug) do nothing;
