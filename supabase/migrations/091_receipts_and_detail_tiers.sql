-- 1. Points for Boosted receipts: upload a receipt or invoice from any
--    Boosted business (detailing, photography, merch). It waits for an admin
--    to check it, then pays points at the usual rate (points_settings
--    .points_per_dollar), claimed in the checklist like all points.
-- 2. Boosted Detailing's three tiers (Express, Deep Clean, Showroom) in the
--    request form.

-- ---------- receipts ----------

alter table public.purchase_claims
  add column if not exists business text not null default 'merch'
    check (business in ('detailing', 'photography', 'merch', 'other')),
  add column if not exists receipt_path text check (char_length(receipt_path) <= 300);

-- Receipts are private: only the person who uploaded one and admins see it.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
  drop policy if exists "people upload their receipts" on storage.objects;
  create policy "people upload their receipts" on storage.objects for insert to authenticated
    with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "people and admins see receipts" on storage.objects;
  create policy "people and admins see receipts" on storage.objects for select to authenticated
    using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
end;
$$;

-- Send a receipt for checking. ok | not_signed_in | unconfirmed | bad_business
-- | bad_order | bad_amount | need_receipt | rate_limited | duplicate
create or replace function public.submit_receipt(p_business text, p_order_ref text, p_amount_cents int, p_receipt_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  rec record;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if p_business not in ('detailing', 'photography', 'merch', 'other') then
    return jsonb_build_object('status', 'bad_business');
  end if;
  if char_length(btrim(coalesce(p_order_ref, ''))) not between 3 and 60 then
    return jsonb_build_object('status', 'bad_order');
  end if;
  if coalesce(p_amount_cents, 0) not between 100 and 1000000 then
    return jsonb_build_object('status', 'bad_amount');
  end if;
  -- The photo has to be theirs (uploaded into their own folder).
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> v_uid::text then
    return jsonb_build_object('status', 'need_receipt');
  end if;
  if (select count(*) from public.purchase_claims
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if exists (select 1 from public.purchase_claims
              where store = 'other' and lower(btrim(order_ref)) = lower(btrim(p_order_ref))
                and status <> 'rejected') then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.purchase_claims (user_id, store, order_ref, amount_cents, business, receipt_path)
  values (v_uid, 'other', btrim(p_order_ref), p_amount_cents, p_business, p_receipt_path)
  returning id into v_id;

  select coalesce(nullif(username, ''), 'someone') into v_name from public.profiles where id = v_uid;
  for rec in select id from public.profiles where is_admin loop
    perform public.notify(rec.id, 'feedback', '🧾 New Boosted receipt',
      '@' || v_name || ': ' || p_business || ', $' || to_char(p_amount_cents / 100.0, 'FM999990.00') || '. Settings → Admin → Purchases.',
      null, 'receipt:' || v_id);
  end loop;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.submit_receipt(text, text, int, text) from public, anon;
grant execute on function public.submit_receipt(text, text, int, text) to authenticated;

-- The admin queue shows which business and the receipt photo.
drop function if exists public.purchase_queue(text);
create or replace function public.purchase_queue(p_status text default 'pending')
returns table (
  id uuid, store text, order_ref text, amount_cents int, points int, created_at timestamptz,
  user_id uuid, username text, note text, business text, receipt_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.store, c.order_ref, c.amount_cents, c.points, c.created_at, c.user_id, p.username, c.note, c.business, c.receipt_path
    from public.purchase_claims c
    left join public.profiles p on p.id = c.user_id
   where public.is_admin() and c.status = p_status
   order by c.created_at desc
   limit 200;
$$;

revoke execute on function public.purchase_queue(text) from public, anon;
grant execute on function public.purchase_queue(text) to authenticated;

-- Approved receipts say what they were for in your points history.
create or replace function public.award_purchase(p_claim uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.purchase_claims;
  v_points int;
begin
  select * into c from public.purchase_claims where id = p_claim;
  v_points := floor(c.amount_cents / 100.0 * (select points_per_dollar from public.points_settings))::int;
  update public.purchase_claims set points = v_points where id = p_claim;
  if v_points > 0 then
    insert into public.point_ledger (user_id, delta, reason, note, created_by)
    values (c.user_id, v_points, 'purchase',
            left('Boosted ' || c.business || ' · ' || c.order_ref || ' ($' || to_char(c.amount_cents / 100.0, 'FM999990.00') || ')', 200),
            auth.uid());
  end if;
  return v_points;
end;
$$;

-- ---------- detailing tiers ----------

create or replace function public.request_detail(
  p_service text,
  p_car text,
  p_when text,
  p_area text,
  p_phone text,
  p_reply_email text,
  p_notes text,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_reply_email, '')), ''));
  v_car text := left(nullif(btrim(coalesce(p_car, '')), ''), 80);
  v_id uuid;
  v_name text;
  v_msg text;
  rec record;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if p_service not in ('Express Detail', 'Deep Clean', 'Showroom Detail', 'Not sure yet',
                       'Full detail', 'Interior', 'Exterior') then
    return jsonb_build_object('status', 'bad_service');
  end if;
  if v_car is null then
    return jsonb_build_object('status', 'need_car');
  end if;
  if v_phone is not null and v_phone !~ '^[0-9+() .-]{7,20}$' then
    return jsonb_build_object('status', 'bad_phone');
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') then
    return jsonb_build_object('status', 'bad_email');
  end if;
  if (select count(*) from public.feedback
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  v_msg := 'Service: ' || p_service
        || E'\nCar: ' || v_car
        || coalesce(E'\nWhen: ' || left(nullif(btrim(p_when), ''), 120), '')
        || coalesce(E'\nArea: ' || left(nullif(btrim(p_area), ''), 80), '')
        || coalesce(E'\nPhone: ' || v_phone, '')
        || coalesce(E'\n\n' || left(nullif(btrim(p_notes), ''), 1000), '');

  insert into public.feedback (user_id, kind, topic, message, reply_email, phone, device)
  values (v_uid, 'contact', 'detailing', v_msg, v_email, v_phone, left(nullif(btrim(p_device), ''), 120))
  returning id into v_id;

  select coalesce(nullif(username, ''), 'someone') into v_name from public.profiles where id = v_uid;
  for rec in select id from public.profiles where is_admin loop
    perform public.notify(rec.id, 'feedback', '🧽 New detailing request',
      '@' || coalesce(v_name, 'someone') || ': ' || p_service || ', ' || v_car || '. Open Settings → Inbox.',
      null, 'detailing:' || v_id);
  end loop;

  return jsonb_build_object('status', 'ok');
end;
$$;
