-- Meets from TUNR's own Instagram (@tunr.app), imported with no hands on
-- it. A scheduled job (api/instagram-sync.js, api/_lib/instagram.js) reads
-- the account's new posts through Instagram's official API, reads each
-- flyer with the same AI as "post a meet", and lists the meet. Posts that
-- aren't meets are skipped; ones missing a date, time or findable place are
-- held for an admin to look at.
--
--   instagram_link: the access token (renewed here every week, so it never
--     lapses), the account name, and how the last run went. Server only.
--   instagram_posts: every post looked at once, and what came of it.

create table if not exists public.instagram_link (
  id boolean primary key default true check (id),
  access_token text,
  seed_hash text,          -- which INSTAGRAM_ACCESS_TOKEN (from Vercel) this came from
  refreshed_at timestamptz,
  username text,
  last_run_at timestamptz,
  last_result jsonb,
  last_error text
);
insert into public.instagram_link (id) values (true) on conflict (id) do nothing;
alter table public.instagram_link enable row level security;
-- No policies: only the server (service role) reads or writes it.

create table if not exists public.instagram_posts (
  media_id text primary key,
  permalink text,
  posted_at timestamptz,
  status text not null check (status in ('imported', 'not_a_meet', 'needs_review', 'duplicate', 'past', 'failed')),
  reason text check (char_length(reason) <= 300),
  event_id uuid references public.events (id) on delete set null,
  image_url text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists instagram_posts_posted_idx on public.instagram_posts (posted_at desc);
alter table public.instagram_posts enable row level security;

drop policy if exists "admins see instagram posts" on public.instagram_posts;
create policy "admins see instagram posts"
  on public.instagram_posts for select to authenticated
  using (public.is_admin());

-- For the admin page: is it connected, and how did the last run go. Never
-- the token.
create or replace function public.instagram_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'connected', l.access_token is not null,
    'username', l.username,
    'refreshed_at', l.refreshed_at,
    'last_run_at', l.last_run_at,
    'last_result', l.last_result,
    'last_error', l.last_error
  )
  from public.instagram_link l
  where l.id and public.is_admin();
$$;
revoke execute on function public.instagram_status() from public, anon;
grant execute on function public.instagram_status() to authenticated;

-- A meet already listed for that day near that spot (or from that post):
-- a one-off on the same Georgia day within half a mile, or a weekly/monthly
-- meet on the same weekday within half a mile. Returns its id, or null.
create or replace function public.instagram_duplicate(p_permalink text, p_day date, p_lat double precision, p_lng double precision)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
    from public.events e
   where not coalesce(e.hidden, false)
     and (
       (p_permalink is not null and e.source_url = p_permalink)
       or (
         p_lat is not null and e.lat is not null
         and public.miles_between(e.lat, e.lng, p_lat, p_lng) <= 0.5
         and (
           (e.recurrence is null and (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date = p_day)
           or (e.recurrence is not null and e.recurrence like '%' || upper(to_char(p_day, 'DY')))
         )
       )
     )
   limit 1;
$$;

-- Alerts every admin (the import's "needs a look" and "imported" notes).
create or replace function public.notify_admins(p_kind text, p_title text, p_body text, p_dedupe text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  for a in select id from public.profiles where is_admin loop
    perform public.notify(a.id, p_kind, p_title, p_body, null, case when p_dedupe is null then null else p_dedupe || ':' || a.id end);
  end loop;
end;
$$;

revoke execute on function public.instagram_duplicate(text, date, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text) from public, anon, authenticated;
grant execute on function public.instagram_duplicate(text, date, double precision, double precision) to service_role;
grant execute on function public.notify_admins(text, text, text, text) to service_role;
