-- Meets found on the web: a scheduled job searches public event sites for
-- Georgia car meets and shows, and writes what it finds to
-- data/found-meets/latest.json; .github/workflows/found-meets.yml loads that
-- file here (import_found_meets, as the database owner). Nothing is listed
-- by itself: admins look at each one (Settings → Admin → Found meets) and
-- ADD it (it becomes a meet, credited to its source) or DISMISS it.
--
--   found_meets                     the review queue (admins only)
--   import_found_meets(items, batch) loads a batch; skips repeats and meets
--                                   already on TUNR; tells admins
--   admin_add_found_meet(...)       makes the meet (the app pins the place)
--   admin_dismiss_found_meet(id)

create table if not exists public.found_meets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  kind text not null default 'meet' check (kind in ('meet', 'show', 'cruise', 'track', 'other')),
  starts_local text not null check (starts_local ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  ends_local text check (ends_local is null or ends_local ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  timezone text not null default 'America/New_York',
  location text not null check (char_length(location) between 3 and 200),
  city text check (char_length(city) <= 80),
  host text check (char_length(host) <= 80),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  details text check (char_length(details) <= 600),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 500),
  source_name text check (char_length(source_name) <= 80),
  status text not null default 'new' check (status in ('new', 'added', 'dismissed', 'duplicate')),
  event_id uuid references public.events (id) on delete set null,
  batch text,
  found_at timestamptz not null default now()
);
create unique index if not exists found_meets_once on public.found_meets (lower(title), starts_local);
create index if not exists found_meets_status_idx on public.found_meets (status, starts_local);
alter table public.found_meets enable row level security;
drop policy if exists "admins see found meets" on public.found_meets;
create policy "admins see found meets" on public.found_meets for select to authenticated using (public.is_admin());

-- Share of words two titles have in common (0..1), without extensions.
create or replace function public.similarity_words(a text, b text)
returns numeric
language sql
immutable
as $$
  with x as (select distinct w from regexp_split_to_table(regexp_replace(a, '[^a-z0-9 ]', ' ', 'g'), '\s+') w where length(w) > 2),
       y as (select distinct w from regexp_split_to_table(regexp_replace(b, '[^a-z0-9 ]', ' ', 'g'), '\s+') w where length(w) > 2)
  select case when (select count(*) from x) = 0 or (select count(*) from y) = 0 then 0
              else (select count(*) from x join y using (w))::numeric / least((select count(*) from x), (select count(*) from y)) end;
$$;

-- A meet already on TUNR that day with a similar name (or the same page).
create or replace function public.found_meet_duplicate(p_title text, p_day date, p_url text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
    from public.events e
   where not coalesce(e.hidden, false)
     and (e.source_url = p_url
          or ((e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date = p_day
              and (lower(e.title) = lower(p_title)
                   or similarity_words(lower(e.title), lower(p_title)) >= 0.6)))
   limit 1;
$$;
revoke execute on function public.found_meet_duplicate(text, date, text) from public, anon, authenticated;

-- Loads a batch from the finder. Bad rows are skipped (counted), never fatal.
create or replace function public.import_found_meets(p_items jsonb, p_batch text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_new int := 0;
  v_dup int := 0;
  v_bad int := 0;
  v_seen int := 0;
  v_id uuid;
  v_dupe uuid;
  v_start text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'not_a_list';
  end if;
  for it in select * from jsonb_array_elements(p_items) limit 300 loop
    begin
      v_start := it ->> 'starts_local';
      -- Only upcoming meets, within ~2 months.
      if v_start is null or v_start !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
         or v_start::timestamp < (now() at time zone 'America/New_York') - interval '2 hours'
         or v_start::timestamp > (now() at time zone 'America/New_York') + interval '70 days' then
        v_bad := v_bad + 1;
        continue;
      end if;
      v_dupe := public.found_meet_duplicate(it ->> 'title', left(v_start, 10)::date, it ->> 'source_url');
      insert into public.found_meets (title, kind, starts_local, ends_local, location, city, host, instagram, details, source_url, source_name, status, event_id, batch)
      values (left(trim(it ->> 'title'), 120), coalesce(nullif(it ->> 'kind', ''), 'meet'), v_start, nullif(it ->> 'ends_local', ''),
              left(trim(it ->> 'location'), 200), left(nullif(trim(it ->> 'city'), ''), 80), left(nullif(trim(it ->> 'host'), ''), 80),
              nullif(trim(leading '@' from coalesce(it ->> 'instagram', '')), ''), left(nullif(trim(it ->> 'details'), ''), 600),
              it ->> 'source_url', left(nullif(trim(it ->> 'source_name'), ''), 80),
              case when v_dupe is null then 'new' else 'duplicate' end, v_dupe, p_batch)
      on conflict do nothing
      returning id into v_id;
      if v_id is null then
        v_seen := v_seen + 1;
      elsif v_dupe is null then
        v_new := v_new + 1;
      else
        v_dup := v_dup + 1;
      end if;
      v_id := null;
    exception when others then
      v_bad := v_bad + 1; -- a row that breaks a rule (bad link, too long, …)
    end;
  end loop;
  if v_new > 0 then
    perform public.notify_admins('found_meets', '🔎 ' || v_new || ' meet' || case when v_new = 1 then '' else 's' end || ' found online',
      'Look them over and add the good ones: Settings → Admin → Found meets.', 'found:' || coalesce(p_batch, now()::date::text));
  end if;
  return jsonb_build_object('new', v_new, 'already_on_tunr', v_dup, 'seen_before', v_seen, 'skipped', v_bad);
end;
$$;
revoke execute on function public.import_found_meets(jsonb, text) from public, anon, authenticated;

-- Admins: list it. The app geocodes the place first (p_lat/p_lng; null for
-- "pin it to the city").
create or replace function public.admin_add_found_meet(p_id uuid, p_lat double precision, p_lng double precision, p_vibe text default 'JDM')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.found_meets;
  v_start timestamptz;
  v_end timestamptz;
  v_event uuid;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into f from public.found_meets where id = p_id for update;
  if not found or f.status not in ('new', 'duplicate') then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_start := f.starts_local::timestamp at time zone f.timezone;
  v_end := case when f.ends_local is not null then f.ends_local::timestamp at time zone f.timezone end;
  if v_end is not null and v_end <= v_start then
    v_end := v_end + interval '1 day';
  end if;
  insert into public.events (title, host, location, city, start_at, end_at, vibe, tags, description, source, source_url, lat, lng, timezone, visibility, access_mode, created_by)
  values (f.title, coalesce(f.instagram, f.host, f.source_name, 'TUNR'), f.location, coalesce(f.city, 'Atlanta, GA'), v_start, v_end,
          case when p_vibe in ('JDM', 'Euro', 'Exotic', 'Domestic', 'Truck') then p_vibe else 'JDM' end,
          array['Found online'],
          concat_ws(E'\n\n', f.details, 'Found on ' || coalesce(f.source_name, 'the web') || ': ' || f.source_url
                    || case when f.instagram is not null then E'\nHost: @' || f.instagram else '' end),
          'web', f.source_url, p_lat, p_lng, f.timezone, 'public', 'both', auth.uid())
  returning id into v_event;
  update public.found_meets set status = 'added', event_id = v_event where id = p_id;
  return jsonb_build_object('status', 'ok', 'event_id', v_event);
end;
$$;
revoke execute on function public.admin_add_found_meet(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.admin_add_found_meet(uuid, double precision, double precision, text) to authenticated;

create or replace function public.admin_dismiss_found_meet(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  update public.found_meets set status = 'dismissed' where id = p_id and status in ('new', 'duplicate');
end;
$$;
revoke execute on function public.admin_dismiss_found_meet(uuid) from public, anon;
grant execute on function public.admin_dismiss_found_meet(uuid) to authenticated;
