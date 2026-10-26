-- TUNR Rush is about 15% faster on every level (and lane changes are
-- quicker, in rushEngine.js). Goals are re-tuned with simulated players so
-- each level is as hard as before. The allowed speed ranges go up to fit.

create or replace function public.game_level_ok(l jsonb)
returns boolean
language sql
immutable
as $$
  select l is not null and jsonb_typeof(l) = 'object'
     and (l ->> 'goal')::numeric between 300 and 20000
     and (l ->> 'points')::numeric between 0 and 10
     and (l ->> 'startTime')::numeric between 10 and 180
     and (l ->> 'clockSeconds')::numeric between 0 and 10
     and (l ->> 'crashSeconds')::numeric between 0 and 15
     and (l ->> 'boostSeconds')::numeric between 0 and 10
     and (l ->> 'boostChance')::numeric between 0 and 0.3
     and (l ->> 'clockChance')::numeric between 0 and 0.5
     and (l ->> 'traffic')::numeric between 0.5 and 2.5
     and (l ->> 'startSpeed')::numeric between 10 and 120
     and (l ->> 'ramp')::numeric between 10 and 200
     and (l ->> 'topSpeed')::numeric between 30 and 130
     and (l ->> 'boostSpeed')::numeric between 30 and 160;
$$;

update public.game_settings
   set levels = levels
     || jsonb_build_object('easy', (levels -> 'easy') || '{"startSpeed": 40, "topSpeed": 86, "boostSpeed": 120, "goal": 1600}'::jsonb)
     || jsonb_build_object('medium', (levels -> 'medium') || '{"startSpeed": 46, "topSpeed": 98, "boostSpeed": 132, "goal": 2000}'::jsonb)
     || jsonb_build_object('hard', (levels -> 'hard') || '{"startSpeed": 52, "topSpeed": 110, "boostSpeed": 144, "goal": 2700}'::jsonb);
