-- "Taco Tuesday" is now "TUNR Tuesdays" (the owner's name for it). Only the
-- words people see change: the tables and functions keep their taco_*
-- names (renaming live tables isn't worth the risk). The winner's alert and
-- ledger note get the new name.

create or replace function public.settle_taco_picks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.taco_picks;
  e public.events;
  v_points int := coalesce((select taco_points from public.points_settings), 5);
  w record;
begin
  for p in
    select * from public.taco_picks
     where settled_at is null and closes_at < now()
       and (stat = 'manual' and result is not null or stat = 'going')
     for update skip locked
  loop
    if p.stat = 'going' then
      select * into e from public.events where id = p.event_id;
      if not found then
        update public.taco_picks set settled_at = now() where id = p.id; -- called off
        continue;
      end if;
      if e.start_at is null or e.start_at > now() then
        continue;
      end if;
      p.result := (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going' and r.created_at <= e.start_at);
      update public.taco_picks set result = p.result where id = p.id;
    end if;
    for w in
      select t.user_id from public.taco_entries t
       where t.pick_id = p.id
         and ((t.choice = 'more' and p.result > p.taco_line) or (t.choice = 'less' and p.result < p.taco_line))
    loop
      if v_points > 0 then
        insert into public.point_ledger (user_id, delta, reason, occurrence, note)
        values (w.user_id, v_points, 'taco_bonus', p.day, 'TUNR Tuesdays pick')
        on conflict do nothing;
      end if;
      perform public.notify(w.user_id, 'taco_win', '🏁 TUNR Tuesdays: you called it!',
        'It finished at ' || trim(to_char(p.result, 'FM999999990.##')) || '. +' || v_points || ' points are waiting in your checklist.',
        'tab:perks', 'taco:' || p.id);
    end loop;
    update public.taco_picks set settled_at = now() where id = p.id;
  end loop;
end;
$$;
revoke execute on function public.settle_taco_picks() from public, anon, authenticated;
