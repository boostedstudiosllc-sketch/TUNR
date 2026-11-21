-- Fixes from the TUNR+ security audit (122):
--   * A failed renewal (past_due) no longer gives the unpaid month free:
--     membership runs to the end of what was paid, plus up to a week while
--     Stripe retries the card.
--   * A late "incomplete" event can't switch a new payer off.
--   * An old card subscription ending doesn't remove a free membership.
--   * The admin log says whose row changed for tables keyed by user_id
--     (memberships), not just what changed.

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  d jsonb := '{}'::jsonb;
  k text;
  cut constant int := 200;
begin
  if not public.is_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (o -> k) is distinct from (n -> k) then
        d := d || jsonb_build_object(k, jsonb_build_array(left(o ->> k, cut), left(n ->> k, cut)));
      end if;
    end loop;
    if d = '{}'::jsonb then
      return null;
    end if;
  else
    for k in select jsonb_object_keys(coalesce(n, o)) loop
      d := d || jsonb_build_object(k, left(coalesce(n, o) ->> k, cut));
    end loop;
  end if;
  insert into public.admin_log (admin_id, action, target, row_id, changes)
  values (auth.uid(), tg_op, tg_table_name, coalesce(coalesce(n, o) ->> 'id', coalesce(n, o) ->> 'user_id'), d);
  return null;
end;
$$;

create or replace function public.sync_membership(
  p_user uuid, p_status text, p_plan text, p_until timestamptz, p_cancel_at timestamptz,
  p_customer text, p_subscription text, p_event_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.memberships;
  v_on boolean := p_status in ('active', 'trialing', 'past_due');
  v_paid boolean := p_status in ('active', 'trialing');
  v_until timestamptz;
  v_plan text := case when p_plan in ('month', 'year') then p_plan end;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_member:' || p_user::text));
  select * into m from public.memberships where user_id = p_user;
  if m.synced_at is not null and p_event_at < m.synced_at then
    return jsonb_build_object('status', 'stale'); -- Stripe sent them out of order
  end if;
  -- "incomplete" only comes before a new subscription's first payment;
  -- arriving late (same second as "active"), it mustn't switch a payer off.
  if p_status = 'incomplete' then
    return jsonb_build_object('status', 'ignored');
  end if;
  -- A free membership from TUNR isn't ended by an old card subscription ending.
  if not v_on and m.via = 'admin' then
    return jsonb_build_object('status', 'comp_kept');
  end if;
  -- A cancelled old subscription mustn't end a newer one.
  if not v_on and m.stripe_subscription is not null and p_subscription is not null and m.stripe_subscription <> p_subscription then
    return jsonb_build_object('status', 'other_subscription');
  end if;
  -- Paid (active, trialing): Stripe's period end. A failed renewal (past_due):
  -- Stripe has already moved the period end to the unpaid month, so keep
  -- what was paid for, plus at most a week while Stripe retries the card.
  v_until := case
    when v_paid then coalesce(p_until, greatest(m.active_until, now() + case when coalesce(v_plan, m.plan) = 'year' then interval '370 days' else interval '35 days' end))
    when v_on then least(coalesce(p_until, 'infinity'::timestamptz), coalesce(m.active_until, now()) + interval '7 days')
    else now() end;
  insert into public.memberships as t (user_id, via, plan, status, active_until, cancel_at, stripe_customer, stripe_subscription, synced_at)
  values (p_user, 'stripe', v_plan, coalesce(p_status, 'active'),
          -- Until Stripe says the exact date: a month (or year) and a few days.
          v_until,
          case when v_on then p_cancel_at end, p_customer, p_subscription, p_event_at)
  on conflict (user_id) do update set
    via = 'stripe',
    plan = coalesce(v_plan, t.plan),
    status = coalesce(p_status, t.status),
    active_until = v_until,
    cancel_at = case when v_on then p_cancel_at end,
    stripe_customer = coalesce(p_customer, t.stripe_customer),
    stripe_subscription = coalesce(p_subscription, t.stripe_subscription),
    synced_at = p_event_at,
    started_at = case when not public.member_active(p_user) and v_on then now() else t.started_at end,
    updated_at = now();
  update public.profiles
     set is_member = v_on,
         member_since = case when v_on then coalesce(member_since, now()) else member_since end
   where id = p_user;
  return jsonb_build_object('status', 'ok', 'member', v_on);
end;
$$;
