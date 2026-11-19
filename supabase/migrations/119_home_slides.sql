-- The swipeable banner at the top of Discover (HomeSlides.jsx): what's new
-- and what's on. Admins add slides here (Settings → Admin → Home banner);
-- the app mixes in its own (the hottest meet this week, TUNR Tuesdays, your
-- Daily Pit Stop). Everyone sees the live ones, signed in or not.
--
--   home_slides: title, body, button label, where the button goes (an app
--   link like "tab:perks", "play:rush", "meet:<id>", "open:photo-spots", or
--   an https:// address), an optional picture from TUNR's storage, a colour
--   theme, an optional start and end, and the order.

create table if not exists public.home_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  body text check (char_length(body) <= 140),
  cta text not null default 'Open' check (char_length(cta) between 1 and 24),
  link text not null check (
    char_length(link) <= 300
    and (link ~ '^(tab|play|meet|linkup|post|forum|club|person|open):[A-Za-z0-9:_-]+$' or link ~ '^https://[^\s<>"]+$')
  ),
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^(https://[a-z0-9]{20}\.supabase\.co|http://(127\.0\.0\.1|localhost):[0-9]+)/storage/v1/object/public/')),
  theme text not null default 'blue' check (theme in ('blue', 'purple', 'red', 'gold', 'green', 'night')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort integer not null default 0,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint home_slides_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists home_slides_live_idx on public.home_slides (sort, created_at) where active;

alter table public.home_slides enable row level security;
drop policy if exists "everyone sees live slides" on public.home_slides;
create policy "everyone sees live slides" on public.home_slides for select to anon, authenticated
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.is_admin());
drop policy if exists "admins add slides" on public.home_slides;
create policy "admins add slides" on public.home_slides for insert to authenticated with check (public.is_admin());
drop policy if exists "admins change slides" on public.home_slides;
create policy "admins change slides" on public.home_slides for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins remove slides" on public.home_slides;
create policy "admins remove slides" on public.home_slides for delete to authenticated using (public.is_admin());

-- A few to start with: what's new lately.
insert into public.home_slides (title, body, cta, link, theme, sort)
select * from (values
  ('Drive together, talk live', 'Start a convoy: everyone on one map, plus group voice chat for the drive.', 'Start a convoy', 'tab:community', 'purple', 10),
  ('Find your next photo spot', 'Bridges, rooftops, murals and night lights around Georgia, rated by members.', 'Browse spots', 'open:photo-spots', 'blue', 20),
  ('Daily Pit Stop', 'Open TUNR every day for a point. Every 7th day in a row pays a bonus.', 'Claim today', 'open:pitstop', 'gold', 30),
  ('Games work offline', 'No signal at the meet? Drift King, Rush and the rest still play.', 'Play now', 'tab:perks', 'red', 40)
) as s(title, body, cta, link, theme, sort)
where not exists (select 1 from public.home_slides);
