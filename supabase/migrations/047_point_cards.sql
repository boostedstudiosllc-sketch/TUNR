-- Points cards: one-time codes printed on a card that goes in every order
-- bag, or is handed over after a sale or a detail. Scanning one adds its
-- points straight away, so purchases never need checking by hand, whatever
-- the shop (Square, Depop, in person, the detailing business).
--
-- Codes are 12 characters from a 31-letter alphabet (about 10^18
-- combinations), each works once, and wrong guesses are limited, so they
-- can't be guessed. A card's dollar value counts toward rewards' minimum
-- spend like any approved purchase.

alter table public.purchase_claims drop constraint if exists purchase_claims_store_check;
alter table public.purchase_claims add constraint purchase_claims_store_check
  check (store in ('square', 'depop', 'in_person', 'other', 'card'));

create table if not exists public.point_cards (
  code text primary key check (code ~ '^[A-Z2-9]{12}$'),
  batch_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  points integer not null check (points between 1 and 100000),
  value_cents integer not null default 0 check (value_cents between 0 and 1000000),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  voided_at timestamptz
);

create index if not exists point_cards_batch_idx on public.point_cards (batch_id);

alter table public.point_cards enable row level security;
-- No policies: only the functions below read or write cards.

create table if not exists public.card_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists card_attempts_user_idx on public.card_attempts (user_id, created_at desc);

alter table public.card_attempts enable row level security;

-- Makes a batch and returns its codes. Admins only.
create or replace function public.create_point_cards(
  p_label text,
  p_points int,
  p_value_cents int,
  p_count int,
  p_expires_at timestamptz default null
)
returns table (card_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_code text;
  v_made int := 0;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if coalesce(p_count, 0) not between 1 and 500 then
    raise exception 'card_count_check';
  end if;

  while v_made < p_count loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
                 from generate_series(1, 12));
    begin
      insert into public.point_cards (code, batch_id, label, points, value_cents, expires_at, created_by)
      values (v_code, v_batch, btrim(p_label), p_points, coalesce(p_value_cents, 0), p_expires_at, auth.uid());
      v_made := v_made + 1;
    exception when unique_violation then
      -- Astronomically unlikely; just draw another.
      null;
    end;
  end loop;

  return query select c.code from public.point_cards c where c.batch_id = v_batch order by c.code;
end;
$$;

revoke execute on function public.create_point_cards(text, int, int, int, timestamptz) from public, anon;
grant execute on function public.create_point_cards(text, int, int, int, timestamptz) to authenticated;

-- Scan or type a card. ok, not_signed_in, unconfirmed, rate_limited,
-- invalid, used (someone else's), yours (already added), expired.
create or replace function public.redeem_point_card(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.point_cards;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if (select count(*) from public.card_attempts
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.card_attempts (user_id) values (v_uid);

  select * into c from public.point_cards where code = v_code for update;
  if not found or c.voided_at is not null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if c.redeemed_at is not null then
    return jsonb_build_object('status', case when c.redeemed_by = v_uid then 'yours' else 'used' end);
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));

  update public.point_cards set redeemed_by = v_uid, redeemed_at = now() where code = v_code;

  -- Counts as spending, for rewards with a minimum spend.
  if c.value_cents >= 100 then
    insert into public.purchase_claims (user_id, store, order_ref, amount_cents, status, points, decided_at, note)
    values (v_uid, 'card', c.code, c.value_cents, 'approved', c.points, now(), left(c.label, 200));
  end if;

  insert into public.point_ledger (user_id, delta, reason, note)
  values (v_uid, c.points, 'purchase', left('Points card: ' || c.label, 200));

  return jsonb_build_object(
    'status', 'ok',
    'points', c.points,
    'label', c.label,
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where user_id = v_uid)
  );
end;
$$;

revoke execute on function public.redeem_point_card(text) from public, anon;
grant execute on function public.redeem_point_card(text) to authenticated;

-- One row per batch, for the admin page.
create or replace function public.point_card_batches()
returns table (
  batch_id uuid, label text, points int, value_cents int, made int, redeemed int,
  voided int, created_at timestamptz, expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.batch_id, min(c.label), min(c.points), min(c.value_cents),
         count(*)::int, count(c.redeemed_at)::int, count(c.voided_at)::int,
         min(c.created_at), min(c.expires_at)
    from public.point_cards c
   where public.is_admin()
   group by c.batch_id
   order by min(c.created_at) desc
   limit 100;
$$;

revoke execute on function public.point_card_batches() from public, anon;
grant execute on function public.point_card_batches() to authenticated;

-- The unused codes in a batch, to print again.
create or replace function public.point_card_codes(p_batch uuid)
returns table (code text, label text, points int, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.label, c.points, c.expires_at
    from public.point_cards c
   where public.is_admin() and c.batch_id = p_batch
     and c.redeemed_at is null and c.voided_at is null
   order by c.code;
$$;

revoke execute on function public.point_card_codes(uuid) from public, anon;
grant execute on function public.point_card_codes(uuid) to authenticated;

-- Kill a batch's unused cards (lost, stolen, printed wrong).
create or replace function public.void_point_cards(p_batch uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  update public.point_cards set voided_at = now()
   where batch_id = p_batch and redeemed_at is null and voided_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.void_point_cards(uuid) from public, anon;
grant execute on function public.void_point_cards(uuid) to authenticated;
