-- Guess the Car photos from Wikimedia Commons: admins import freely
-- licensed photos from the admin page, each with its photographer, licence
-- and a link back to the photo's page (the licences ask for that credit).
-- The same photo can't be added twice.

alter table public.car_puzzles add column if not exists source_url text check (source_url is null or source_url ~ '^https://');
alter table public.car_puzzles drop constraint if exists car_puzzles_credit_check;
alter table public.car_puzzles add constraint car_puzzles_credit_check check (credit is null or char_length(credit) <= 200);
create unique index if not exists car_puzzles_photo_once on public.car_puzzles (photo_url);

-- The pool now carries each photo's source link. (Its columns change, so
-- it's dropped and made again; the functions below are remade with it.)
drop function if exists public.car_pool();
create function public.car_pool()
returns table (key text, photo_url text, answer text, make text, credit text, source_url text)
language sql
stable
security definer
set search_path = public
as $$
  select 'p:' || p.id, p.photo_url, p.make || ' ' || p.model, p.make, p.credit, p.source_url
    from public.car_puzzles p where p.active
  union all
  select 'v:' || v.id, v.photo_url, v.make || ' ' || v.model, v.make, '@' || coalesce(pr.username, 'a TUNR member') || '''s build', null
    from public.vehicles v
    join public.profiles pr on pr.id = v.owner_id
   where v.public_page and v.photo_url ~ '^https://' and v.make is not null and v.model is not null;
$$;
revoke execute on function public.car_pool() from public, anon, authenticated;

create or replace function public.car_guess_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  c record;
  g public.car_guesses;
  v_pool int;
begin
  select count(*) into v_pool from public.car_pool();
  if v_pool = 0 then
    return jsonb_build_object('day', v_day, 'pool', 0);
  end if;
  select * into c from public.car_pool() order by md5(key || v_day::text) limit 1;
  select * into g from public.car_guesses where user_id = auth.uid() and day = v_day;
  return jsonb_build_object(
    'day', v_day,
    'photo_url', c.photo_url,
    'options', public.car_options(c.answer, c.make, v_day::text),
    'pool', v_pool,
    'guessed', case when g.user_id is null then null else jsonb_build_object(
      'choice', g.choice, 'correct', g.correct, 'seconds', g.seconds,
      'answer', (select answer from public.car_pool() where key = g.puzzle),
      'credit', (select credit from public.car_pool() where key = g.puzzle),
      'source_url', (select source_url from public.car_pool() where key = g.puzzle)) end
  );
end;
$$;
grant execute on function public.car_guess_today() to anon, authenticated;

create or replace function public.guess_car(p_choice text, p_seconds real)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/New_York')::date;
  c record;
  v_right boolean;
  v_points int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into c from public.car_pool() order by md5(key || v_day::text) limit 1;
  if not found then
    return jsonb_build_object('status', 'no_car');
  end if;
  if exists (select 1 from public.car_guesses where user_id = v_uid and day = v_day) then
    return jsonb_build_object('status', 'already');
  end if;
  v_right := lower(btrim(p_choice)) = lower(c.answer);
  insert into public.car_guesses (user_id, day, puzzle, choice, correct, seconds)
  values (v_uid, v_day, c.key, left(p_choice, 80), v_right, greatest(0, least(p_seconds, 600)));
  if v_right then
    -- Quicker (blurrier) pays more.
    v_points := case when p_seconds <= 5 then 3 when p_seconds <= 12 then 2 else 1 end;
    insert into public.point_ledger (user_id, delta, reason, occurrence, note)
    values (v_uid, v_points, 'guess_bonus', v_day, 'Guess the Car: ' || c.answer)
    on conflict do nothing;
  end if;
  return jsonb_build_object('status', 'ok', 'correct', v_right, 'answer', c.answer, 'credit', c.credit, 'source_url', c.source_url, 'points', v_points);
end;
$$;
revoke execute on function public.guess_car(text, real) from public, anon;
grant execute on function public.guess_car(text, real) to authenticated;

create or replace function public.car_guess_practice(p_skip text[] default '{}')
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select jsonb_build_object('key', c.key, 'photo_url', c.photo_url, 'answer', c.answer, 'credit', c.credit, 'source_url', c.source_url,
                            'options', public.car_options(c.answer, c.make, c.key || random()::text))
    from public.car_pool() c
   where not (c.key = any (coalesce(p_skip, '{}')))
   order by random()
   limit 1;
$$;
grant execute on function public.car_guess_practice(text[]) to anon, authenticated;
