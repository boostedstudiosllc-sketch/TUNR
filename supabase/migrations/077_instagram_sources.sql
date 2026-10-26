-- Other Instagram accounts to import meets from (with their OK), such as
-- @nawfside.tm. Read through Instagram's Business Discovery, which needs the
-- Facebook-linked connection: @tunr.app linked to a Facebook Page, and a
-- token from Meta's Graph API Explorer (api/_lib/instagram.js).
--
--   instagram_sources: the accounts to watch. Admins add and remove them;
--     the import notes when each was last read and any problem.
--   instagram_link gains which kind of token it holds and @tunr.app's
--     Instagram id (the Facebook connection reads by id).
--   instagram_posts gains which account a post came from.

alter table public.instagram_link
  add column if not exists token_kind text check (token_kind in ('instagram', 'facebook')),
  add column if not exists ig_user_id text;

alter table public.instagram_posts
  add column if not exists account text;

create table if not exists public.instagram_sources (
  username text primary key check (username ~ '^[a-z0-9._]{1,30}$'),
  active boolean not null default true,
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_count integer,
  last_error text check (char_length(last_error) <= 300)
);
alter table public.instagram_sources enable row level security;

drop policy if exists "admins see instagram sources" on public.instagram_sources;
create policy "admins see instagram sources"
  on public.instagram_sources for select to authenticated using (public.is_admin());
drop policy if exists "admins add instagram sources" on public.instagram_sources;
create policy "admins add instagram sources"
  on public.instagram_sources for insert to authenticated with check (public.is_admin());
drop policy if exists "admins change instagram sources" on public.instagram_sources;
create policy "admins change instagram sources"
  on public.instagram_sources for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins remove instagram sources" on public.instagram_sources;
create policy "admins remove instagram sources"
  on public.instagram_sources for delete to authenticated using (public.is_admin());

insert into public.instagram_sources (username, added_by) values ('nawfside.tm', null) on conflict (username) do nothing;

-- The admin page also shows which kind of connection it is.
create or replace function public.instagram_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'connected', l.access_token is not null,
    'kind', l.token_kind,
    'username', l.username,
    'refreshed_at', l.refreshed_at,
    'last_run_at', l.last_run_at,
    'last_result', l.last_result,
    'last_error', l.last_error
  )
  from public.instagram_link l
  where l.id and public.is_admin();
$$;
