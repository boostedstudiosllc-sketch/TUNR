-- Guess the Car: one car a day, the same for everyone. Its photo starts
-- blurred and sharpens; pick the make and model from four. Right answers
-- pay 1–3 points (quicker pays more), waiting in the checklist. Plus
-- practice rounds with no points.
--
-- The cars: photos admins add (car_puzzles), plus members' cars that have a
-- photo and a public build page. Answers stay on the server until you guess.

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus', 'guess_bonus'
));
create unique index if not exists point_ledger_guess_once_a_day
  on public.point_ledger (user_id, occurrence) where reason = 'guess_bonus';

create table if not exists public.car_puzzles (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null check (photo_url ~ '^https://'),
  make text not null check (char_length(make) between 2 and 30),
  model text not null check (char_length(model) between 1 and 40),
  year int check (year between 1900 and 2100),
  credit text check (credit is null or char_length(credit) <= 80),
  active boolean not null default true,
  added_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.car_puzzles enable row level security;
-- Admins only, answers included; everyone else plays through the functions.
drop policy if exists "admins manage car puzzles" on public.car_puzzles;
create policy "admins manage car puzzles" on public.car_puzzles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.car_guesses (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  puzzle text not null,
  choice text not null,
  correct boolean not null,
  seconds real,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.car_guesses enable row level security;
drop policy if exists "players see their guesses" on public.car_guesses;
create policy "players see their guesses" on public.car_guesses for select to authenticated using (user_id = auth.uid());

-- Every car in the game: key, photo, answer ("Make Model"), make, credit.
create or replace function public.car_pool()
returns table (key text, photo_url text, answer text, make text, credit text)
language sql
stable
security definer
set search_path = public
as $$
  select 'p:' || p.id, p.photo_url, p.make || ' ' || p.model, p.make, p.credit
    from public.car_puzzles p where p.active
  union all
  select 'v:' || v.id, v.photo_url, v.make || ' ' || v.model, v.make, '@' || coalesce(pr.username, 'a TUNR member') || '''s build'
    from public.vehicles v
    join public.profiles pr on pr.id = v.owner_id
   where v.public_page and v.photo_url ~ '^https://' and v.make is not null and v.model is not null;
$$;
revoke execute on function public.car_pool() from public, anon, authenticated;

-- Four choices: the answer and three others (other makes first), in a
-- shuffled order that's the same for everyone that day.
create or replace function public.car_options(p_answer text, p_make text, p_seed text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with others as (
    select distinct answer, make from public.car_pool() where answer <> p_answer
    union
    select x, split_part(x, ' ', 1) from unnest(array[
      'Honda Civic Type R', 'Subaru WRX STI', 'Nissan GT-R', 'Toyota Supra', 'BMW M3', 'Ford Mustang GT',
      'Chevrolet Camaro SS', 'Dodge Challenger SRT', 'Mazda MX-5 Miata', 'Nissan 370Z', 'Volkswagen Golf GTI',
      'Mitsubishi Lancer Evolution', 'Audi RS3', 'Mercedes-AMG C63', 'Toyota GR86', 'Porsche 911 Carrera',
      'Acura Integra Type R', 'Infiniti Q50', 'Lexus IS 350', 'Chevrolet Corvette', 'Ford F-150 Raptor', 'Jeep Wrangler'
    ]) x where x <> p_answer
  ),
  picked as (
    select answer from others
     order by (make = p_make), md5(answer || p_seed)
     limit 3
  )
  select jsonb_agg(a order by md5(a || p_seed || 'order'))
    from (select p_answer as a union all select answer from picked) t;
$$;
revoke execute on function public.car_options(text, text, text) from public, anon, authenticated;

-- Today's car (Atlanta date). { day, photo_url, options, pool,
-- guessed: { choice, correct, answer, credit, seconds } | null }
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
      'credit', (select credit from public.car_pool() where key = g.puzzle)) end
  );
end;
$$;
grant execute on function public.car_guess_today() to anon, authenticated;

-- Guess today's car, once. { status: ok, correct, answer, credit, points }
-- | not_signed_in | unconfirmed | no_car | already
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
  return jsonb_build_object('status', 'ok', 'correct', v_right, 'answer', c.answer, 'credit', c.credit, 'points', v_points);
end;
$$;
revoke execute on function public.guess_car(text, real) from public, anon;
grant execute on function public.guess_car(text, real) to authenticated;

-- Practice: a random car with its answer (no points, so nothing to hide).
create or replace function public.car_guess_practice(p_skip text[] default '{}')
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select jsonb_build_object('key', c.key, 'photo_url', c.photo_url, 'answer', c.answer, 'credit', c.credit,
                            'options', public.car_options(c.answer, c.make, c.key || random()::text))
    from public.car_pool() c
   where not (c.key = any (coalesce(p_skip, '{}')))
   order by random()
   limit 1;
$$;
grant execute on function public.car_guess_practice(text[]) to anon, authenticated;

-- How you've done: { played, correct, streak (days in a row right) }.
create or replace function public.my_car_guesses()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with g as (select day, correct from public.car_guesses where user_id = auth.uid()),
  runs as (
    select count(*)::int as len, max(day) as last_day
      from (select day, day - (row_number() over (order by day))::int as grp from g where correct) i
     group by grp
  )
  select jsonb_build_object(
    'played', (select count(*) from g),
    'correct', (select count(*) from g where correct),
    'streak', coalesce((select len from runs where last_day >= (now() at time zone 'America/New_York')::date - 1 order by last_day desc limit 1), 0)
  );
$$;
grant execute on function public.my_car_guesses() to authenticated;

-- Admins edit the photos; log it like other admin changes.
do $$
begin
  if to_regprocedure('public.log_admin_change()') is not null then
    drop trigger if exists log_admin_change on public.car_puzzles;
    create trigger log_admin_change after insert or update or delete on public.car_puzzles
      for each row execute function public.log_admin_change();
  end if;
end;
$$;
