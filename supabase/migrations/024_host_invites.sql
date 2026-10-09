-- Host invites, and the founding host badge.
--
-- Verification used to mean putting a code in your Instagram bio. Hosts don't
-- want to touch their bio, and we're recruiting them by DM anyway — so the DM
-- is the proof. An admin makes a one-time link for @someaccount and sends it
-- to that account's inbox. Only whoever reads that inbox can open it, so
-- redeeming the link verifies the account that opened it. No code, no bio,
-- no approval step.
--
-- Hosts who find /hosts on their own still file a request (host_verifications);
-- the admin answers it with an invite DM rather than checking a bio.
--
-- Founding host: every host verified before launch, using the same cutoff as
-- the Day 1 badge (launch_settings.day_one_closes_at). It lives on
-- verified_hosts because that row is public, admin-written, and already
-- keyed on the host name the meet cards show.

-- ============ FOUNDING HOST ============
alter table public.verified_hosts
  add column if not exists founding boolean not null default false;

create or replace function public.launch_window_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.day_one_closes_at is null or now() < s.day_one_closes_at
       from public.launch_settings s),
    true
  );
$$;

-- Decided by the database when the host is first verified; re-verifying an
-- existing host (approval upserts this row) never takes it away or adds it.
create or replace function public.set_verified_host_founding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.founding := (auth.uid() is null and new.founding) or public.launch_window_open();
  elsif auth.uid() is not null then
    new.founding := old.founding;
  end if;
  return new;
end;
$$;

drop trigger if exists verified_hosts_founding on public.verified_hosts;
create trigger verified_hosts_founding
  before insert or update on public.verified_hosts
  for each row execute function public.set_verified_host_founding();

-- Everyone verified so far was verified before launch.
update public.verified_hosts set founding = true where not founding;

-- ============ INVITES ============
create table if not exists public.host_invites (
  id uuid primary key default gen_random_uuid(),
  -- 16 characters from a 31-letter alphabet: not guessable, short enough to
  -- sit in a DM without looking like a phishing link.
  token text unique not null,
  instagram_handle text not null check (instagram_handle ~ '^[a-z0-9_.]{1,30}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  used_host text
);

create index if not exists host_invites_created_idx on public.host_invites (created_at desc);

alter table public.host_invites enable row level security;

-- Admins see the list. Everyone else only ever touches an invite through the
-- functions below, by token, so there's no way to enumerate them.
drop policy if exists "admins read invites" on public.host_invites;
create policy "admins read invites"
  on public.host_invites for select
  to authenticated
  using (public.is_admin());

create or replace function public.create_host_invite(p_handle text)
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

  select string_agg(
           substr('abcdefghjkmnpqrstuvwxyz23456789', (floor(random() * 31) + 1)::int, 1), ''
         )
    into v_token
    from generate_series(1, 16);

  insert into public.host_invites (token, instagram_handle, created_by)
  values (v_token, v_handle, auth.uid());
  return v_token;
end;
$$;

-- What the /hosts page needs to greet someone by name before they sign up.
-- Returns the handle and whether the link still works — nothing else.
create or replace function public.peek_host_invite(p_token text)
returns table (instagram_handle text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select i.instagram_handle,
         case
           when i.used_at is not null then 'used'
           when i.expires_at < now() then 'expired'
           else 'valid'
         end
    from public.host_invites i
   where i.token = p_token;
$$;

-- Verifies the calling account as a host under its username, linked to the
-- invite's Instagram account. Same effects as an admin approving a request.
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

  update public.host_invites
     set used_by = v_uid, used_at = now(), used_host = v_host
   where id = v_inv.id;

  return 'verified';
end;
$$;

revoke all on function public.create_host_invite(text) from public;
revoke all on function public.peek_host_invite(text) from public;
revoke all on function public.redeem_host_invite(text) from public;
grant execute on function public.create_host_invite(text) to authenticated;
grant execute on function public.peek_host_invite(text) to anon, authenticated;
grant execute on function public.redeem_host_invite(text) to authenticated;

-- ============ COMMENTS ============
-- Both badges next to a commenter's name. security_invoker restated, as in 023.
create or replace view public.comments_with_author
with (security_invoker = true) as
select c.id, c.event_id, c.user_id, c.body, c.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.day_one, false) as day_one,
       p.day_one_number,
       exists (
         select 1 from public.verified_hosts vh
         where vh.user_id = c.user_id and vh.founding
       ) as founding_host
from public.comments c
left join public.profiles p on p.id = c.user_id;

grant select on public.comments_with_author to anon, authenticated;
