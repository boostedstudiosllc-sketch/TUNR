-- Meets from @georgia.carmeets flyers, October 2026.
--
-- Instagram isn't reachable by search, so the automated passes in 026 found
-- almost nothing from the Georgia scene's biggest repost account. These come
-- from the account's grid, read flyer by flyer on Oct 10 2026. Every detail
-- below is what the flyer prints; nothing is inferred except the end time
-- where a flyer gives none.
--
-- Map pins were looked up per address. Only EchoPark Speedway and the
-- Roswell Nissan dealer have published coordinates; the rest are estimates
-- within roughly a few hundred metres (Dacula couldn't be placed, so it has
-- no pin). Directions now route to the street address rather than the pin,
-- so an estimated pin only moves the map dot, not where people end up.
--
-- Left out from the same grid:
--   * Nawfside's Halloween Park 'N' Chill (5395 Buford Hwy, Norcross,
--     8PM-3AM) and the Sinnerz x Xhale City Trunk or Treat (2130 Pleasant
--     Hill Rd) — the grid crops the date ("FRI OCTOBER 2_", "OCT _9TH").
--     Probably Oct 23 and Oct 29; add once confirmed from the full post.
--   * Cars and Cream (weekly, Saturdays 8 PM) — no location on the flyer.
--   * Bike Night (Thursdays, Cheshire Bridge Rd), Cycle Gear Halloween Party,
--     Road Runner Meet & Greet, the Oct 24 Halloween Ride & Meet —
--     motorcycle events.
--   * Already past: Cars vs Trucks (Oct 9), Bubba's 33 Cars vs Bikes (Oct 7),
--     LOUD Culture Jefferson (Oct 4), Steak 'n Shake Megameet (Oct 3), NSS x
--     INVTL Euros vs Exotics vs JDM (Oct 1). The Oct 10 bike meet was
--     cancelled for weather.

insert into public.events
  (slug, title, host, verified, location, city, start_at, end_at, recurrence, recurrence_until, timezone, vibe, tags, description, source, source_url, lng, lat, base_going, base_interested)
values
  ('limitless-cars-and-coffee-2026-10-11','Limitless Cars and Coffee','Limitless',false,'3206 Lawrenceville-Suwanee Rd','Suwanee, GA','2026-10-11 11:00-04','2026-10-11 15:00-04',null,null,'America/New_York','JDM','{"Coffee","Food","Cars & Bikes","Faith"}','Cars and coffee from Limitless, a Christian car group, 11 AM-3 PM: quality coffee, food, cars, bikes and sports. Whether you''re there for the cars, the friendships or the faith, all are welcome.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.049,34.0395,50,120),

  ('loud-culture-athens-2026-10-11','LOUD Culture Park and Chill','LoudCulture',false,'122 Alps Rd','Athens, GA','2026-10-11 19:00-04','2026-10-11 22:00-04',null,null,'America/New_York','JDM','{"Park And Chill","No Revving","No Burnouts"}','Sunday evening park-and-chill from LOUD Culture, 7-10 PM. No revving, no burnouts.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-83.4099,33.954,40,100),

  ('taco-tuesday-dacula-2026-10-13','Taco Tuesday','YNWA',false,'Cornerstone Village, 2300 Liam Ave NE Unit 113','Dacula, GA','2026-10-13 20:00-04','2026-10-13 23:00-04',null,null,'America/New_York','JDM','{"Taco Tuesday","Night Meet","No Revving","No Hooning"}','Tuesday night meet, 8-11 PM, hosted by YNWA with Full Throttle Society, Metro ATL Carmeets and Nawfside. No revving, no hooning.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',null,null,50,120),

  ('low-n-clean-columbus-2026','Low N Clean Georgia','LowNClean',false,'Columbus Georgia Convention and Trade Center, 801 Front Ave','Columbus, GA','2026-10-17 13:00-04','2026-10-17 19:00-04',null,null,'America/New_York','JDM','{"Indoor Show","Vendors","Awards","All Makes"}','Indoor car show at the Columbus Georgia Convention and Trade Center, 1-7 PM, with the Riverwalk, vendors, giveaways, awards and music. All makes and models welcome; show cars register at lownclean.com.','lownclean.com','https://www.lownclean.com',-84.99528,32.46306,200,480),

  ('buck-cancer-broncos-mcdonough-2026','Big or Small, Protect Them All: Buck Cancer Car Show','GeorgiaBroncos',false,'Sweet Auburn BBQ, 1828 Jonesboro Rd','McDonough, GA','2026-10-17 09:00-04','2026-10-17 13:00-04',null,null,'America/New_York','Truck','{"Charity","Breast Cancer","Broncos","Car Show"}','Buck Cancer, Broncos & Boobs: a car show and breast cancer fundraiser at Sweet Auburn BBQ, 9 AM-1 PM, hosted by Georgia Broncos with Smoke & Mirrors.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.2166,33.4647,70,160),

  ('jacky-jones-cars-coffee-2026-10-17','Cars & Coffee at Jacky Jones','JackyJones',false,'Jacky Jones Performance Alley, 2840 Highway 129 S','Cleveland, GA','2026-10-17 08:00-04','2026-10-17 11:00-04',null,null,'America/New_York','Domestic','{"Cars & Coffee","All Makes","Dealership"}','Saturday cars and coffee at Jacky Jones Performance Alley, 8-11 AM, with Switchback Coffee. All makes welcome.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-83.788,34.5625,50,110),

  ('twisted-dimensions-gainesville-2026-10-17','Twisted Dimensions Night Meet','TwistedDimensions',false,'Bamboo Express Car Wash, 1238 Jesse Jewell Pkwy SW','Gainesville, GA','2026-10-17 20:00-04','2026-10-17 23:00-04',null,null,'America/New_York','JDM','{"Night Meet","No Revving","No Burnouts","No Littering"}','Saturday night meet from Twisted Dimensions in the express car wash lot on Jesse Jewell Pkwy, 8-11 PM. Rules: no revving, no burnouts, no littering.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-83.844,34.29,50,120),

  ('keys-to-the-city-fall-mixer-2026','Keys to the City Fall Mixer','HugoRevolutions',false,'Showcase, 1995 Windy Hill Rd SE','Smyrna, GA','2026-10-18 14:30-04','2026-10-18 18:30-04',null,null,'America/New_York','JDM','{"Showcase","Mixer","Sunday"}','Hugo Revolutions'' Keys to the City fall mixer and car showcase, Sunday 2:30-6:30 PM.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.492,33.903,40,100),

  ('customs-by-cam-buford-2026-10-22','Customs By Cam Car Meet','CustomsByCam',false,'Buford (exact spot posted a week before on @customs.by.cam)','Buford, GA','2026-10-22 19:00-04','2026-10-22 22:00-04',null,null,'America/New_York','JDM','{"Night Meet","Cars","Community","Location TBA"}','Thursday night meet from Customs By Cam and @that1.s3, 7-10 PM in Buford. The exact location is released a week before on Instagram: follow @customs.by.cam.','instagram.com/customs.by.cam','https://www.instagram.com/customs.by.cam/',null,null,50,120),

  ('spooky-supercars-2026','Spooky Supercars','TheInvitational',false,'Bonfire Brazil Steakhouse, 3940 Cherokee St NW #601','Kennesaw, GA','2026-10-23 19:00-04','2026-10-23 22:00-04',null,null,'America/New_York','Exotic','{"Supercars","Halloween","Showcase"}','The Invitational''s Halloween supercar night at Bonfire Brazil Steakhouse, 7-10 PM. Owners can apply to showcase their car at theinvtl.com/submit.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.595,34.0447,90,220),

  ('cars-and-christ-atlanta-2026','Cars and Christ Atlanta','AtlantaAlive',false,'EchoPark Speedway, 1500 Tara Pl','Hampton, GA','2026-10-24 18:00-04','2026-10-24 21:00-04',null,null,'America/New_York','JDM','{"Faith","Food","Music","All Makes"}','Food, music, Christ and cars at EchoPark Speedway (formerly Atlanta Motor Speedway), 6-9 PM, from Clutch and Atlanta Alive. Limitless runs an official cruise there: meet at 3825 Shackleford Rd, Duluth at 3 PM, rolling out at 4 PM.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.31786,33.38349,200,450),

  -- Recurring: confirms the "Nissan Night Roswell" an undated directory
  -- listed, which the search pass couldn't verify.
  ('nissan-night-roswell','Nissan Night','SpeedgateMotorsports',false,'Regal Nissan, 1090 Holcomb Bridge Rd','Roswell, GA','2026-11-07 18:00-05','2026-11-07 22:00-05','monthly:first:SAT',null,'America/New_York','JDM','{"Monthly","Nissan","Dealership","Apply To Display"}','Nissan Night on the first Saturday of every month, 6-10 PM at the Nissan dealership on Holcomb Bridge Rd, presented by Nissan of Roswell and Speedgate Motorsports. Apply to display your car at speedgatemotorsports.com.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.32811,34.02183,60,140),

  ('speedgate-tuner-night','Tuner Night','SpeedgateMotorsports',false,'Speedgate Motorsports, 440 Interstate North Pkwy','Atlanta, GA','2026-10-10 18:00-04','2026-10-10 22:00-04','monthly:second:SAT',null,'America/New_York','JDM','{"Monthly","Indoor","Vendors","Apply To Display"}','Tuner Night on the second Saturday of every month, 6-10 PM: an underground garage-style car display with music, vendors and food from Speedgate Motorsports. All cars welcome; apply to display at speedgatemotorsports.com/tunernight.','instagram.com/georgia.carmeets','https://www.instagram.com/georgia.carmeets/',-84.451,33.8995,80,180)
on conflict (slug) do nothing;

-- Street Soldiers: a current flyer confirms it's still weekly, Saturdays
-- 7-10 PM at the same lot, all makes, all models, all ages. The old pin was
-- McDonough's city centre, not the lot.
update public.events
   set location = 'Floor & Decor lot, 1120 Towne Center Village Dr',
       tags = '{"Weekly","Cars & Bikes","All Ages","No Burnouts"}',
       description = 'Weekly Saturday night car and bike meet in McDonough, 7-10 PM. All makes, all models, all ages. No burnouts, no hooning - respect the spot. Flyer via @georgia.carmeets.',
       lat = 33.48,
       lng = -84.217
 where slug = 'street-soldiers-mcdonough';
