-- Grants admin to the operator's account.
--
-- Previously left as a manual step to keep an email out of the repository,
-- but that address is already public in src/lib/contact.js — it's printed in
-- the terms and the privacy policy as the contact for reports and data
-- requests. So there's nothing to protect by making this a chore.
--
-- Being admin unlocks two things in the Profile tab: the reports queue and
-- the host verification queue. Both are enforced by row-level security, so
-- this flag is the whole grant.
--
-- No-op if no account with that address exists yet, which is the safe
-- outcome: sign up first, then re-run this file.
--
-- To revoke: update public.profiles set is_admin = false where id = '<uuid>';

update public.profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('boostedstudiosllc@gmail.com');
