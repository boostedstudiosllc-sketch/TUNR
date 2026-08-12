-- Photos on meets.
--
-- Right now a meet dies the moment it's over. Letting anyone who was there
-- post pictures afterwards gives it an afterlife: the host gets proof their
-- meet was good, people have a reason to reopen the app on a Sunday, and a
-- host deciding where to post next month can see what turnout actually
-- looked like.
--
-- Access mirrors comments — same gate, same block rules, same rate limiting —
-- because it's the same kind of user-generated content hanging off an event.

create table if not exists public.meet_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  caption text check (caption is null or char_length(caption) <= 140),
  created_at timestamptz not null default now()
);

create index if not exists meet_photos_event_idx
  on public.meet_photos (event_id, created_at desc);

alter table public.meet_photos enable row level security;

-- Definer, and that matters: a plain subquery against events inside a policy
-- runs under the *caller's* row-level security, and a hidden event is exactly
-- what the caller can't see — so `not exists (... where hidden)` comes back
-- true and the photos stay visible. The check has to be able to see the row
-- it's checking.
create or replace function public.event_is_hidden(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select e.hidden from public.events e where e.id = p_event_id), false);
$$;

-- Visible to anyone who can see the meet, minus anyone you've blocked.
-- A pulled-down meet takes its photos with it.
drop policy if exists "meet photos follow the meet" on public.meet_photos;
create policy "meet photos follow the meet"
  on public.meet_photos for select
  to anon, authenticated
  using (
    public.can_access_event(event_id)
    and not public.has_blocked(user_id)
    and not public.event_is_hidden(event_id)
  );

drop policy if exists "signed-in users add photos" on public.meet_photos;
create policy "signed-in users add photos"
  on public.meet_photos for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_event(event_id));

-- The uploader, the meet's host, or an admin can take a photo down.
drop policy if exists "uploader host or admin removes photos" on public.meet_photos;
create policy "uploader host or admin removes photos"
  on public.meet_photos for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_event_host(event_id)
    or public.is_admin()
  );

-- Author's handle alongside, without exposing the profiles join to clients.
-- security_invoker so the select policy above still applies.
drop view if exists public.meet_photos_with_author;
create view public.meet_photos_with_author
with (security_invoker = true) as
select
  mp.id,
  mp.event_id,
  mp.user_id,
  mp.photo_url,
  mp.caption,
  mp.created_at,
  coalesce(p.username, 'someone') as username
from public.meet_photos mp
left join public.profiles p on p.id = mp.user_id;

grant select on public.meet_photos_with_author to anon, authenticated;

-- Same reasoning as the comment limits in 006: the anon key is public, so a
-- cap that only exists in the client is no cap at all.
create or replace function public.enforce_photo_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
  on_this_meet integer;
begin
  select count(*) into recent
  from public.meet_photos
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recent >= 30 then
    raise exception 'rate_limit_photos' using errcode = 'P0001';
  end if;

  select count(*) into on_this_meet
  from public.meet_photos
  where user_id = new.user_id and event_id = new.event_id;

  if on_this_meet >= 12 then
    raise exception 'photo_limit_per_meet' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists meet_photos_rate_limit on public.meet_photos;
create trigger meet_photos_rate_limit
  before insert on public.meet_photos
  for each row execute function public.enforce_photo_rate_limit();

-- ============ STORAGE ============
insert into storage.buckets (id, name, public)
values ('meet-photos', 'meet-photos', true)
on conflict (id) do nothing;

drop policy if exists "meet photos are publicly readable" on storage.objects;
create policy "meet photos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'meet-photos');

drop policy if exists "users upload their own meet photos" on storage.objects;
create policy "users upload their own meet photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete their own meet photos" on storage.objects;
create policy "users delete their own meet photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
