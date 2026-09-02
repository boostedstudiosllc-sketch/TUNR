-- Partners and perks: the membership tier's content, without the billing.
--
-- Deliberately shipped free first. There are no partner deals yet, and you
-- can't charge a subscription for benefits that don't exist. A live directory
-- is also the tool for signing partners — "you're listed in front of Atlanta
-- car people, free, and we send you customers" is a much easier pitch than a
-- promise. Billing lands once there's something worth paying for.
--
-- The membership flag already exists here so the redaction is built and
-- tested from day one: everyone sees the offers, only members see the codes.
-- Turning billing on later sets is_member; nothing else has to change.

-- ============ MEMBERSHIP ============
-- Kept minimal on purpose. Stripe's customer/subscription ids get added
-- alongside when checkout is wired up; nothing here assumes a provider.
alter table public.profiles
  add column if not exists is_member boolean not null default false;

alter table public.profiles
  add column if not exists member_since timestamptz;

-- Same reasoning as is_admin in 011: the update policy lets a user write
-- their own profile row, so the flag needs a guard or anyone could grant
-- themselves a paid membership with one REST call.
create or replace function public.guard_profile_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No auth.uid() means this isn't an API request — it's the SQL editor, a
  -- migration, or the service role handling a payment webhook.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_member := false;
    new.member_since := null;
  else
    if new.is_member is distinct from old.is_member then
      new.is_member := old.is_member;
    end if;
    if new.member_since is distinct from old.member_since then
      new.member_since := old.member_since;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_membership_guard on public.profiles;
create trigger profiles_membership_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_membership();

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_member from public.profiles p where p.id = auth.uid()), false);
$$;

-- ============ PARTNERS ============
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null default 'other'
    check (category in ('detailing', 'parts', 'wheels_tires', 'tuning', 'wraps', 'insurance', 'track', 'other')),
  description text check (char_length(description) <= 400),
  logo_url text,
  website text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partners_active_idx on public.partners (active, name);

alter table public.partners enable row level security;

drop policy if exists "active partners are public" on public.partners;
create policy "active partners are public"
  on public.partners for select
  to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "admins manage partners" on public.partners;
create policy "admins manage partners"
  on public.partners for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists partners_touch_updated_at on public.partners;
create trigger partners_touch_updated_at
  before update on public.partners
  for each row execute function public.touch_updated_at();

-- ============ PERKS ============
create table if not exists public.perks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 600),
  -- Short, human version of the saving: "20% off", "$25 off a full detail".
  discount_text text not null check (char_length(btrim(discount_text)) between 1 and 60),
  -- How it's claimed. `code` is the only one that needs hiding.
  redemption_type text not null default 'code'
    check (redemption_type in ('code', 'show_screen', 'link')),
  code text,
  url text,
  terms text check (char_length(terms) <= 400),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists perks_partner_idx on public.perks (partner_id);
create index if not exists perks_active_idx on public.perks (active, ends_at);

alter table public.perks enable row level security;

-- The table itself stays admin-only. Everyone reads the view below instead,
-- which is what keeps the code out of non-members' hands — row-level security
-- can't hide a single column.
drop policy if exists "admins manage perks" on public.perks;
create policy "admins manage perks"
  on public.perks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists perks_touch_updated_at on public.perks;
create trigger perks_touch_updated_at
  before update on public.perks
  for each row execute function public.touch_updated_at();

-- Definer view: shows every live offer to everyone, because seeing what you'd
-- get is the whole conversion argument. The code is null unless you're a
-- member, so the paywall is enforced in the database rather than the screen.
drop view if exists public.perks_public;
create view public.perks_public as
select
  pk.id,
  pk.partner_id,
  pk.title,
  pk.description,
  pk.discount_text,
  pk.redemption_type,
  pk.terms,
  pk.starts_at,
  pk.ends_at,
  p.name as partner_name,
  p.slug as partner_slug,
  p.category as partner_category,
  p.logo_url as partner_logo_url,
  p.website as partner_website,
  p.city as partner_city,
  -- Members get the code and the link; everyone else gets the pitch.
  case when public.is_member() or public.is_admin() then pk.code else null end as code,
  case when public.is_member() or public.is_admin() then pk.url else null end as url,
  (public.is_member() or public.is_admin()) as unlocked
from public.perks pk
join public.partners p on p.id = pk.partner_id
where pk.active
  and p.active
  and (pk.starts_at is null or pk.starts_at <= now())
  and (pk.ends_at is null or pk.ends_at >= now());

grant select on public.perks_public to anon, authenticated;

-- ============ REDEMPTIONS ============
-- So a partner can be told "we sent you 40 people this month", which is how
-- you keep them signed up.
create table if not exists public.perk_redemptions (
  id uuid primary key default gen_random_uuid(),
  perk_id uuid not null references public.perks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

create index if not exists perk_redemptions_perk_idx
  on public.perk_redemptions (perk_id, redeemed_at desc);

alter table public.perk_redemptions enable row level security;

drop policy if exists "users see their own redemptions" on public.perk_redemptions;
create policy "users see their own redemptions"
  on public.perk_redemptions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "members record a redemption" on public.perk_redemptions;
create policy "members record a redemption"
  on public.perk_redemptions for insert
  to authenticated
  with check (user_id = auth.uid() and (public.is_member() or public.is_admin()));

-- Counts only, no identities — safe to show next to a perk and to hand a
-- partner as a monthly figure.
drop view if exists public.perk_redemption_counts;
create view public.perk_redemption_counts as
select perk_id, count(*) as redemptions
from public.perk_redemptions
group by perk_id;

grant select on public.perk_redemption_counts to anon, authenticated;
