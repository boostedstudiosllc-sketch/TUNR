-- Tidy-up of 086–088, no change in what players see:
--   * one spend_points() used by both unlocks (scenery and garage parts),
--     so the balance and ledger rule lives in one place;
--   * the swear filter is one trigger function (clean_columns) on every
--     table, 086's clean_body / clean_post retired;
--   * the filter and part-guard triggers only fire when their columns
--     change, and do less work per row.

-- ---------- spending points ----------

-- Take p_cost points from p_uid's claimed balance (with a 'redeem' row),
-- or say why not. { status: 'ok', balance } | { status: 'not_enough',
-- balance, cost }. Callers hold no lock; this takes the per-player one.
create or replace function public.spend_points(p_uid uuid, p_cost int, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || p_uid::text));
  v_balance := public.points_balance(p_uid);
  if v_balance < p_cost then
    return jsonb_build_object('status', 'not_enough', 'balance', v_balance, 'cost', p_cost);
  end if;
  insert into public.point_ledger (user_id, delta, reason, note) values (p_uid, -p_cost, 'redeem', left(p_note, 200));
  return jsonb_build_object('status', 'ok', 'balance', v_balance - p_cost);
end;
$$;
revoke execute on function public.spend_points(uuid, int, text) from public, anon, authenticated;

create or replace function public.unlock_rush_scenery(p_scenery text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.rush_scenery;
  r jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into s from public.rush_scenery where id = p_scenery and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if s.price = 0 or exists (select 1 from public.rush_scenery_owned where user_id = v_uid and scenery = s.id) then
    return jsonb_build_object('status', 'owned');
  end if;
  r := public.spend_points(v_uid, s.price, 'TUNR Rush scenery: ' || s.name);
  if r ->> 'status' = 'ok' then
    insert into public.rush_scenery_owned (user_id, scenery, points) values (v_uid, s.id, s.price);
  end if;
  return r;
end;
$$;

create or replace function public.unlock_garage_part(p_part text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  g public.garage_parts;
  r jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into g from public.garage_parts where id = p_part and active;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('tunr_points:' || v_uid::text));
  if public.has_garage_part(v_uid, g.id) then
    return jsonb_build_object('status', 'owned');
  end if;
  r := public.spend_points(v_uid, g.price, 'Garage: ' || g.name);
  if r ->> 'status' = 'ok' then
    insert into public.garage_parts_owned (user_id, part, points) values (v_uid, g.id, g.price);
  end if;
  return r;
end;
$$;

-- ---------- the swear filter ----------

-- Star out the listed columns; the row is only rebuilt if one changed.
create or replace function public.clean_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
  j jsonb := to_jsonb(new);
  v text;
  changed boolean := false;
begin
  foreach col in array tg_argv loop
    v := j ->> col;
    if v is not null and public.clean_words(v) <> v then
      j := jsonb_set(j, array[col], to_jsonb(public.clean_words(v)));
      changed := true;
    end if;
  end loop;
  if changed then
    new := jsonb_populate_record(new, j);
  end if;
  return new;
end;
$$;

-- Refuse a new or changed name with a swear word in it.
create or replace function public.reject_bad_words()
returns trigger
language plpgsql
as $$
declare
  col text;
  j jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v text;
begin
  foreach col in array tg_argv loop
    v := j ->> col;
    if v is not null and (o ->> col) is distinct from v and public.clean_words(v) <> v then
      raise exception 'Keep it clean: no swear words in %.', replace(col, '_', ' ') using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- Every table, its columns, and whether they're starred out or refused.
-- Triggers fire only when one of those columns is written.
do $$
declare
  r record;
  t text;
  cols text;
begin
  foreach t in array array['linkup_messages', 'club_messages', 'forum_comments', 'comments'] loop
    execute format('drop trigger if exists clean_body on public.%I', t);
  end loop;
  drop trigger if exists clean_post on public.forum_posts;

  for r in
    select * from (values
      ('linkup_messages', array['body'], 'clean_text', 'clean_columns'),
      ('club_messages', array['body'], 'clean_text', 'clean_columns'),
      ('forum_comments', array['body'], 'clean_text', 'clean_columns'),
      ('comments', array['body'], 'clean_text', 'clean_columns'),
      ('forum_posts', array['title', 'body'], 'clean_text', 'clean_columns'),
      ('events', array['title', 'description', 'showcase_note'], 'clean_text', 'clean_columns'),
      ('linkups', array['note'], 'clean_text', 'clean_columns'),
      ('clubs', array['description'], 'clean_text', 'clean_columns'),
      ('forums', array['description'], 'clean_text', 'clean_columns'),
      ('profiles', array['bio', 'display_name'], 'clean_text', 'clean_columns'),
      ('vehicles', array['build_notes', 'model'], 'clean_text', 'clean_columns'),
      ('meet_photos', array['caption'], 'clean_text', 'clean_columns'),
      ('listing_requests', array['details'], 'clean_text', 'clean_columns'),
      ('reports', array['note'], 'clean_text', 'clean_columns'),
      ('feedback', array['message'], 'clean_text', 'clean_columns'),
      ('points_issues', array['message'], 'clean_text', 'clean_columns'),
      ('profiles', array['username'], 'reject_bad_words', 'reject_bad_words'),
      ('clubs', array['name'], 'reject_bad_words', 'reject_bad_words'),
      ('forums', array['name'], 'reject_bad_words', 'reject_bad_words')
    ) as t(tbl, cols, trig, fn)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    select string_agg(quote_ident(c), ', ') into cols from unnest(r.cols) c;
    execute format('drop trigger if exists %I on public.%I', r.trig, r.tbl);
    execute format(
      'create trigger %I before insert or update of %s on public.%I for each row execute function public.%I(%s)',
      r.trig, cols, r.tbl, r.fn, (select string_agg(quote_literal(c), ', ') from unnest(r.cols) c)
    );
  end loop;
end;
$$;

drop function if exists public.clean_body();
drop function if exists public.clean_post();

-- ---------- the garage part guard ----------

-- Only when a part column is written; the columns are fixed, so read them
-- straight off the row.
create or replace function public.vehicle_parts_guard()
returns trigger
language plpgsql
as $$
declare
  pair text[];
  v text;
  was text;
begin
  foreach pair slice 1 in array array[
    ['spoiler', new.game_spoiler, case when tg_op = 'UPDATE' then old.game_spoiler end],
    ['rims', new.game_rims, case when tg_op = 'UPDATE' then old.game_rims end],
    ['height', new.game_height, case when tg_op = 'UPDATE' then old.game_height end]
  ] loop
    v := pair[2];
    was := pair[3];
    if v is not null and v is distinct from was and not public.has_garage_part(new.owner_id, pair[1] || ':' || v) then
      raise exception 'locked_part: unlock % in the garage first.',
        coalesce((select name from public.garage_parts where id = pair[1] || ':' || v), v)
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists vehicle_parts_guard on public.vehicles;
create trigger vehicle_parts_guard before insert or update of game_spoiler, game_rims, game_height on public.vehicles
  for each row execute function public.vehicle_parts_guard();
