-- Receipts pay a flat amount (10 points by default, admins can change it),
-- not points per dollar, and one receipt a day.

alter table public.points_settings
  add column if not exists receipt_points integer not null default 10 check (receipt_points between 0 and 1000);

create or replace function public.award_purchase(p_claim uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.purchase_claims;
  s public.points_settings;
  v_points int;
begin
  select * into c from public.purchase_claims where id = p_claim;
  select * into s from public.points_settings;
  -- An uploaded receipt: a flat amount. A card or a sale an admin records:
  -- points per dollar, as before.
  v_points := case when c.receipt_path is not null then s.receipt_points
                   else floor(c.amount_cents / 100.0 * s.points_per_dollar)::int end;
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

-- One receipt a day.
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
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> v_uid::text then
    return jsonb_build_object('status', 'need_receipt');
  end if;
  if exists (select 1 from public.purchase_claims
              where user_id = v_uid and receipt_path is not null and status <> 'rejected'
                and created_at > now() - interval '24 hours') then
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
