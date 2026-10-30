-- Setup steps pay less (some nothing), like SoFi's "Activate your card":
-- a profile photo pays 5 (was 10 for photo + username + bio together),
-- username and bio are a setup step with no points, adding your car and
-- turning on alerts stay at 10 and 5. Admins can change all three amounts
-- (0 turns one off). Points already paid stay paid.

alter table public.points_settings
  add column if not exists starter_photo_points integer not null default 5 check (starter_photo_points between 0 and 100),
  add column if not exists starter_car_points integer not null default 10 check (starter_car_points between 0 and 100),
  add column if not exists starter_alerts_points integer not null default 5 check (starter_alerts_points between 0 and 100);

create or replace function public.claim_starter_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.points_settings;
  p public.profiles;
  v_photo boolean;
  v_details boolean;
  v_car boolean;
  v_alerts boolean;
  v_added int := 0;
  v_n int;
  step record;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select * into s from public.points_settings;
  select * into p from public.profiles where id = v_uid;
  v_photo := p.avatar_url is not null;
  v_details := coalesce(p.username, '') <> '' and coalesce(btrim(p.bio), '') <> '';
  v_car := exists (select 1 from public.vehicles where owner_id = v_uid);
  v_alerts := exists (select 1 from public.push_subscriptions where user_id = v_uid);

  if public.email_confirmed(v_uid) then
    for step in
      select * from (values ('starter_profile', v_photo, s.starter_photo_points),
                            ('starter_car', v_car, s.starter_car_points),
                            ('starter_alerts', v_alerts, s.starter_alerts_points)) t(reason, done, pts)
    loop
      if step.done and step.pts > 0 then
        insert into public.point_ledger (user_id, delta, reason) values (v_uid, step.pts, step.reason)
        on conflict do nothing;
        get diagnostics v_n = row_count;
        v_added := v_added + v_n * step.pts;
      end if;
    end loop;
  end if;

  -- Each step: done or not (from the account itself, so a step with no
  -- points still ticks off), and what it pays.
  return jsonb_build_object(
    'status', 'ok',
    'added', v_added,
    'confirmed', public.email_confirmed(v_uid),
    'photo', v_photo,
    'details', v_details,
    'car', v_car,
    'alerts', v_alerts,
    'pays', jsonb_build_object('photo', s.starter_photo_points, 'car', s.starter_car_points, 'alerts', s.starter_alerts_points)
  );
end;
$$;
revoke execute on function public.claim_starter_points() from public, anon;
grant execute on function public.claim_starter_points() to authenticated;
