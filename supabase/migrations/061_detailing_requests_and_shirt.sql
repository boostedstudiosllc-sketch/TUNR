-- Three owner requests:
--
--   1. Boosted meets give 5 or 10 points. Any meet still set higher (the old
--      +25) comes down to 10, and 10 is now the most a meet can be set to.
--   2. The shirt reward: 300 points, one per person.
--   3. Boosted Detailing has no website or booking link, so people reach it
--      through the app: a request form (service, car, when, area, phone)
--      that lands in the admin inbox, and admins get an alert for each one.

-- 1. Boosted points top out at 10.
update public.points_meets set points = 10 where points > 10;

alter table public.points_meets drop constraint if exists points_meets_points_check;
alter table public.points_meets add constraint points_meets_points_check check (points between 1 and 10);

create or replace function public.set_meet_points(p_event uuid, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if coalesce(p_points, 0) <= 0 then
    delete from public.points_meets where event_id = p_event;
    return;
  end if;
  if p_points > 10 then
    raise exception 'points_meets_points_check';
  end if;
  insert into public.points_meets (event_id, enabled_by, points) values (p_event, auth.uid(), p_points)
  on conflict (event_id) do update set points = excluded.points, enabled_by = excluded.enabled_by;
end;
$$;

-- 2. The shirt: 10 points per $1 of value, so a $30 shirt is 300.
insert into public.rewards (title, description, kind, cost, how_to_claim, stock, per_person, active)
select 'Boosted Studios T-shirt',
       'A $30 shirt for our most active members. Any size.',
       'merch', 300,
       'Show your claim code at a Boosted meet and tell us your size. Can''t make one? Message us in the app and we''ll sort out pickup.',
       null, 1, true
 where not exists (select 1 from public.rewards where title = 'Boosted Studios T-shirt');

-- 3. Detailing requests ride on the contact inbox (051_feedback.sql).
alter table public.feedback drop constraint if exists feedback_topic_check;
alter table public.feedback add constraint feedback_topic_check check (topic in (
  'account', 'meet', 'points', 'bug', 'safety', 'business', 'other',
  'feature', 'improvement', 'event_idea', 'detailing'
));

alter table public.feedback
  add column if not exists phone text check (phone is null or phone ~ '^[0-9+() .-]{7,20}$');

-- A business on the Boosted page can take requests in the app instead of
-- (or as well as) links.
alter table public.boosted_businesses
  add column if not exists contact_form boolean not null default false;

update public.boosted_businesses
   set contact_form = true, email = null
 where slug = 'boosted-detailing';

-- ok, not_signed_in, bad_service, need_car, bad_phone, bad_email, rate_limited
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
  if p_service not in ('Full detail', 'Interior', 'Exterior', 'Not sure yet') then
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

revoke execute on function public.request_detail(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_detail(text, text, text, text, text, text, text, text) to authenticated;

-- The inbox gains the phone number and a topic filter.
drop function if exists public.feedback_inbox(text, text);
create or replace function public.feedback_inbox(p_status text default 'new', p_kind text default null, p_topic text default null)
returns table (
  id uuid, kind text, topic text, message text, reply_email text, device text, status text,
  reply text, created_at timestamptz, user_id uuid, username text, account_email text, phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.kind, f.topic, f.message, f.reply_email, f.device, f.status, f.reply, f.created_at,
         f.user_id, p.username, u.email, f.phone
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
   where public.is_admin()
     and f.status = p_status
     and (p_kind is null or f.kind = p_kind)
     and (p_topic is null or f.topic = p_topic)
   order by f.created_at desc
   limit 200;
$$;

revoke execute on function public.feedback_inbox(text, text, text) from public, anon;
grant execute on function public.feedback_inbox(text, text, text) to authenticated;
