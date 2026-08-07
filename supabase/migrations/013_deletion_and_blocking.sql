-- Account deletion and user blocking.
--
-- Both are App Store requirements — guideline 5.1.1(v) makes in-app account
-- deletion mandatory for any app with sign-up, and 1.2 requires a way to block
-- abusive users in any app carrying user-generated content. They're the right
-- thing on the web regardless.

-- ============ BLOCKING ============
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);

alter table public.blocks enable row level security;

drop policy if exists "users read their own blocks" on public.blocks;
create policy "users read their own blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "users create their own blocks" on public.blocks;
create policy "users create their own blocks"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "users remove their own blocks" on public.blocks;
create policy "users remove their own blocks"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- Definer so the comments policy below can consult blocks without needing a
-- select policy that would expose who blocked whom.
create or replace function public.has_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where blocker_id = auth.uid() and blocked_id = p_user_id
  );
$$;

-- Blocked comments are filtered in the database, so they never reach the
-- client at all rather than being hidden after the fact.
drop policy if exists "comments are readable by everyone" on public.comments;
create policy "comments are readable by everyone"
  on public.comments for select
  to anon, authenticated
  using (public.can_access_event(event_id) and not public.has_blocked(user_id));

-- Blocking is one-directional in what it hides, but it has to stop the
-- blocked account talking to you as well, or it isn't a block.
drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment"
  on public.comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.can_access_event(event_id)
    and not exists (
      select 1 from public.blocks b
      join public.events e on e.id = event_id
      where b.blocker_id = e.created_by and b.blocked_id = auth.uid()
    )
  );

-- Handy for the "blocked accounts" list in the profile.
drop view if exists public.blocked_accounts;
create view public.blocked_accounts
with (security_invoker = true) as
select
  b.blocked_id,
  b.created_at,
  coalesce(p.username, 'someone') as username
from public.blocks b
left join public.profiles p on p.id = b.blocked_id;

grant select on public.blocked_accounts to authenticated;

-- ============ ACCOUNT DELETION ============
-- Deleting the auth.users row cascades to profiles, rsvps, comments, follows,
-- blocks, event_members and host_verifications, all of which reference it with
-- on delete cascade. Two things don't cascade the way we want:
--
--   * events.created_by is `on delete set null`, which would leave meets
--     nobody can edit, update or take down. They go with the account.
--   * verified_hosts.user_id is also set null; the reservation is released so
--     the host name doesn't stay locked forever.
--
-- Runs as definer because deleting from auth.users needs privileges no client
-- role has, and takes no user id — it only ever deletes the caller.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  delete from public.verified_hosts where user_id = v_uid;
  delete from public.events where created_by = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
