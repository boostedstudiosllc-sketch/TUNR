-- Parts for sale say which car they fit: make, model and years (a range,
-- e.g. 2015–2021), or "universal" (fits most cars: seats, gauges, lights…).
-- Required on every new listing; the old free-text "fits" stays for extra
-- detail (bolt pattern, trims). The Parts tab filters by make, model and
-- year, and "Fits my car" uses your garage.
--
-- Listings posted before this keep working without it, but once a listing
-- has a fitment it can't be taken away.

alter table public.listings
  add column if not exists fit_universal boolean not null default false,
  add column if not exists fit_make text references public.car_makes (name),
  add column if not exists fit_model text check (fit_model is null or char_length(btrim(fit_model)) between 1 and 60),
  add column if not exists fit_year_from integer check (fit_year_from is null or fit_year_from between 1900 and 2100),
  add column if not exists fit_year_to integer check (fit_year_to is null or fit_year_to between 1900 and 2100);
alter table public.listings drop constraint if exists listings_fit_years_check;
alter table public.listings add constraint listings_fit_years_check check (fit_year_to is null or fit_year_from is null or fit_year_to >= fit_year_from);
create index if not exists listings_fit_idx on public.listings (fit_make, fit_model) where status in ('active', 'pending');

create or replace function public.check_listing_fitment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- the SQL editor and imports
  end if;
  -- One year given: it fits that year.
  if new.fit_year_from is not null and new.fit_year_to is null then
    new.fit_year_to := new.fit_year_from;
  end if;
  if new.fit_universal then
    new.fit_make := null;
    new.fit_model := null;
    new.fit_year_from := null;
    new.fit_year_to := null;
    return new;
  end if;
  if tg_op = 'INSERT' or old.fit_universal or old.fit_make is not null then
    if new.fit_make is null or nullif(btrim(coalesce(new.fit_model, '')), '') is null or new.fit_year_from is null then
      raise exception 'fitment_required';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists check_listing_fitment on public.listings;
create trigger check_listing_fitment before insert or update on public.listings for each row execute function public.check_listing_fitment();

-- 103's feed, with the new columns (l.* is fixed when a view is made).
drop view if exists public.listings_feed;
create view public.listings_feed
with (security_invoker = true) as
select l.*, coalesce(p.username, 'someone') as seller_name, p.avatar_url as seller_avatar, p.created_at as seller_joined,
       (select count(*) from public.listings s where s.seller_id = l.seller_id and s.status = 'sold')::int as seller_sold
  from public.listings l
  left join public.profiles p on p.id = l.seller_id;
grant select on public.listings_feed to authenticated;
