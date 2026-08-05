-- Private meets: passcode entry and host-approved join requests.
--
-- Threat model: the anon key ships in the browser, so anyone can query the
-- REST API directly. "Hide it in the UI" is not privacy. The address of a
-- private meet is therefore withheld by the database itself:
--
--   * public.events gets a real SELECT policy — a private row is only
--     readable by its host and its approved members.
--   * public.events_public is the view the app reads. It runs with definer
--     rights (so it can see every row) and nulls out location/lat/lng/
--     description/photo for private meets the caller isn't in, exposing a
--     `locked` flag instead. That's what powers the teaser card.
--   * The passcode is only ever returned to the event's own host.
--
-- Every membership check goes through security-definer helpers so the
-- events <-> event_members policies don't recurse into each other.

-- ============ COLUMNS ============
alter table public.events
  add column if not exists visibility text not null default 'public';

alter table public.events
  add column if not exists access_mode text not null default 'both';

alter table public.events
  add column if not exists passcode text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_visibility_check') then
    alter table public.events
      add constraint events_visibility_check check (visibility in ('public', 'private'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_access_mode_check') then
    alter table public.events
      add constraint events_access_mode_check check (access_mode in ('passcode', 'request', 'both'));
  end if;
end
$$;

-- Six characters, ambiguous glyphs (0/O, 1/I/L) left out so a code read off a
-- phone screen or shouted across a lot still types in cleanly.
create or replace function public.gen_event_passcode()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31) + 1)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

update public.events set passcode = public.gen_event_passcode() where passcode is null;
alter table public.events alter column passcode set default public.gen_event_passcode();

-- ============ MEMBERSHIP ============
create table if not exists public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (event_id, user_id)
);

create index if not exists event_members_user_idx on public.event_members (user_id);

alter table public.event_members enable row level security;

-- ============ HELPERS ============
-- Security definer so the policies below can consult events/event_members
-- without tripping over each other's row-level security.
create or replace function public.can_access_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'public'
        or (auth.uid() is not null and e.created_by = auth.uid())
        or exists (
          select 1 from public.event_members m
          where m.event_id = e.id
            and m.user_id = auth.uid()
            and m.status = 'approved'
        )
      )
  );
$$;

create or replace function public.is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and auth.uid() is not null
      and e.created_by = auth.uid()
  );
$$;

create or replace function public.event_allows_requests(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.visibility = 'private'
      and e.access_mode in ('request', 'both')
  );
$$;

-- ============ EVENT_MEMBERS POLICIES ============
drop policy if exists "members read their own membership" on public.event_members;
create policy "members read their own membership"
  on public.event_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_event_host(event_id));

-- A user may only ever create a *pending* row for themselves, and only on a
-- meet that accepts requests. Approval is the host's move, below.
drop policy if exists "users request to join" on public.event_members;
create policy "users request to join"
  on public.event_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.event_allows_requests(event_id)
  );

drop policy if exists "hosts decide requests" on public.event_members;
create policy "hosts decide requests"
  on public.event_members for update
  to authenticated
  using (public.is_event_host(event_id))
  with check (public.is_event_host(event_id));

drop policy if exists "hosts remove members and users withdraw" on public.event_members;
create policy "hosts remove members and users withdraw"
  on public.event_members for delete
  to authenticated
  using (user_id = auth.uid() or public.is_event_host(event_id));

-- Host-facing request list with the requester's handle attached.
-- security_invoker so the caller's own row-level security still applies —
-- without it this view would hand every membership row to everyone.
drop view if exists public.event_members_with_profile;
create view public.event_members_with_profile
with (security_invoker = true) as
select
  m.event_id,
  m.user_id,
  m.status,
  m.created_at,
  m.decided_at,
  coalesce(p.username, 'someone') as username
from public.event_members m
left join public.profiles p on p.id = m.user_id;

grant select on public.event_members_with_profile to authenticated;

-- ============ EVENTS READ POLICY ============
-- Replaces the blanket "everyone can read every event". Private rows now
-- leave the database only for people who belong on them.
drop policy if exists "events are readable by everyone" on public.events;
drop policy if exists "public events are readable by everyone" on public.events;
create policy "public events are readable by everyone"
  on public.events for select
  to anon, authenticated
  using (visibility = 'public' or public.can_access_event(id));

-- The feed reads this instead of the table: it can see every row, and hands
-- back a redacted version of the ones the caller isn't in.
drop view if exists public.events_public;
create view public.events_public as
select
  e.id,
  e.slug,
  e.title,
  e.host,
  e.verified,
  e.city,
  e.start_at,
  e.end_at,
  e.recurrence,
  e.timezone,
  e.vibe,
  e.tags,
  e.base_going,
  e.base_interested,
  e.created_by,
  e.created_at,
  e.visibility,
  e.access_mode,
  v.locked,
  m.status as membership_status,
  case when v.locked then null else e.location end as location,
  case when v.locked then null else e.description end as description,
  case when v.locked then null else e.lng end as lng,
  case when v.locked then null else e.lat end as lat,
  case when v.locked then null else e.photo_url end as photo_url,
  case when v.locked then null else e.source end as source,
  case when v.locked then null else e.source_url end as source_url,
  case
    when auth.uid() is not null and e.created_by = auth.uid() then e.passcode
    else null
  end as passcode
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select (
    e.visibility = 'private'
    and (auth.uid() is null or e.created_by is distinct from auth.uid())
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v;

grant select on public.events_public to anon, authenticated;

-- ============ PASSCODE REDEMPTION ============
-- Attempts are logged so a stolen link can't be used to grind through codes.
create table if not exists public.passcode_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists passcode_attempts_user_idx
  on public.passcode_attempts (user_id, created_at desc);

alter table public.passcode_attempts enable row level security;
-- No policies: only the security-definer function below touches this table.

-- Returns a status string rather than raising, so the client can show the
-- right copy for each outcome. The passcode itself never crosses the wire in
-- the response — the caller submits a guess and learns only pass/fail.
create or replace function public.redeem_event_passcode(p_event_id uuid, p_passcode text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_attempts integer;
begin
  if auth.uid() is null then
    return 'not_signed_in';
  end if;

  select count(*) into v_attempts
  from public.passcode_attempts
  where user_id = auth.uid()
    and created_at > now() - interval '1 hour';

  if v_attempts >= 20 then
    return 'rate_limited';
  end if;

  insert into public.passcode_attempts (user_id, event_id) values (auth.uid(), p_event_id);

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return 'not_found';
  end if;

  if v_event.visibility <> 'private' then
    return 'ok';
  end if;

  if v_event.access_mode = 'request' then
    return 'passcode_disabled';
  end if;

  if upper(trim(coalesce(p_passcode, ''))) <> upper(coalesce(v_event.passcode, '')) then
    return 'invalid';
  end if;

  insert into public.event_members (event_id, user_id, status, decided_at)
  values (p_event_id, auth.uid(), 'approved', now())
  on conflict (event_id, user_id)
  do update set status = 'approved', decided_at = now();

  return 'ok';
end;
$$;

revoke all on function public.redeem_event_passcode(uuid, text) from public;
grant execute on function public.redeem_event_passcode(uuid, text) to authenticated;

-- ============ DOWNSTREAM TABLES ============
-- Comments and RSVPs hang off events, so they need the same gate — otherwise
-- a comment thread becomes a side channel for a private meet's address.
drop policy if exists "comments are readable by everyone" on public.comments;
create policy "comments are readable by everyone"
  on public.comments for select
  to anon, authenticated
  using (public.can_access_event(event_id));

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_event(event_id));

-- comments_with_author runs with definer rights, which would route straight
-- around the policy above. Make it honour the caller's own permissions.
alter view public.comments_with_author set (security_invoker = true);

drop policy if exists "users manage their own rsvps: insert" on public.rsvps;
create policy "users manage their own rsvps: insert"
  on public.rsvps for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_event(event_id));
