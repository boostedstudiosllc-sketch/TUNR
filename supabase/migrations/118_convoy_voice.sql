-- Voice chat in a convoy: everyone in it can talk, like a group call.
--
-- The audio goes phone to phone (WebRTC, encrypted end to end); the
-- database only lets phones find each other. They do that on a private
-- Supabase Realtime channel named "convoy-voice:<convoy id>", which only
-- members of that running convoy may join (Realtime Authorization: RLS on
-- realtime.messages). Nothing is recorded or stored.
--
--   convoy_voice_topic_ok(topic) → may the signed-in member use this channel?

create or replace function public.convoy_voice_topic_ok(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_topic is null or p_topic !~ '^convoy-voice:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.in_live_convoy(substring(p_topic from 14)::uuid);
end;
$$;
revoke execute on function public.convoy_voice_topic_ok(text) from public, anon;
grant execute on function public.convoy_voice_topic_ok(text) to authenticated;

-- Supabase's Realtime schema (absent in the local test database).
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    drop policy if exists "convoy members hear the voice channel" on realtime.messages;
    create policy "convoy members hear the voice channel" on realtime.messages for select to authenticated
      using (public.convoy_voice_topic_ok(realtime.topic()));
    drop policy if exists "convoy members talk on the voice channel" on realtime.messages;
    create policy "convoy members talk on the voice channel" on realtime.messages for insert to authenticated
      with check (public.convoy_voice_topic_ok(realtime.topic()));
  end if;
end;
$$;
