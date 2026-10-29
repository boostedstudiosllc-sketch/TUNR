-- Photo of the week: members vote for their favourite meet photo posted this
-- week (Monday to Sunday, Atlanta time). One vote a week, which you can move,
-- and not on your own photo. Last week's top photo wins, and its owner gets
-- points (photo_points, default 25) and an alert. The winner is settled the
-- first time anyone looks after the week ends, so no scheduled job is needed.

alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check check (reason in (
  'checkin', 'rsvp_bonus', 'stay_bonus', 'streak_bonus', 'referral_bonus', 'welcome_bonus', 'game_bonus',
  'starter_profile', 'starter_car', 'starter_alerts',
  'redeem', 'refund', 'revoke', 'admin_adjust', 'purchase', 'member_bonus', 'spin_bonus', 'host_bonus',
  'photo_bonus'
));

-- One winner a week: occurrence is the week's Monday.
create unique index if not exists point_ledger_photo_once_a_week
  on public.point_ledger (occurrence) where reason = 'photo_bonus';

alter table public.points_settings
  add column if not exists photo_points integer not null default 25 check (photo_points between 0 and 1000);

create table if not exists public.photo_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null,
  photo_id uuid not null references public.meet_photos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, week)
);
create index if not exists photo_votes_photo_idx on public.photo_votes (photo_id);
alter table public.photo_votes enable row level security;
-- Votes are read and written only through the functions below.

-- The winners, one row a week.
create table if not exists public.photo_winners (
  week date primary key,
  photo_id uuid references public.meet_photos (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  photo_url text,
  caption text,
  event_id uuid references public.events (id) on delete set null,
  votes int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.photo_winners enable row level security;
drop policy if exists "anyone sees the winners" on public.photo_winners;
create policy "anyone sees the winners" on public.photo_winners for select to anon, authenticated using (true);

-- Photos in the running for a week: posted that week, on a meet that's
-- public and not taken down.
create or replace function public.photo_week_entries(p_week date)
returns table (id uuid, user_id uuid, photo_url text, caption text, event_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select mp.id, mp.user_id, mp.photo_url, mp.caption, mp.event_id, mp.created_at
    from public.meet_photos mp
    join public.events e on e.id = mp.event_id
   where (mp.created_at at time zone 'America/New_York')::date between p_week and p_week + 6
     and not coalesce(e.hidden, false)
     and coalesce(e.visibility, 'public') = 'public';
$$;
revoke execute on function public.photo_week_entries(date) from public, anon, authenticated;

-- Settles past weeks that have votes but no winner yet: most votes wins,
-- the earlier photo on a tie. Pays the owner and tells them.
create or replace function public.settle_photo_weeks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w date;
  this_week date := (select week from public.spin_week());
  win record;
  v_points int := coalesce((select photo_points from public.points_settings), 25);
begin
  for w in
    select distinct v.week from public.photo_votes v
     where v.week < this_week
       and not exists (select 1 from public.photo_winners pw where pw.week = v.week)
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtext('tunr_photo_week:' || w::text));
    continue when exists (select 1 from public.photo_winners pw where pw.week = w);
    select p.id, p.user_id, p.photo_url, p.caption, p.event_id, count(v.user_id)::int as votes
      into win
      from public.photo_week_entries(w) p
      join public.photo_votes v on v.photo_id = p.id and v.week = w
     group by p.id, p.user_id, p.photo_url, p.caption, p.event_id, p.created_at
     order by count(v.user_id) desc, p.created_at
     limit 1;
    insert into public.photo_winners (week, photo_id, user_id, photo_url, caption, event_id, votes)
    values (w, win.id, win.user_id, win.photo_url, win.caption, win.event_id, coalesce(win.votes, 0));
    if win.user_id is not null and v_points > 0 then
      insert into public.point_ledger (user_id, delta, reason, occurrence, note, event_id)
      values (win.user_id, v_points, 'photo_bonus', w, 'Photo of the week', win.event_id)
      on conflict do nothing;
      perform public.notify(win.user_id, 'photo_week', '📸 Your photo won Photo of the week',
        win.votes || ' vote' || case when win.votes = 1 then '' else 's' end || '. +' || v_points || ' points are waiting in your checklist.',
        null, 'photo_week:' || w);
    end if;
  end loop;
end;
$$;
revoke execute on function public.settle_photo_weeks() from public, anon, authenticated;

-- Last week's winner (settling it first if needed), with names for the card.
create or replace function public.photo_of_the_week()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  perform public.settle_photo_weeks();
  select jsonb_build_object(
      'week', pw.week, 'photo_id', pw.photo_id, 'photo_url', pw.photo_url, 'caption', pw.caption,
      'votes', pw.votes, 'user_id', pw.user_id, 'username', coalesce(p.username, 'someone'),
      'event_id', pw.event_id, 'event_title', e.title)
    into r
    from public.photo_winners pw
    left join public.profiles p on p.id = pw.user_id
    left join public.events e on e.id = pw.event_id
   where pw.photo_url is not null
   order by pw.week desc
   limit 1;
  return r;
end;
$$;
grant execute on function public.photo_of_the_week() to anon, authenticated;

-- This week's photos with their votes, most votes first, and which one
-- you voted for. { week, ends_at, my_vote, photos: [...] }
create or replace function public.photo_week_ballot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.spin_week()),
  p as (
    select x.*, coalesce(pr.username, 'someone') as username, e.title as event_title,
           (select count(*) from public.photo_votes v where v.photo_id = x.id and v.week = s.week)::int as votes
      from s, public.photo_week_entries(s.week) x
      left join public.profiles pr on pr.id = x.user_id
      left join public.events e on e.id = x.event_id
     where auth.uid() is null or not public.has_blocked(x.user_id)
  )
  select jsonb_build_object(
    'week', s.week,
    'ends_at', s.next_at,
    'my_vote', (select v.photo_id from public.photo_votes v where v.user_id = auth.uid() and v.week = s.week),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'photo_url', p.photo_url, 'caption', p.caption, 'user_id', p.user_id,
        'username', p.username, 'event_id', p.event_id, 'event_title', p.event_title,
        'votes', p.votes, 'mine', p.user_id = auth.uid())
        order by p.votes desc, p.created_at desc)
      from (select * from p order by votes desc, created_at desc limit 60) p), '[]'::jsonb))
  from s;
$$;
grant execute on function public.photo_week_ballot() to anon, authenticated;

-- Vote (or move your vote). { status: ok | not_signed_in | unconfirmed |
-- not_this_week | own_photo }
create or replace function public.vote_photo(p_photo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := (select week from public.spin_week());
  v_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if not public.email_confirmed(v_uid) then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  select user_id into v_owner from public.photo_week_entries(v_week) where id = p_photo;
  if not found then
    return jsonb_build_object('status', 'not_this_week');
  end if;
  if v_owner = v_uid then
    return jsonb_build_object('status', 'own_photo');
  end if;
  insert into public.photo_votes (user_id, week, photo_id)
  values (v_uid, v_week, p_photo)
  on conflict (user_id, week) do update set photo_id = excluded.photo_id, created_at = now();
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.vote_photo(uuid) from public, anon;
grant execute on function public.vote_photo(uuid) to authenticated;
