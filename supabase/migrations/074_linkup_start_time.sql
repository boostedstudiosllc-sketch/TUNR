-- Linkups can start any time today or tomorrow (Georgia time), picked on a
-- time wheel, instead of only within the next two hours. Same posting rules
-- otherwise (040_linkups.sql). New error codes: linkup_start_passed,
-- linkup_starts_too_far. The "linkup near you" alert says when: "in 40 min",
-- "in 2 hr 15 min", or "today at 9:30 PM" / "tomorrow at 10:00 AM".

create or replace function public.check_linkup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No uid: the SQL editor or the service role. Nested: this database's own
  -- triggers (the 25-person flag), already trusted.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.linkup_agreements a where a.user_id = auth.uid()) then
      raise exception 'linkup_terms_required';
    end if;
    if new.starts_at < now() - interval '10 minutes' then
      raise exception 'linkup_start_passed';
    end if;
    -- Any time today or tomorrow (Georgia time).
    if (new.starts_at at time zone 'America/New_York')::date > (now() at time zone 'America/New_York')::date + 1 then
      raise exception 'linkup_starts_too_far';
    end if;
    if exists (select 1 from public.linkups l
               where l.user_id = auth.uid() and l.cancelled_at is null and l.ends_at > now()) then
      raise exception 'linkup_already_live';
    end if;
    if (select count(*) from public.linkups l
        where l.user_id = auth.uid() and l.created_at > now() - interval '1 day') >= 6 then
      raise exception 'rate_limit_linkups';
    end if;
    new.created_at := now();
    new.cancelled_at := null;
    new.big_alerted_at := null;
    return new;
  end if;

  -- Updates: the note, the end time (up to four hours after the start) and
  -- cancelling. Nothing else moves once people have planned around it.
  new.id := old.id;
  new.user_id := old.user_id;
  new.kind := old.kind;
  new.visibility := old.visibility;
  new.place := old.place;
  new.area := old.area;
  new.lat := old.lat;
  new.lng := old.lng;
  new.starts_at := old.starts_at;
  new.created_at := old.created_at;
  new.big_alerted_at := old.big_alerted_at;
  if old.cancelled_at is not null then
    new.cancelled_at := old.cancelled_at;
  elsif new.cancelled_at is not null then
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.linkup_posted_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce((select username from public.profiles where id = new.user_id), 'someone');
  v_mins int := greatest(0, round(extract(epoch from (new.starts_at - now())) / 60)::int);
  v_local timestamp := new.starts_at at time zone 'America/New_York';
  v_when text := case
    when v_mins < 5 then 'starting now'
    when v_mins < 60 then 'in ' || v_mins || ' min'
    when v_mins < 180 then 'in ' || (v_mins / 60) || ' hr' || case when v_mins % 60 > 0 then ' ' || (v_mins % 60) || ' min' else '' end
    else case when v_local::date = (now() at time zone 'America/New_York')::date then 'today' else 'tomorrow' end
         || ' at ' || to_char(v_local, 'FMHH12:MI AM')
  end;
  rec record;
begin
  for rec in
    select s.user_id, public.miles_between(s.lat, s.lng, new.lat, new.lng) as miles
    from public.alert_settings s
    where s.linkups and s.lat is not null and s.lng is not null
      and s.user_id <> new.user_id
      and public.miles_between(s.lat, s.lng, new.lat, new.lng) <= s.radius_miles
      and not public.blocked_either_way(s.user_id, new.user_id)
    order by 2
    limit 500
  loop
    perform public.notify(
      rec.user_id,
      'linkup_nearby',
      public.linkup_kind_label(new.kind) || ' linkup near you',
      '@' || v_name || ' · ' ||
        v_when ||
        coalesce(' · ' || new.area, '') || ' · ' || round(rec.miles::numeric, 0) || ' mi' ||
        case when new.visibility = 'private' then ' · private, request to join' else '' end,
      'linkup:' || new.id,
      'linkup:' || new.id
    );
  end loop;
  return new;
end;
$$;

-- Admin insights: "live now" means started and not over.
create or replace function public.linkup_stats()
returns table (posted_7d int, posted_30d int, joins_30d int, biggest_30d int, live_now int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.linkups where created_at > now() - interval '7 days'),
    (select count(*)::int from public.linkups where created_at > now() - interval '30 days'),
    (select count(*)::int from public.linkup_members m join public.linkups l on l.id = m.linkup_id
      where l.created_at > now() - interval '30 days' and m.status = 'in'),
    coalesce((select max(public.linkup_headcount(id)) from public.linkups where created_at > now() - interval '30 days'), 0),
    (select count(*)::int from public.linkups where cancelled_at is null and starts_at <= now() and ends_at > now())
  where public.is_admin();
$$;
