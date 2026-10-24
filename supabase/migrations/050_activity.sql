-- Your activity, for the Settings pages: sign-in history, meet history, and
-- invite dates.

-- ============ SIGN-IN HISTORY ============
-- Written by the app when a sign-in happens: the device (browser and system,
-- e.g. "Safari on iPhone") and a partly hidden address, so someone can spot
-- a sign-in that wasn't them. Kept 90 days.
create table if not exists public.sign_ins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device text not null check (char_length(device) <= 120),
  ip_hint text check (char_length(ip_hint) <= 60),
  created_at timestamptz not null default now()
);

create index if not exists sign_ins_user_idx on public.sign_ins (user_id, created_at desc);

alter table public.sign_ins enable row level security;

drop policy if exists "users see their own sign-ins" on public.sign_ins;
create policy "users see their own sign-ins"
  on public.sign_ins for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.record_sign_in(p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_device text := left(coalesce(nullif(btrim(p_device), ''), 'Unknown device'), 120);
  v_ip text := public.request_ip();
  v_hint text;
begin
  if v_uid is null then
    return;
  end if;
  -- The same device signing in again within 30 minutes is the same visit.
  if exists (select 1 from public.sign_ins
              where user_id = v_uid and device = v_device and created_at > now() - interval '30 minutes') then
    return;
  end if;
  -- Enough to recognise a network, not to locate anyone: 203.0.113.x / 2001:db8:…
  v_hint := case
    when v_ip ~ '^\d+\.\d+\.\d+\.\d+$' then regexp_replace(v_ip, '\.\d+$', '.x')
    when v_ip like '%:%' then split_part(v_ip, ':', 1) || ':' || split_part(v_ip, ':', 2) || ':…'
    else null
  end;
  insert into public.sign_ins (user_id, device, ip_hint) values (v_uid, v_device, v_hint);
  delete from public.sign_ins where user_id = v_uid and created_at < now() - interval '90 days';
end;
$$;

revoke execute on function public.record_sign_in(text) from public, anon;
grant execute on function public.record_sign_in(text) to authenticated;

-- ============ MEET HISTORY ============
-- Meets you checked in at (with the day), and one-off meets you RSVP'd to
-- that are over. Newest first.
create or replace function public.my_meet_history()
returns table (event_id uuid, title text, city text, day date, rsvp text, checked_in boolean)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select event_id, occurrence as day
      from public.meet_checkins
     where user_id = auth.uid() and voided_at is null
  ),
  r as (
    select r.event_id, r.status,
           (e.start_at at time zone coalesce(e.timezone, 'America/New_York'))::date as day
      from public.rsvps r
      join public.events e on e.id = r.event_id
     where r.user_id = auth.uid()
       and e.recurrence is null
       and e.start_at is not null
       and coalesce(e.end_at, e.start_at + interval '4 hours') < now()
  ),
  both_ as (
    select coalesce(c.event_id, r.event_id) as event_id,
           coalesce(c.day, r.day) as day,
           r.status as rsvp,
           c.event_id is not null as checked_in
      from c
      full join r on r.event_id = c.event_id and r.day = c.day
  )
  select b.event_id, e.title, e.city, b.day, b.rsvp, b.checked_in
    from both_ b
    join public.events e on e.id = b.event_id
   where not e.hidden
   order by b.day desc
   limit 200;
$$;

revoke execute on function public.my_meet_history() from public, anon;
grant execute on function public.my_meet_history() to authenticated;

-- ============ INVITES ============
-- 049's my_invites, plus when each friend joined.
create or replace function public.my_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  v_count := public.confirmed_invites(v_uid);
  return jsonb_build_object(
    'status', 'ok',
    'code', (select invite_code from public.profiles where id = v_uid),
    'confirmed', v_count,
    'pending', (select count(*) from public.profiles p
                 where p.invited_by = v_uid and not public.email_confirmed(p.id)),
    'unlocked', jsonb_build_object(
      'cars', v_count >= 1 or public.is_admin(),
      'clubs', v_count >= 1 or public.is_admin(),
      'flair', v_count >= 5 or public.is_admin()
    ),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'username', p.username,
               'confirmed', public.email_confirmed(p.id),
               'joined', p.invited_at)
             order by p.invited_at desc)
        from public.profiles p where p.invited_by = v_uid), '[]'::jsonb)
  );
end;
$$;
