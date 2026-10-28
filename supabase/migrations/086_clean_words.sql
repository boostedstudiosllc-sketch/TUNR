-- Keeping chat clean: swear words and slurs in chats, comments and forum
-- posts are swapped for "***" as they're saved. The app does the same first
-- (src/lib/clean.js, same list) and shows a short warning.

create or replace function public.clean_words(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    p,
    '\y(?:(?:mother)?f+u+c+k+\w*|s+h+i+t+\w*|bullshit\w*|bitch\w*|ass(?:hole)?s?|asshole\w*|dumbass\w*|jackass\w*|dick(?:s|head\w*)?|cunt\w*|puss(?:y|ies)|cock(?:s|sucker\w*)?|bastards?|whores?|sluts?|fag(?:s|got\w*)?|nigg\w*|retard\w*|piss(?:ed|ing)?|twats?|wank\w*|pricks?)\y',
    '***',
    'gi'
  );
$$;

create or replace function public.clean_body()
returns trigger
language plpgsql
as $$
begin
  new.body := public.clean_words(new.body);
  return new;
end;
$$;

create or replace function public.clean_post()
returns trigger
language plpgsql
as $$
begin
  new.title := public.clean_words(new.title);
  new.body := public.clean_words(new.body);
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['linkup_messages', 'club_messages', 'forum_comments', 'comments'] loop
    execute format('drop trigger if exists clean_body on public.%I', t);
    execute format('create trigger clean_body before insert or update of body on public.%I for each row execute function public.clean_body()', t);
  end loop;
end;
$$;

drop trigger if exists clean_post on public.forum_posts;
create trigger clean_post before insert or update of title, body on public.forum_posts
  for each row execute function public.clean_post();
