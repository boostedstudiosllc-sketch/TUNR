-- Taco Tuesday and scratch cards (Perks tab).
--
-- Taco Tuesday (free): every Tuesday one MORE-or-LESS pick on a TUNR stat,
-- like PrizePicks, with a "taco line" discounted from the usual line. A
-- right pick pays points_settings.taco_points (5) once the result is in,
-- to claim in the checklist.
--   taco_picks:   one per Tuesday. Made automatically from the biggest meet
--                 coming up (how many going when it starts), or by an admin
--                 (any question; the admin enters the result).
--   taco_entries: one pick per person per Tuesday, locked once made.
--   taco_today() settles finished picks, makes Tuesday's if needed, and
--   returns it; taco_pick(choice) enters.
--
-- Scratch cards (cost points): three cards, each paying a random number of
-- points straight into the balance. The odds live in scratch_cards and are
-- shown in the app. One random day a week the cheapest card is sold out.
-- At most 10 cards a day; admins can switch them off
-- (points_settings.scratch_on).

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus', 'guess_bonus', 'taco_bonus', 'scratch_buy', 'scratch_win'
));
create unique index if not exists point_ledger_taco_once_a_week
  on public.point_ledger (user_id, occurrence) where reason = 'taco_bonus';

alter table public.points_settings
  add column if not exists taco_points integer not null default 5 check (taco_points between 0 and 50),
  add column if not exists scratch_on boolean not null default true;

create or replace function public.atl_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

-- ---------- scratch cards ----------

create table if not exists public.scratch_cards (
  id text primary key,
  name text not null,
  cost integer not null check (cost > 0),
  prizes integer[] not null,  -- the points you can win…
  weights integer[] not null, -- …and how likely each is (out of their total)
  sort integer not null default 0,
  active boolean not null default true,
  check (cardinality(prizes) = cardinality(weights) and cardinality(prizes) > 0)
);
alter table public.scratch_cards enable row level security;
drop policy if exists "anyone sees the scratch cards" on public.scratch_cards;
create policy "anyone sees the scratch cards" on public.scratch_cards for select to anon, authenticated using (true);
drop policy if exists "admins change scratch cards" on public.scratch_cards;
create policy "admins change scratch cards" on public.scratch_cards for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The owner's odds (out of 1,000):
--   Tune-Up, 2 points: wins 1–5, a 1 or 2 85% of the time.
--   Turbo, 5 points: wins 1–10, 1–5 80% of the time.
--   Supercharged, 10 points: wins 1–20, 1–11 90% of the time.
insert into public.scratch_cards (id, name, cost, prizes, weights, sort) values
  ('tuneup', 'Tune-Up', 2, '{1,2,3,4,5}', '{400,450,80,40,30}', 1),
  ('turbo', 'Turbo', 5, '{1,2,3,4,5,6,7,8,9,10}', '{100,140,180,200,180,70,50,40,25,15}', 2),
  ('supercharged', 'Supercharged', 10, '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}',
   '{30,40,50,60,80,90,100,110,120,120,100,25,20,15,12,9,7,5,4,3}', 3)
on conflict (id) do nothing;

create table if not exists public.scratch_plays (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null references public.scratch_cards (id),
  cost integer not null,
  prize integer not null,
  created_at timestamptz not null default now()
);
create index if not exists scratch_plays_user_idx on public.scratch_plays (user_id, created_at desc);
alter table public.scratch_plays enable row level security;
drop policy if exists "players see their scratch cards" on public.scratch_plays;
create policy "players see their scratch cards" on public.scratch_plays for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Written only by buy_scratch().

-- The day this week (Atlanta Mon–Sun) the cheapest card is sold out.
create or replace function public.scratch_out_day(p_week date)
returns date
language sql
immutable
as $$
  select p_week + abs(hashtext('scratch-out:' || p_week::text)) % 7;
$$;
create or replace function public.scratch_out_day()
returns date
language sql
stable
as $$
  select public.scratch_out_day(date_trunc('week', public.atl_today())::date);
$$;

-- The cheapest active card, which is the one that sells out.
create or replace function public.scratch_cheapest()
returns text
language sql
stable
set search_path = public
as $$
  select id from public.scratch_cards where active order by cost, sort limit 1;
$$;

-- { on, balance, played_today, max_per_day, cards: [{ id, name, cost, prizes, weights, sold_out }], recent }
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
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'cost', c.cost, 'prizes', c.prizes, 'weights', c.weights,
        'sold_out', c.id = public.scratch_cheapest() and public.scratch_out_day() = public.atl_today()
      ) order by c.sort) from public.scratch_cards c where c.active), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(r) from (
        select p.card_id, p.cost, p.prize, p.created_at from public.scratch_plays p
         where p.user_id = auth.uid() order by p.created_at desc limit 5) r), '[]'::jsonb)
  );
$$;
grant execute on function public.scratch_shop() to anon, authenticated;

-- Buy and scratch one card: pays for it and picks the prize in one go.
-- { status: ok, prize, cost, balance } | not_signed_in | unconfirmed | off |
--   not_found | sold_out | daily_limit | not_enough
create or replace function public.buy_scratch(p_card text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.scratch_cards;
  v_balance int;
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
  select * into c from public.scratch_cards where id = p_card and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if c.id = public.scratch_cheapest() and public.scratch_out_day() = public.atl_today() then
    return jsonb_build_object('status', 'sold_out');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if (select count(*) from public.scratch_plays
       where user_id = v_uid and (created_at at time zone 'America/New_York')::date = public.atl_today()) >= 10 then
    return jsonb_build_object('status', 'daily_limit');
  end if;
  v_balance := public.points_balance(v_uid);
  if v_balance < c.cost then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', c.cost);
  end if;

  v_roll := floor(random() * (select sum(w) from unnest(c.weights) w))::int;
  for i in 1 .. cardinality(c.prizes) loop
    v_roll := v_roll - c.weights[i];
    if v_roll < 0 then
      v_prize := c.prizes[i];
      exit;
    end if;
  end loop;

  insert into public.point_ledger (user_id, delta, reason, note) values (v_uid, -c.cost, 'scratch_buy', 'Scratch card: ' || c.name);
  insert into public.point_ledger (user_id, delta, reason, note) values (v_uid, v_prize, 'scratch_win', 'Scratch card: ' || c.name)
  returning id into v_id;
  -- Winnings go straight into the balance, like the weekly spin.
  update public.point_ledger set claimed_at = now() where id = v_id;
  insert into public.scratch_plays (user_id, card_id, cost, prize) values (v_uid, c.id, c.cost, v_prize);
  return jsonb_build_object('status', 'ok', 'prize', v_prize, 'cost', c.cost, 'balance', v_balance - c.cost + v_prize);
end;
$$;
revoke execute on function public.buy_scratch(text) from public, anon;
grant execute on function public.buy_scratch(text) to authenticated;

-- ---------- Taco Tuesday ----------

create table if not exists public.taco_picks (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,                      -- the Tuesday it's open
  question text not null check (char_length(question) between 5 and 200),
  event_id uuid references public.events (id) on delete set null,
  stat text not null default 'manual' check (stat in ('going', 'manual')), -- going: counted at the meet's start
  line numeric not null check (line >= 0),       -- the usual line, shown crossed out
  taco_line numeric not null check (taco_line >= 0),
  closes_at timestamptz not null,
  result numeric,
  settled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.taco_picks enable row level security;
drop policy if exists "anyone sees taco picks" on public.taco_picks;
create policy "anyone sees taco picks" on public.taco_picks for select to anon, authenticated using (true);
drop policy if exists "admins add taco picks" on public.taco_picks;
create policy "admins add taco picks" on public.taco_picks for insert to authenticated with check (public.is_admin());
drop policy if exists "admins change taco picks" on public.taco_picks;
create policy "admins change taco picks" on public.taco_picks for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins remove taco picks" on public.taco_picks;
create policy "admins remove taco picks" on public.taco_picks for delete to authenticated using (public.is_admin());

-- Closes at midnight Atlanta time on its Tuesday unless set otherwise.
create or replace function public.taco_pick_defaults()
returns trigger
language plpgsql
as $$
begin
  new.closes_at := coalesce(new.closes_at, ((new.day + 1)::timestamp at time zone 'America/New_York') - interval '1 second');
  return new;
end;
$$;
drop trigger if exists taco_pick_defaults on public.taco_picks;
create trigger taco_pick_defaults before insert or update on public.taco_picks for each row execute function public.taco_pick_defaults();

create table if not exists public.taco_entries (
  pick_id uuid not null references public.taco_picks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  choice text not null check (choice in ('more', 'less')),
  created_at timestamptz not null default now(),
  primary key (pick_id, user_id)
);
alter table public.taco_entries enable row level security;
drop policy if exists "players see their taco picks" on public.taco_entries;
create policy "players see their taco picks" on public.taco_entries for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Written only by taco_pick().

-- Settles picks whose result is in: a 'going' pick once its meet has
-- started (going RSVPs made before the start), a 'manual' one once an admin
-- has entered the result. Pays right picks (unclaimed, to claim in the
-- checklist) and tells them. A pick whose meet was deleted is called off.
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
        values (w.user_id, v_points, 'taco_bonus', p.day, 'Taco Tuesday pick')
        on conflict do nothing;
      end if;
      perform public.notify(w.user_id, 'taco_win', '🌮 Taco Tuesday: you called it!',
        'It finished at ' || trim(to_char(p.result, 'FM999999990.##')) || '. +' || v_points || ' points are waiting in your checklist.',
        'tab:perks', 'taco:' || p.id);
    end loop;
    update public.taco_picks set settled_at = now() where id = p.id;
  end loop;
end;
$$;
revoke execute on function public.settle_taco_picks() from public, anon, authenticated;

-- On a Tuesday with no pick yet: the public meet in the next 7 days with
-- the most people going. The usual line is a bit above where it's heading,
-- the taco line close to where it is now, so MORE is the friendly side.
create or replace function public.make_taco_pick(p_day date default null) -- p_day: for tests
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, public.atl_today());
  e record;
begin
  if extract(isodow from v_day) <> 2 or exists (select 1 from public.taco_picks where day = v_day) then
    return;
  end if;
  select ev.id, ev.title, ev.start_at,
         (select count(*) from public.rsvps r where r.event_id = ev.id and r.status = 'going') as going
    into e
    from public.events ev
   where ev.start_at > now() + interval '1 day' and ev.start_at < now() + interval '7 days'
     and not coalesce(ev.hidden, false) and coalesce(ev.visibility, 'public') = 'public'
   order by going desc, ev.start_at
   limit 1;
  if not found then
    return;
  end if;
  insert into public.taco_picks (day, question, event_id, stat, line, taco_line, closes_at, created_by)
  values (v_day,
          'How many will be going to ' || left(e.title, 120) || ' when it starts?',
          e.id, 'going',
          greatest(5, round(e.going * 1.6)) + 0.5,
          greatest(2, round(e.going * 1.15)) + 0.5,
          ((v_day + 1)::timestamp at time zone 'America/New_York') - interval '1 second',
          null)
  on conflict (day) do nothing;
end;
$$;
revoke execute on function public.make_taco_pick(date) from public, anon, authenticated;

-- { today, is_tuesday, next_tuesday, points, pick: { …, open, my_choice, outcome } }
-- The pick is today's if there is one, otherwise the latest.
create or replace function public.taco_today()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day date := public.atl_today();
  p public.taco_picks;
  v_choice text;
begin
  perform public.settle_taco_picks();
  perform public.make_taco_pick();
  select * into p from public.taco_picks where day <= v_day order by day desc limit 1;
  if found then
    select choice into v_choice from public.taco_entries where pick_id = p.id and user_id = auth.uid();
  end if;
  return jsonb_build_object(
    'today', v_day,
    'is_tuesday', extract(isodow from v_day) = 2,
    'next_tuesday', v_day + ((9 - extract(isodow from v_day)::int) % 7),
    'points', coalesce((select taco_points from public.points_settings), 5),
    'pick', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'day', p.day, 'question', p.question, 'event_id', p.event_id, 'stat', p.stat,
      'line', p.line, 'taco_line', p.taco_line, 'closes_at', p.closes_at,
      'open', p.day = v_day and now() <= p.closes_at,
      'result', p.result, 'settled', p.settled_at is not null,
      'entries', (select count(*) from public.taco_entries t where t.pick_id = p.id),
      'my_choice', v_choice,
      'outcome', case
        when v_choice is null or p.settled_at is null then null
        when p.result is null then 'void'
        when (v_choice = 'more' and p.result > p.taco_line) or (v_choice = 'less' and p.result < p.taco_line) then 'won'
        else 'lost' end) end
  );
end;
$$;
grant execute on function public.taco_today() to anon, authenticated;

-- Make today's pick: { status: ok } | not_signed_in | unconfirmed | no_pick | closed | already
create or replace function public.taco_pick(p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.taco_picks;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if p_choice not in ('more', 'less') then
    return jsonb_build_object('status', 'bad_choice');
  end if;
  select * into p from public.taco_picks where day = public.atl_today();
  if not found then
    return jsonb_build_object('status', 'no_pick');
  end if;
  if now() > p.closes_at then
    return jsonb_build_object('status', 'closed');
  end if;
  insert into public.taco_entries (pick_id, user_id, choice) values (p.id, v_uid, p_choice)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.taco_pick(text) from public, anon;
grant execute on function public.taco_pick(text) to authenticated;

-- Admin changes here show in the admin log too.
do $$
begin
  if to_regprocedure('public.log_admin_change()') is not null then
    drop trigger if exists log_admin_change on public.taco_picks;
    create trigger log_admin_change after insert or update or delete on public.taco_picks
      for each row execute function public.log_admin_change();
    drop trigger if exists log_admin_change on public.scratch_cards;
    create trigger log_admin_change after update on public.scratch_cards
      for each row execute function public.log_admin_change();
  end if;
end;
$$;
