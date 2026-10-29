-- Neon underglow and decals for the garage, bought with points like the
-- wing and wheels. Underglow is one unlock for every colour ("glow:neon");
-- each decal is its own unlock. Looks only.

alter table public.vehicles
  add column if not exists game_glow text check (game_glow is null or game_glow in ('none', 'blue', 'pink', 'green', 'red', 'purple', 'white')),
  add column if not exists game_decal text check (game_decal is null or game_decal in ('none', 'stripes', 'side', 'number'));

alter table public.garage_parts drop constraint if exists garage_parts_id_check;
alter table public.garage_parts add constraint garage_parts_id_check check (id ~ '^(spoiler|rims|height|glow|decal):[a-z]{2,20}$');

insert into public.garage_parts (id, name, price, sort) values
  ('glow:neon', 'Neon underglow', 45, 6),
  ('decal:stripes', 'Racing stripes', 25, 7),
  ('decal:side', 'Side stripe', 15, 8),
  ('decal:number', 'Race number', 20, 9)
on conflict (id) do nothing;

-- The guard now covers underglow (any colour needs glow:neon) and decals.
create or replace function public.vehicle_parts_guard()
returns trigger
language plpgsql
as $$
declare
  pair text[];
  v text;
  was text;
  neon constant text := 'neon';
begin
  foreach pair slice 1 in array array[
    ['spoiler', new.game_spoiler, case when tg_op = 'UPDATE' then old.game_spoiler end],
    ['rims', new.game_rims, case when tg_op = 'UPDATE' then old.game_rims end],
    ['height', new.game_height, case when tg_op = 'UPDATE' then old.game_height end],
    ['glow', case when coalesce(new.game_glow, 'none') <> 'none' then neon end,
             case when tg_op = 'UPDATE' and coalesce(old.game_glow, 'none') <> 'none' then neon end],
    ['decal', new.game_decal, case when tg_op = 'UPDATE' then old.game_decal end]
  ] loop
    v := pair[2];
    was := pair[3];
    if v is not null and v is distinct from was and not public.has_garage_part(new.owner_id, pair[1] || ':' || v) then
      raise exception 'locked_part: unlock % in the garage first.',
        coalesce((select name from public.garage_parts where id = pair[1] || ':' || v), v)
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists vehicle_parts_guard on public.vehicles;
create trigger vehicle_parts_guard before insert or update of game_spoiler, game_rims, game_height, game_glow, game_decal on public.vehicles
  for each row execute function public.vehicle_parts_guard();
