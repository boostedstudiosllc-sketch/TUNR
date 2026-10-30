-- One free scratch card a week (Atlanta Mon–Sun), so anyone can play without
-- spending points. It's a Tune-Up (the cheapest card) with the same odds as
-- a bought one, and works even on the Tune-Up's sold-out day.
--
--   scratch_plays.free_week: the week a free card was used (one per week).
--   buy_scratch(card, free) takes free = true for it; scratch_shop() says
--   whether this week's is still there.

alter table public.scratch_plays add column if not exists free_week date;
create unique index if not exists scratch_plays_free_once_a_week
  on public.scratch_plays (user_id, free_week) where free_week is not null;

create or replace function public.scratch_shop()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'on', (select scratch_on from public.points_settings),
    'balance', case when auth.uid() is null then null else public.points_balance(auth.uid()) end,
    'played_today', (select count(*) from public.scratch_plays p
                      where p.user_id = auth.uid() and (p.created_at at time zone 'America/New_York')::date = public.atl_today()),
    'max_per_day', 10,
    'free_card', public.scratch_cheapest(),
    'free_used', exists (select 1 from public.scratch_plays p where p.user_id = auth.uid() and p.free_week = (select week from public.spin_week())),
    'free_next_at', (select next_at from public.spin_week()),
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'cost', c.cost, 'prizes', c.prizes, 'weights', c.weights,
        'sold_out', c.id = public.scratch_cheapest() and public.scratch_out_day() = public.atl_today()
      ) order by c.sort) from public.scratch_cards c where c.active), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(r) from (
        select p.card_id, p.cost, p.prize, p.created_at, p.free_week is not null as free from public.scratch_plays p
         where p.user_id = auth.uid() order by p.created_at desc limit 5) r), '[]'::jsonb)
  );
$$;
grant execute on function public.scratch_shop() to anon, authenticated;

-- Buy (or, with p_free, take this week's free card) and scratch one card.
-- { status: ok, prize, cost, balance, free } | not_signed_in | unconfirmed |
--   off | not_found | sold_out | daily_limit | not_enough | free_used
drop function if exists public.buy_scratch(text);
create or replace function public.buy_scratch(p_card text, p_free boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := (select week from public.spin_week());
  c public.scratch_cards;
  v_balance int;
  v_cost int;
  v_roll int;
  v_prize int;
  i int;
  v_id bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if not coalesce((select scratch_on from public.points_settings), false) then
    return jsonb_build_object('status', 'off');
  end if;
  -- The free card is always the cheapest one, whatever card was asked for.
  select * into c from public.scratch_cards
   where id = case when p_free then public.scratch_cheapest() else p_card end and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not p_free and c.id = public.scratch_cheapest() and public.scratch_out_day() = public.atl_today() then
    return jsonb_build_object('status', 'sold_out');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if (select count(*) from public.scratch_plays
       where user_id = v_uid and (created_at at time zone 'America/New_York')::date = public.atl_today()) >= 10 then
    return jsonb_build_object('status', 'daily_limit');
  end if;
  v_balance := public.points_balance(v_uid);
  if p_free then
    if exists (select 1 from public.scratch_plays where user_id = v_uid and free_week = v_week) then
      return jsonb_build_object('status', 'free_used');
    end if;
    v_cost := 0;
  else
    if v_balance < c.cost then
      return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', c.cost);
    end if;
    v_cost := c.cost;
  end if;

  v_roll := floor(random() * (select sum(w) from unnest(c.weights) w))::int;
  for i in 1 .. cardinality(c.prizes) loop
    v_roll := v_roll - c.weights[i];
    if v_roll < 0 then
      v_prize := c.prizes[i];
      exit;
    end if;
  end loop;

  if v_cost > 0 then
    insert into public.point_ledger (user_id, delta, reason, note) values (v_uid, -v_cost, 'scratch_buy', 'Scratch card: ' || c.name);
  end if;
  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, v_prize, 'scratch_win', case when p_free then 'Free scratch card: ' else 'Scratch card: ' end || c.name)
  returning id into v_id;
  -- Winnings go straight into the balance, like the weekly spin.
  update public.point_ledger set claimed_at = now() where id = v_id;
  insert into public.scratch_plays (user_id, card_id, cost, prize, free_week)
  values (v_uid, c.id, v_cost, v_prize, case when p_free then v_week end);
  return jsonb_build_object('status', 'ok', 'prize', v_prize, 'cost', v_cost, 'balance', v_balance - v_cost + v_prize, 'free', p_free);
end;
$$;
revoke execute on function public.buy_scratch(text, boolean) from public, anon;
grant execute on function public.buy_scratch(text, boolean) to authenticated;
