-- Free perks: some offers go to anyone with an account, not just members.
--
-- Chemical Guys (BOOSTED, 10% off) becomes the reason to sign up rather than
-- the reason to pay: a free account is enough to see the code. Every other
-- perk stays members-only by default, so this is opt-in per perk.
--
-- The gate stays in the database. Signed out, perks_public still shows the
-- offer and nulls the code, exactly as for members-only perks — the code
-- only comes back once there's an account behind the request.

alter table public.perks
  add column if not exists members_only boolean not null default true;

-- Redemption policies run as the caller, who can't read the admin-only perks
-- table, so they ask through this.
create or replace function public.perk_is_free(p_perk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not pk.members_only from public.perks pk where pk.id = p_perk_id), false);
$$;

-- Same as 021 plus the free case, and members_only appended so the app can
-- say "free with an account" on the card.
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
  case when a.unlocked then pk.code else null end as code,
  case when a.unlocked then pk.url else null end as url,
  a.unlocked,
  pk.members_only
from public.perks pk
join public.partners p on p.id = pk.partner_id
cross join lateral (
  select (
    public.is_member()
    or public.is_admin()
    or (not pk.members_only and auth.uid() is not null)
  ) as unlocked
) a
where pk.active
  and p.active
  and (pk.starts_at is null or pk.starts_at <= now())
  and (pk.ends_at is null or pk.ends_at >= now());

grant select on public.perks_public to anon, authenticated;

drop policy if exists "members record a redemption" on public.perk_redemptions;
create policy "members record a redemption"
  on public.perk_redemptions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_member() or public.is_admin() or public.perk_is_free(perk_id))
  );

update public.perks pk
   set members_only = false,
       description = 'Use the code at checkout on chemicalguys.com. Free with any TUNR account.'
  from public.partners p
 where p.id = pk.partner_id
   and p.slug = 'chemical-guys'
   and pk.code = 'BOOSTED';
