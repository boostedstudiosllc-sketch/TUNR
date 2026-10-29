-- "Enjoying TUNR?" ratings: 1–5 stars and an optional note, from the
-- occasional in-app prompt or Settings → Rate TUNR. Admins see the average.

create table if not exists public.app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  device text check (char_length(device) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists app_ratings_created_idx on public.app_ratings (created_at desc);
alter table public.app_ratings enable row level security;

drop policy if exists "people rate the app" on public.app_ratings;
create policy "people rate the app" on public.app_ratings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "people see their ratings" on public.app_ratings;
create policy "people see their ratings" on public.app_ratings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No swearing in the note (the same filter as everywhere else).
drop trigger if exists clean_text on public.app_ratings;
create trigger clean_text before insert or update of comment on public.app_ratings
  for each row execute function public.clean_columns('comment');

-- For admins: the average and how many, all time and the last 30 days.
create or replace function public.app_rating_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object(
    'count', count(*),
    'average', round(avg(stars)::numeric, 2),
    'count_30d', count(*) filter (where created_at > now() - interval '30 days'),
    'average_30d', round((avg(stars) filter (where created_at > now() - interval '30 days'))::numeric, 2),
    'stars', jsonb_build_object('1', count(*) filter (where stars = 1), '2', count(*) filter (where stars = 2), '3', count(*) filter (where stars = 3), '4', count(*) filter (where stars = 4), '5', count(*) filter (where stars = 5))
  ) else null end
  from public.app_ratings;
$$;
revoke execute on function public.app_rating_summary() from public, anon;
grant execute on function public.app_rating_summary() to authenticated;
