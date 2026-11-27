-- Help assistant (api/_routes/help.js): daily limits, so one person (or a
-- script) can't use up the free AI quota. Only counts are kept, never the
-- questions. Called by the server with the service key.

create table if not exists public.help_usage (
  day date not null,
  who text not null check (char_length(who) <= 80),
  questions integer not null default 0,
  primary key (day, who)
);
alter table public.help_usage enable row level security;
revoke all on public.help_usage from public, anon, authenticated;

-- p_who: 'user:<id>' for a signed-in member, 'visitor:<hash>' otherwise.
-- → { status: ok | rate_limit | busy, left }
-- 40 a day per member, 10 per signed-out visitor, 1,000 a day for everyone.
create or replace function public.use_help_question(p_who text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.atl_today();
  v_limit int := case when p_who like 'user:%' then 40 else 10 end;
  v_mine int;
begin
  if p_who is null or p_who !~ '^(user|visitor):[A-Za-z0-9-]{8,72}$' then
    return jsonb_build_object('status', 'bad_request');
  end if;
  perform pg_advisory_xact_lock(hashtext('help:' || p_who));
  if (select coalesce(sum(questions), 0) from public.help_usage where day = v_day) >= 1000 then
    return jsonb_build_object('status', 'busy');
  end if;
  select questions into v_mine from public.help_usage where day = v_day and who = p_who;
  if coalesce(v_mine, 0) >= v_limit then
    return jsonb_build_object('status', 'rate_limit', 'limit', v_limit);
  end if;
  insert into public.help_usage (day, who, questions) values (v_day, p_who, 1)
  on conflict (day, who) do update set questions = public.help_usage.questions + 1;
  -- Kept a week.
  delete from public.help_usage where day < v_day - 7;
  return jsonb_build_object('status', 'ok', 'left', v_limit - coalesce(v_mine, 0) - 1);
end;
$$;
revoke execute on function public.use_help_question(text) from public, anon, authenticated;

-- Admins: questions asked per day (counts only).
create or replace function public.admin_help_usage()
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
    select jsonb_agg(jsonb_build_object('day', day, 'questions', q, 'people', n) order by day desc)
    from (select day, sum(questions) as q, count(*) as n from public.help_usage group by day) t
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_help_usage() from public, anon;
grant execute on function public.admin_help_usage() to authenticated;
