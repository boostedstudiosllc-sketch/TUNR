-- Spam protection for comments and meet posting.
--
-- Enforced with BEFORE INSERT triggers rather than in the app: the anon key
-- is public, so anything checked only in the client can be bypassed by
-- posting straight to the REST API. These run inside the insert transaction,
-- so the limit holds no matter where the write comes from.
--
-- Errors are raised with machine-readable markers; the app maps them to
-- user-facing copy (see src/lib/errors.js) so wording lives with the rest of
-- the app's copy.

-- ============ COMMENTS ============
create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
  duplicates integer;
begin
  select count(*) into recent
  from public.comments
  where user_id = new.user_id
    and created_at > now() - interval '5 minutes';

  if recent >= 10 then
    raise exception 'rate_limit_comments' using errcode = 'P0001';
  end if;

  -- Same text from the same account inside an hour: copy-paste spam.
  select count(*) into duplicates
  from public.comments
  where user_id = new.user_id
    and body = new.body
    and created_at > now() - interval '1 hour';

  if duplicates >= 1 then
    raise exception 'duplicate_comment' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

-- ============ MEETS ============
create or replace function public.enforce_event_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hourly integer;
  daily integer;
begin
  -- Seeded rows (inserted from the SQL editor) have no creator; skip them.
  if new.created_by is null then
    return new;
  end if;

  select count(*) into hourly
  from public.events
  where created_by = new.created_by
    and created_at > now() - interval '1 hour';

  if hourly >= 5 then
    raise exception 'rate_limit_events_hourly' using errcode = 'P0001';
  end if;

  select count(*) into daily
  from public.events
  where created_by = new.created_by
    and created_at > now() - interval '24 hours';

  if daily >= 20 then
    raise exception 'rate_limit_events_daily' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists events_rate_limit on public.events;
create trigger events_rate_limit
  before insert on public.events
  for each row execute function public.enforce_event_rate_limit();
