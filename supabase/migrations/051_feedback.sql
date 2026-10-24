-- Contact us and the suggestion box: messages to the TUNR team from inside
-- the app. Admins read them in an inbox and can answer; the answer arrives
-- as an alert, and the sender sees it on the page they wrote from.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('contact', 'suggestion')),
  topic text not null check (topic in (
    'account', 'meet', 'points', 'bug', 'safety', 'business', 'other',
    'feature', 'improvement', 'event_idea'
  )),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  -- Where to reach them if not in the app (optional; defaults to the account email).
  reply_email text check (reply_email is null or (char_length(reply_email) <= 254 and reply_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')),
  device text check (char_length(device) <= 120),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  reply text check (char_length(reply) <= 1000),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references auth.users (id) on delete set null
);

create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "users see their own feedback" on public.feedback;
create policy "users see their own feedback"
  on public.feedback for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- Written only through the functions below.

-- ok, not_signed_in, bad_kind, too_short, bad_email, rate_limited
create or replace function public.send_feedback(
  p_kind text,
  p_topic text,
  p_message text,
  p_reply_email text,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(nullif(btrim(coalesce(p_reply_email, '')), ''));
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if p_kind not in ('contact', 'suggestion')
     or p_topic not in ('account', 'meet', 'points', 'bug', 'safety', 'business', 'other',
                        'feature', 'improvement', 'event_idea') then
    return jsonb_build_object('status', 'bad_kind');
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 5 then
    return jsonb_build_object('status', 'too_short');
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') then
    return jsonb_build_object('status', 'bad_email');
  end if;
  if (select count(*) from public.feedback
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.feedback (user_id, kind, topic, message, reply_email, device)
  values (v_uid, p_kind, p_topic, left(btrim(p_message), 2000), v_email, left(nullif(btrim(p_device), ''), 120));
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.send_feedback(text, text, text, text, text) from public, anon;
grant execute on function public.send_feedback(text, text, text, text, text) to authenticated;

create or replace function public.feedback_inbox(p_status text default 'new', p_kind text default null)
returns table (
  id uuid, kind text, topic text, message text, reply_email text, device text, status text,
  reply text, created_at timestamptz, user_id uuid, username text, account_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.kind, f.topic, f.message, f.reply_email, f.device, f.status, f.reply, f.created_at,
         f.user_id, p.username, u.email
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
   where public.is_admin()
     and f.status = p_status
     and (p_kind is null or f.kind = p_kind)
   order by f.created_at desc
   limit 200;
$$;

revoke execute on function public.feedback_inbox(text, text) from public, anon;
grant execute on function public.feedback_inbox(text, text) to authenticated;

-- Answer (they get an alert) or close without one.
create or replace function public.answer_feedback(p_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.feedback;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  select * into f from public.feedback where id = p_id for update;
  if not found then
    raise exception 'feedback_not_found';
  end if;
  update public.feedback
     set status = case when v_reply is null then 'closed' else 'answered' end,
         reply = left(v_reply, 1000), answered_at = now(), answered_by = auth.uid()
   where id = p_id;
  if v_reply is not null then
    perform public.notify(f.user_id, 'feedback',
      case when f.kind = 'suggestion' then '💡 About your suggestion' else '💬 TUNR replied' end,
      left(v_reply, 300), null, 'feedback:' || f.id);
  end if;
end;
$$;

revoke execute on function public.answer_feedback(uuid, text) from public, anon;
grant execute on function public.answer_feedback(uuid, text) to authenticated;
