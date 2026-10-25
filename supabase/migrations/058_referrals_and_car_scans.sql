-- Referral points and "Scan my build".
--
-- Referral points are paid when the invited friend checks in at their first
-- meet (at the meet's location, so a throwaway email can't earn them):
-- +5 to whoever brought them in, +2 welcome to the new member. At most 10
-- paid referrals a month per person. The unlocks from 049 are unchanged
-- (they still count from the confirmed email).
--
-- "Scan my build": every car has a public page; the QR sticker on the car
-- opens it with the owner's invite code, so a scanner who signs up counts as
-- the owner's referral ("via the QR on your car"). Scans are counted per car
-- for the owner, with the scanner's address kept only as a one-way hash to
-- skip repeat scans.

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus'
));

create unique index if not exists point_ledger_welcome_once
  on public.point_ledger (user_id) where reason = 'welcome_bonus';

-- How someone was brought in.
alter table public.profiles
  add column if not exists invited_via text check (invited_via in ('link', 'scan')),
  add column if not exists invited_vehicle uuid references public.vehicles (id) on delete set null;

-- 049's guard, plus the new columns: only claim_invite sets them.
create or replace function public.guard_profile_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.invite_code is null or auth.uid() is not null then
      new.invite_code := public.gen_invite_code();
    end if;
    if auth.uid() is not null then
      new.invited_by := null;
      new.invited_at := null;
      new.invited_via := null;
      new.invited_vehicle := null;
      new.profile_color := null;
    end if;
    return new;
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.invite_code := old.invite_code;
  if coalesce(current_setting('tunr.claiming_invite', true), '') <> 'on' then
    new.invited_by := old.invited_by;
    new.invited_at := old.invited_at;
    new.invited_via := old.invited_via;
    new.invited_vehicle := old.invited_vehicle;
  end if;
  if new.profile_color is distinct from old.profile_color and new.profile_color is not null
     and public.confirmed_invites(new.id) < 5 then
    raise exception 'invite_to_unlock_flair';
  end if;
  return new;
end;
$$;

-- 049's claim_invite, now told how they arrived (a link, or the QR on a car).
drop function if exists public.claim_invite(text);
create or replace function public.claim_invite(p_code text, p_source text default 'link', p_vehicle uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter public.profiles;
  v_me public.profiles;
  v_created timestamptz;
  v_via text := case when p_source = 'scan' then 'scan' else 'link' end;
  v_vehicle uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into v_me from public.profiles where id = v_uid;
  if v_me.invited_by is not null then
    return jsonb_build_object('status', 'already');
  end if;
  select created_at into v_created from auth.users where id = v_uid;
  if v_created < now() - interval '7 days' then
    return jsonb_build_object('status', 'too_late');
  end if;
  select * into v_inviter from public.profiles
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_inviter.id = v_uid then
    return jsonb_build_object('status', 'self');
  end if;
  -- Only a car that really is the inviter's.
  if v_via = 'scan' then
    select id into v_vehicle from public.vehicles where id = p_vehicle and owner_id = v_inviter.id;
  end if;

  perform set_config('tunr.claiming_invite', 'on', true);
  update public.profiles
     set invited_by = v_inviter.id, invited_at = now(), invited_via = v_via, invited_vehicle = v_vehicle
   where id = v_uid;
  perform set_config('tunr.claiming_invite', 'off', true);

  perform public.notify(v_inviter.id, 'invite',
    case when v_via = 'scan' then '🔳 Someone joined from your car''s QR' else '🎉 A friend joined with your invite' end,
    coalesce('@' || nullif(v_me.username, ''), 'Someone new') ||
      ' signed up. It counts once they confirm their email, and you get +5 points when they check in at their first meet.',
    'person:' || v_uid, 'invite:' || v_uid);
  return jsonb_build_object('status', 'ok', 'inviter', v_inviter.username);
end;
$$;

revoke execute on function public.claim_invite(text, text, uuid) from public, anon;
grant execute on function public.claim_invite(text, text, uuid) to authenticated;

-- ============ REFERRAL POINTS ============
create table if not exists public.referral_payouts (
  referred_id uuid primary key references auth.users (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  paid boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists referral_payouts_inviter_idx on public.referral_payouts (inviter_id, created_at desc);

alter table public.referral_payouts enable row level security;
-- No policies: written by the trigger below only.

-- On someone's first check-in: welcome bonus, and the referrer's points
-- (unless they've had 10 paid this month).
create or replace function public.pay_referral_on_first_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_paid int;
begin
  if (select count(*) from public.meet_checkins where user_id = new.user_id and voided_at is null) <> 1 then
    return new;
  end if;
  select invited_by into v_inviter from public.profiles where id = new.user_id;
  if v_inviter is null or exists (select 1 from public.referral_payouts where referred_id = new.user_id) then
    return new;
  end if;

  select count(*) into v_paid from public.referral_payouts
   where inviter_id = v_inviter and paid
     and created_at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';

  insert into public.referral_payouts (referred_id, inviter_id, paid) values (new.user_id, v_inviter, v_paid < 10)
  on conflict do nothing;

  insert into public.point_ledger (user_id, delta, reason, note)
  values (new.user_id, 2, 'welcome_bonus', 'Welcome to TUNR: first meet!')
  on conflict do nothing;

  if v_paid < 10 then
    insert into public.point_ledger (user_id, delta, reason, note)
    values (v_inviter, 5, 'referral_bonus',
            left('@' || coalesce((select username from public.profiles where id = new.user_id), 'a friend') || ' checked in at their first meet', 200));
    perform public.notify(v_inviter, 'reward', '⭐ +5 referral points',
      coalesce('@' || (select username from public.profiles where id = new.user_id), 'Your friend') ||
        ' checked in at their first meet.', 'person:' || new.user_id, 'referral:' || new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists meet_checkins_referral on public.meet_checkins;
create trigger meet_checkins_referral
  after insert on public.meet_checkins
  for each row execute function public.pay_referral_on_first_checkin();

-- ============ CAR SCANS ============
create table if not exists public.car_scans (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  visitor text not null,
  created_at timestamptz not null default now()
);

create index if not exists car_scans_vehicle_idx on public.car_scans (vehicle_id, created_at desc);

alter table public.car_scans enable row level security;
-- No policies: recorded and read through the functions below.

-- Counted when the car page opens from the sticker. The owner's own scans
-- and repeats from the same visitor within 30 minutes don't count.
create or replace function public.record_car_scan(p_vehicle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_visitor text := md5(coalesce(auth.uid()::text, public.request_ip(), 'unknown') || ':tunr-car-scan');
begin
  select owner_id into v_owner from public.vehicles where id = p_vehicle;
  if v_owner is null or v_owner = auth.uid() then
    return;
  end if;
  if exists (select 1 from public.car_scans
              where vehicle_id = p_vehicle and visitor = v_visitor and created_at > now() - interval '30 minutes') then
    return;
  end if;
  if (select count(*) from public.car_scans where visitor = v_visitor and created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  insert into public.car_scans (vehicle_id, visitor) values (p_vehicle, v_visitor);
  delete from public.car_scans where vehicle_id = p_vehicle and created_at < now() - interval '400 days';
end;
$$;

revoke execute on function public.record_car_scan(uuid) from public;
grant execute on function public.record_car_scan(uuid) to anon, authenticated;

-- For the owner: scans this month and all time, and sign-ups from the QR.
create or replace function public.car_scan_stats(p_vehicle uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'month', (select count(*) from public.car_scans s
               where s.vehicle_id = p_vehicle
                 and s.created_at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York'),
    'total', (select count(*) from public.car_scans s where s.vehicle_id = p_vehicle),
    'joined', (select count(*) from public.profiles p where p.invited_vehicle = p_vehicle)
  )
  where exists (select 1 from public.vehicles v where v.id = p_vehicle and (v.owner_id = auth.uid() or public.is_admin()));
$$;

revoke execute on function public.car_scan_stats(uuid) from public, anon;
grant execute on function public.car_scan_stats(uuid) to authenticated;

-- 050's my_invites, plus how each friend arrived.
create or replace function public.my_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  v_count := public.confirmed_invites(v_uid);
  return jsonb_build_object(
    'status', 'ok',
    'code', (select invite_code from public.profiles where id = v_uid),
    'confirmed', v_count,
    'pending', (select count(*) from public.profiles p
                 where p.invited_by = v_uid and not public.email_confirmed(p.id)),
    'unlocked', jsonb_build_object(
      'cars', v_count >= 1 or public.is_admin(),
      'clubs', v_count >= 1 or public.is_admin(),
      'flair', v_count >= 5 or public.is_admin()
    ),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'username', p.username,
               'confirmed', public.email_confirmed(p.id),
               'joined', p.invited_at,
               'via', coalesce(p.invited_via, 'link'),
               'car', (select trim(coalesce(v.year::text, '') || ' ' || v.make || ' ' || v.model) from public.vehicles v where v.id = p.invited_vehicle),
               'points', (select r.paid from public.referral_payouts r where r.referred_id = p.id))
             order by p.invited_at desc nulls last)
        from public.profiles p where p.invited_by = v_uid), '[]'::jsonb)
  );
end;
$$;

-- ============ THE STICKER AS A REWARD ============
-- "$1" by the 10-points-per-dollar rule. Off until stickers are printed;
-- switch it on in Settings → Admin → Rewards.
insert into public.rewards (title, description, kind, cost, how_to_claim, per_person, active)
select 'Scan my build sticker',
       'Weatherproof QR sticker for your window. People scan it at meets to see your build on TUNR.',
       'merch', 10, 'Show your claim code at a Boosted meet to pick up your sticker.', 2, false
 where not exists (select 1 from public.rewards where title = 'Scan my build sticker');

-- ============ BUILD PAGES ARE OPT-IN ============
-- The garage promises other people see a car's make and model, never the
-- owner's name. A build page shows the owner's @username, so each car's page
-- stays off until its owner turns it on (when they get the sticker).
alter table public.vehicles
  add column if not exists public_page boolean not null default false;

-- What the sticker opens. Null when the car doesn't exist or its page is off
-- (the owner still sees their own).
create or replace function public.get_build_page(p_vehicle uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id, 'year', v.year, 'make', v.make, 'model', v.model,
    'build_notes', v.build_notes, 'photo_url', v.photo_url, 'public_page', v.public_page,
    'owner', jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
                                'profile_color', p.profile_color, 'city', p.city),
    'is_mine', v.owner_id = auth.uid(),
    'other_cars', (select count(*) from public.vehicles o where o.owner_id = v.owner_id and o.id <> v.id)
  )
    from public.vehicles v
    join public.profiles p on p.id = v.owner_id
   where v.id = p_vehicle
     and (v.public_page or v.owner_id = auth.uid());
$$;

revoke execute on function public.get_build_page(uuid) from public;
grant execute on function public.get_build_page(uuid) to anon, authenticated;

-- Scans only count on a page that's on.
create or replace function public.record_car_scan(p_vehicle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_visitor text := md5(coalesce(auth.uid()::text, public.request_ip(), 'unknown') || ':tunr-car-scan');
begin
  select owner_id into v_owner from public.vehicles where id = p_vehicle and public_page;
  if v_owner is null or v_owner = auth.uid() then
    return;
  end if;
  if exists (select 1 from public.car_scans
              where vehicle_id = p_vehicle and visitor = v_visitor and created_at > now() - interval '30 minutes') then
    return;
  end if;
  if (select count(*) from public.car_scans where visitor = v_visitor and created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  insert into public.car_scans (vehicle_id, visitor) values (p_vehicle, v_visitor);
  delete from public.car_scans where vehicle_id = p_vehicle and created_at < now() - interval '400 days';
end;
$$;
