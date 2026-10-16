-- Notifications: an in-app inbox for everyone, and phone/desktop alerts
-- (Web Push) for anyone who turns them on.
--
-- Rows are only ever created by the database itself (triggers and definer
-- functions in this and later migrations) or by the server with the service
-- role, never directly by a client, so nobody can send anyone else an alert.
-- Delivering the push half is the server's job (api/push.js): it claims the
-- rows still waiting, sends them, and that's it.

-- ============ SETTINGS ============
-- Kept out of profiles because profiles are readable by everyone, and this
-- holds a (rounded) home location.
create table if not exists public.alert_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Linkups within this many miles of lat/lng.
  radius_miles int not null default 25 check (radius_miles between 1 and 250),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  linkups boolean not null default true,     -- linkups starting near you
  activity boolean not null default true,    -- people joining yours, requests answered, confirmations
  reminders boolean not null default true,   -- the morning of a meet you're going to
  updated_at timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

drop policy if exists "users read their own alert settings" on public.alert_settings;
create policy "users read their own alert settings"
  on public.alert_settings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users create their own alert settings" on public.alert_settings;
create policy "users create their own alert settings"
  on public.alert_settings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users change their own alert settings" on public.alert_settings;
create policy "users change their own alert settings"
  on public.alert_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users remove their own alert settings" on public.alert_settings;
create policy "users remove their own alert settings"
  on public.alert_settings for delete to authenticated
  using (user_id = auth.uid());

-- About a kilometre: enough to say "4 miles away", not enough to find a house.
create or replace function public.round_alert_location()
returns trigger
language plpgsql
as $$
begin
  new.lat := round(new.lat::numeric, 2)::double precision;
  new.lng := round(new.lng::numeric, 2)::double precision;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists alert_settings_round on public.alert_settings;
create trigger alert_settings_round
  before insert or update on public.alert_settings
  for each row execute function public.round_alert_location();

-- ============ DEVICES ============
create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users read their own devices" on public.push_subscriptions;
create policy "users read their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users remove their own devices" on public.push_subscriptions;
create policy "users remove their own devices"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- A phone is one device whoever's signed in: saving it moves it to the
-- current account, so a shared or handed-down phone doesn't keep getting the
-- previous person's alerts.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- The server's signing keys for Web Push (VAPID), made by the server the
-- first time it needs them. No policies: only the service role reads this.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_keys enable row level security;

-- ============ THE INBOX ============
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 300),
  -- Where tapping it goes: 'linkup:<id>', 'meet:<id>' or 'person:<id>'.
  link text check (char_length(link) <= 120),
  -- One of each per person, e.g. 'linkup:<id>' for "a linkup near you".
  dedupe text check (char_length(dedupe) <= 160),
  -- Whether to send it to their devices too (their settings, at the time).
  push boolean not null default true,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz,
  unique (user_id, dedupe)
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unsent_idx on public.notifications (created_at)
  where pushed_at is null and push;

alter table public.notifications enable row level security;

drop policy if exists "users read their own notifications" on public.notifications;
create policy "users read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users clear their own notifications" on public.notifications;
create policy "users clear their own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- The one way rows get in. Settings decide: nearby linkups are skipped
-- entirely for anyone who turned them off; everything else always lands in
-- the inbox and only the phone alert follows the setting.
create or replace function public.notify(
  p_user uuid,
  p_kind text,
  p_title text,
  p_body text default '',
  p_link text default null,
  p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.alert_settings;
  v_push boolean;
begin
  if p_user is null then
    return;
  end if;
  select * into s from public.alert_settings where user_id = p_user;
  if p_kind = 'linkup_nearby' then
    if s.user_id is null or not s.linkups then
      return;
    end if;
    v_push := true;
  elsif p_kind = 'meet_reminder' then
    if s.user_id is not null and not s.reminders then
      return;
    end if;
    v_push := true;
  else
    v_push := coalesce(s.activity, true);
  end if;

  insert into public.notifications (user_id, kind, title, body, link, dedupe, push)
  values (p_user, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 300), p_link, p_dedupe, v_push)
  on conflict (user_id, dedupe) do nothing;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text, text) to service_role;

-- For the server's daily meet reminders: many at once.
create or replace function public.notify_many(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  n int := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    perform public.notify(
      (item ->> 'user_id')::uuid,
      item ->> 'kind',
      item ->> 'title',
      item ->> 'body',
      item ->> 'link',
      item ->> 'dedupe'
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.notify_many(jsonb) from public, anon, authenticated;
grant execute on function public.notify_many(jsonb) to service_role;

-- The server takes the waiting alerts and the devices to send them to in one
-- step, marking them taken, so two deliveries running at once never send the
-- same alert twice. Anything over a day old has missed its moment and is
-- left in the inbox only. Old inbox rows are cleared out on the way.
create or replace function public.claim_pushes(p_limit int default 200)
returns table (id bigint, user_id uuid, title text, body text, link text, kind text, endpoints jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n0 where n0.created_at < now() - interval '60 days';
  return query
  with taken as (
    update public.notifications n
    set pushed_at = now()
    where n.id in (
      select n2.id from public.notifications n2
      where n2.pushed_at is null and n2.push and n2.created_at > now() - interval '1 day'
      order by n2.created_at
      limit greatest(1, least(p_limit, 500))
      for update skip locked
    )
    returning n.id, n.user_id, n.title, n.body, n.link, n.kind
  )
  select t.id, t.user_id, t.title, t.body, t.link, t.kind,
         coalesce(
           (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
              from public.push_subscriptions ps where ps.user_id = t.user_id),
           '[]'::jsonb
         )
  from taken t;
end;
$$;

revoke execute on function public.claim_pushes(int) from public, anon, authenticated;
grant execute on function public.claim_pushes(int) to service_role;

-- The bell updates live. Realtime applies the select policy per viewer.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Miles between two points, for "linkups near you".
create or replace function public.miles_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

grant execute on function public.miles_between(double precision, double precision, double precision, double precision) to anon, authenticated;
