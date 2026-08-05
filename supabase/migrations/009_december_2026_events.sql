-- December 2026.
--
-- December is thin on purpose, not by oversight. Checked in August 2026:
-- ShiftAtlanta (the metro's main aggregator) had zero December listings, and
-- the usual annuals hadn't published dates yet. Organisers post December
-- flyers in October/November, so this file will need a second pass then.
--
-- The recurring meets already cover December on their own — Caffeine &
-- Octane lands Sun Dec 6, Tin Cup Cruise-In Thu Dec 3, and the weeklies run
-- every week — so the calendar is not empty without this.
--
-- Only event confirmed against the organiser's own site rather than a search
-- snippet. Snippets were wrong here: one placed a Tucker toy-drive cruise-in
-- on Dec 5 2026, but every underlying listing was from 2023/2024.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('santas-toy-run-car-show','Santa''s Toy Run Car Show','SantasToyRun',false,'Fan Zone, Michelin Raceway Road Atlanta','Braselton, GA','2026-12-05 11:00-05','2026-12-05 14:00-05',null,'America/New_York','Domestic','{"Charity","Toy Drive","Classics","Race Weekend","19th Annual"}','Classic car show in the Fan Zone during the 19th Annual Santa''s Toy Run race weekend at Road Atlanta. All makes and models, Best in Show and People''s Choice awards, hosted by American Street Rodders. $25 to register a car; admission is one toy or a gift card worth $25 or more. Proceeds go to children in foster care, group homes and domestic violence shelters.','santastoyrun.org','https://www.santastoyrun.org/car-show/',-83.81,34.147,210,480)
on conflict (slug) do nothing;
