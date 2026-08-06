-- Fixes found reviewing 008 and 011 against the real threat model: the anon
-- key is public, so every policy has to hold against someone calling the REST
-- API directly with parameters the app would never send.
--
-- Written as a follow-up migration rather than edits to 008/011 so it lands
-- correctly whether or not those have already been applied.

-- ============ 1. THE VERIFICATION CODE IS NOT THE CLIENT'S TO CHOOSE ============
-- host_verifications.code had a default but nothing stopped a caller passing
-- its own value, which breaks the whole mechanism:
--
--   A real host requests verification for @torqatl, gets code C, and puts C in
--   their Instagram bio. The bio is public. An attacker reads C, then submits
--   their own request claiming the same host name and the same Instagram
--   handle, passing code = C. The admin opens @torqatl, sees C exactly where
--   it should be, and approves — with a coin-flip on which request they click.
--
-- Generating the code server-side makes each request's code unique and
-- unguessable, so a code only ever matches the account that requested it.
-- The decision columns are pinned here too; a requester has no business
-- setting them.
create or replace function public.guard_host_verification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.code := public.gen_verification_code();
  new.status := 'pending';
  new.note := null;
  new.decided_at := null;
  new.decided_by := null;
  return new;
end;
$$;

drop trigger if exists host_verifications_insert_guard on public.host_verifications;
create trigger host_verifications_insert_guard
  before insert on public.host_verifications
  for each row execute function public.guard_host_verification_insert();

-- ============ 2. HOST RESERVATION WAS CASE-SENSITIVE ============
-- 011 compared host names as exact strings, so reserving 'torq' did nothing
-- to stop a listing under 'TORQ' or 'torq ' — same name to every reader, a
-- different row to Postgres. Impersonation is the point of the feature, so
-- match on a normalised form everywhere.
create or replace function public.normalize_host(p_host text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_host, '')));
$$;

-- Also stops two verified hosts differing only by case.
create unique index if not exists verified_hosts_normalized_idx
  on public.verified_hosts (public.normalize_host(host));

create or replace function public.enforce_event_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(current_setting('tunr.allow_verified_write', true), '') <> 'on' then
      new.verified := old.verified;
      new.host := old.host;
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.verified_hosts vh
    where public.normalize_host(vh.host) = public.normalize_host(new.host)
      and vh.user_id is distinct from new.created_by
  ) then
    raise exception 'host_reserved' using errcode = 'P0001';
  end if;

  new.verified := exists (
    select 1 from public.verified_hosts vh
    where public.normalize_host(vh.host) = public.normalize_host(new.host)
      and vh.user_id = new.created_by
  );

  return new;
end;
$$;

create or replace function public.decide_host_verification(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.host_verifications;
begin
  if not public.is_admin() then
    return 'not_admin';
  end if;

  select * into v_req from public.host_verifications where id = p_id;
  if not found then
    return 'not_found';
  end if;

  if not p_approve then
    update public.host_verifications
       set status = 'rejected', note = p_note, decided_at = now(), decided_by = auth.uid()
     where id = p_id;
    return 'rejected';
  end if;

  if exists (
    select 1 from public.verified_hosts
    where public.normalize_host(host) = public.normalize_host(v_req.host)
      and user_id is distinct from v_req.user_id
  ) then
    return 'host_taken';
  end if;

  insert into public.verified_hosts (host, user_id, instagram_handle, verified_by)
  values (v_req.host, v_req.user_id, v_req.instagram_handle, auth.uid())
  on conflict (host) do update
    set user_id = excluded.user_id,
        instagram_handle = excluded.instagram_handle,
        verified_at = now(),
        verified_by = excluded.verified_by;

  perform set_config('tunr.allow_verified_write', 'on', true);

  update public.events
     set verified = true
   where public.normalize_host(host) = public.normalize_host(v_req.host)
     and (created_by = v_req.user_id or created_by is null);

  update public.host_verifications
     set status = 'approved', note = p_note, decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  return 'approved';
end;
$$;

-- Two requests for the same host name are a decision for the admin, but the
-- second one shouldn't look identical to the first. Surfacing both is fine;
-- the codes now differ, which is what makes them tellable apart.
create index if not exists host_verifications_host_idx
  on public.host_verifications (public.normalize_host(host));

-- ============ 3. AN RSVP COULD BE MOVED ONTO A PRIVATE MEET ============
-- 008 gated rsvp INSERT on can_access_event but left UPDATE checking only
-- ownership, so `update rsvps set event_id = '<private meet>'` slipped past
-- the gate and added the caller to a private meet's going count.
drop policy if exists "users manage their own rsvps: update" on public.rsvps;
create policy "users manage their own rsvps: update"
  on public.rsvps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_event(event_id));
