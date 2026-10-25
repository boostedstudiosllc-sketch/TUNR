-- TUNR Rush gains a boost pickup (the Boosted Studios turbo): a few seconds
-- at up to 115 m/s. The run check in finish_game_run allowed 90 m/s, which a
-- run with lots of boosts could pass legitimately, so it now allows 120.
-- Everything else is the same as 060_tunr_rush.sql.

create or replace function public.finish_game_run(p_run uuid, p_distance int, p_score int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.game_runs;
  v_secs double precision;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_earned int := 0;
  v_best int;
begin
  select * into r from public.game_runs where id = p_run and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if r.finished_at is not null then
    return jsonb_build_object('status', 'already');
  end if;
  v_secs := extract(epoch from now() - r.started_at);
  if v_secs > 600 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_long');
  end if;
  if coalesce(p_distance, 0) < 0 or p_distance > v_secs * 120 + 50
     or coalesce(p_score, 0) < 0 or p_score > p_distance + 50000 then
    update public.game_runs set finished_at = now(), distance = 0, score = 0 where id = p_run;
    return jsonb_build_object('status', 'too_fast');
  end if;

  update public.game_runs set finished_at = now(), distance = p_distance, score = p_score where id = p_run;

  if p_distance >= 3000 and public.email_confirmed(v_uid) then
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (v_uid, 1, 'game_bonus', v_day, 'TUNR Rush daily drive: ' || p_distance || ' m')
    on conflict do nothing;
    get diagnostics v_earned = row_count;
  end if;

  select max(distance) into v_best from public.game_runs where user_id = v_uid and finished_at is not null;
  return jsonb_build_object(
    'status', 'ok',
    'earned', v_earned,
    'best', coalesce(v_best, 0),
    'today_done', exists (select 1 from public.point_ledger where user_id = v_uid and reason = 'game_bonus' and occurrence = v_day)
  );
end;
$$;

revoke execute on function public.finish_game_run(uuid, int, int) from public, anon;
grant execute on function public.finish_game_run(uuid, int, int) to authenticated;
