-- Inviting a TUNR friend into an Arcade game room, inside the app: they get
-- an alert ("@sam wants to race you in Drift King") that opens the room.
-- (Sharing the room link outside the app works as before.)
--
--   game_invites: who invited whom to which room, for the rate limit and so
--     the same invite isn't sent twice.
--   invite_to_game(user, game, room) → { status: ok } | not_signed_in |
--     unconfirmed | bad_game | bad_room | self | not_found | blocked |
--     already | rate_limit

create table if not exists public.game_invites (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  game text not null,
  room text not null,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, game, room)
);
create index if not exists game_invites_from_idx on public.game_invites (from_user, created_at desc);
alter table public.game_invites enable row level security;
drop policy if exists "people see invites they sent or got" on public.game_invites;
create policy "people see invites they sent or got" on public.game_invites for select to authenticated
  using (auth.uid() in (from_user, to_user));
-- Written only by invite_to_game().

create or replace function public.invite_to_game(p_to uuid, p_game text, p_room text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_game text;
  v_verb text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select name, verb into v_game, v_verb from (values
    ('drag', 'Drag Race', 'race you in'), ('drift', 'Drift King', 'race you in'), ('karts', 'Boosted Karts', 'race you in'),
    ('ball', 'Turbo Ball', 'play you at'), ('guess', 'Guess the Car', 'quiz you in')) g(id, name, verb)
   where id = p_game;
  if v_game is null then
    return jsonb_build_object('status', 'bad_game');
  end if;
  if p_room !~ '^[A-Z0-9]{4}$' then
    return jsonb_build_object('status', 'bad_room');
  end if;
  if p_to = v_uid then
    return jsonb_build_object('status', 'self');
  end if;
  if not exists (select 1 from public.profiles where id = p_to) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if public.blocked_either_way(v_uid, p_to) then
    return jsonb_build_object('status', 'blocked');
  end if;
  if (select count(*) from public.game_invites where from_user = v_uid and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limit');
  end if;
  insert into public.game_invites (from_user, to_user, game, room) values (v_uid, p_to, p_game, p_room)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;
  select coalesce(nullif(username, ''), 'someone') into v_name from public.profiles where id = v_uid;
  perform public.notify(p_to, 'game_invite', '🎮 @' || v_name || ' wants to ' || v_verb || ' ' || v_game,
    'Tap to join room ' || p_room || '.', 'room:' || p_game || ':' || p_room, 'ginv:' || v_uid || ':' || p_room);
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.invite_to_game(uuid, text, text) from public, anon;
grant execute on function public.invite_to_game(uuid, text, text) to authenticated;
