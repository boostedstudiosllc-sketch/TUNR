-- Points you earn wait in your checklist until you tap CLAIM (like a farm
-- game's task board), instead of landing in your balance on their own.
--
-- point_ledger.claimed_at: null = earned, waiting to be claimed. Only
-- claimed rows count toward your balance. Refunds and TUNR's own
-- adjustments land at once; everything else you earn waits.

alter table public.point_ledger add column if not exists claimed_at timestamptz default now();
update public.point_ledger set claimed_at = created_at where claimed_at is null;

create index if not exists point_ledger_unclaimed_idx
  on public.point_ledger (user_id) where claimed_at is null;

create or replace function public.point_ledger_hold()
returns trigger
language plpgsql
as $$
begin
  if new.delta > 0 and new.reason not in ('refund', 'admin_adjust') then
    new.claimed_at := null;
  else
    new.claimed_at := coalesce(new.claimed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists point_ledger_hold on public.point_ledger;
create trigger point_ledger_hold
  before insert on public.point_ledger
  for each row execute function public.point_ledger_hold();

-- Every function that adds up a balance counts claimed points only. They
-- all add it up the same way (sum(delta) from point_ledger where ...), so
-- rewrite each one in place rather than copying them all out here.
do $$
declare
  f record;
  def text;
  fixed text;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ 'sum\(delta\), 0\)( into v_\w+)?\s+from public\.point_ledger\s+where '
  loop
    def := pg_get_functiondef(f.oid);
    fixed := regexp_replace(
      def,
      '(sum\(delta\), 0\)( into v_\w+)?\s+from public\.point_ledger\s+where )(?!claimed_at)',
      '\1claimed_at is not null and ',
      'g'
    );
    if fixed <> def then
      execute fixed;
    end if;
  end loop;
end;
$$;

-- Claim waiting points: the ones listed, or all of them (p_ids null).
create or replace function public.claim_points(p_ids bigint[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claimed integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  with c as (
    update public.point_ledger
    set claimed_at = now()
    where user_id = v_uid
      and claimed_at is null
      and (p_ids is null or id = any (p_ids))
    returning delta
  )
  select coalesce(sum(delta), 0) into v_claimed from c;
  return jsonb_build_object(
    'status', 'ok',
    'claimed', v_claimed,
    'balance', (select coalesce(sum(delta), 0) from public.point_ledger where claimed_at is not null and user_id = v_uid)
  );
end;
$$;

revoke execute on function public.claim_points(bigint[]) from public, anon;
grant execute on function public.claim_points(bigint[]) to authenticated;
