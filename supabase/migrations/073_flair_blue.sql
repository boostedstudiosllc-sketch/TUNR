-- TUNR's color is now Boosted Studios blue. Profile flair gets that blue as
-- a choice; orange stays a choice for anyone who already picked it.

alter table public.profiles drop constraint if exists profiles_profile_color_check;
alter table public.profiles add constraint profiles_profile_color_check check (
  profile_color is null or profile_color in
    ('#0080F0', '#FF4500', '#FACC15', '#10B981', '#38BDF8', '#A855F7', '#EC4899', '#EF4444', '#F0F0F0')
);
