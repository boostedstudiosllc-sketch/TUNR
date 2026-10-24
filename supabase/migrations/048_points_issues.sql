-- "Missing points?" reports: a buyer whose points didn't show up (lost the
-- card, card didn't work, bought somewhere else) sends the order number and
-- the email they bought with. An admin looks it up and either adds the
-- points (the order is then recorded, so it can't be paid twice) or replies
-- with why not. Either way the buyer gets an alert with the answer.

create table if not exists public.points_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store text not null check (store in ('square', 'depop', 'in_person', 'other', 'card')),
  order_ref text not null check (char_length(btrim(order_ref)) between 3 and 60),
  purchase_email text not null check (
    char_length(purchase_email) <= 254 and purchase_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
  ),
  item text check (char_length(item) <= 80),
  message text check (char_length(message) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'declined')),
  reply text check (char_length(reply) <= 300),
  points_added integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index if not exists points_issues_user_idx on public.points_issues (user_id, created_at desc);
create index if not exists points_issues_status_idx on public.points_issues (status, created_at desc);

alter table public.points_issues enable row level security;

drop policy if exists "users see their own points issues" on public.points_issues;
create policy "users see their own points issues"
  on public.points_issues for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- Written only through the functions below.

-- ok, not_signed_in, bad_order, bad_email, rate_limited, already_open, already_paid
create or replace function public.report_points_issue(
  p_store text,
  p_order_ref text,
  p_purchase_email text,
  p_item text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref text := btrim(coalesce(p_order_ref, ''));
  v_email text := lower(btrim(coalesce(p_purchase_email, '')));
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if p_store not in ('square', 'depop', 'in_person', 'other', 'card') or char_length(v_ref) not between 3 and 60 then
    return jsonb_build_object('status', 'bad_order');
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    return jsonb_build_object('status', 'bad_email');
  end if;
  if (select count(*) from public.points_issues
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if exists (select 1 from public.points_issues
              where user_id = v_uid and status = 'open' and lower(order_ref) = lower(v_ref)) then
    return jsonb_build_object('status', 'already_open');
  end if;
  -- Already paid out for this order (to anyone).
  if exists (select 1 from public.purchase_claims
              where lower(btrim(order_ref)) = lower(v_ref) and status = 'approved') then
    return jsonb_build_object('status', 'already_paid');
  end if;

  insert into public.points_issues (user_id, store, order_ref, purchase_email, item, message)
  values (v_uid, p_store, v_ref, v_email, left(nullif(btrim(p_item), ''), 80), left(nullif(btrim(p_message), ''), 500));
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.report_points_issue(text, text, text, text, text) from public, anon;
grant execute on function public.report_points_issue(text, text, text, text, text) to authenticated;

create or replace function public.points_issue_queue(p_status text default 'open')
returns table (
  id uuid, store text, order_ref text, purchase_email text, item text, message text,
  status text, reply text, points_added int, created_at timestamptz,
  user_id uuid, username text, account_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.store, i.order_ref, i.purchase_email, i.item, i.message,
         i.status, i.reply, i.points_added, i.created_at,
         i.user_id, p.username, u.email
    from public.points_issues i
    left join public.profiles p on p.id = i.user_id
    left join auth.users u on u.id = i.user_id
   where public.is_admin() and i.status = p_status
   order by i.created_at desc
   limit 200;
$$;

revoke execute on function public.points_issue_queue(text) from public, anon;
grant execute on function public.points_issue_queue(text) to authenticated;

-- Fix it (records the order for the amount found, which adds the points at
-- the current rate) or decline with a reason. Returns the points added.
create or replace function public.resolve_points_issue(p_id uuid, p_amount_cents int, p_reply text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.points_issues;
  v_points int := 0;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into i from public.points_issues where id = p_id for update;
  if not found then
    raise exception 'issue_not_found';
  end if;
  if i.status <> 'open' then
    raise exception 'issue_already_answered';
  end if;

  if p_amount_cents is not null then
    -- record_purchase checks admin, the amount and that the order isn't
    -- already paid, so a report can't pay an order twice.
    v_points := public.record_purchase(i.user_id, case when i.store = 'card' then 'other' else i.store end, i.order_ref, p_amount_cents);
    update public.points_issues
       set status = 'resolved', reply = left(nullif(btrim(p_reply), ''), 300), points_added = v_points,
           resolved_at = now(), resolved_by = auth.uid()
     where id = p_id;
    perform public.notify(i.user_id, 'reward', '⭐ Points added',
      '+' || v_points || ' points for order ' || i.order_ref || '.' || coalesce(' ' || nullif(btrim(p_reply), ''), ''), null, null);
  else
    if coalesce(btrim(p_reply), '') = '' then
      raise exception 'note_required';
    end if;
    update public.points_issues
       set status = 'declined', reply = left(btrim(p_reply), 300), resolved_at = now(), resolved_by = auth.uid()
     where id = p_id;
    perform public.notify(i.user_id, 'reward', 'About your missing points',
      'Order ' || i.order_ref || ': ' || btrim(p_reply), null, null);
  end if;
  return v_points;
end;
$$;

revoke execute on function public.resolve_points_issue(uuid, int, text) from public, anon;
grant execute on function public.resolve_points_issue(uuid, int, text) to authenticated;
