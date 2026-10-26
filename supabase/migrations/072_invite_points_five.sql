-- The owner settled invite points: 5 for the inviter (the new member's
-- welcome point stays 1). Still changeable under Admin → Purchases → Rates.
alter table public.points_settings alter column referral_points set default 5;
update public.points_settings set referral_points = 5;
