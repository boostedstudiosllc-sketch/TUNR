-- Parts for sale, like Facebook Marketplace: members list parts off their
-- cars, others message the seller in a private chat. No money moves through
-- TUNR; the two of them sort out the deal and the hand-off themselves.
--
--   listings:          the parts (photos, price or "make an offer", fits…)
--   listing_threads:   one chat per buyer per listing
--   listing_messages:  the chat
--   start_listing_chat(listing) opens (or reopens) your chat with the seller.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1500),
  category text not null check (category in ('wheels', 'exhaust', 'intake', 'suspension', 'aero', 'interior', 'lighting', 'engine', 'electronics', 'other')),
  condition text not null check (condition in ('new', 'like_new', 'used', 'for_parts')),
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000), -- null: make an offer; 0: free
  fits text check (fits is null or char_length(fits) <= 120),
  city text check (city is null or char_length(city) <= 60),
  photos text[] not null check (cardinality(photos) between 1 and 6),
  status text not null default 'active' check (status in ('active', 'pending', 'sold', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_feed_idx on public.listings (status, created_at desc);
create index if not exists listings_seller_idx on public.listings (seller_id, created_at desc);
alter table public.listings enable row level security;

-- Anyone signed in sees live listings (not from someone they've blocked);
-- sellers see all their own; admins see everything.
drop policy if exists "people see listings" on public.listings;
create policy "people see listings" on public.listings for select to authenticated
  using ((status in ('active', 'pending', 'sold') and not public.has_blocked(seller_id)) or seller_id = auth.uid() or public.is_admin());
drop policy if exists "people list parts" on public.listings;
create policy "people list parts" on public.listings for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists "sellers change their listings" on public.listings;
create policy "sellers change their listings" on public.listings for update to authenticated
  using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());
drop policy if exists "sellers delete their listings" on public.listings;
create policy "sellers delete their listings" on public.listings for delete to authenticated using (seller_id = auth.uid() or public.is_admin());

-- Listing rules: a confirmed email, photos from TUNR's own storage, ten new
-- listings a day and 40 live at once. A removed listing stays removed
-- unless an admin brings it back.
create or replace function public.check_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u text;
begin
  if auth.uid() is null then
    return new;
  end if;
  foreach u in array new.photos loop
    if u !~ '^https?://[^/]+/storage/v1/object/public/event-photos/' then
      raise exception 'listing_photo_not_ours';
    end if;
  end loop;
  if tg_op = 'INSERT' then
    if not public.email_confirmed(auth.uid()) then
      raise exception 'email_unconfirmed';
    end if;
    if (select count(*) from public.listings where seller_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
      raise exception 'rate_limit_listings';
    end if;
    if (select count(*) from public.listings where seller_id = auth.uid() and status in ('active', 'pending')) >= 40 then
      raise exception 'too_many_listings';
    end if;
    new.status := 'active';
    new.created_at := now();
  else
    new.seller_id := old.seller_id;
    new.created_at := old.created_at;
    if old.status = 'removed' and not public.is_admin() then
      new.status := 'removed';
    end if;
    if new.status = 'removed' and old.status <> 'removed' and not public.is_admin() then
      raise exception 'admins_remove_listings';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists check_listing on public.listings;
create trigger check_listing before insert or update on public.listings for each row execute function public.check_listing();

-- ---------- chats ----------

create table if not exists public.listing_threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  buyer_read_at timestamptz not null default now(),
  seller_read_at timestamptz not null default 'epoch',
  unique (listing_id, buyer_id)
);
create index if not exists listing_threads_buyer_idx on public.listing_threads (buyer_id, last_at desc);
create index if not exists listing_threads_seller_idx on public.listing_threads (seller_id, last_at desc);
alter table public.listing_threads enable row level security;
drop policy if exists "the two people see their chat" on public.listing_threads;
create policy "the two people see their chat" on public.listing_threads for select to authenticated
  using (auth.uid() in (buyer_id, seller_id) or public.is_admin());
-- Chats are opened with start_listing_chat(); no direct inserts or updates.

create table if not exists public.listing_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.listing_threads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists listing_messages_thread_idx on public.listing_messages (thread_id, created_at);
alter table public.listing_messages enable row level security;

create or replace function public.in_listing_thread(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listing_threads t where t.id = p_thread and auth.uid() in (t.buyer_id, t.seller_id));
$$;
grant execute on function public.in_listing_thread(uuid) to authenticated;

drop policy if exists "the two people read their messages" on public.listing_messages;
create policy "the two people read their messages" on public.listing_messages for select to authenticated
  using (public.in_listing_thread(thread_id) or public.is_admin());
drop policy if exists "the two people send messages" on public.listing_messages;
create policy "the two people send messages" on public.listing_messages for insert to authenticated
  with check (user_id = auth.uid() and public.in_listing_thread(thread_id));

-- Sending: not to someone who's blocked you (or you them), 30 a minute at
-- most. Then the chat moves to the top, and the other person gets an alert
-- (one per chat every five minutes).
create or replace function public.check_listing_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.listing_threads;
  other uuid;
begin
  select * into t from public.listing_threads where id = new.thread_id;
  other := case when new.user_id = t.buyer_id then t.seller_id else t.buyer_id end;
  if public.blocked_either_way(new.user_id, other) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.listing_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limit_messages';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists check_listing_message on public.listing_messages;
create trigger check_listing_message before insert on public.listing_messages for each row execute function public.check_listing_message();

create or replace function public.after_listing_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.listing_threads;
  other uuid;
  v_name text;
  v_title text;
begin
  select * into t from public.listing_threads where id = new.thread_id;
  other := case when new.user_id = t.buyer_id then t.seller_id else t.buyer_id end;
  update public.listing_threads
     set last_at = new.created_at,
         buyer_read_at = case when new.user_id = buyer_id then new.created_at else buyer_read_at end,
         seller_read_at = case when new.user_id = seller_id then new.created_at else seller_read_at end
   where id = t.id;
  select coalesce(nullif(username, ''), 'someone') into v_name from public.profiles where id = new.user_id;
  select title into v_title from public.listings where id = t.listing_id;
  perform public.notify(other, 'listing_message', '💬 @' || v_name || ' · ' || left(coalesce(v_title, 'your listing'), 60),
    left(new.body, 140), 'listing-chat:' || t.id, 'lmsg:' || t.id || ':' || floor(extract(epoch from now()) / 300)::bigint);
  return null;
end;
$$;
drop trigger if exists after_listing_message on public.listing_messages;
create trigger after_listing_message after insert on public.listing_messages for each row execute function public.after_listing_message();

-- Swear words starred out, as everywhere else people type.
do $$
begin
  if to_regprocedure('public.clean_columns()') is not null then
    drop trigger if exists clean_text on public.listings;
    create trigger clean_text before insert or update of title, description, fits, city on public.listings
      for each row execute function public.clean_columns('title', 'description', 'fits', 'city');
    drop trigger if exists clean_text on public.listing_messages;
    create trigger clean_text before insert or update of body on public.listing_messages
      for each row execute function public.clean_columns('body');
  end if;
end;
$$;

-- Open (or reopen) your chat with a listing's seller. Returns { status:
-- ok, thread } | not_signed_in | unconfirmed | not_found | own_listing |
-- blocked | sold
create or replace function public.start_listing_chat(p_listing uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l public.listings;
  v_thread uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select * into l from public.listings where id = p_listing and status <> 'removed';
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if l.seller_id = v_uid then
    return jsonb_build_object('status', 'own_listing');
  end if;
  if public.blocked_either_way(v_uid, l.seller_id) then
    return jsonb_build_object('status', 'blocked');
  end if;
  select id into v_thread from public.listing_threads where listing_id = p_listing and buyer_id = v_uid;
  if v_thread is null then
    if l.status = 'sold' then
      return jsonb_build_object('status', 'sold');
    end if;
    insert into public.listing_threads (listing_id, buyer_id, seller_id) values (p_listing, v_uid, l.seller_id)
    returning id into v_thread;
  end if;
  return jsonb_build_object('status', 'ok', 'thread', v_thread);
end;
$$;
revoke execute on function public.start_listing_chat(uuid) from public, anon;
grant execute on function public.start_listing_chat(uuid) to authenticated;

-- Read up to now.
create or replace function public.read_listing_chat(p_thread uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listing_threads
     set buyer_read_at = case when buyer_id = auth.uid() then now() else buyer_read_at end,
         seller_read_at = case when seller_id = auth.uid() then now() else seller_read_at end
   where id = p_thread and auth.uid() in (buyer_id, seller_id);
$$;
revoke execute on function public.read_listing_chat(uuid) from public, anon;
grant execute on function public.read_listing_chat(uuid) to authenticated;

-- Your chats, newest first: the part, the other person, the last message,
-- and whether there's something new.
create or replace function public.my_listing_chats()
returns table (id uuid, listing_id uuid, title text, photo text, price_cents int, status text, selling boolean,
               other_id uuid, other_name text, other_avatar text, last_body text, last_at timestamptz, unread boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, l.id, l.title, l.photos[1], l.price_cents, l.status, t.seller_id = auth.uid(),
         o.id, coalesce(o.username, 'someone'), o.avatar_url,
         (select m.body from public.listing_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
         t.last_at,
         t.last_at > (case when t.seller_id = auth.uid() then t.seller_read_at else t.buyer_read_at end)
           and exists (select 1 from public.listing_messages m where m.thread_id = t.id and m.user_id <> auth.uid())
    from public.listing_threads t
    join public.listings l on l.id = t.listing_id
    join public.profiles o on o.id = case when t.seller_id = auth.uid() then t.buyer_id else t.seller_id end
   where auth.uid() in (t.buyer_id, t.seller_id)
     and exists (select 1 from public.listing_messages m where m.thread_id = t.id)
   order by t.last_at desc
   limit 100;
$$;
revoke execute on function public.my_listing_chats() from public, anon;
grant execute on function public.my_listing_chats() to authenticated;

-- The feed, with each seller's name, photo and how many they've sold.
create or replace view public.listings_feed
with (security_invoker = true) as
select l.*, coalesce(p.username, 'someone') as seller_name, p.avatar_url as seller_avatar, p.created_at as seller_joined,
       (select count(*) from public.listings s where s.seller_id = l.seller_id and s.status = 'sold')::int as seller_sold
  from public.listings l
  left join public.profiles p on p.id = l.seller_id;
grant select on public.listings_feed to authenticated;

-- Reports and the admin log know about listings.
alter table public.community_reports drop constraint if exists community_reports_target_type_check;
alter table public.community_reports add constraint community_reports_target_type_check
  check (target_type in ('forum', 'post', 'comment', 'club', 'profile', 'listing'));

create or replace function public.resolve_community_report(p_type text, p_target text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins_only';
  end if;
  if p_action = 'remove' then
    if p_type = 'post' then update public.forum_posts set removed = true where id::text = p_target;
    elsif p_type = 'comment' then update public.forum_comments set removed = true where id::text = p_target;
    elsif p_type = 'forum' then update public.forums set hidden = true where id::text = p_target;
    elsif p_type = 'club' then update public.clubs set hidden = true where id::text = p_target;
    elsif p_type = 'profile' then update public.profiles set avatar_url = null, bio = null where id::text = p_target;
    elsif p_type = 'listing' then update public.listings set status = 'removed' where id::text = p_target;
    end if;
  end if;
  update public.community_reports set resolved_at = now()
  where target_type = p_type and target_id = p_target and resolved_at is null;
end;
$$;
revoke execute on function public.resolve_community_report(text, text, text) from public, anon;
grant execute on function public.resolve_community_report(text, text, text) to authenticated;

do $$
begin
  if to_regprocedure('public.log_admin_change()') is not null then
    drop trigger if exists log_admin_change on public.listings;
    create trigger log_admin_change after insert or update or delete on public.listings
      for each row execute function public.log_admin_change();
  end if;
end;
$$;

-- Live chat: new messages arrive without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.listing_messages;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
