-- Co-hosts, "is this your meet?" requests, and a hole in takedowns.
--
-- 1. CO-HOSTS. Most Georgia meets are run by two to four crews at once
--    (Taco Tuesday: YNWA, Full Throttle Society, Metro ATL Carmeets,
--    Nawfside), but a meet had exactly one host. The owner — whoever posted
--    it — can now invite other accounts by username. An accepted co-host
--    manages the meet like the owner does: edits the details, approves join
--    requests on a private meet, sees its passcode, removes photos. Only the
--    owner deletes the meet, changes who can see it, or manages co-hosts, so
--    a co-host can never lock the owner out. Admins can also credit crews
--    by name on listings nobody owns (the imported ones).
--
-- 2. LISTING REQUESTS. Imported listings were posted by us, not by the
--    organizer, so an organizer needs a way to say "take this down", "this is
--    wrong" or "this is mine" without making an account first. Requests land
--    in an admin queue; anyone can file one, nobody but admins can read them.
--
--    A claim is handed over by a host invite that carries the listing:
--    redeeming it makes the organizer the listing's owner.
--
-- 3. TAKEDOWN HOLE. The update policy lets a creator write any column of their
--    own meet, including `hidden` — so a meet pulled by moderation could be
--    un-hidden by its creator with one REST call. Pinned below.

-- ============ CO-HOSTS ============
create table if not exists public.event_cohosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Display name: the invitee's username, or a crew credited by name.
  host text not null check (char_length(btrim(host)) between 1 and 40),
  -- Null for a name-only credit (no account behind it, no permissions).
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists event_cohosts_event_user_idx
  on public.event_cohosts (event_id, user_id) where user_id is not null;
create unique index if not exists event_cohosts_event_host_idx
  on public.event_cohosts (event_id, lower(host));
create index if not exists event_cohosts_user_idx
  on public.event_cohosts (user_id, status);

alter table public.event_cohosts enable row level security;

-- The owner, distinct from co-hosts: the one who posted the meet.
create or replace function public.is_event_owner(p_event_id uuid)
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

-- Everything that already asks "is this the host?" — approving join
-- requests, removing members, deleting photos — now includes accepted
-- co-hosts, so they get those powers without a policy each.
create or replace function public.is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.events e
      where e.id = p_event_id and e.created_by = auth.uid()
    )
    -- Co-hosts only count while the meet has an owner. A listing nobody owns
    -- (imported, or orphaned by an account deleted outside the app) is
    -- managed by admins, not by whoever was left attached to it.
    or exists (
      select 1 from public.event_cohosts c
      join public.events e on e.id = c.event_id
      where c.event_id = p_event_id
        and c.user_id = auth.uid()
        and c.status = 'accepted'
        and e.created_by is not null
    )
  );
$$;

-- A co-host of a private meet is in, the same as the owner.
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
        or (e.created_by is not null and exists (
          select 1 from public.event_cohosts c
          where c.event_id = e.id
            and c.user_id = auth.uid()
            and c.status = 'accepted'
        ))
      )
  );
$$;

-- Accepted co-hosts are public credit, like the host name. Pending invites
-- are visible only to the people involved.
drop policy if exists "cohosts are readable" on public.event_cohosts;
create policy "cohosts are readable"
  on public.event_cohosts for select
  to anon, authenticated
  using (
    status = 'accepted'
    or user_id = auth.uid()
    or public.is_event_owner(event_id)
    or public.is_admin()
  );

-- No insert or update policies: invites and acceptance go through the
-- functions below, which check who is asking. Deleting is direct: the
-- owner removes anyone, a co-host can step down, admins can do either.
drop policy if exists "owners remove cohosts and cohosts step down" on public.event_cohosts;
create policy "owners remove cohosts and cohosts step down"
  on public.event_cohosts for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_event_owner(event_id)
    or public.is_admin()
  );

-- invited | not_owner | no_such_user | self | reserved | already | limit | not_found
create or replace function public.invite_cohost(p_event_id uuid, p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_user uuid;
  v_name text := lower(btrim(regexp_replace(coalesce(p_username, ''), '^@', '')));
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  -- The owner only: a meet nobody owns has no one to invite on its behalf.
  if not public.is_event_owner(p_event_id) then
    return 'not_owner';
  end if;

  select id into v_user from public.profiles where username = v_name;
  if v_user is null then
    return 'no_such_user';
  end if;
  if v_user = v_event.created_by then
    return 'self';
  end if;
  -- A verified host's name belongs to their account. If someone else now
  -- holds that username (the host renamed), crediting it would put another
  -- account's meet on the real host's page.
  if exists (
    select 1 from public.verified_hosts vh
    where public.normalize_host(vh.host) = public.normalize_host(v_name)
      and vh.user_id is distinct from v_user
  ) then
    return 'reserved';
  end if;
  if exists (select 1 from public.event_cohosts where event_id = p_event_id and user_id = v_user) then
    return 'already';
  end if;
  -- Five is plenty for a meet and stops an owner spraying invites.
  if (select count(*) from public.event_cohosts where event_id = p_event_id) >= 5 then
    return 'limit';
  end if;

  insert into public.event_cohosts (event_id, host, user_id, status, invited_by)
  values (p_event_id, v_name, v_user, 'invited', auth.uid());
  return 'invited';
end;
$$;

-- accepted | declined | reserved | not_found
create or replace function public.respond_cohost_invite(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return 'not_found';
  end if;
  if p_accept then
    -- Re-checked here: the username or a reservation can change between
    -- invite and accept.
    if exists (
      select 1 from public.event_cohosts c
      join public.profiles pr on pr.id = c.user_id
      join public.verified_hosts vh
        on public.normalize_host(vh.host) = public.normalize_host(pr.username)
       and vh.user_id is distinct from c.user_id
      where c.id = p_id
    ) then
      return 'reserved';
    end if;
    update public.event_cohosts
       set status = 'accepted', accepted_at = now()
     where id = p_id and user_id = auth.uid() and status = 'invited';
    return case when found then 'accepted' else 'not_found' end;
  end if;
  delete from public.event_cohosts
   where id = p_id and user_id = auth.uid() and status = 'invited';
  return case when found then 'declined' else 'not_found' end;
end;
$$;

revoke all on function public.invite_cohost(uuid, text) from public;
revoke all on function public.respond_cohost_invite(uuid, boolean) from public;
grant execute on function public.invite_cohost(uuid, text) to authenticated;
grant execute on function public.respond_cohost_invite(uuid, boolean) to authenticated;

-- ============ WHO MAY CHANGE WHAT ON A MEET ============
drop policy if exists "cohosts can update their events" on public.events;
create policy "cohosts can update their events"
  on public.events for update
  to authenticated
  using (public.is_event_host(id))
  with check (public.is_event_host(id));

-- Pins the columns that aren't the caller's to change. host and verified are
-- pinned here too: the verification guard (012) skips rows with no owner, so
-- it can't be relied on for them.
create or replace function public.guard_event_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL editor, migrations, service role, and admins are trusted, and so is
  -- a claimed listing being handed over by redeem_host_invite.
  if auth.uid() is null
     or public.is_admin()
     or coalesce(current_setting('tunr.allow_handover', true), '') = 'on' then
    return new;
  end if;

  -- Nobody but moderation decides whether a meet is pulled, and a meet
  -- can't be handed to someone else.
  new.hidden := old.hidden;
  new.created_by := old.created_by;

  -- Verification is decided by the verify/redeem functions, which set this
  -- transaction-local flag.
  if coalesce(current_setting('tunr.allow_verified_write', true), '') <> 'on' then
    new.host := old.host;
    new.verified := old.verified;
  end if;

  -- A co-host edits the details, not who can see the meet or how to get in,
  -- and not the seeded counts or where the listing came from.
  if old.created_by is distinct from auth.uid() then
    new.visibility := old.visibility;
    new.access_mode := old.access_mode;
    new.passcode := old.passcode;
    new.slug := old.slug;
    new.base_going := old.base_going;
    new.base_interested := old.base_interested;
    new.source := old.source;
    new.source_url := old.source_url;
    new.recurrence_until := old.recurrence_until;
  end if;
  return new;
end;
$$;

drop trigger if exists events_owner_guard on public.events;
create trigger events_owner_guard
  before update on public.events
  for each row execute function public.guard_event_update();

-- ============ EVENTS_PUBLIC ============
-- Same as 026, except: hosts (owner or co-host) see the passcode and are
-- never shown the locked teaser; and two columns are appended — the
-- accepted co-host names, and whether the viewer hosts this meet.
create or replace view public.events_public as
select
  e.id, e.slug, e.title, e.host, e.verified, e.city,
  e.start_at, e.end_at, e.recurrence, e.timezone, e.vibe, e.tags,
  e.base_going, e.base_interested, e.created_by, e.created_at,
  e.visibility, e.access_mode, e.hidden,
  v.locked,
  m.status as membership_status,
  case when v.locked then null else e.location end as location,
  case when v.locked then null else e.description end as description,
  case when v.locked then null else e.lng end as lng,
  case when v.locked then null else e.lat end as lat,
  case when v.locked then null else e.photo_url end as photo_url,
  case when v.locked then null else e.source end as source,
  case when v.locked then null else e.source_url end as source_url,
  case when h.is_host then e.passcode else null end as passcode,
  e.recurrence_until,
  -- An account-backed co-host shows under their current username, so a
  -- rename can't leave a stale credit someone else could take.
  coalesce(
    (select array_agg(coalesce(pr.username, c.host) order by c.created_at)
       from public.event_cohosts c
       left join public.profiles pr on pr.id = c.user_id
      where c.event_id = e.id and c.status = 'accepted'),
    '{}'::text[]
  ) as cohosts,
  h.is_host as viewer_is_host
from public.events e
left join lateral (
  select em.status
  from public.event_members em
  where em.event_id = e.id and em.user_id = auth.uid()
  limit 1
) m on true
cross join lateral (
  select public.is_event_host(e.id) as is_host
) h
cross join lateral (
  select (
    e.visibility = 'private'
    and not h.is_host
    and coalesce(m.status, '') <> 'approved'
  ) as locked
) v
where not coalesce(e.hidden, false) or public.is_admin();

grant select on public.events_public to anon, authenticated;

-- ============ LISTING REQUESTS ============
create table if not exists public.listing_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('remove', 'correct', 'claim')),
  requester_name text check (char_length(requester_name) <= 80),
  -- An email address or an Instagram handle — how we reply.
  contact text not null check (char_length(btrim(contact)) between 3 and 120),
  details text check (char_length(details) <= 1000),
  user_id uuid references auth.users (id) on delete set null,
  -- Where an anonymous request came from, for per-sender limits.
  ip text,
  -- Arrived during a flood: kept, but sorted below the rest. Never rejected
  -- for someone else's volume, or a spammer could block a real takedown.
  throttled boolean not null default false,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index if not exists listing_requests_status_idx
  on public.listing_requests (status, created_at desc);
create index if not exists listing_requests_event_idx
  on public.listing_requests (event_id, created_at desc);
create index if not exists listing_requests_ip_idx
  on public.listing_requests (ip, created_at desc);

alter table public.listing_requests enable row level security;

-- Organizers often won't have an account, so anyone may file one.
drop policy if exists "anyone can file a listing request" on public.listing_requests;
create policy "anyone can file a listing request"
  on public.listing_requests for insert
  to anon, authenticated
  with check (status = 'open');

drop policy if exists "admins read listing requests" on public.listing_requests;
create policy "admins read listing requests"
  on public.listing_requests for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins resolve listing requests" on public.listing_requests;
create policy "admins resolve listing requests"
  on public.listing_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The caller's address as the platform saw it. cf-connecting-ip and
-- x-real-ip are set by the proxy; the leftmost x-forwarded-for entry is the
-- fallback (it can be spoofed, so it's only a speed bump).
create or replace function public.request_ip()
returns text
language sql
stable
as $$
  -- The setting is unset (or '') outside an API request, e.g. in the SQL
  -- editor, so there's no address to read.
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    h ->> 'x-real-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1)
  )), '')
  from (select nullif(current_setting('request.headers', true), '')::json as h) headers;
$$;

-- Stamps the fields, limits each sender, and only accepts requests about
-- listings TUNR posted. Open to anonymous callers, so every limit is about
-- the sender — never about how many others have asked.
create or replace function public.guard_listing_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One at a time, so parallel requests can't all see "under the limit".
  perform pg_advisory_xact_lock(hashtext('public.listing_requests'));

  new.user_id := auth.uid();
  new.ip := public.request_ip();
  new.status := 'open';
  new.throttled := false;
  new.resolved_at := null;
  new.resolved_by := null;
  new.created_at := now();
  new.contact := btrim(new.contact);

  -- Only listings nobody posted. An organizer's own meet has an owner, and
  -- problems with it go through Report, which needs an account.
  if not exists (
    select 1 from public.events e
    where e.id = new.event_id
      and e.created_by is null
      and e.visibility = 'public'
      and not coalesce(e.hidden, false)
  ) then
    raise exception 'not_listable' using errcode = 'P0001';
  end if;

  -- The same sender asking the same thing about the same listing again.
  if exists (
    select 1 from public.listing_requests
    where event_id = new.event_id
      and kind = new.kind
      and status = 'open'
      and lower(contact) = lower(new.contact)
  ) then
    raise exception 'duplicate_request' using errcode = 'P0001';
  end if;

  -- Per sender: by account, by address, by contact.
  if (new.user_id is not null and (select count(*) from public.listing_requests
        where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5)
     or (new.ip is not null and (select count(*) from public.listing_requests
        where ip = new.ip and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from public.listing_requests
          where lower(contact) = lower(new.contact) and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limit_requests' using errcode = 'P0001';
  end if;

  -- A flood across the site still gets in, flagged.
  if (select count(*) from public.listing_requests
       where created_at > now() - interval '1 hour') >= 60 then
    new.throttled := true;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_requests_guard on public.listing_requests;
create trigger listing_requests_guard
  before insert on public.listing_requests
  for each row execute function public.guard_listing_request();

-- The queue, with the listing it's about.
drop view if exists public.listing_requests_queue;
create view public.listing_requests_queue
with (security_invoker = true) as
select
  r.id, r.event_id, r.kind, r.requester_name, r.contact, r.details,
  r.status, r.created_at, r.throttled,
  e.title as event_title, e.host as event_host, e.city as event_city,
  e.start_at as event_start, e.hidden as event_hidden, e.slug as event_slug,
  (e.created_by is null) as event_imported
from public.listing_requests r
join public.events e on e.id = r.event_id;

grant select on public.listing_requests_queue to authenticated;

-- ============ CLAIMS: HANDING A LISTING OVER ============
-- A claim ends with the organizer owning the listing, not just verified. The
-- host invite DMed to them can carry the listing; redeeming it makes them
-- its owner, under their own name, and closes the request.
alter table public.host_invites
  add column if not exists event_id uuid references public.events (id) on delete set null;
alter table public.host_invites
  add column if not exists listing_request_id uuid references public.listing_requests (id) on delete set null;

drop function if exists public.create_host_invite(text);
create or replace function public.create_host_invite(
  p_handle text,
  p_event_id uuid default null,
  p_request_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := lower(regexp_replace(btrim(coalesce(p_handle, '')), '^@', ''));
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if v_handle !~ '^[a-z0-9_.]{1,30}$' then
    raise exception 'bad_handle' using errcode = 'P0001';
  end if;
  -- Only a listing nobody owns can be handed over.
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and created_by is null
  ) then
    raise exception 'not_claimable' using errcode = 'P0001';
  end if;

  select string_agg(
           substr('abcdefghjkmnpqrstuvwxyz23456789', (floor(random() * 31) + 1)::int, 1), ''
         )
    into v_token
    from generate_series(1, 16);

  insert into public.host_invites (token, instagram_handle, created_by, event_id, listing_request_id)
  values (v_token, v_handle, auth.uid(), p_event_id, p_request_id);
  return v_token;
end;
$$;

revoke all on function public.create_host_invite(text, uuid, uuid) from public;
grant execute on function public.create_host_invite(text, uuid, uuid) to authenticated;

-- 024's redemption, plus the handover at the end.
create or replace function public.redeem_host_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.host_invites;
  v_uid uuid := auth.uid();
  v_host text;
begin
  if v_uid is null then
    return 'not_signed_in';
  end if;

  -- Locked so two tabs can't both spend the same link.
  select * into v_inv from public.host_invites where token = p_token for update;
  if not found then
    return 'not_found';
  end if;
  if v_inv.used_at is not null then
    return case when v_inv.used_by = v_uid then 'already_yours' else 'used' end;
  end if;
  if v_inv.expires_at < now() then
    return 'expired';
  end if;

  select username into v_host from public.profiles where id = v_uid;
  if v_host is null then
    return 'needs_username';
  end if;

  if exists (
    select 1 from public.verified_hosts
    where public.normalize_host(host) = public.normalize_host(v_host)
      and user_id is distinct from v_uid
  ) then
    return 'host_taken';
  end if;

  insert into public.verified_hosts (host, user_id, instagram_handle, verified_by)
  values (v_host, v_uid, v_inv.instagram_handle, v_inv.created_by)
  on conflict (host) do update
    set user_id = excluded.user_id,
        instagram_handle = excluded.instagram_handle,
        verified_at = now(),
        verified_by = excluded.verified_by;

  perform set_config('tunr.allow_verified_write', 'on', true);
  update public.events
     set verified = true
   where public.normalize_host(host) = public.normalize_host(v_host)
     and (created_by = v_uid or created_by is null);

  -- Keep host_verifications as the record the Profile tab reads, and close
  -- any request they filed before the invite arrived.
  insert into public.host_verifications (user_id, host, instagram_handle)
  values (v_uid, v_host, v_inv.instagram_handle)
  on conflict (user_id, host) do nothing;
  update public.host_verifications
     set status = 'approved',
         instagram_handle = v_inv.instagram_handle,
         note = 'invite',
         decided_at = now(),
         decided_by = v_inv.created_by
   where user_id = v_uid and host = v_host and status <> 'approved';
  -- A request under some other name is superseded by this one.
  delete from public.host_verifications
   where user_id = v_uid and host <> v_host and status <> 'approved';

  -- A claimed listing becomes theirs, under their verified name — if nobody
  -- has taken it in the meantime.
  if v_inv.event_id is not null then
    perform set_config('tunr.allow_handover', 'on', true);
    update public.events
       set created_by = v_uid,
           host = v_host,
           verified = true
     where id = v_inv.event_id
       and created_by is null;
    perform set_config('tunr.allow_handover', '', true);
    update public.listing_requests
       set status = 'done', resolved_at = now(), resolved_by = v_inv.created_by
     where id = v_inv.listing_request_id and status = 'open';
  end if;

  update public.host_invites
     set used_by = v_uid, used_at = now(), used_host = v_host
   where id = v_inv.id;

  return 'verified';
end;
$$;

-- Taco Tuesday's flyer names four crews; credit the other three.
insert into public.event_cohosts (event_id, host, status, accepted_at)
select e.id, c.host, 'accepted', now()
  from public.events e
  cross join (values ('FullThrottleSociety'), ('MetroATLCarmeets'), ('Nawfside')) as c(host)
 where e.slug = 'taco-tuesday-dacula-2026-10-13'
on conflict do nothing;
