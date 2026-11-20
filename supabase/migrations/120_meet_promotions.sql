-- Promoted meets: a host pays to put their meet in front of more people.
--
--   Featured  (default $15, 7 days): pinned at the top of Discover with a
--             PROMOTED label.
--   Spotlight (default $29, 7 days): Featured, plus a slide in the Discover
--             banner and one alert to members nearby (their "linkups near
--             you" area; they can turn promoted alerts off).
-- Either ends when the meet does, whichever is first.
--
-- How it's paid: the host taps PROMOTE, request_promotion() makes a pending
-- row with the price from promo_packages (never from the phone), api/promote
-- opens Stripe Checkout, and Stripe's webhook (api/stripe-webhook) calls
-- activate_promotion() with the amount actually paid. Admins can also grant
-- one (paid in cash, a comp): admin_grant_promotion(). Prices are set in
-- promo_packages (Settings → Admin → Promoted meets).

create table if not exists public.promo_packages (
  id text primary key check (id in ('featured', 'spotlight')),
  name text not null,
  price_cents integer not null check (price_cents between 100 and 100000),
  days integer not null check (days between 1 and 30),
  banner boolean not null default false,
  alert boolean not null default false,
  active boolean not null default true
);
insert into public.promo_packages (id, name, price_cents, days, banner, alert) values
  ('featured', 'Featured', 1500, 7, false, false),
  ('spotlight', 'Spotlight', 2900, 7, true, true)
on conflict (id) do nothing;
alter table public.promo_packages enable row level security;
drop policy if exists "everyone sees the prices" on public.promo_packages;
create policy "everyone sees the prices" on public.promo_packages for select to anon, authenticated using (true);
drop policy if exists "admins set the prices" on public.promo_packages;
create policy "admins set the prices" on public.promo_packages for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.meet_promotions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  package text not null references public.promo_packages (id),
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  paid_via text check (paid_via in ('stripe', 'admin')),
  stripe_session text unique,
  starts_at timestamptz,
  ends_at timestamptz,
  alerted_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists meet_promotions_live_idx on public.meet_promotions (ends_at) where status = 'active';
create index if not exists meet_promotions_event_idx on public.meet_promotions (event_id, created_at desc);
alter table public.meet_promotions enable row level security;
-- The meet's hosts and admins see its promotions; writes only through the functions below.
drop policy if exists "hosts see their meet's promotions" on public.meet_promotions;
create policy "hosts see their meet's promotions" on public.meet_promotions for select to authenticated
  using (created_by = auth.uid() or public.is_event_host(event_id) or public.is_admin());

-- Promoted alerts can be turned off (Alerts settings).
alter table public.alert_settings add column if not exists promoted boolean not null default true;

-- What everyone sees: the live promotions (no prices, no buyers).
create or replace function public.promoted_meets()
returns table (event_id uuid, package text, banner boolean, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.event_id) p.event_id, p.package, k.banner, p.ends_at
    from public.meet_promotions p
    join public.promo_packages k on k.id = p.package
    join public.events e on e.id = p.event_id
   where p.status = 'active' and p.starts_at <= now() and p.ends_at > now() and not coalesce(e.hidden, false)
   order by p.event_id, k.banner desc, p.ends_at desc;
$$;
grant execute on function public.promoted_meets() to anon, authenticated;

-- A host asks to promote their meet: a pending row at today's price.
create or replace function public.request_promotion(p_event uuid, p_package text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  k public.promo_packages;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into e from public.events where id = p_event;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not (public.is_event_host(p_event) or public.is_admin()) then
    return jsonb_build_object('status', 'not_host');
  end if;
  if coalesce(e.end_at, e.start_at + interval '4 hours') <= now() or coalesce(e.hidden, false) then
    return jsonb_build_object('status', 'meet_over');
  end if;
  select * into k from public.promo_packages where id = p_package and active;
  if not found then
    return jsonb_build_object('status', 'bad_package');
  end if;
  if exists (select 1 from public.meet_promotions where event_id = p_event and status = 'active' and ends_at > now() and package = p_package) then
    return jsonb_build_object('status', 'already');
  end if;
  -- A checkout already waiting (the host backed out and tried again): reuse
  -- it, so two payments can't make two promotions (or two alerts).
  select id into v_id from public.meet_promotions
   where event_id = p_event and package = p_package and status = 'pending' and created_at > now() - interval '1 day'
   order by created_at desc limit 1;
  if v_id is not null then
    update public.meet_promotions set amount_cents = k.price_cents where id = v_id;
    return jsonb_build_object('status', 'ok', 'id', v_id, 'amount_cents', k.price_cents, 'package', k.name, 'title', e.title, 'days', k.days);
  end if;
  if (select count(*) from public.meet_promotions where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  insert into public.meet_promotions (event_id, package, amount_cents, created_by)
  values (p_event, p_package, k.price_cents, v_uid) returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id, 'amount_cents', k.price_cents, 'package', k.name, 'title', e.title, 'days', k.days);
end;
$$;
revoke execute on function public.request_promotion(uuid, text) from public, anon;
grant execute on function public.request_promotion(uuid, text) to authenticated;

-- Turns a promotion on: from now for the package's days, or until the meet
-- ends; Spotlight alerts members nearby once. (Not callable from the app.)
create or replace function public.start_promotion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.meet_promotions;
  k public.promo_packages;
  e public.events;
  v_end timestamptz;
  v_sent int := 0;
  rec record;
begin
  select * into p from public.meet_promotions where id = p_id for update;
  select * into k from public.promo_packages where id = p.package;
  select * into e from public.events where id = p.event_id;
  -- Hidden by moderators, or over, by the time the payment landed: don't go
  -- live or alert anyone; admins refund it.
  if coalesce(e.hidden, false) or coalesce(e.end_at, e.start_at + interval '4 hours') <= now() then
    perform public.notify_admins('promotion_refund', '💸 Refund a promotion',
      'A ' || k.name || ' promotion was paid for “' || left(coalesce(e.title, 'a meet'), 60) || '”, which is hidden or over. Refund it in Stripe, then STOP it in Settings → Admin → Promoted meets.',
      'promo-refund:' || p.id);
    return jsonb_build_object('status', 'meet_unavailable');
  end if;
  v_end := least(now() + make_interval(days => k.days), coalesce(e.end_at, e.start_at + interval '4 hours'));
  update public.meet_promotions set status = 'active', starts_at = now(), ends_at = v_end where id = p_id;
  -- One nearby alert per meet, ever, however many Spotlights it gets.
  if k.alert and e.lat is not null and e.lng is not null
     and not exists (select 1 from public.meet_promotions o where o.event_id = e.id and o.alerted_at is not null) then
    for rec in
      select s.user_id
        from public.alert_settings s
       where s.promoted and s.lat is not null and s.lng is not null
         and public.miles_between(s.lat, s.lng, e.lat, e.lng) <= least(s.radius_miles, 50)
         -- Not the hosts, and not anyone who's blocked (or is blocked by) a host or the buyer.
         and not exists (
           select 1 from (
             select e.created_by as h
             union select p.created_by
             union select c.user_id from public.event_cohosts c where c.event_id = e.id and c.status = 'accepted'
           ) hosts
           where hosts.h is not null and (hosts.h = s.user_id or public.blocked_either_way(s.user_id, hosts.h))
         )
       order by public.miles_between(s.lat, s.lng, e.lat, e.lng)
       limit 500
    loop
      -- A private meet's address is only for the people it lets in.
      perform public.notify(rec.user_id, 'promoted_meet', '⭐ Promoted meet near you: ' || left(e.title, 80),
        case when coalesce(e.visibility, 'public') = 'private' then 'Private meet. Tap to ask to join.' else coalesce(e.location, '') || '. Tap to see it.' end,
        'meet:' || e.id, 'promo:' || e.id);
      v_sent := v_sent + 1;
    end loop;
    update public.meet_promotions set alerted_at = now() where id = p_id;
  end if;
  return jsonb_build_object('status', 'ok', 'ends_at', v_end, 'alerted', v_sent);
end;
$$;
revoke execute on function public.start_promotion(uuid) from public, anon, authenticated;

-- Stripe's webhook (api/stripe-webhook, with the service key): paid in full.
create or replace function public.activate_promotion(p_id uuid, p_session text, p_amount_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.meet_promotions;
begin
  select * into p from public.meet_promotions where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p.status = 'active' then
    return jsonb_build_object('status', 'already'); -- Stripe can send a webhook twice
  end if;
  if p.status <> 'pending' then
    return jsonb_build_object('status', 'not_pending');
  end if;
  if coalesce(p_amount_cents, 0) < p.amount_cents then
    return jsonb_build_object('status', 'underpaid');
  end if;
  update public.meet_promotions set paid_via = 'stripe', stripe_session = p_session, amount_cents = p_amount_cents where id = p_id;
  return public.start_promotion(p_id);
end;
$$;
revoke execute on function public.activate_promotion(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_promotion(uuid, text, integer) to service_role;

-- Admins: promote a meet for free (a comp, or paid in person).
create or replace function public.admin_grant_promotion(p_event uuid, p_package text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if not exists (select 1 from public.promo_packages where id = p_package) then
    raise exception 'bad_package';
  end if;
  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'not_found';
  end if;
  insert into public.meet_promotions (event_id, package, amount_cents, paid_via, created_by)
  values (p_event, p_package, 0, 'admin', auth.uid()) returning id into v_id;
  return public.start_promotion(v_id) || jsonb_build_object('id', v_id);
end;
$$;
revoke execute on function public.admin_grant_promotion(uuid, text) from public, anon;
grant execute on function public.admin_grant_promotion(uuid, text) to authenticated;

create or replace function public.cancel_promotion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  update public.meet_promotions set status = 'cancelled' where id = p_id;
end;
$$;
revoke execute on function public.cancel_promotion(uuid) from public, anon;
grant execute on function public.cancel_promotion(uuid) to authenticated;
