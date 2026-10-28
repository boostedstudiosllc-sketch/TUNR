-- Garage style: a wheel finish and a ride height for each car, next to the
-- paint, body and spoiler TUNR Rush already keeps (060, 063). Shown in the
-- 3D garage (on your profile and to anyone viewing it) and on your car in
-- TUNR Rush. Owners change them through the existing "owners manage their
-- vehicles" policy; null means the default (silver, stock).

alter table public.vehicles
  add column if not exists game_rims text check (game_rims is null or game_rims in ('silver', 'black', 'gold', 'bronze', 'chrome')),
  add column if not exists game_height text check (game_height is null or game_height in ('stock', 'lowered', 'slammed', 'lifted'));
