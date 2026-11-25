-- App error log: members see a plain reason ("you don't have access to
-- that"); the technical one ("permission denied for table follows") comes
-- here, for admins (Settings → Admin → App errors). Written only through
-- report_app_error (limits, no reading back); read only by admins.

create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  shown text not null check (char_length(shown) <= 400),
  detail text not null check (char_length(detail) between 1 and 400),
  page text check (char_length(page) <= 200),
  agent text check (char_length(agent) <= 200),
  -- Signed-out reporters: a hash of their address, only for the limit.
  visitor text,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_recent on public.app_errors (created_at desc);
create index if not exists app_errors_by_user on public.app_errors (user_id, created_at desc);
create index if not exists app_errors_by_visitor on public.app_errors (visitor, created_at desc) where visitor is not null;
alter table public.app_errors enable row level security;
revoke all on public.app_errors from public, anon, authenticated;

-- Error text can carry sign-in links, tokens, keys or emails: those are
-- never stored, whatever the app sent.
create or replace function public.app_error_scrub(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    p,
    'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)?', '[token]', 'g'),
    '(bearer\s+)[^\s;,]+', '\1[token]', 'gi'),
    '\m(sk|rk|pk|whsec)_[A-Za-z0-9_]{6,}', '[key]', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
    '(\m(access_token|refresh_token|provider_token|token|apikey|api_key|password|passwd|secret|signature)"?\s*[:=]\s*"?)[^"&#\s,;}]+', '\1[hidden]', 'gi'),
    '([?&#](code|key|sig|token_hash|otp)=)[^&#\s]+', '\1[hidden]', 'gi');
$$;
revoke execute on function public.app_error_scrub(text) from public, anon, authenticated;

-- From the app, when it shows a member a failure. Quietly skips past the
-- limits: 30 an hour per person (signed-out: per address), 300 an hour from
-- signed-out visitors in total, and the same failure from the same person
-- once per 10 minutes.
create or replace function public.report_app_error(p_shown text, p_detail text, p_page text default null, p_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_visitor text := case when auth.uid() is null then md5(coalesce(public.request_ip(), 'unknown') || ':tunr-app-errors') end;
  v_detail text := left(trim(public.app_error_scrub(left(coalesce(p_detail, ''), 2000))), 400);
begin
  if v_detail = '' then
    return;
  end if;
  -- One report at a time per sender, so parallel calls can't all pass the limits.
  perform pg_advisory_xact_lock(hashtext('app_errors:' || coalesce(v_uid::text, v_visitor)));
  if v_uid is not null then
    if (select count(*) from public.app_errors where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
      return;
    end if;
    if exists (select 1 from public.app_errors where user_id = v_uid and detail = v_detail and created_at > now() - interval '10 minutes') then
      return;
    end if;
  else
    if (select count(*) from public.app_errors where visitor = v_visitor and created_at > now() - interval '1 hour') >= 30
       or (select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 hour') >= 300 then
      return;
    end if;
    if exists (select 1 from public.app_errors where user_id is null and detail = v_detail and created_at > now() - interval '10 minutes') then
      return;
    end if;
  end if;
  insert into public.app_errors (user_id, visitor, shown, detail, page, agent)
  values (v_uid, v_visitor,
          left(trim(public.app_error_scrub(left(coalesce(p_shown, ''), 2000))), 400), v_detail,
          nullif(left(trim(public.app_error_scrub(left(coalesce(p_page, ''), 1000))), 200), ''),
          nullif(left(trim(left(coalesce(p_agent, ''), 1000)), 200), ''));
  -- Kept for 30 days.
  delete from public.app_errors where id in (select id from public.app_errors where created_at < now() - interval '30 days' limit 200);
end;
$$;
revoke execute on function public.report_app_error(text, text, text, text) from public;
grant execute on function public.report_app_error(text, text, text, text) to anon, authenticated;

-- Admins: the same failures grouped, newest first.
-- → [{ detail, shown, times, people, first_at, last_at, page, agent, usernames }]
create or replace function public.admin_app_errors(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  return coalesce((
    select jsonb_agg(g order by g->>'last_at' desc)
    from (
      select jsonb_build_object(
        'detail', a.detail,
        'shown', (array_agg(a.shown order by a.created_at desc))[1],
        'times', count(*),
        'people', count(distinct a.user_id),
        'first_at', min(a.created_at),
        'last_at', max(a.created_at),
        'page', (array_agg(a.page order by a.created_at desc))[1],
        'agent', (array_agg(a.agent order by a.created_at desc))[1],
        'usernames', coalesce(jsonb_agg(distinct p.username) filter (where p.username is not null), '[]'::jsonb)
      ) as g
      from public.app_errors a
      left join public.profiles p on p.id = a.user_id
      where a.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
      group by a.detail
      order by max(a.created_at) desc
      limit 200
    ) t
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_app_errors(integer) from public, anon;
grant execute on function public.admin_app_errors(integer) to authenticated;

-- Admins: clear one failure (fixed) or everything.
create or replace function public.admin_clear_app_errors(p_detail text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  delete from public.app_errors where p_detail is null or detail = p_detail;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.admin_clear_app_errors(text) from public, anon;
grant execute on function public.admin_clear_app_errors(text) to authenticated;
