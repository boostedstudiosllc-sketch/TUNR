-- Fixes found by the database policy tests (supabase/tests, run with
-- `npm run test:db`).
--
-- 1. Listing photos: 103 accepted any website as long as the path looked
--    like ours. Now they must be in this Supabase project's event-photos
--    bucket, inside the seller's own folder (how uploadEventPhoto saves
--    them), same as avatar_url_ok does for profile photos.
-- 2. event-photos uploads (003) only checked the bucket, so someone could
--    upload into another person's folder. Now, like avatars and car
--    photos, only into your own <uid>/ folder. (The Instagram import
--    uploads with the service key, which skips this.)
-- 3. Guess the Car practice could hand out today's car with its answer,
--    so someone could look the answer up before guessing for points.
--    Practice now skips today's car.

create or replace function public.listing_photo_ok(p_url text, p_user uuid)
returns boolean
language sql
immutable
as $$
  -- (http://localhost or 127.0.0.1 is allowed for a local `supabase start`.)
  select char_length(p_url) <= 500
     and p_url ~ ('^(https://[a-z0-9]{20}\.supabase\.co|http://(127\.0\.0\.1|localhost):[0-9]+)/storage/v1/object/public/event-photos/'
                  || p_user::text || '/[A-Za-z0-9._-]+$');
$$;

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
  if tg_op = 'UPDATE' then
    new.seller_id := old.seller_id;
  end if;
  foreach u in array new.photos loop
    if not public.listing_photo_ok(u, new.seller_id) then
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

-- Today's car (the one guess_car pays for), so practice can leave it out.
create or replace function public.car_of_the_day()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select key from public.car_pool() order by md5(key || ((now() at time zone 'America/New_York')::date)::text) limit 1;
$$;
revoke execute on function public.car_of_the_day() from public, anon, authenticated;

create or replace function public.car_guess_practice(p_skip text[] default '{}')
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select jsonb_build_object('key', c.key, 'photo_url', c.photo_url, 'answer', c.answer, 'credit', c.credit, 'source_url', c.source_url,
                            'options', public.car_options(c.answer, c.make, c.key || random()::text))
    from public.car_pool() c
   where not (c.key = any (coalesce(p_skip, '{}')))
     and c.key is distinct from public.car_of_the_day()
   order by random()
   limit 1;
$$;
grant execute on function public.car_guess_practice(text[]) to anon, authenticated;

drop policy if exists "signed-in users can upload event photos" on storage.objects;
create policy "signed-in users can upload event photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = auth.uid()::text);
