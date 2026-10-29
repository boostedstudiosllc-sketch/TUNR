-- The admin log: every change an admin makes (approving a receipt, voiding
-- a check-in, changing prices, hiding a meet, adjusting points, …) is
-- written down by itself: who, what, which row, what changed, when. Only
-- admins can read it; nobody can edit or delete it from the app.

create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  target text not null,
  row_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_log_created_idx on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;

drop policy if exists "admins read the admin log" on public.admin_log;
create policy "admins read the admin log" on public.admin_log for select to authenticated using (public.is_admin());
-- No insert, update or delete policies: only the trigger writes, and rows
-- are never changed.

-- Writes one line when an admin changes a row. For an update, only the
-- columns that changed (old → new); long values are cut short.
create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  d jsonb := '{}'::jsonb;
  k text;
  cut constant int := 200;
begin
  if not public.is_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (o -> k) is distinct from (n -> k) then
        d := d || jsonb_build_object(k, jsonb_build_array(left(o ->> k, cut), left(n ->> k, cut)));
      end if;
    end loop;
    if d = '{}'::jsonb then
      return null;
    end if;
  else
    for k in select jsonb_object_keys(coalesce(n, o)) loop
      d := d || jsonb_build_object(k, left(coalesce(n, o) ->> k, cut));
    end loop;
  end if;
  insert into public.admin_log (admin_id, action, target, row_id, changes)
  values (auth.uid(), tg_op, tg_table_name, coalesce(n, o) ->> 'id', d);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'point_ledger', 'purchase_claims', 'reward_redemptions', 'rewards', 'points_settings', 'point_cards',
    'rush_scenery', 'garage_parts', 'game_settings', 'events', 'meet_checkins', 'points_meets',
    'host_verifications', 'verified_hosts', 'host_invites', 'feedback', 'community_reports', 'reports',
    'points_issues', 'boosted_businesses', 'perks', 'partners', 'profiles', 'clubs', 'forums',
    'sticker_orders', 'sticker_settings', 'listing_requests'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists log_admin_change on public.%I', t);
    execute format('create trigger log_admin_change after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t);
  end loop;
end;
$$;

-- The newest entries, with the admin's username, for Settings → Admin → Admin log.
create or replace function public.admin_log_recent(p_limit int default 200)
returns table (id bigint, created_at timestamptz, admin text, action text, target text, row_id text, changes jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.created_at, coalesce(p.username, 'someone'), l.action, l.target, l.row_id, l.changes
    from public.admin_log l
    left join public.profiles p on p.id = l.admin_id
   where public.is_admin()
   order by l.created_at desc, l.id desc
   limit least(greatest(p_limit, 1), 500);
$$;
revoke execute on function public.admin_log_recent(int) from public, anon;
grant execute on function public.admin_log_recent(int) to authenticated;
