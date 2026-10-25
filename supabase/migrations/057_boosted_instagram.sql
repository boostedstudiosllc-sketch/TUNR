-- Instagram handles for the Boosted businesses page. A business can have
-- more than one account (Boosted Photography has two), so the column holds
-- up to three handles.

alter table public.boosted_businesses drop constraint if exists boosted_businesses_instagram_check;

alter table public.boosted_businesses
  alter column instagram type text[]
  using case when instagram is null or instagram = '' then null else array[instagram] end;

create or replace function public.instagram_handles_ok(p text[])
returns boolean
language sql
immutable
as $$
  select p is null or (
    cardinality(p) between 1 and 3
    and not exists (select 1 from unnest(p) h where h !~ '^[A-Za-z0-9._]{1,30}$')
  );
$$;

alter table public.boosted_businesses
  add constraint boosted_businesses_instagram_check check (public.instagram_handles_ok(instagram));

update public.boosted_businesses set instagram = array['tunr.app'] where slug = 'tunr' and instagram is null;
update public.boosted_businesses set instagram = array['boostedstudios.png', 'BoostedStudios.portfolio']
 where slug = 'boosted-photography' and instagram is null;
