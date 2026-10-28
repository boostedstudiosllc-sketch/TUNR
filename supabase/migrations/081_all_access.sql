-- All access: one account, Boosted Studios (the operator), gets every paid
-- and locked feature without paying, inviting or earning it:
--   * membership (member perks and their codes; is_member() says yes)
--   * the invite unlocks (more cars, starting clubs, profile flair)
--   * rewards without the account-age, check-in and spend rules. It still
--     spends points and takes from the stock, so those stay honest.
-- The app reads the flag too (profiles.all_access, my_points.all_access) to
-- show TUNR Rush scenery and Park Up levels as unlocked; those are kept in
-- the app, not checked here.
--
-- Only set from the SQL editor or a migration: like is_member, a guard keeps
-- it out of reach of the update policy that lets people edit their own row.
-- To give it to another account: update public.profiles set all_access = true
-- where id = '<uuid>'; to take it away, set it to false.

alter table public.profiles
  add column if not exists all_access boolean not null default false;

create or replace function public.guard_profile_all_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No auth.uid(): the SQL editor, a migration, or the service role.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.all_access := false;
  elsif new.all_access is distinct from old.all_access then
    new.all_access := old.all_access;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_all_access_guard on public.profiles;
create trigger profiles_all_access_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_all_access();

create or replace function public.all_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.all_access from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.all_access() to anon, authenticated;

-- 021's is_member(), counting all access as a membership.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_member or p.all_access from public.profiles p where p.id = auth.uid()), false);
$$;

-- 058's my_invites(): everything unlocked with all access.
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
      'cars', v_count >= 1 or public.is_admin() or public.all_access(),
      'clubs', v_count >= 1 or public.is_admin() or public.all_access(),
      'flair', v_count >= 5 or public.is_admin() or public.all_access()
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

-- 058's guard: profile flair without five friends, with all access.
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
     and public.confirmed_invites(new.id) < 5 and not public.all_access() then
    raise exception 'invite_to_unlock_flair';
  end if;
  return new;
end;
$$;

-- 049's locks: more cars and a club without a friend, with all access.
create or replace function public.lock_extra_cars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and not public.all_access()
     and (select count(*) from public.vehicles where owner_id = new.owner_id) = 1
     and public.confirmed_invites(new.owner_id) < 1 then
    raise exception 'invite_to_unlock_cars';
  end if;
  return new;
end;
$$;

create or replace function public.lock_new_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and not public.all_access()
     and not exists (select 1 from public.clubs where created_by = new.created_by)
     and public.confirmed_invites(new.created_by) < 1 then
    raise exception 'invite_to_unlock_clubs';
  end if;
  return new;
end;
$$;

-- 046's my_points(): says whether you have all access, and that you can
-- claim rewards.
create or replace function public.my_points()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_age_days int;
  v_checkins int;
  v_spent bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  v_spent := public.spent_cents(v_uid);
  return jsonb_build_object(
    'status', 'ok',
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid),
    'earned', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid and delta > 0),
    'checkins', v_checkins,
    'spent_cents', v_spent,
    'account_days', coalesce(v_age_days, 0),
    'all_access', public.all_access(),
    'can_redeem', public.all_access() or (coalesce(v_age_days, 0) >= 14 and (v_checkins >= 2 or v_spent > 0) and public.email_confirmed(v_uid))
  );
end;
$$;

-- 046's redeem_reward(): no account-age, check-in, spend or email rule with
-- all access. Points and stock still apply.
create or replace function public.redeem_reward(p_reward uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.rewards;
  v_age_days int;
  v_checkins int;
  v_balance int;
  v_mine int;
  v_spent bigint;
  v_code text;
  v_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) and not public.all_access() then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  select floor(extract(epoch from now() - u.created_at) / 86400)::int into v_age_days
    from auth.users u where u.id = v_uid;
  if coalesce(v_age_days, 0) < 14 and not public.all_access() then
    return jsonb_build_object('status', 'too_new', 'days_left', 14 - coalesce(v_age_days, 0));
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));

  select * into r from public.rewards where id = p_reward and active for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Buyers who've spent enough don't also need two check-ins.
  v_spent := public.spent_cents(v_uid);
  if r.min_spend_cents > 0 and v_spent < r.min_spend_cents and not public.all_access() then
    return jsonb_build_object('status', 'need_spend', 'spent_cents', v_spent, 'min_spend_cents', r.min_spend_cents);
  end if;
  select count(*) into v_checkins from public.meet_checkins where user_id = v_uid and voided_at is null;
  if v_checkins < 2 and v_spent = 0 and not public.all_access() then
    return jsonb_build_object('status', 'need_checkins', 'checkins', v_checkins);
  end if;

  if r.stock is not null and r.stock <= 0 then
    return jsonb_build_object('status', 'sold_out');
  end if;

  select count(*) into v_mine from public.reward_redemptions
   where user_id = v_uid and reward_id = p_reward and status <> 'cancelled';
  if v_mine >= r.per_person then
    return jsonb_build_object('status', 'limit');
  end if;

  select coalesce(sum(delta), 0) into v_balance from public.point_ledger where user_id = v_uid;
  if v_balance < r.cost then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', r.cost);
  end if;

  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
                 from generate_series(1, 8));
    exit when not exists (select 1 from public.reward_redemptions where claim_code = v_code);
  end loop;

  insert into public.reward_redemptions (id, reward_id, user_id, cost, claim_code)
  values (v_id, p_reward, v_uid, r.cost, v_code);
  insert into public.point_ledger (user_id, delta, reason, redemption_id, note)
  values (v_uid, -r.cost, 'redeem', v_id, left(r.title, 200));
  if r.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward;
  end if;

  return jsonb_build_object('status', 'ok', 'claim_code', v_code, 'balance', v_balance - r.cost);
end;
$$;

update public.profiles p
   set all_access = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('boostedstudiosllc@gmail.com');
