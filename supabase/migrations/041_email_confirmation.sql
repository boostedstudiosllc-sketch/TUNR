-- Confirm-later email. Sign-up no longer waits on an email (Supabase's
-- "Confirm email" is off), so TUNR checks the address itself afterwards:
--
--   day 0   a "confirm your email" link is emailed at sign-up
--   day 3-4 a reminder, naming the date the account will be removed
--   day 7+  still unconfirmed: the account is deleted (and never before both
--           emails actually went out, at least three days after the reminder)
--
-- Until then the account can browse and RSVP, but not chat, post, join
-- linkups or see a linkup's spot. The emails are Supabase's magic-link email
-- (see docs/email-templates.md); clicking one signs the person in with a
-- one-time code, which is what proves they own the inbox.

create table if not exists public.account_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  confirmed_at timestamptz,
  welcome_sent_at timestamptz,
  reminder_sent_at timestamptz,
  last_send_at timestamptz,
  delete_on date
);

alter table public.account_status enable row level security;

drop policy if exists "users read their own account status" on public.account_status;
create policy "users read their own account status"
  on public.account_status for select to authenticated
  using (user_id = auth.uid());

-- Everyone who signed up before this counts as confirmed: they either went
-- through Supabase's confirmation email or signed in with Google.
insert into public.account_status (user_id, confirmed_at)
select u.id, coalesce(u.email_confirmed_at, u.created_at, now())
from auth.users u
on conflict (user_id) do nothing;

-- No row means signed up after this migration and not confirmed yet.
create or replace function public.email_confirmed(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.confirmed_at is not null from public.account_status s where s.user_id = p_user), false);
$$;

grant execute on function public.email_confirmed(uuid) to anon, authenticated;

-- Called by the app on every sign-in. Confirms the account when this session
-- came from something only the inbox's owner could do: an emailed link or
-- code, a password reset, or Google. A plain password sign-in doesn't count.
create or replace function public.confirm_my_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_methods text[];
  s public.account_status;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select array_agg(x ->> 'method') into v_methods
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x;

  insert into public.account_status (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if v_methods && array['otp', 'magiclink', 'oauth', 'recovery', 'email/signup', 'invite', 'email_change'] then
    update public.account_status set confirmed_at = coalesce(confirmed_at, now()) where user_id = auth.uid();
  end if;

  select * into s from public.account_status where user_id = auth.uid();
  return jsonb_build_object(
    'confirmed', s.confirmed_at is not null,
    'confirmed_at', s.confirmed_at,
    'welcome_sent_at', s.welcome_sent_at,
    'delete_on', s.delete_on
  );
end;
$$;

revoke execute on function public.confirm_my_email() from public, anon;
grant execute on function public.confirm_my_email() to authenticated;

-- ============ WHAT NEEDS A CONFIRMED EMAIL ============
-- Chat, posting, linkups, verification. One error the app explains.
create or replace function public.require_confirmed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.email_confirmed(auth.uid()) then
    raise exception 'confirm_email_first';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'comments', 'linkup_messages', 'linkups', 'linkup_members', 'events',
    'photographer_confirmations', 'host_verifications', 'meet_photos', 'event_members'
  ] loop
    if to_regclass('public.' || t) is not null then
      -- Named to sort first, so this is the error people see before any other.
      execute format('drop trigger if exists a_require_confirmed_email on public.%I', t);
      execute format(
        'create trigger a_require_confirmed_email before insert on public.%I for each row execute function public.require_confirmed_email()',
        t
      );
    end if;
  end loop;
end $$;

-- 040's feed: a public linkup's spot is for confirmed accounts only.
create or replace view public.linkups_feed as
select
  l.id,
  l.user_id,
  coalesce(p.username, 'someone') as username,
  coalesce(p.is_photographer, false) as photographer,
  public.photographer_verified(l.user_id) as photographer_verified,
  coalesce(p.day_one, false) as day_one,
  p.day_one_number,
  l.kind,
  l.visibility,
  l.area,
  case when v.sees then l.place end as place,
  case when v.sees then l.note end as note,
  case when v.sees then l.lat else round(l.lat::numeric, 2)::double precision end as lat,
  case when v.sees then l.lng else round(l.lng::numeric, 2)::double precision end as lng,
  not v.sees as locked,
  l.going_as,
  l.starts_at,
  l.ends_at,
  l.created_at,
  l.cancelled_at,
  public.linkup_headcount(l.id) as headcount,
  case when r.role = 'host' then
    (select count(*)::int from public.linkup_members m where m.linkup_id = l.id and m.status = 'requested')
  else 0 end as requests,
  r.role as my_role
from public.linkups l
left join public.profiles p on p.id = l.user_id
cross join lateral (select public.linkup_role(l.id) as role) r
cross join lateral (
  select (r.role in ('host', 'in')) or (l.visibility = 'public' and public.email_confirmed(auth.uid())) as sees
) v
where auth.uid() is not null
  and not public.blocked_either_way(auth.uid(), l.user_id)
  and (
    (l.cancelled_at is null and l.ends_at > now())
    or (r.role is not null and l.ends_at > now() - interval '6 hours')
  );

revoke all on public.linkups_feed from anon;
grant select on public.linkups_feed to authenticated;

-- ============ THE SERVER'S SIDE ============
-- Who needs which email today, and who's past their date. Unconfirmed
-- accounts only; created within the last 60 days so nothing ancient lingers.
create or replace function public.confirmation_queue()
returns table (user_id uuid, email text, created_at timestamptz, stage text, delete_on date)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select u.id, u.email::text, u.created_at,
      case
        when s.welcome_sent_at is null then 'welcome'
        when s.reminder_sent_at is null and u.created_at <= now() - interval '3 days' then 'reminder'
        when s.reminder_sent_at is not null
             and now() >= greatest(u.created_at + interval '7 days', s.reminder_sent_at + interval '3 days')
             and current_date >= coalesce(s.delete_on, current_date)
          then 'delete'
      end as stage,
      s.delete_on
    from auth.users u
    left join public.account_status s on s.user_id = u.id
    where s.confirmed_at is null
      and u.email is not null
      and u.created_at > now() - interval '60 days'
  ) q
  where q.stage is not null;
$$;

revoke execute on function public.confirmation_queue() from public, anon, authenticated;
grant execute on function public.confirmation_queue() to service_role;

-- Record an email that went out, after it went out: a failed send is never
-- recorded, so nobody is removed without both warnings. p_stage is
-- 'welcome', 'reminder' or 'resend' (someone tapped "resend"). The removal
-- date is never earlier than seven days after sign-up, or three days after
-- the reminder.
create or replace function public.mark_confirmation_sent(p_user uuid, p_stage text, p_delete_on date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz := (select created_at from auth.users where id = p_user);
  v_floor date;
begin
  insert into public.account_status (user_id) values (p_user) on conflict (user_id) do nothing;
  v_floor := (v_created + interval '7 days')::date;
  if p_stage = 'reminder' then
    v_floor := greatest(v_floor, (now() + interval '3 days')::date);
  end if;
  update public.account_status
  set welcome_sent_at = case when p_stage = 'welcome' then coalesce(welcome_sent_at, now()) else welcome_sent_at end,
      reminder_sent_at = case when p_stage = 'reminder' then coalesce(reminder_sent_at, now()) else reminder_sent_at end,
      last_send_at = now(),
      delete_on = greatest(coalesce(delete_on, v_floor), v_floor, coalesce(p_delete_on, v_floor))
  where user_id = p_user;
  return (select delete_on from public.account_status where user_id = p_user);
end;
$$;

revoke execute on function public.mark_confirmation_sent(uuid, text, date) from public, anon, authenticated;
grant execute on function public.mark_confirmation_sent(uuid, text, date) to service_role;

-- How many accounts the cleanup removed, by day, for the admin.
create table if not exists public.account_cleanups (
  day date primary key default current_date,
  deleted int not null default 0
);

alter table public.account_cleanups enable row level security;

create or replace function public.record_account_cleanup(p_deleted int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.account_cleanups (day, deleted) values (current_date, p_deleted)
  on conflict (day) do update set deleted = public.account_cleanups.deleted + excluded.deleted;
$$;

revoke execute on function public.record_account_cleanup(int) from public, anon, authenticated;
grant execute on function public.record_account_cleanup(int) to service_role;

create or replace function public.account_cleanup_stats()
returns table (deleted_7d int, deleted_30d int, unconfirmed_now int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(deleted)::int from public.account_cleanups where day > current_date - 7), 0),
    coalesce((select sum(deleted)::int from public.account_cleanups where day > current_date - 30), 0),
    (select count(*)::int from auth.users u
       left join public.account_status s on s.user_id = u.id
       where s.confirmed_at is null)
  where public.is_admin();
$$;

revoke execute on function public.account_cleanup_stats() from public, anon;
grant execute on function public.account_cleanup_stats() to authenticated;
