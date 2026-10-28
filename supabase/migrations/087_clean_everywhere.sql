-- No swearing anywhere people type, not just chat (086 covered the chats):
-- meet titles and descriptions, linkup notes, bios, build notes, captions,
-- club and forum descriptions, reports and messages to TUNR are starred
-- out as they're saved. Names (usernames, club names, forum names) are
-- refused instead, since "***" can't stand in for a name. The app does the
-- same first (src/lib/clean.js) and shows a short warning.

-- Star out the listed columns: clean_columns('title', 'description').
create or replace function public.clean_columns()
returns trigger
language plpgsql
as $$
declare
  col text;
  j jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if jsonb_typeof(j -> col) = 'string' then
      j := jsonb_set(j, array[col], to_jsonb(public.clean_words(j ->> col)));
    end if;
  end loop;
  new := jsonb_populate_record(new, j);
  return new;
end;
$$;

-- Refuse a new or changed name with a swear word in it.
create or replace function public.reject_bad_words()
returns trigger
language plpgsql
as $$
declare
  col text;
  v text;
begin
  foreach col in array tg_argv loop
    v := to_jsonb(new) ->> col;
    if v is not null and public.clean_words(v) <> v
       and (tg_op = 'INSERT' or (to_jsonb(old) ->> col) is distinct from v) then
      raise exception 'Keep it clean: no swear words in %.', replace(col, '_', ' ') using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('events', array['title', 'description', 'showcase_note']),
      ('linkups', array['note']),
      ('clubs', array['description']),
      ('forums', array['description']),
      ('profiles', array['bio', 'display_name']),
      ('vehicles', array['build_notes', 'model']),
      ('meet_photos', array['caption']),
      ('listing_requests', array['details']),
      ('reports', array['note']),
      ('feedback', array['message']),
      ('points_issues', array['message'])
    ) as t(tbl, cols)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    execute format('drop trigger if exists clean_text on public.%I', r.tbl);
    execute format(
      'create trigger clean_text before insert or update on public.%I for each row execute function public.clean_columns(%s)',
      r.tbl,
      (select string_agg(quote_literal(c), ', ') from unnest(r.cols) c)
    );
  end loop;

  for r in
    select * from (values
      ('profiles', array['username']),
      ('clubs', array['name']),
      ('forums', array['name'])
    ) as t(tbl, cols)
  loop
    execute format('drop trigger if exists reject_bad_words on public.%I', r.tbl);
    execute format(
      'create trigger reject_bad_words before insert or update on public.%I for each row execute function public.reject_bad_words(%s)',
      r.tbl,
      (select string_agg(quote_literal(c), ', ') from unnest(r.cols) c)
    );
  end loop;
end;
$$;
