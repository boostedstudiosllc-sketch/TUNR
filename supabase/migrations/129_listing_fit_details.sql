-- Parts that only fit some versions of a car (2019 G30 headlights: adaptive
-- LED vs halogen are different parts). On top of 128's make / model /
-- years, a listing can say:
--   fit_trim       the trim or chassis code ("G30", "540i", "Type R")
--   fit_requires   what the car must have ("Adaptive LED headlights")
--   part_number    the OEM or brand part number, the surest match
-- All optional. Search matches the part number and trim, and the Parts
-- filter can narrow to a trim (parts for every trim still show).

alter table public.listings
  add column if not exists fit_trim text check (fit_trim is null or char_length(btrim(fit_trim)) between 1 and 60),
  add column if not exists fit_requires text check (fit_requires is null or char_length(btrim(fit_requires)) between 1 and 80),
  add column if not exists part_number text check (part_number is null or char_length(btrim(part_number)) between 2 and 40);
create index if not exists listings_part_number_idx on public.listings (lower(replace(part_number, ' ', ''))) where part_number is not null;

-- 128's feed again, with the new columns.
drop view if exists public.listings_feed;
create view public.listings_feed
with (security_invoker = true) as
select l.*, coalesce(p.username, 'someone') as seller_name, p.avatar_url as seller_avatar, p.created_at as seller_joined,
       (select count(*) from public.listings s where s.seller_id = l.seller_id and s.status = 'sold')::int as seller_sold
  from public.listings l
  left join public.profiles p on p.id = l.seller_id;
grant select on public.listings_feed to authenticated;
