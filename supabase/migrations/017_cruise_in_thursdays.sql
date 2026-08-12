-- Cruise-In Thursdays at The Outlet Shoppes at Atlanta.
--
-- Found by crawling garageapp.com's public events sitemap, then verified
-- against the venue's own listing and Woodstock's tourism site before being
-- added here. That order matters: garageapp is a competitor, and its
-- structured data carries no start times (every event is 00:00:00), so
-- copying its listings would have meant publishing meets at the wrong hour.
--
-- Four other Georgia events in that sitemap were deliberately not taken:
--   * Turnt Thursdays (Smyrna) — no independent source anywhere. Unverifiable,
--     and taking it would be lifting a competitor's exclusive rather than
--     reporting a public fact.
--   * Bike Night Athens — motorcycles only.
--   * NOPI Drag Race, Adel — sanctioned track racing, but ~3.5 hours south.
--   * North GA Cruisers, Summerville — real-looking charity show, but only
--     garageapp carries it. Left out pending a second source.
-- Their other three Georgia entries were duplicate Caffeine & Octane listings
-- and TORQ Cumming, both already here.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('cruise-in-thursdays-woodstock','Cruise-In Thursdays','CarCommunityConnection',false,'The Outlet Shoppes at Atlanta, Ridgewalk Pkwy','Woodstock, GA','2026-08-13 18:00-04','2026-08-13 21:00-04','weekly:THU','America/New_York','Domestic','{"Weekly","All Makes","Free","No Burnouts","Family Friendly"}','Every Thursday 6-9 PM at The Outlet Shoppes at Atlanta, hosted by Car Community Connection. Classic muscle and hot rods through to exotics, lifted trucks and JDM builds. Free, all makes and models. Set up in the lot in front of Cancun Mexican Grill on the northeast side. House rules: no burnouts, no loud music, no revving.','theoutletshoppesatatlanta.com','https://theoutletshoppesatatlanta.com/event/17999-cruise-in-thursdays-hosted-by-car-community-connection',-84.52304,34.12147,130,300)
on conflict (slug) do nothing;
