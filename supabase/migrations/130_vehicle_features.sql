-- What a garage car has, for checking parts fit (the Parts tab tells you
-- "✅ Fits your 2019 540i" or "⚠️ Needs adaptive LED headlights"): a short
-- list of features or packages, e.g. "Adaptive LED headlights",
-- "M Sport package", "Sunroof". A listing's "only fits cars with" (129) is
-- matched against it in the app (fitment.js checkFit).

-- Up to 20 features, each 2 to 60 characters.
create or replace function public.vehicle_features_ok(p text[])
returns boolean
language sql
immutable
as $$
  select cardinality(p) <= 20 and not exists (select 1 from unnest(p) f where f is null or char_length(btrim(f)) not between 2 and 60);
$$;

alter table public.vehicles
  add column if not exists features text[] not null default '{}';
alter table public.vehicles drop constraint if exists vehicles_features_check;
alter table public.vehicles add constraint vehicles_features_check check (public.vehicle_features_ok(features));
