-- The starter meets (001, 004, 007, 009, 014, 017, 026, 027) were loaded
-- with made-up "going" and "interested" numbers, which the app adds to real
-- RSVPs. From here on every count is real people only. The going-over-time
-- chart (meet_going_history, 035) starts from these too, so it now starts
-- at zero.
update public.events
   set base_going = 0,
       base_interested = 0
 where base_going <> 0 or base_interested <> 0;
