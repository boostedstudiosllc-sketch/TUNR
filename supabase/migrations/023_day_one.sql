-- Day 1: a badge for everyone who signed up before launch, numbered in order.
--
-- The point is the link in the bio. People who sign up now get a real account
-- straight away — not a waitlist entry to chase later — and the badge is what
-- makes signing up before there's much to do feel worth it.
--
-- The badge is set by the database, never the client: if it could be written
-- from the browser it would mean nothing, and it's only worth showing off
-- because it can't be faked. Eligibility is when the *auth account* was
-- created, not the profile row, so someone who signs up today and confirms
-- their email next week still counts.
--
-- Closing the window at launch is one statement in the SQL editor:
--
--   update public.launch_settings set day_one_closes_at = now();
--
-- Accounts created after that don't get the badge; everyone who has it keeps it.

-- ============ SETTINGS ============
-- One row. Readable by everyone so the /join page can stop promising the badge
-- once it's closed.
create table if not exists public.launch_settings (
  id boolean primary key default true check (id),
  day_one_closes_at timestamptz
);

insert into public.launch_settings (id) values (true) on conflict (id) do nothing;

alter table public.launch_settings enable row level security;

drop policy if exists "launch settings are public" on public.launch_settings;
create policy "launch settings are public"
  on public.launch_settings for select
  to anon, authenticated
  using (true);

-- ============ PROFILE COLUMNS ============
alter table public.profiles
  add column if not exists day_one boolean not null default false;

-- "Day 1 #37". Gaps are fine (an account deleted, a failed insert) — the order
-- is what matters, not that the numbers are contiguous.
alter table public.profiles
  add column if not exists day_one_number integer unique;

-- Where the account came from: 'bio', 'tiktok', 'ig'... from the ?ref= on the
-- link. Null means they signed up inside the app. Analytics only.
alter table public.profiles
  add column if not exists signup_source text
    check (signup_source ~ '^[a-z0-9_-]{1,32}$');

create sequence if not exists public.day_one_number_seq;

-- ============ ELIGIBILITY ============
create or replace function public.day_one_open_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.day_one_closes_at is null or u.created_at < s.day_one_closes_at
       from auth.users u, public.launch_settings s
      where u.id = p_user_id),
    false
  );
$$;

-- Same pattern as the is_admin and is_member guards: the update policy lets a
-- user write their own row, so these columns need a trigger in front of them.
create or replace function public.guard_profile_day_one()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The app saves profiles with upserts, which fire this even when the row
    -- exists and the statement ends up as an update. Drawing a number then
    -- would burn one on every profile save; the update path below guards
    -- the columns instead.
    if exists (select 1 from public.profiles where id = new.id) then
      return new;
    end if;
    -- Decided here for every insert, API or not, so there's no path where the
    -- client's value is trusted. The SQL editor can still grant one by hand.
    new.day_one := (auth.uid() is null and new.day_one) or public.day_one_open_for(new.id);
    if new.day_one then
      new.day_one_number := nextval('public.day_one_number_seq');
    else
      new.day_one_number := null;
    end if;
    return new;
  end if;

  -- No auth.uid() means the SQL editor, a migration or the service role.
  if auth.uid() is null then
    return new;
  end if;

  new.day_one := old.day_one;
  new.day_one_number := old.day_one_number;
  -- The source can be filled in once and never changed. Once, rather than
  -- only at insert, because the app has several places that create the row
  -- and the one carrying the source doesn't always get there first.
  if old.signup_source is not null then
    new.signup_source := old.signup_source;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_day_one_guard on public.profiles;
create trigger profiles_day_one_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_day_one();

-- ============ BACKFILL ============
-- Everyone already here was here from the beginning, in the order they joined.
-- Runs as the migration, so auth.uid() is null and the guard lets it through.
with ordered as (
  select p.id, row_number() over (order by u.created_at, p.id) as n
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.day_one_number is null
)
update public.profiles p
   set day_one = true,
       day_one_number = o.n + coalesce((select max(day_one_number) from public.profiles), 0)
  from ordered o
 where o.id = p.id;

select setval(
  'public.day_one_number_seq',
  greatest(coalesce((select max(day_one_number) from public.profiles), 0), 1),
  coalesce((select max(day_one_number) from public.profiles), 0) > 0
);

-- ============ COMMENTS ============
-- The badge shows next to a name in the comments, which is where people
-- actually see each other. Columns are appended so the view can be replaced
-- in place; security_invoker is restated because replacing a view resets its
-- options, and 008 depends on it to hide comments on private meets.
create or replace view public.comments_with_author
with (security_invoker = true) as
select c.id, c.event_id, c.user_id, c.body, c.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.day_one, false) as day_one,
       p.day_one_number
from public.comments c
left join public.profiles p on p.id = c.user_id;

grant select on public.comments_with_author to anon, authenticated;

-- ============ ADMIN STATS ============
-- How many signed up and from which link. A definer view so it can count
-- every profile; the where clause is what keeps it admin-only.
drop view if exists public.signup_stats;
create view public.signup_stats as
select
  coalesce(p.signup_source, 'app') as source,
  count(*) as signups,
  count(*) filter (where p.day_one) as day_one,
  count(*) filter (where p.created_at > now() - interval '7 days') as last_7_days
from public.profiles p
where public.is_admin()
group by 1;

grant select on public.signup_stats to authenticated;
