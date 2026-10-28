-- Club pages: a cover banner and social links, and a "joined the club"
-- post in the club chat when someone joins, so members can welcome them
-- with one tap.

alter table public.clubs add column if not exists cover_url text check (char_length(cover_url) <= 500);
alter table public.clubs add column if not exists instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.clubs add column if not exists tiktok text check (tiktok ~ '^[A-Za-z0-9._]{2,24}$');
alter table public.clubs add column if not exists website text check (website ~ '^https?://' and char_length(website) <= 200);

create or replace view public.clubs_list
with (security_invoker = true) as
select c.id, c.slug, c.name, c.kind, c.city, c.description, c.logo_url, c.visibility, c.created_by, c.created_at, c.hidden,
       public.club_member_count(c.id) as members,
       public.club_role(c.id) as my_role,
       case when public.club_role(c.id) in ('owner', 'admin')
         then (select count(*)::int from public.club_members m where m.club_id = c.id and m.status = 'requested')
         else 0 end as requests,
       c.cover_url, c.instagram, c.tiktok, c.website
from public.clubs c;

-- Chat posts: 'text' (people) or 'joined' (posted by TUNR when someone joins).
alter table public.club_messages add column if not exists kind text not null default 'text' check (kind in ('text', 'joined'));

-- Only TUNR posts 'joined': anything sent straight from the app is text.
create or replace function public.club_messages_kind_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() = 1 then
    new.kind := 'text';
  end if;
  return new;
end;
$$;

drop trigger if exists club_messages_kind_guard on public.club_messages;
create trigger club_messages_kind_guard before insert on public.club_messages
  for each row execute function public.club_messages_kind_guard();

create or replace function public.club_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'member' and new.role <> 'owner'
     and (tg_op = 'INSERT' or old.status is distinct from 'member') then
    insert into public.club_messages (club_id, user_id, body, kind)
    values (new.club_id, new.user_id, 'joined the club', 'joined');
  end if;
  return new;
end;
$$;

drop trigger if exists club_member_joined on public.club_members;
create trigger club_member_joined after insert or update of status on public.club_members
  for each row execute function public.club_member_joined();

-- A join post doesn't use up the day's chat alert.
create or replace function public.club_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clubs;
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  rec record;
begin
  if new.kind = 'joined' then
    return new;
  end if;
  select * into c from public.clubs where id = new.club_id;
  for rec in select user_id from public.club_members where club_id = c.id and status = 'member' and user_id <> new.user_id loop
    if not public.blocked_either_way(rec.user_id, new.user_id) then
      perform public.notify(rec.user_id, 'club_chat', c.name || ' chat',
        '@' || v_name || ': ' || left(new.body, 120), 'club:' || c.id, 'clubchat:' || c.id || ':' || current_date);
    end if;
  end loop;
  return new;
end;
$$;

create or replace view public.club_messages_with_author
with (security_invoker = true) as
select m.id, m.club_id, m.user_id, m.body, m.created_at,
       coalesce(p.username, 'someone') as username,
       coalesce(p.is_photographer, false) as photographer,
       public.photographer_verified(m.user_id) as photographer_verified,
       public.club_role(m.club_id, m.user_id) as role,
       m.kind
from public.club_messages m
left join public.profiles p on p.id = m.user_id;
