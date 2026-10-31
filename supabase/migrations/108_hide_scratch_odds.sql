-- Scratch cards don't show their odds (the owner's call): players see each
-- card's top prize only. The odds stay in scratch_cards, now readable by
-- admins alone, and scratch_shop() sends `top` instead of prizes/weights.

drop policy if exists "anyone sees the scratch cards" on public.scratch_cards;
drop policy if exists "admins see the scratch cards" on public.scratch_cards;
create policy "admins see the scratch cards" on public.scratch_cards for select to authenticated using (public.is_admin());

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
        'id', c.id, 'name', c.name, 'cost', c.cost,
        'top', (select max(x) from unnest(c.prizes) x),
        'sold_out', c.id = public.scratch_cheapest() and public.scratch_out_day() = public.atl_today()
      ) order by c.sort) from public.scratch_cards c where c.active), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(r) from (
        select p.card_id, p.cost, p.prize, p.created_at, p.free_week is not null as free from public.scratch_plays p
         where p.user_id = auth.uid() order by p.created_at desc limit 5) r), '[]'::jsonb)
  );
$$;
grant execute on function public.scratch_shop() to anon, authenticated;
