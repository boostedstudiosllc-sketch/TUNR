-- TUNR Rush: Hard really is hard now. The owner cleared Hard on the first
-- try by 400 m, so the levels were re-tuned against a driver that plans
-- ahead at human reaction times. Hard: a top player clears it about 1 try
-- in 5; Medium is a real challenge for good players.

update public.game_settings
   set levels = levels
     || jsonb_build_object('medium', (levels -> 'medium') || '{"goal": 2750, "traffic": 1.12}'::jsonb)
     || jsonb_build_object('hard', (levels -> 'hard') || '{"goal": 3400, "traffic": 1.25, "clockChance": 0.11}'::jsonb);
