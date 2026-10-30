# TUNR: Developer Handoff

Owner: **Boosted Studios Production LLC**. Contact address published in the app: `boostedstudiosllc@gmail.com` (see `src/lib/contact.js`).
Written October 2026 from the code on branch `claude/tunr-car-meet-app-f9dqlh`. Where this document and the code disagree, the code is right.

---

## For the owner: the short version

1. TUNR is a finished, working **web app**: car meets, a map, RSVPs, chat, linkups, forums, clubs, alerts, points and rewards, invite-to-unlock, and admin tools. It runs on Vercel (the website) and Supabase (the database and logins).
2. A developer can turn it into real **iPhone and Android apps** by wrapping this same code with a tool called **Capacitor**. About 95% of the work you've already paid for carries over. A full rewrite isn't needed.
3. Expect roughly **3 to 6 weeks** for one experienced developer to get both apps into the stores (an estimate, see section 8), plus Apple and Google review time.
4. **You** should open and own the store accounts: Apple Developer (99 USD a year, needs a free D-U-N-S number for the LLC) and Google Play (25 USD once). You'll also need a Mac for iPhone builds, either yours or the developer's.
5. Give the developer access to GitHub, Vercel and Supabase as a *member* of your accounts, never your passwords. Keep every account in the LLC's name.
6. **Owner's must-have for the app version:** members can record their own car as their alert sound. Today it plays only while the web app is open (phones don't allow custom sounds for web apps). The app version must make it play for alerts when the app is closed too. See section 8, checklist H.

---

## Contents

1. [What TUNR is](#1-what-tunr-is)
2. [Architecture](#2-architecture)
3. [Environment variables](#3-environment-variables)
4. [External services and dashboard settings](#4-external-services-and-dashboard-settings)
5. [Database and migrations](#5-database-and-migrations)
6. [Run, test, build, deploy](#6-run-test-build-deploy)
7. [Conventions](#7-conventions)
8. [Turning TUNR into an iOS/Android app](#8-turning-tunr-into-an-iosandroid-app)
9. [Known gaps and backlog](#9-known-gaps-and-backlog)

---

## 1. What TUNR is

TUNR is a mobile-first web app for finding and attending car meets, launched in the Atlanta / Georgia scene (the map pins and geocoding work anywhere in the US). Anyone can browse meets without an account. A free account lets people RSVP (and say whether they're bringing a car, shooting photos, or both), add their cars to a garage, chat on meets, post meets (a flyer can fill in the form using AI), start spontaneous "linkups", and take part in forums and clubs. Hosts can verify their identity, add co-hosts and run private meets. Admins get moderation queues and growth insights. Users must be 18+ (Terms of Service, `src/components/TermsOfService.jsx`).

### Feature inventory

| Area | What it does | Main code | Main DB objects |
|---|---|---|---|
| **Discover** | List of upcoming meets. Filters by vibe (JDM/Euro/Exotic/Domestic/Truck), Today, This Weekend, Following. Search, sort (soonest / most going / nearest), distance from you, "Happening today" strip, month **calendar** view. Weekly and monthly recurrence, with an optional end date. | `src/App.jsx`, `MeetCard.jsx`, `CalendarView.jsx`, `TodayStrip.jsx`, `src/lib/dates.js`, `src/lib/geo.js` | `events`, `events_public` (view), `event_rsvp_counts` |
| **Map** | Mapbox GL map of meets, filtered by time (on now / next 2 hours / tonight / custom range), plus an optional layer of forum photo-spot pins. | `MapView.jsx`, `TimeFilter.jsx` | `events_public`, `forum_posts` (spot pins) |
| **Meet page** | Details, flyer, static map, directions (Google Maps), share link `/m/<slug>` with link-preview tags, a "going over time" ticker chart, the attendee car list (make and model only), meet photos afterwards, and flagging/reporting. | `MeetDetail.jsx`, `GoingTicker.jsx`, `Attendees.jsx`, `MeetPhotos.jsx`, `IssueFlag.jsx`, `ReportMeet.jsx`, `api/m/[slug].js` | `meet_going_history()`, `event_attendees` (view), `meet_photos`, `reports` |
| **RSVPs and "going as"** | Going / Maybe / Not going, plus going as car, photographer or both. Counts of cars and photographers per meet. | `App.jsx` (`handleRsvp`, `handleGoingAs`), `src/lib/store.js` | `rsvps` (`status`, `going_as`, `vehicle_id`), `rsvp_log` |
| **Post a meet** | Two-step form. A location is checked against **Mapbox geocoding** (found / area only / not found) and gives the pin real coordinates. Optional **flyer reader**: upload a flyer and Google **Gemini** fills in the form. Duplicate flyers are caught by an image fingerprint. | `SubmitMeet.jsx`, `EditMeet.jsx`, `src/lib/geocode.js`, `src/lib/flyer.js`, `src/lib/phash.js`, `api/read-flyer.js`, `api/_lib/gemini.js`, `api/_lib/flyer.js` | `events`, `flyer_reads` (rate limit), `find_flyer_matches()` |
| **Meet chat** | A live chat on each meet (Supabase Realtime, with polling as a fallback) and thumbs up/down on messages. | `Comments.jsx` | `comments`, `comment_reactions`, `comments_with_author` |
| **People** | Person profiles, following people and hosts, removing followers, **block** (hides content both ways and ends follows) and **restrict** (on meets you host, their messages are seen only by them and the hosts). | `PersonProfile.jsx`, `Connections.jsx`, `HostProfile.jsx` | `user_follows`, `follows` (hosts), `blocks`, `restrictions`, `get_person()`, `my_connections()` |
| **Profile** | Instagram-style: profile photo (own `avatars/<uid>/` folder) and bio (044), Going / Followers / Following stats, badges, clubs, and tabs for Garage (cars with photos, plus a **3D garage**: `Showroom.jsx` / `src/lib/showroom3d.js`, styled like a racing game's garage: your car fills the screen on a turntable in a bright studio (a studio light environment for paint reflections, a mirrored glossy floor via `Reflector`, off on low-power phones), name and stats over it, and one dark glass panel (bottom on phones, right on wide screens; `setInsets` keeps the car centred in the uncovered part) with the **Tuner** (Paint swatches / Body / Wing / Wheels / Stance, ◀ ▶), DRIVE, MORE GAMES and the car cards, saved to `vehicles.game_*` (080 adds `game_rims`, `game_height`) and used on your car in TUNR Rush; DRIVE opens Rush in that car via the `play:rush:<car id>` link; other people's profiles open the same garage read-only), Meets (going / saved / posted), forum Posts and Clubs. **Edit profile** is a sheet. A ⚙️ **Settings screen** (grouped rows that each open a page) holds: edit profile, email confirmation (red ⚠️ flag and a red dot on the gear while unconfirmed), change password, host verification, alerts, restricted/blocked accounts, co-host invites, the admin tools, Terms/Privacy/support, sign out and delete account. Profiles can be reported (`community_reports` type `profile`); an admin "remove" clears the photo and bio. A password-reset link opens a set-new-password sheet (`PASSWORD_RECOVERY`). | `ProfileTab.jsx`, `EditProfile.jsx`, `SettingsScreen.jsx`, `SetPassword.jsx`, `Garage.jsx`, `Showroom.jsx`, `src/lib/showroom3d.js`, `AccountSettings.jsx`, `Badge.jsx` | `profiles`, `vehicles`, `car_makes`, `get_person()` |
| **TUNR Rush scenery** | Where the road runs: Desert (free), City, Forest, Beach, Mountains, Swamp, Arctic, Volcano and Space, each unlocked once with reward points (prices set by admins in Settings → Admin → TUNR Rush). Looks only: the course, traffic and scoring are the same everywhere. 3D: ground, sky, fog, horizon and roadside props per place (`PLACES` in `rush3d.js`); Classic 2D: colors and roadside emoji (`SCENERY` in `rushEngine.js`). The pick is remembered on the phone. | `TunrRush.jsx`, `RushAdmin.jsx`, `src/lib/rush.js`, `src/lib/rush3d.js`, `src/lib/rushEngine.js` | `rush_scenery`, `rush_scenery_owned`, `unlock_rush_scenery()` |
| **Arcade** | Every TUNR game in one place, opened from the Perks tab. TUNR Rush is the one game that pays points each day; the rest are free play. **Park Up**: a top-down parking game with an on-screen steering wheel, brake (and reverse) and gas; 8 levels, stars by time, kept on the phone. `scripts/park-solve.mjs` (also run by `test/park.test.js`) proves every level can be parked. **Drift King**: arcade racing in 3D on 22 real circuit layouts, in one of four car types (`CARS`: Formula, GT, Tuner, Muscle; rivals drive the same type; each has its own top speed, grip and drift feel), with two Boosted Studios coins a lap on the longest straights (`coinSpots`, `COIN`: player only, a short boost, back next lap) (made-up names; outlines from bacinger/f1-circuits, MIT, built by `scripts/build-f1-tracks.mjs` into `src/lib/f1Tracks.js`). Gas, brake, steer left/right; steering on the gas drifts. Three rivals on Easy / Medium / Hard (`DIFFICULTY` scales their pace), 1–3 laps, a guide line on the track (green / yellow / red for your speed, can be turned off in pause), overhead / chase / cockpit cameras chosen in pause (chase by default), mini-map; fastest lap and best finish per track kept on the phone. `test/f1.test.js` drives full races on several circuits. **Boosted Karts**: kart racing on 4 TUNR-designed tracks (`src/lib/kartTracks.js`, smoothed control points) against 5 computer karts, sharing Drift King's track code and 3D track drawing. The kart drives itself; steer, brake, hold DRIFT through bends to charge a mini-turbo (blue, then orange sparks; each level banks a Boosted token), spend 3 tokens on NITRO. Fixed boost pads per track (`padSpots`), obstacles scattered at random each race (`placeObstacles`: barrels and crates spin you out, oil spins you, cones slow you). Rivals dodge obstacles, use pads and rubber-band a little to keep it close. `test/kart.test.js` covers drifting, tokens, nitro, pads, obstacles and full races. Races are played sideways: held upright, the race is drawn rotated 90° so you just turn the phone (`KartRace`; Android is also asked to lock landscape via `Sideways.jsx`). Karts have Drift King's guide line (`drawGuide`, shared; on by default, setting in the menu). Gas setting: Karts default to a held GAS pedal, Turbo Ball to Automatic (`input.gas`). **Every game's menu** shows a "Your ride" card (`RideCard` / `GarageRow` in `Showroom.jsx`); GARAGE opens the full-screen 3D garage in picker mode (`GarageShowroom` with `action` + `first` = the game's own car): spin, tune and SELECT. **Turbo Ball**: car soccer, 1 v 1 or 2 v 2 against the computer (`src/lib/soccerEngine.js`: walled arena with rounded corners and goal boxes, a bouncing ball, cars that drive, boost, jump and flip; 6 big and 16 small boost pads; kickoff countdown, goals, a match clock and golden-goal overtime). The computer drives with the same controls as the player (`aiInput`: chase and line up behind the ball, go round when past it, support or defend the goal; `AI_LEVELS` set how well). Taps quicker than a frame still count (`jumpTap`). Drawn by `src/lib/soccerRender3d.js` (ball cam or car cam). Record (wins, losses, goals) in localStorage. `test/soccer.test.js` covers the physics, goals, overtime and full computer-vs-computer matches.  **Egg Haul**: side-view hill driving with an egg on the roof (`src/lib/eggEngine.js`: one rigid car on two sprung wheels, seeded value-noise hills that get rougher with distance, the egg a small ball in a dip on the roof; hard bumps crack it, 3 cracks or rolling off ends the run). Gas / brake (reverse), in the air gas tips the nose up and brake down. One fixed course (`COURSE`), best distance in localStorage, drawn in 2D by `src/lib/eggDraw.js` in your garage car's paint. `test/egg.test.js`. | `Arcade.jsx`, `ParkUp.jsx`, `DriftKing.jsx`, `KartGame.jsx`, `CarSoccer.jsx`, `EggHaul.jsx`, `src/lib/eggEngine.js`, `src/lib/eggDraw.js`, `src/lib/soccerEngine.js`, `src/lib/soccerRender3d.js`, `src/lib/kartEngine.js`, `src/lib/kartRender3d.js`, `src/lib/kartTracks.js`, `src/lib/parkEngine.js`, `src/lib/parkDraw.js`, `src/lib/f1Engine.js`, `src/lib/f1Render3d.js`, `src/lib/f1Tracks.js` | none (progress and bests are in localStorage) |
| **Instagram import** | New meet flyers posted on @tunr.app, and on other accounts admins add to the watch list with the account's OK (`instagram_sources`, e.g. @nawfside.tm, read through Business Discovery), are listed automatically: every 2 hours (GitHub Actions, `.github/workflows/instagram.yml`) plus daily (Vercel cron), `api/instagram-sync.js` reads the account's new posts through Instagram's official API (Instagram API with Instagram login), reads each flyer with Gemini, geocodes it, skips duplicates and lists it. Flyers missing a date, time or place are held for admins (Settings → Admin → Instagram import). Needs `INSTAGRAM_ACCESS_TOKEN` in Vercel once; the token is then renewed weekly in `instagram_link`. | `api/_lib/instagram.js`, `InstagramImportAdmin.jsx`, `src/lib/instagramName.js` | `instagram_link`, `instagram_posts`, `instagram_sources`, `instagram_duplicate()`, `notify_admins()` |
| **Mailed stickers** | Members order a printed copy of their car's QR sticker; the price shows on the button and the order form. Pay by card (an admin-set payment link, e.g. Stripe) or points. Admin: Settings → Admin → Sticker orders. | `StickerOrder.jsx`, `StickerOrdersAdmin.jsx`, `stickerOrders.js`, `075_sticker_orders.sql` |
| **Linkups** | Quick meetups that start any time today or tomorrow (picked on a time wheel, `TimeWheel.jsx`) and last up to 4: photos, cruise or hang. Public or private (on a private one, the spot shows only after the poster accepts you). One live linkup per person, 6 a day. Everyone agrees to the linkup rules once. Linkup chat. Alerts for linkups near you. At 25 people the host is reminded of the rules and admins are told. | `LinkupTab.jsx`, `LinkupForm.jsx`, `LinkupDetail.jsx`, `LinkupTerms.jsx`, `src/lib/linkups.js`, `src/lib/linkupRules.js` | `linkups`, `linkup_members`, `linkup_messages`, `linkup_agreements`, `linkups_feed` |
| **Forums** | Reddit-style forums anyone with a confirmed email can start (3 a week). Tagged posts, votes, threaded comments, "mark as solved", and photo-spot posts with a map pin. The forum's creator moderates it. | `ForumsTab.jsx`, `ForumView.jsx`, `PostView.jsx`, `PostForm.jsx`, `src/lib/community.js` | `forums`, `forum_posts`, `forum_comments`, votes, `forum_follows` |
| **Clubs** | Car clubs, crews and photo groups (2 new a month). Public or private, with owner / admin / member roles. Club chat, the meets members are going to (the next one featured as DON'T MISS THIS ONE), and a choice to show the club on your profile. Club page (085): cover banner (`cover_url`, or a color by kind), Instagram / TikTok / website links, edited by owners and admins. Joining posts a 'joined the club' chat post (`club_messages.kind = 'joined'`, by trigger; the app can only send 'text') with one-tap welcomes (Welcome! / Glad you're here / What do you drive?); join posts don't use up the day's chat alert. | `ClubsTab.jsx`, `ClubView.jsx` | `clubs`, `club_members`, `club_messages`, `club_meets()` |
| **Alerts** | An in-app inbox (the bell), plus phone and desktop alerts through **Web Push**. Settings: linkups near you (radius and home location, rounded to about 1 km), activity, and meet-day reminders. A **daily cron** sends reminders on the morning of meets you're going to. | `NotificationBell.jsx`, `AlertSettings.jsx`, `HomeScreenPrompt.jsx`, `src/lib/alerts.js`, `public/sw.js`, `api/push.js`, `api/daily.js`, `api/reminders.js`, `api/_lib/push.js` | `notifications`, `alert_settings`, `push_subscriptions`, `push_keys`, `notify()`, `claim_pushes()` |
| **Confirm-later email** | Signing up doesn't wait for an email. The app emails a confirm link at once, a reminder on day 3 or 4, and deletes accounts still unconfirmed after 7 days (never before both emails actually went out). Until confirmed, people can browse and RSVP but can't chat, post or use linkups. Typos and throwaway domains are caught at sign-up. | `ConfirmEmail.jsx`, `AuthForm.jsx`, `src/lib/account.js`, `src/lib/emailCheck.js`, `api/confirm-email.js`, `api/_lib/accounts.js` | `account_status`, `confirm_my_email()`, `require_confirmed_email()` trigger, `confirmation_queue()` |
| **Photographers** | A self-declared 📸 badge with a link to the photographer's page. It becomes verified (📸✓) after 5 car owners confirm "they shot my car", or when an admin grants it. Admins can also revoke it. | `src/lib/photographer.js`, `PersonProfile.jsx` | `profiles.is_photographer`, `photographer_confirmations`, `photographer_grants` |
| **Hosts** | Host verification (a request, or a one-time invite link DMed from @tunr.app). Verifying reserves the host name. A founding-host badge for hosts verified before launch. Co-hosts invited by username. **Private meets** with a passcode and/or host-approved join requests. "Is this your meet?" requests on imported listings. The `/hosts` pitch page. | `HostVerification.jsx`, `HostSetup.jsx`, `HostPitch.jsx`, `Cohosts.jsx`, `PrivateAccess.jsx`, `ListingRequest.jsx` | `host_verifications`, `verified_hosts`, `host_invites`, `event_cohosts`, `event_members`, `passcode_attempts`, `listing_requests` |
| **Perks** | Partner discounts (for example Chemical Guys, 10% off, free with any account). The database hides codes: free perks from signed-out visitors, members-only perks from non-members. The members-only tier is built, but billing isn't. | `PerksTab.jsx`, `JoinPage.jsx` | `partners`, `perks`, `perks_public`, `perk_redemptions`, `profiles.is_member` |
| **Points and rewards** | Points for checking in at admin-approved ⭐ "points meets" (the host's daily 6-character code + being within 400 m of the pin during the meet; +10, +5 if RSVP'd going beforehand), one-time getting-started bonuses, a one-time membership bonus, and purchases (10 per $1, set in admin). Rewards catalog with claim codes, optional minimum spend, stock and per-person limits; redeeming needs a 14-day-old account and 2 check-ins or a purchase. Anti-cheat: hosts can't earn at their own meets, one check-in per meet per day, 3 a day, attempt limits; the ledger is written only by SQL functions. **The shop is "coming soon"**: `SHOP_OPEN = false` in `src/lib/points.js` hides purchase points, scan-to-earn **points cards** (printable QR batches) and missing-points reports, all built and ready. | `CheckIn.jsx`, `Rewards.jsx`, `src/lib/points.js`, `PerksTab.jsx` | `points_meets`, `meet_checkins`, `point_ledger`, `rewards`, `reward_redemptions`, `points_settings`, `purchase_claims`, `point_cards`, `points_issues` (045–048) |
| **Invites** | Beli-style invite-to-unlock. Personal link `/?invite=<code>`; a friend counts once they sign up (account under 7 days old) and confirm their email. 1 friend unlocks a 2nd+ car and starting a club; 5 unlock a profile color and the Connector badge. Enforced by triggers; existing 2nd cars and clubs are grandfathered. | `InviteSheet.jsx`, `src/lib/invites.js` | `profiles.invite_code/invited_by/profile_color`, `claim_invite()`, `my_invites()` (049) |
| **Activity and support** | Settings pages: meet history, invite history, transaction log, sign-in history (device + masked network, 90 days) with "sign out everywhere else", custom **alert sound** (record or upload ≤6 s; device-only `localStorage`, plays while open), Contact us and Suggestion box with an admin Inbox (replies arrive as alerts). | `ActivityPages.jsx`, `Feedback.jsx`, `src/lib/activity.js`, `src/lib/feedback.js`, `NotificationBell.jsx` | `sign_ins`, `my_meet_history()`, `feedback` (050–051) |
| **Growth pages** | `/join` (a bio link that gives a numbered Day 1 badge before launch) and `/hosts`, both with server-rendered link-preview tags. | `JoinPage.jsx`, `HostPitch.jsx`, `api/join.js`, `api/hosts.js` | `launch_settings`, `signup_stats` |
| **Admin** | Shown only to admins, in Profile → ⚙️ Settings → Admin (`SettingsScreen.jsx`): insights (growth and host traction, CSV export), sign-up sources, the meet reports queue (hide/restore), community reports (posts, comments, forums, clubs), verification queue, host invites, listing requests, and account-cleanup numbers. | `Insights.jsx`, `SignupStats.jsx`, `ModerationQueue.jsx`, `CommunityReports.jsx`, `HostVerification.jsx` | `admin_*` views, `reports_queue`, `community_report_queue()`, `moderate_event()`, `is_admin()` |
| **Legal** | Terms of Service (version 3; you have to scroll to the end to agree, and every acceptance is logged) and the Privacy Policy, both shown in the app. | `TermsOfService.jsx`, `PrivacyPolicy.jsx`, `TOS_VERSION` in `src/lib/store.js` | `terms_acceptances` |
| **Analytics** | First-party events (`app_opened`, `rsvp`, `search`…) written to the database. No third-party trackers. | `track()` in `src/lib/store.js` | `analytics_events` |

---

## 2. Architecture

### Stack

- **Frontend:** React 18 and Vite 5, plain JavaScript (no TypeScript), no router (screens are picked from `window.location.pathname` in `App.jsx`), no state library. Styles are inline objects. Dark theme: background `#0A0A0A`, cards `#111`/`#141414`, borders `#222`/`#2A2A2A`, accent Boosted Studios blue `#0080F0`/`#3CABFD` (was orange until Oct 2026). Fonts: Barlow Condensed for headings and buttons, Barlow for body text (loaded from Google Fonts in `App.jsx`). The layout is 430 px wide at most.
- **Backend:** Supabase (Postgres with row-level security, Auth, Storage, Realtime). The browser talks to Supabase directly with the public anon key.
- **Server code:** Vercel serverless functions in `api/` (Node, ESM), for the few jobs that need a secret key or an outside API. There's one daily Vercel Cron.
- **Outside services:** Mapbox (maps and geocoding), Google Gemini (flyer reading), Web Push (VAPID, using the `web-push` npm package), and Gmail SMTP through Supabase Auth (email).
- **PWA:** `public/manifest.webmanifest` and a minimal network-first `public/sw.js`. The service worker exists for installing to the home screen and for push, not for offline use.
- **Dependencies** (`package.json`): `@supabase/supabase-js`, `react`, `react-dom`, `web-push`. Dev: `vite`, `@vitejs/plugin-react`. Mapbox GL JS v3.3.0 is loaded from Mapbox's CDN at runtime (`MapView.jsx`), not from npm.

### Repo layout

```
api/                      Vercel serverless functions (each file is a route)
  _lib/                   shared server code; Vercel doesn't route "_" folders
    accounts.js           confirm-later email: send, daily queue, deletions
    flyer.js              flyer prompt, JSON schema, clean-up of AI output
    gemini.js             Gemini call with model fallbacks
    push.js               service-role REST helper, VAPID keys, Web Push delivery
  m/[slug].js             /m/:slug share page with per-meet Open Graph tags
  confirm-email.js  daily.js  hosts.js  join.js  push.js  read-flyer.js  reminders.js
docs/                     email-templates.md (Supabase email setup), this file
public/                   icons, manifest.webmanifest, sw.js
scripts/migrate.sh        applies pending SQL migrations (used by CI)
src/
  App.jsx                 tabs, top-level state, deep links (?open=, /m/, /join, /hosts)
  components/             61 screen and sheet components (Sheet.jsx = bottom sheet)
  data/events.js          seed meets, used only when Supabase isn't configured
  lib/                    data layer and pure helpers (see below)
supabase/migrations/      001…051 numbered SQL files (append-only)
test/                     node:test unit tests (no database needed)
.github/workflows/migrate.yml   auto-applies migrations on push
vercel.json               rewrites, function timeouts, cron
```

Key `src/lib` modules: `supabase.js` (the client), `store.js` (most reads and writes: events, RSVPs, profile, auth, uploads, moderation), `community.js` (forums and clubs), `linkups.js`, `alerts.js` (inbox, settings, Web Push), `account.js` (email confirmation state, `useAccount()`), `errors.js` (error wording), `dates.js` (recurrence and time zones), `geo.js` / `geocode.js`, `emailCheck.js`, `image.js` (shrinking images before upload), `phash.js` (flyer fingerprint).

Size: about 16,500 lines of JSX, 3,600 of `src/lib`, 1,000 of `api/`, and 7,800 of SQL.

### How data flows

```
Browser (React)
  ├── supabase-js (anon key + the user's JWT) ─► Supabase REST/RPC, Storage, Realtime
  │       every table has RLS; privileged actions go through SECURITY DEFINER RPCs
  │       and BEFORE-INSERT/UPDATE triggers (rate limits, guards, notifications)
  ├── fetch("/api/…") ─► Vercel functions
  │       read-flyer: forwards the user's JWT (RLS still applies) and calls Gemini
  │       push/confirm-email/daily/reminders: use the SERVICE ROLE key, server only
  ├── Mapbox APIs (public token): map tiles, static map, forward and reverse geocoding
  └── Service worker (sw.js): receives Web Push and opens /?open=<link> on tap

Vercel Cron (daily, 13:00 UTC) ─► /api/daily ─► reminders + confirm-later emails
                                              + deletions + push delivery
GitHub push touching supabase/migrations ─► Action ─► scripts/migrate.sh ─► Postgres
```

Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app runs in "guest mode": seed meets plus RSVPs stored only on the device.

Alerts are queued by the database: triggers and definer functions call `notify()`, which inserts rows into `notifications`. Clients can't insert notifications. After an action that might have queued one, the client pings `POST /api/push` (`kickPush()`), and the server claims waiting rows (`claim_pushes()`, which uses `FOR UPDATE SKIP LOCKED`, so a row is never sent twice) and sends them. A link in an alert is a string like `meet:<id>`, `linkup:<id>`, `post:<id>`, `forum:<id>`, `club:<id>` or `person:<id>`, and `openLink()` in `App.jsx` routes it.

### Serverless routes

| Route | Method / auth | Key used | What it does | Error codes |
|---|---|---|---|---|
| `/api/read-flyer` | POST `{imageUrl, caption}`, `Authorization: Bearer <user JWT>` | anon key + the user's JWT, `GEMINI_API_KEY` | Only accepts an image in the caller's own folder of the `event-photos` bucket. Logs the read to `flyer_reads` *first* (a DB trigger limits it to 10 an hour and 25 a day; admins are exempt). Calls Gemini with a JSON schema, then normalizes the result (the year is always the current one, a weekday/date mismatch is flagged). | `not_configured`, `not_signed_in`, `bad_image`, `rate_limit_flyers`, `log_failed`, `busy`, `unreadable`, `bad_key`, `no_model`, `ai_failed` |
| `/api/confirm-email` | POST, Bearer user JWT | service role | Sends the welcome or "resend" confirm email (Supabase magic link). At most one every 10 minutes. | `not_signed_in`, `confirm_email_wait`, `push_not_configured`, `email_send_failed` |
| `/api/push` | GET returns `{publicKey}`. POST delivers queued alerts. No auth, by design: it only delivers what the DB queued. | service role | Makes VAPID keys on first use and stores them in `push_keys` (no env var needed). Removes dead subscriptions (404/410). | `push_not_configured`, `push_failed` |
| `/api/daily` | GET from Vercel Cron. If `CRON_SECRET` is set, needs `Bearer CRON_SECRET`. | service role | Meet-day reminders, then the confirm-later queue (first emails that didn't send, reminders, deleting accounts), then push delivery. | `bad_cron_secret`, `push_not_configured` |
| `/api/reminders` | GET (same guard) | service role | Reminders and delivery only, for running by hand. Safe to run twice (deduped per person, per meet, per day). | `bad_cron_secret`, `reminders_failed` |
| `/m/:slug` → `/api/m/[slug]` | GET, public | anon | Returns the built `index.html` with that meet's OG/Twitter tags. Reads `events_public`, so private meets show only their title. | none |
| `/join` → `/api/join`, `/hosts` → `/api/hosts` | GET, public | none | The same `index.html` with tags specific to that page. | none |

Function timeouts are set in `vercel.json`: read-flyer, reminders and daily 60 s, push 30 s.

---

## 3. Environment variables

Names only. Values live in the dashboards, never in the repo. `.env.example` lists the three client variables. For local development, put them in `.env.local`, which git ignores.

| Name | Where it lives | Used by | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (all environments), `.env.local` | client bundle **and** `api/*` | The Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Vercel, `.env.local` | client bundle and `api/*` | The public anon key. Safe in the browser because RLS enforces everything. |
| `VITE_MAPBOX_TOKEN` | Vercel, `.env.local` | client bundle | A public Mapbox token for the map, static maps and geocoding. Without it the map shows a placeholder and the location check is skipped. |
| `GEMINI_API_KEY` | Vercel | `api/read-flyer.js` | A Google AI Studio key for the flyer reader. Without it you get `not_configured`. |
| `INSTAGRAM_ACCESS_TOKEN` | Vercel | `api/instagram-sync.js` | Either an Instagram-login token (`IG…`, @tunr.app only, renewed weekly) or a Facebook-login token (`EA…`, from the Graph API Explorer; needed for watched accounts), which is swapped once for the linked Facebook Page's non-expiring token. Kept in `instagram_link`; a new value replaces the stored one. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Vercel | `api/_lib/instagram.js` | The Meta app's id and secret (Settings → Basic), needed to swap a Facebook-login token for a long-lived one. |
| `GEMINI_MODEL` | Vercel (optional) | `api/read-flyer.js` | Overrides the model. The default is `gemini-flash-latest`, falling back to `gemini-2.5-flash`, `gemini-2.5-flash-lite` and `gemini-2.0-flash` on 404/429. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel only, **never** with a `VITE_` prefix | `api/_lib/push.js` (push, confirm-email, daily, reminders) | Bypasses RLS. Used for push delivery, the Auth admin API (setting email template values, deleting unconfirmed accounts) and sending magic links. `SUPABASE_SECRET_KEY` and `SUPABASE_URL` are also accepted as fallback names. |
| `CRON_SECRET` | Vercel (optional) | `api/daily.js`, `api/reminders.js` | When set, only requests with `Authorization: Bearer <CRON_SECRET>` can run them. Vercel Cron sends that header automatically. |
| `SUPABASE_DB_URL` | GitHub → Settings → Secrets → Actions | `.github/workflows/migrate.yml` → `scripts/migrate.sh` | The Postgres connection string (Supabase **Session pooler** URI with the DB password) used to apply migrations. |

Anything with a `VITE_` prefix is built into the public JavaScript bundle. Never give a secret that prefix.

---

## 4. External services and dashboard settings

These settings live outside the repo. Changing them can break sign-up, email or alerts.

**Supabase** (database, Auth, Storage, Realtime)
- **Authentication → Sign In / Providers → Email: "Confirm email" must stay OFF.** TUNR confirms emails itself after sign-up (`041_email_confirmation.sql`). Turning it on would make sign-up wait for an email, and the flow wasn't built for that.
- **Authentication → Emails → Templates → Magic Link:** must hold the subject and HTML from `docs/email-templates.md`. TUNR uses this one template for the welcome email, the day-3 reminder and resends. It reads `.Data.confirm_reminder`, `.Data.delete_on` and `.Data.username`, which `api/_lib/accounts.js` sets on the user just before sending.
- **Custom SMTP:** Gmail (`smtp.gmail.com`, port 465, an app password on the sending Google account, sender name `TUNR`), with the "emails per hour" rate limit raised. Supabase's built-in sender only allows a few emails an hour. Gmail allows about 500 a day.
- **Authentication → URL Configuration:** Site URL = the live site (for example `https://tunr-gules.vercel.app`). The Redirect URLs must include `<site>/**`, so sign-ups from `/join` and `/hosts` come back to those pages (see `returnUrl()` in `src/lib/store.js`).
- **Google sign-in:** the Google provider is enabled with an OAuth client from Google Cloud Console, whose authorized redirect URI is the Supabase callback (`https://<project-ref>.supabase.co/auth/v1/callback`). The app only shows the Google button when the provider is on (`googleEnabled()` reads `/auth/v1/settings`).
- **Storage buckets** (created by migrations, all public-read): `event-photos` (meet photos and flyers, club logos, forum photos), `meet-photos`, `vehicle-photos`, and `avatars` (profile photos; 044 only accepts an `avatar_url` inside the user's own `avatars/<uid>/` folder, and old photos are deleted when replaced or when the account is deleted).
- **Realtime:** migrations add `comments`, `notifications`, `linkup_messages`, `linkup_members` and `club_messages` to the `supabase_realtime` publication.
- **Admin access:** `020_grant_admin.sql` sets `profiles.is_admin` for the owner's account (looked up by email). To add or remove admins, write a new migration or run an `update` in the SQL editor.
- **Day 1 window:** to close it at launch, run `update public.launch_settings set day_one_closes_at = now();` (see `023_day_one.sql`).

**Vercel** (hosting and serverless functions)
- The environment variables in section 3.
- The production branch: the working branch has been `claude/tunr-car-meet-app-f9dqlh` (the migration workflow also listens on `main`). Check which branch Vercel deploys before changing branches.
- Cron: `vercel.json` runs `/api/daily` at `0 13 * * *` (UTC), which is 9:00 AM Eastern in summer and 8:00 AM in winter.
- Rewrites in `vercel.json`: `/m/:slug`, `/join` and `/hosts`. There's no catch-all SPA rewrite, so a new path-based page needs its own rewrite.

**GitHub:** the `SUPABASE_DB_URL` Actions secret, and the `migrate.yml` workflow (section 5).

**Mapbox:** a public token (`VITE_MAPBOX_TOKEN`). If you add URL restrictions to the token, include every origin the app runs on, including the native app origins (section 8).

**Google AI Studio:** the Gemini API key (free tier). The Privacy Policy tells users that flyer images go to Google and may be used to improve its products on the free tier.

**Instagram:** host invites are sent as DMs from **@tunr.app** (`INSTAGRAM_HANDLE` in `src/lib/contact.js`).

**Access to give a new developer:** a GitHub collaborator, a Vercel team member, a Supabase project member (Developer role), and later an Apple App Store Connect user and a Google Play Console user. Mapbox and AI Studio keys can stay with the owner. The developer only needs to be able to set the env vars.

---

## 5. Database and migrations

### How migrations ship

- Files live in `supabase/migrations/NNN_description.sql`, zero-padded and applied in filename order.
- `.github/workflows/migrate.yml` runs `scripts/migrate.sh` on any push to `main` or `claude/tunr-car-meet-app-f9dqlh` that touches `supabase/migrations/**`, the script or the workflow. It can also be run by hand, with an optional `baseline` input for a database where early files were pasted in by hand. Runs are serialized (`concurrency: supabase-migrations`).
- `migrate.sh` records applied files in `public.schema_migrations`. Each file runs in **one transaction together with its tracking row**, so a failing file leaves nothing half-applied and isn't marked done. Afterwards it prints what the DB considers applied.
- **There's no staging database.** A pushed migration goes straight to production. Test first (see below).

### Rules

- **Append-only.** Never edit a file that has been applied. `010_remove_host_claiming.sql` exists because 003 was edited after it had already run, and the edit never reached the live DB. Fix things in a new numbered file.
- Write migrations so they can run again safely: `create … if not exists`, `drop policy if exists` then `create policy`, and `create or replace function`.
- A view or function whose return shape changes is dropped and created again (for example 044 redefines `get_person`). Keep `grant`s next to the definition.
- Several migrations (001, 004, 007, 009, 014, 017, 022, 026, 027) seed real meet and perk data. Each records where its data came from in the header comment.
- Once native apps are in the stores, **keep RPC, view and API changes backward compatible**. Older app versions stay installed for months.

### Data model (key objects)

- **Meets:** `events` (recurrence such as `weekly:SAT` or `monthly:first|second|third|fourth|last:SUN`, `recurrence_until`, `timezone`, `visibility`, `access_mode`, `passcode`, `hidden`, `flyer_url`, `flyer_hash`), `events_public` (the view the app reads), `rsvps` (`status` going/interested/not_going, `going_as`, `vehicle_id`), `event_rsvp_counts`, `event_attendees`, `rsvp_log` (anonymous history kept forever), `event_cohosts`, `event_members` (private-meet access), `passcode_attempts`, `meet_photos`, `comments`, `comment_reactions`, `reports`, `listing_requests`, `flyer_reads`.
- **People:** `profiles` (username, city, `is_admin`, `is_member`, `is_photographer`, `photo_page`, Day 1 fields, terms fields, and `avatar_url`/`bio` from 044), `vehicles`, `car_makes`, `follows` (hosts by name), `user_follows`, `blocks`, `restrictions`, `photographer_confirmations`, `photographer_grants`, `terms_acceptances`, `account_status`, `account_cleanups`.
- **Hosts:** `host_verifications`, `verified_hosts` (a reserved host name and the founding flag), `host_invites`, `launch_settings`.
- **Community:** `linkups`, `linkup_members`, `linkup_messages`, `linkup_agreements`, `forums`, `forum_follows`, `forum_posts`, `forum_comments`, the vote tables, `community_reports`, `clubs`, `club_members`, `club_messages`.
- **Alerts:** `notifications`, `alert_settings`, `push_subscriptions`, `push_keys` (no policies, service role only).
- **Commerce and metrics:** `partners`, `perks`, `perks_public`, `perk_redemptions`, `analytics_events`, and the `admin_*` views (`admin_overview`, `admin_daily`, `admin_host_stats`, `admin_meet_stats`), `signup_stats`.

### Security model

The working assumption, repeated in the migration headers: **the anon key is public, so anyone can call the REST API directly with any parameters. Every rule has to hold in the database.**

- **RLS on every table.** Rows are owner-scoped with `auth.uid()`. Reads that would leak columns go through views instead: `event_attendees` exposes make and model only, and `events_public` nulls out the location, coordinates, description and photo of a private meet you're not in, and returns the passcode only to its hosts.
- **SECURITY DEFINER helpers and RPCs** (all `set search_path = public`, with `execute` revoked from `public`/`anon` where it matters):
  - helpers that keep policies from recursing: `can_access_event`, `is_admin`, `is_event_host`, `blocked_between`, `email_confirmed`
  - privileged actions: `delete_my_account`, `redeem_event_passcode`, `create_host_invite`, `redeem_host_invite`, `decide_host_verification`, `moderate_event`, `invite_cohost`, `save_push_subscription`, `confirm_my_email`
  - service-role-only functions: `claim_pushes`, `notify_many`, `confirmation_queue`, `mark_confirmation_sent`, `record_account_cleanup`
- **Triggers:**
  - *Rate limits* that raise machine-readable markers (`rate_limit_comments`, `rate_limit_events_hourly`, `rate_limit_flyers`, `rate_limit_linkups`, …). `src/lib/errors.js` maps each marker to user-facing wording.
  - *Guards* that pin columns the server controls, so a client can't set its own `is_admin`, `is_member`, Day 1 number, terms fields, `verified` badge or `hidden` flag. Verification codes are generated on the server.
  - `a_require_confirmed_email`, named with an `a_` prefix so it fires first, on chat, posting, linkups, verification, photos and forums/clubs.
  - *Notification triggers*, which queue alerts.
- **Storage:** public read. `vehicle-photos`, `avatars` and `meet-photos` only accept writes inside the uploader's `<uid>/` folder. `event-photos` only checks the bucket (see gaps).
- **Server keys:** the service role key is used only in `api/_lib/push.js` and its callers. `read-flyer` deliberately uses the caller's JWT so RLS and the flyer rate limit apply.

### Testing a migration safely

1. Best: a second Supabase project as **staging**. Run `SUPABASE_DB_URL='<staging session-pooler URI>' ./scripts/migrate.sh` (needs `psql`).
2. Or run the Supabase stack locally: `supabase start` with the Supabase CLI and Docker, then point `SUPABASE_DB_URL` at the local Postgres it prints. Plain Postgres won't work, because the migrations depend on Supabase's `auth` and `storage` schemas, the `anon`/`authenticated`/`service_role` roles and the `supabase_realtime` publication. There's no `supabase/config.toml` in the repo yet.
3. Check as a normal user, not just in the SQL editor (which runs as `postgres` and skips RLS): try the action through the app or REST with an anon or user token.

---

## 6. Run, test, build, deploy

```bash
npm install
cp .env.example .env.local      # fill in the three VITE_ values (or leave empty for guest mode)
npm run dev                     # Vite dev server, front end only
npm test                        # node --test "test/*.test.js" (96 tests today, no DB or network)
npm run build                   # outputs dist/
npm run preview                 # serves dist/
```

- `npm run dev` doesn't run `api/`. To exercise the flyer reader, push or the email routes locally, use `vercel dev` (Vercel CLI, with the env vars pulled using `vercel env pull`).
- Use Node 22 LTS. The test script relies on Node's built-in glob support for `--test` (Node 21+).
- Tests cover pure logic and the API handlers with injected `fetch` and `web-push` stand-ins: dates and recurrence, geo, geocode judging, flyer normalization, Gemini handling, push delivery, the confirm-later email schedule, error wording, email typo checks, passcodes, claims and photographer links. **CI doesn't run tests.** The only workflow applies migrations.
- **Deploy:** Vercel builds from GitHub automatically (it detects Vite: `npm run build`, output `dist`). The functions in `api/` deploy with it. Migrations deploy separately through the GitHub Action, so land the migration before or together with the code that needs it.
- `README.md` is partly out of date. It describes the early localStorage prototype and pasting `001_init.sql` by hand. This document replaces it.

---

## 7. Conventions

From `CLAUDE.md`, the rules every change follows:

- **Errors always say what went wrong.** Every error a user sees states its cause, never just "Couldn't do that."
  - In `src/lib/*`, wrap failures with `withReason("Couldn't …", error)` or `friendlyWriteError(error, "Couldn't …")` from `src/lib/errors.js`. Both add the real reason, for example "Couldn't save that car. (permission denied for table vehicles)".
  - Don't swallow errors with a bare `catch {}` and a generic message. Catch as `catch (e)` and show `e.message`.
  - API routes return a specific error code (`bad_key`, `rate_limit_flyers`, …) plus `detail` where useful. The client shows a message for that code, or the code itself.
  - Database errors raise markers (`raise exception 'rate_limit_linkups'`), and their wording lives in `WRITE_ERROR_COPY` in `src/lib/errors.js`.
- **Talking to the owner:** the owner isn't technical. End every update with a short **Summary** of a few plain bullets: what was done or decided, anything the owner must do (clearly marked), and what's next. Keep the important details and skip the jargon.
- Match the existing style: inline style objects, the dark palette and fonts above, mobile-first at 430 px max. Bottom sheets use `src/components/Sheet.jsx`. Comments explain *why*, and migrations open with a header saying what they do and why.
- Put rules in the database (RLS, triggers), not only in the UI.

---

## 8. Turning TUNR into an iOS/Android app

### Recommendation: Capacitor around the existing Vite build

[Capacitor](https://capacitorjs.com) puts the built `dist/` in a native iOS/Android shell (a WKWebView or Android WebView) and gives JavaScript access to native features through plugins.

- **Why:** almost all of the code is reused, roughly 95%: all 61 components, `src/lib`, the Supabase backend, RLS, the `api/` routes and the tests. Only the places that touch the browser platform change (listed below). One codebase keeps serving the website, iOS and Android. The backend needs no rewrite.
- **Why not a React Native rewrite now:** React Native can't render this DOM, inline-CSS UI. About 15,000 lines of JSX would need rewriting with RN primitives and a navigation library, and Mapbox, uploads, image compression (canvas) and the fingerprint code would all need native replacements. That's a multi-month project (very roughly 3 to 6 months for one developer), it duplicates the web app, and it buys smoother scrolling and gestures, which TUNR doesn't need yet. Revisit if the app outgrows a WebView, for example with heavy real-time maps or a lot of gesture-driven UI.

### Checklist

**A. Project setup**
- `npm i @capacitor/core @capacitor/cli`, then `npx cap init` with the bundle ID (choose it carefully, because it can't change after release; ideally the reverse of a domain you own), `webDir: "dist"`, then `npx cap add ios` and `npx cap add android`. Build with `npm run build && npx cap sync`.
- In native, skip service worker registration (`src/main.jsx`) and hide the iPhone "Add to Home Screen" prompt (`HomeScreenPrompt.jsx`, and the `ios_home_screen` branch of `pushSupport()` in `src/lib/alerts.js`). Use `Capacitor.isNativePlatform()`.

**B. Fix URLs that assume the app is served from the website**
- Relative API calls: `fetch("/api/…")` in `src/lib/store.js` (`readFlyer`), `src/lib/account.js` (`requestConfirmationEmail`) and `src/lib/alerts.js` (`serverKey`, `kickPush`). In native these resolve to the app's local origin. Prefix them with a configured origin (for example a new `VITE_API_ORIGIN`).
- **CORS:** the `api/` routes send no CORS headers today. Add headers for the native origins (`capacitor://localhost` on iOS, `https://localhost` on Android) and answer `OPTIONS` preflights, because `Authorization` and `Content-Type` headers trigger them.
- `window.location.origin` is used for share links (`MeetDetail.jsx`, `JoinPage.jsx`, `hostInviteUrl()` in `store.js`) and for auth redirects (`returnUrl()`, `sendPasswordReset()` in `store.js`). Use the public site URL instead.
- `App.jsx` routes from `window.location`: `/m/<slug>`, `/join`, `/hosts` and `?open=`. In native, route from `@capacitor/app`'s `appUrlOpen` event.

**C. Auth, sessions and deep links**
- `src/lib/supabase.js` uses the **implicit** flow with `detectSessionInUrl` and localStorage. In native, give supabase-js a storage adapter backed by `@capacitor/preferences`, because iOS can clear WebView storage. Turn off `detectSessionInUrl` and complete sign-ins from deep links yourself (`setSession`, `verifyOtp` or `exchangeCodeForSession`; `completeSignInFromUrl()` shows the cases).
- **Universal Links (iOS) and App Links (Android)** on your web domain: serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` (put them in `public/.well-known/`, and use `vercel.json` headers for the content type). Cover `/`, `/m/*`, `/join` and `/hosts`. A custom domain is strongly recommended first (see gaps).
- **Magic links:** the confirm emails are minted on the server (`api/_lib/accounts.js` → `/auth/v1/otp`) and go to Supabase's verify URL, which then redirects to the Site URL. iOS doesn't reliably open an app from a cross-domain redirect. The robust fix is to change the Magic Link template to link straight to your domain with `{{ .TokenHash }}` (for example `<site>/auth/confirm?token_hash=…&type=magiclink`), then call `supabase.auth.verifyOtp({ token_hash, type })` in the web app and the native app. Add any custom scheme or new paths to the Supabase Redirect URLs.
- **Google sign-in:** Google blocks OAuth inside embedded WebViews. Either open the OAuth URL in the system browser (`@capacitor/browser`, with `skipBrowserRedirect: true`) and return through a deep link, or use native Google Sign-In and `supabase.auth.signInWithIdToken({ provider: "google", … })`.
- **Sign in with Apple:** App Store guideline 4.8 expects an equivalent privacy-focused login option when an app offers Google sign-in, and Sign in with Apple is the standard way to meet it. Enable the Apple provider in Supabase (add the bundle ID as a client ID), use a native plugin, then `signInWithIdToken({ provider: "apple", token, nonce })`. Apple also expects the app to **revoke the Apple token when the account is deleted**, which needs a small server route next to `delete_my_account`.
- `confirm_my_email()` (041) treats a session as proof of the inbox only when its JWT `amr` includes `otp`, `magiclink`, `oauth`, `recovery`, `email/signup`, `invite` or `email_change`. Check which `amr` method Supabase records for ID-token sign-ins (native Google/Apple). If it isn't in that list, add it in a new migration, or those users will be shown as unconfirmed.

**D. Native push instead of Web Push**
- Service workers don't run in the Capacitor WebView, so `public/sw.js` push does nothing there. Use `@capacitor/push-notifications`, or `@capacitor-firebase/messaging` to get FCM tokens on both platforms. Firebase Cloud Messaging can deliver to iOS once an APNs key is uploaded to Firebase.
- Database (new migration): a device-token table, for example `push_devices(token pk, user_id, platform, created_at)`, plus a `save_push_device` RPC modeled on `save_push_subscription` (which moves a device to whoever is signed in). Extend `claim_pushes()` to return device tokens alongside the Web Push endpoints.
- Server: in `api/_lib/push.js` `flush()`, send to FCM (HTTP v1, needing a new server secret such as the Firebase service account) next to `web-push`. Keep the existing TTL and urgency rules (a meet reminder is good for 6 hours, linkup alerts are high priority), and delete tokens FCM reports as unregistered.
- Client: a native branch in `enablePush()`/`disablePush()` and `AlertSettings.jsx`. On `pushNotificationActionPerformed`, call `openLink(link)` in `App.jsx`, which already understands every link format. Keep Web Push for the website.

**E. Location**
- **Required for points:** meet check-ins and the stay-the-whole-meet bonus (045, 052, 053) confirm the member is within 400 m of the meet's pin, so the app must ask for location (When In Use, **precise**) with a clear reason. Settings → Location (`LocationAccess.jsx`, `src/lib/location.js`) shows the state and how to turn it on; in native, read it with `@capacitor/geolocation`'s `checkPermissions()`/`requestPermissions()` and link to the app's own settings page when it's denied.
- Current uses are one-shot `navigator.geolocation` calls: distances in `App.jsx`, plus `currentPosition()` in `src/lib/alerts.js` for the alert home location and the linkup "I'm here now". Switch to `@capacitor/geolocation` and add `NSLocationWhenInUseUsageDescription` (iOS) and `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` (Android).
- **Background location** is only needed for the planned "On my way" / live cruise feature (not built). It requires a plugin (for example `@capacitor-community/background-geolocation`, or the commercial Transistorsoft plugin), `NSLocationAlwaysAndWhenInUseUsageDescription` plus `UIBackgroundModes: location` on iOS, and `ACCESS_BACKGROUND_LOCATION` plus a location foreground service on Android, along with Google Play's background-location declaration (with a video). Apple reviews this closely: keep it opt-in, time-limited and clearly explained. Consider whether a one-shot ETA is enough first. The app and Privacy Policy currently promise **no background tracking, even if the phone's setting is "Always"** (`LocationAccess.jsx`, `PrivacyPolicy.jsx`), and ask for **While Using the App**; if background location is ever added, update both and ask for it separately, only when that feature is turned on.

**F. Camera and photos**
- Uploads use `<input type="file" accept="image/*">` in `SubmitMeet.jsx`, `EditMeet.jsx`, `Garage.jsx`, `MeetPhotos.jsx`, `ClubsTab.jsx`, `PostForm.jsx` and the new profile photo. These work in the Capacitor WebView, but iOS **requires** `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in Info.plist. Optionally use `@capacitor/camera` for a native picker. `compressImage()` and `flyerHash()` use `createImageBitmap` and canvas, which are fine in modern WebViews.

**G. Other platform touches**
- `navigator.share` → `@capacitor/share`. `navigator.clipboard` → `@capacitor/clipboard`. External links (Google Maps directions from `directionsUrl()`, Instagram, partner sites) → `@capacitor/browser` or the system, so they don't replace the app's WebView.
- Bundle Mapbox GL from npm instead of the CDN script in `MapView.jsx`, and the Barlow fonts instead of the Google Fonts `@import`, so the first launch doesn't depend on extra network requests.
- Safe areas: `index.html` already sets `viewport-fit=cover`. Add `env(safe-area-inset-*)` padding to the sticky header, the fixed bottom nav (`App.jsx`) and `Sheet.jsx`. Use `@capacitor/status-bar` (dark), `@capacitor/splash-screen` and `@capacitor/keyboard` (for chat inputs).
- On `resume` (`@capacitor/app`), refetch data. Realtime sockets drop in the background, and the app already polls chat and notifications while visible.
- **Icons and splash:** `public/icon-512.png` is the largest icon. The App Store needs a 1024×1024 master. Generate every size with `@capacitor/assets`.
- **Release strategy:** bundled web assets mean every UI change needs a store release. Consider a live-update service (for example Capgo or Ionic Appflow) for JS/CSS-only fixes, within Apple's rules.

**H. Custom alert sound: the member's own car (owner requirement)**
- Today: Settings → Alert sound records 4 s from the mic (`MediaRecorder`) or takes an uploaded clip (≤6 s, ≤600 KB), stores it as a data URL in `localStorage` (`tunr.alertSound`, `src/lib/activity.js`), and `NotificationBell.jsx` plays it when a new unread alert arrives while the app is open. Phones only use the system sound for web-push alerts when the app is closed.
- **Goal in the native app:** the same clip plays for push alerts when the app is closed or in the background.
- **iOS:** record with a native plugin (or reuse the web recording), convert to linear PCM / IMA4 `.caf` (or `.wav`/`.aiff`), **under 30 seconds**, and write it to `Library/Sounds/tunr_custom.caf` in the app container (a small Swift plugin; files there can be replaced at runtime). Send APNs payloads with `"sound": "tunr_custom.caf"` for devices that have one; iOS falls back to the default if the file is missing.
- **Android (8+):** notification sound is per **channel** and fixed once the channel exists. Copy the clip to app storage, create a channel such as `tunr_custom_<n>` with that sound (`content://` URI via a FileProvider), and send FCM messages with `android.notification.channel_id` set to it. When the member changes their sound, create a new channel with a new id and delete the old one.
- **Server:** add `custom_sound boolean` (and `channel_id text` for Android) to the device-token table from checklist D, set by the app after the sound is installed. In `api/_lib/push.js`, pass `sound` / `channel_id` per device; everyone else keeps the default.
- **Optional:** sync the clip to the account (a private `alert-sounds/<uid>/` storage bucket with own-folder policies, like `avatars` in 044) so it follows the member to a new phone.
- Add `NSMicrophoneUsageDescription` (iOS) and `RECORD_AUDIO` (Android) for recording in-app.

### App Store review points

| Requirement | Status in TUNR |
|---|---|
| 5.1.1(v) in-app account deletion | ✅ `delete_my_account()` RPC with a typed confirmation (`AccountSettings.jsx`, under Profile → ⚙️ Settings, at the bottom). It also deletes the user's profile photos from storage. Add Apple token revocation once Sign in with Apple exists. |
| 1.2 user-generated content: report, block, moderate | ✅ Reporting meets (`reports`) and community content (`community_reports`), block and restrict, admin queues with hide/remove, Terms agreed before use, and the Terms promise review within 24 hours. |
| 4.8 login services | ⚠️ Google sign-in is offered, so add Sign in with Apple. |
| 4.2 minimum functionality (not "just a website") | ⚠️ Native push, location, share and camera integrations make the case. Don't ship a bare wrapper. |
| 2.1 app completeness | ✅ The old "Instagram garage — coming soon" placeholder is gone. Keep placeholder content out of the build. |
| Privacy policy URL | ⚠️ The policy is only an in-app sheet. The store listing needs a public URL, so add a `/privacy` (and `/terms`) page with a `vercel.json` rewrite. |
| Privacy "nutrition" labels | Declare: email and username, user ID, photos, user content (chat, posts, meets), approximate location (the alert home location is rounded to about 1 km, and linkup spots are exact coordinates), usage data (`analytics_events`, including search terms), device push tokens. No ads or cross-app tracking, so no ATT prompt. Processors: Supabase, Vercel, Mapbox, Google (sign-in, Gemini), Gmail. |
| Age rating | The Terms require 18+. Answer the age-rating questionnaire the same way (chat, UGC, meeting strangers). |
| Review notes | Provide a demo account **with a confirmed email** (chat, posting and linkups are locked until confirmed), a private-meet passcode to test with, and a note on the content policy (no street racing or takeovers, plus the linkup rules). |
| 3.1.1 in-app purchase | Only if paid membership is turned on (`is_member` exists, but there's no billing). Digital subscriptions sold in the app generally have to use Apple and Google billing, and US rules have been changing, so check at that time. |

**Google Play:** fill in the Data safety form (same data as above). Account deletion needs to be possible both in the app *and* through a web link, and the website's in-app deletion can serve as that link, so publish its URL. Complete the content rating (IARC) questionnaire and meet the target API level. Background location needs a declaration. New *personal* developer accounts must run a closed test (currently 12 testers for 14 days) before production, while organization accounts are exempt, which is one more reason to enroll as the LLC.

### Accounts and costs (owner-held)

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | 99 USD a year | Enroll as an **organization** (Boosted Studios Production LLC). This needs a **D-U-N-S number** (free from Dun & Bradstreet, but it can take days to weeks), a website and signing authority. |
| Google Play Console | 25 USD once | Organization accounts also ask for a D-U-N-S number and identity verification. |
| Mac with Xcode | hardware | Needed to build, sign and upload iOS apps (or a cloud Mac build service). Android builds work on any OS with Android Studio. Test push and location on real devices. |
| Firebase project | free | For FCM push. The APNs key comes from the Apple account. |
| Custom domain | about 10 to 20 USD a year | Recommended before universal links and branded email. |

### Effort estimate (an estimate, not a quote)

For one experienced web and mobile developer who is new to the codebase:

| Work | Estimate |
|---|---|
| Capacitor setup, iOS/Android projects, icons, splash, safe areas | 2–3 days |
| API origin and CORS, share/redirect URLs, deep-link routing | 1–2 days |
| Auth: deep/universal links, magic-link change, Google in the system browser, Sign in with Apple (with revocation), session storage | 4–6 days |
| Native push: token table and RPC, FCM sender, tap handling, settings UI | 3–5 days |
| Location, camera, share, clipboard and external-link plugins, resume handling | 2–3 days |
| Custom car alert sound (checklist H): iOS `Library/Sounds` plugin, Android channels, per-device flag and payload | 1–2 days |
| Device QA on iOS and Android, fixes | 3–5 days |
| Store listings, privacy labels, Data safety, review notes, resubmissions | 2–4 days of work, plus waiting |
| **Total** | **about 18–30 working days (≈ 145–240 hours), so 3–6 calendar weeks** |

Main drivers: how smooth auth deep linking goes (the most fiddly part), whether App Review raises 4.2 or 4.8 issues, how long the D-U-N-S number and Apple enrollment take (start these **now**, in parallel), and whether background location ("On my way") is in scope. That feature alone adds about 1–2 weeks, plus extra review scrutiny.

---

## 9. Known gaps and backlog

**Product backlog (not built)**
- **"Who's down?":** float a linkup idea to see who's interested before setting a time and place. Linkups must start today or tomorrow.
- **On my way / Open in Waze:** share that you're heading to a meet or linkup (an ETA, possibly live location; see 8.E), and a Waze button beside the Google Maps directions (`directionsUrl()` in `src/lib/geo.js`).
- **Custom alert sound when the app is closed:** required for the native app; see section 8, checklist H.
- **Open the shop:** set `SHOP_OPEN = true` in `src/lib/points.js` when merch launches. For automatic purchase points with no manual checking, an **Etsy** shop (Etsy collects sales tax) can be read daily through the Etsy Open API v3 (receipts include the buyer email) to award points by matching TUNR account emails; or connect Square webhooks if the owner sells on Square.
- **Instagram auto-import** of flyers and meets: blocked until a Meta developer app is created and passes Meta's app review (Instagram's API only works through an approved app). Flyers are currently added by hand or through the flyer reader.
- **Linkups on the map:** the Map tab shows meets and forum photo spots, not linkups.
- **Club members-only linkups:** linkups are public or private, with no club scoping.
- **Own domain, and Resend for email:** the site runs on a `vercel.app` address, and email goes through Gmail SMTP (about 500 a day). A domain with Resend (or similar) and SPF/DKIM improves delivery, and it's needed for clean universal links.
- **Supabase Pro for backups:** the free plan has no downloadable daily backups. Pro (paid monthly; check current pricing) adds them. Do this before launch.
- **Membership billing:** `is_member` and the members-only perk logic exist, but there's no payments integration (see 3.1.1 above).

**Technical debt and hardening found while writing this**
- The `event-photos` storage insert policy (003) only checks the bucket, not the `<uid>/` folder (unlike `meet-photos` and `vehicle-photos`). `read-flyer` checks the folder on its own. Tighten it in a new migration.
- No staging environment: migrations apply straight to production on push.
- CI doesn't run `npm test` or `npm run build`. Add a workflow.
- The `api/` routes have no CORS headers (needed for native, see 8.B).
- There are no public `/privacy` and `/terms` URLs (needed for the store listings).
- `README.md` is out of date (see section 6). The header comment in `030_flyers.sql` still says "Claude" reads flyers. It's Gemini now (`api/_lib/gemini.js`).
- Mapbox GL and the fonts load from CDNs at runtime.
- The app is Atlanta-centric: times are shown in `America/New_York`, the header says "ATLANTA, GA", and geocoding is biased toward Atlanta. Expanding to other regions needs a pass over `src/lib/dates.js`, `App.jsx` and `geocode.js`.

## All access (081)

`profiles.all_access` gives one account every paid and locked feature: membership (`is_member()` says yes, so member perks open), the invite unlocks (more cars, clubs, flair), rewards without the account-age, check-in, spend and email rules (points and stock still apply), and, in the app, all TUNR Rush scenery and Park Up levels (`loadAllAccess()` in `store.js`). Set for boostedstudiosllc@gmail.com by the migration; a guard means it can only be changed from the SQL editor (`update public.profiles set all_access = true where id = '<uuid>'`).

## Points checklist

The 📋 button in the header (`Checklist.jsx`) lists every way to earn points as tasks (today: check in, stay to the end, TUNR Rush; this week: the streak; this month: referrals; getting started: email, profile, car, alerts, membership) with done marks, progress bars and a GO button to where you do it. The yellow badge counts what's left. Opening it pays any getting-started points due (`claim_starter_points`), like the Rewards sheet does.

**Admin log (094)**: a trigger (`log_admin_change`) on ~28 tables writes a row to `admin_log` whenever an admin inserts, changes or deletes something (who, table, row id, and for changes only the columns that changed, old → new, cut to 200 chars). Admins read it in Settings → Admin → Admin log (`AdminLog.jsx`, `admin_log_recent()`); there are no write policies, so it can't be edited from the app. Add new admin-edited tables to the list in 094 when you create them.

**Host badges (095)**: `meets_hosted(uid)` counts meets someone created that have started and aren't hidden. `host_badge(uid)` returns `{ hosted, level, next }` (level 0/5/10/25) and `<Badges hostOf={id}>` shows a bronze/silver/gold trophy from it (`loadHostBadge`, cached per visit). The checklist calls `claim_host_badges()` on open, which pays +10/+25/+50 at 5/10/25 meets as `host_bonus` (once each, unique on `(user_id, note)`); the points then wait to be claimed like any other task.

**Photo of the week (096)**: members vote (`vote_photo`, one vote per Atlanta Mon–Sun week, movable, not on your own photo) for meet photos posted that week on public, visible meets (`photo_week_entries`). `photo_week_ballot()` gives this week's photos with votes and `my_vote`. `photo_of_the_week()` first runs `settle_photo_weeks()`, which picks each finished week's winner (most votes, earlier photo on a tie) into `photo_winners`, pays `points_settings.photo_points` (default 25, editable next to receipt points) as `photo_bonus` (one per week) and alerts the winner. The points then wait in the checklist. Client: `src/lib/photoWeek.js`, `PhotoOfWeek.jsx` (card under the Discover search, ballot sheet) and a "Vote for Photo of the week" checklist task.

**Underglow and decals (097)**: `vehicles.game_glow` (none/blue/pink/green/red/purple/white) and `game_decal` (none/stripes/side/number). Parts for sale: `glow:neon` (45, one unlock covers every colour), `decal:stripes` 25, `decal:side` 15, `decal:number` 20; `vehicle_parts_guard` now checks them too. Client: `GLOWS`/`DECALS` in rushEngine.js, `lookColumns(look)` turns a look into the vehicles columns (use it instead of listing them), `partId` maps any glow colour to `glow:neon`. 3D: `addUnderglow` (ground pool + sill tubes + a point light) and `addDecal` (pieces raycast onto the paint) in rush3d.js `buildCar`; 2D: glow pool and boot stripes in `drawCar`. Meshes with `userData.noShadow` don't cast shadows in the showroom.

**Meet weather**: `src/lib/weather.js` reads Open-Meteo (free, no key, nothing to set up) for the meet's spot and hours (`meetWindow` uses the next run of weekly/monthly meets; forecasts reach about 15 days). `MeetWeather.jsx` shows it on the meet page, amber with a warning when `alertFor` flags storms, snow/ice, rain ≥ 60%, wind ≥ 30 mph, 98°F+ or 32°F-. The morning reminder run (`api/reminders.js`, via the daily cron) adds the warning to each "Today: …" reminder and sends the host a `meet_weather` heads-up; a forecast outage is skipped, never a failed run. Tests: `test/weather.test.js`.

**TUNR Wrapped (098)**: `my_wrapped(year)` returns your year in one call (meets, check-ins, stayed, top meet/vibe/city/host, first meet, busiest month, best streak, top-percent among people who checked in, points earned/spent, photos and wins, comments, linkups, clubs, hosted, Rush runs and best, main car). `wrappedSlides()` (src/lib/wrappedSlides.js, tested) turns it into story slides and leaves out anything that's zero. `Wrapped.jsx` plays them full screen (tap right/left, hold to pause, auto-advance 6s) and ends with a 1080×1350 share card (system share sheet, or a download). Open from Settings → TUNR Wrapped any time; a banner on the profile offers it in December, and in January for the year before.

**Drag Race** (Arcade, free play): `src/lib/dragEngine.js` is the race (tree: three ambers then green at 2.1 s; tap before green = red light; five gears, shift grades perfect 6,900–7,700 rpm / good / early / late with a shift-time cost; one 2.2 s nitro; fixed 1/120 s steps). Five rivals (`RIVALS`) with reaction, shift point and nitro timing; tuned so sloppy driving beats only the first and a near-perfect run beats the Boss (test/drag.test.js locks this in). ET is from launch like a real strip; the win goes to whoever reaches the stripe first. `dragRender3d.js` draws a night strip (lights, walls with signs, grandstand, distance boards, finish gantry, a working tree) with your garage car via `buildCar` (underglow/decals show). `DragRace.jsx`: ladder, garage pick, result card; progress and bests in localStorage (`tunr.drag.progress`).

**Drag Race with a friend (live)**: Drag Race → RACE A FRIEND. Make a room (4-letter code, shareable link `/?drag=CODE` that opens the app straight into it), join with a code, or Quick match (lobby presence; everyone sorts the lobby the same way and pairs it off, `quickRoomCode`). Transport is Supabase Realtime broadcast + presence (`src/lib/dragNet.js`; no tables, no setup); pure room helpers in `dragRooms.js`. Both tap READY; the host (lower user id) sends `start {seed, round}`. Each phone runs its own tree and car (`newRace(…, { remote: true })`), sends `pos` ~12×/s and `done` with its finish time; the other car is drawn from those reports (`remoteSample`, `remoteDone`). Times count from each phone's own green, so lag never decides the winner, and both phones compute the same result. Red light or never leaving loses; if the other phone goes quiet, you win 15 s after finishing. No points. Testing without Supabase: in dev, localStorage `tunr.fakeNet=1` uses BroadcastChannel between tabs (or `window.__tunrRelay` for Playwright across two browsers). Tests: test/drag.test.js.

**Multiplayer in every game that suits it**: Drag Race, Drift King, Boosted Karts, Turbo Ball and Guess the Car each have a "with a friend · live" button. All share `FriendRoom.jsx` (rooms with a 4-letter code and a share link `/?play=<game>&room=CODE`, Quick match per game, READY/REMATCH, host = lower user id, host's settings via `options`/`settings`/`describe`, optional `prepare()` for data both phones need) and `src/lib/gameNet.js` (Supabase Realtime broadcast + presence; one broadcast event "m" carrying `{ e, p }`; channels `<game>-room-<code>` and `<game>-lobby`). Pure helpers in `gameRooms.js`. How each game syncs:
- Racing (Drag, Drift King, Karts): each phone drives its own car and reports it every 125 ms (`REPORT_MS`); the other car is a `remote` car in the engine (`addRemoteCar`/`applyRemote` in f1Engine, `addRemoteKart`/`applyRemoteKart` in kartEngine), carried along between reports by `remoteMotion.js` (dead reckoning + easing). No AI rivals and no contact between the two. Finish times count from each phone's own start, so lag doesn't decide the winner. Over when both finish, the other leaves, or 30 s after you finish.
- Turbo Ball: the host's phone runs the match (`newMatch({ online: "host" })`, the orange car driven by the guest's controls); it sends `snapshot()` 10×/s. The guest (`online: "guest"`) sends its controls when they change (and every 0.5 s), predicts movement locally, never decides goals or the clock, and takes snapshots with `applySnapshot()` (its own car eased, not snapped; goal/go/overtime/over events worked out from the snapshots). test/soccerOnline.test.js.
- Guess the Car: the host's `prepare` picks 5 cars (photos, or 3D brand specs each phone draws); each phone answers at its own pace and sends `answer` events; points = right ? max(20, 100 − 4 × seconds) : 0.
Message budget: Supabase's free plan allows about 2 million Realtime messages a month (each delivered message counts). Roughly: a 2-lap race ≈ 2,000 messages, a 3-minute Turbo Ball match ≈ 2,500, a drag race ≈ 250, a quiz ≈ 20. If multiplayer gets popular, watch Realtime usage in the Supabase dashboard (Reports → Realtime); the Pro plan raises the limit.

**Car Stack** (Arcade, free play): `src/lib/stackEngine.js` (tested in test/stack.test.js): a crane swings the next car (`hookX`, wider and faster as the tower grows, `swingOf`); tap to `drop`. Landing within 0.22 m of the car below is a perfect (snaps straight; 10 points a floor plus 5 × perfects in a row, up to +25); further off it lands where it fell and the tower leans (`lean`, weighted toward the top) and sways (`swayOf`); more than 55% of a car's length off is a miss (3 lives); a lean past 62% of a car's length topples it. Every tenth car is your garage car. `stackRender3d.js` draws a city lot with lit buildings, the flatbed, the swaying tower (last 36 cars kept), the crane cable, tumbling misses, and a sky that goes day → dusk → night → stars with height. Best height/score in localStorage `tunr.stack.best`.

**Guess the Car (099)**: the cars are `car_pool()`: active `car_puzzles` (admins add photos in Settings → Admin → Guess the Car; admin-only table, so answers never reach the app before a guess) plus members' cars with a photo and a public build page. `car_guess_today()` picks the day's car (Atlanta date, same for everyone) and four options (`car_options`: answer + 3 decoys from the pool and a list of popular cars). `guess_car(choice, seconds)` takes one guess a day and pays 3/2/1 points (≤5 s / ≤12 s / slower) as `guess_bonus`, claimed in the checklist ("Guess today's car" task, shown once there are photos). `car_guess_practice()` is free rounds; with no photos at all, practice is "guess the brand" from 3D front ends. `my_car_guesses()`: played, correct, streak. Client: `src/lib/guessCar.js`, `GuessCar.jsx`, `GuessCarAdmin.jsx`.

**Guess the Car from Wikimedia (100)**: Settings → Admin → Guess the Car → IMPORT runs in the admin's browser (Commons allows browser requests with `origin=*`; it rate-limits shared cloud servers, so this can't run from Vercel or a cloud session). For each car in `CAR_LIST` (src/lib/wikimediaCars.js, ~110 meet cars) it searches Commons and `pickPhoto` keeps one wide (≥1000 px) photo whose title names the car, under CC0 / public domain / CC BY / CC BY-SA only, skipping interiors, engines, details, toys and models, race cars and wrecks. Each saves with `credit` ("Photo: name · licence · Wikimedia Commons") and `source_url` (the file page), which the game shows as a link, as the licences require. `car_puzzles.photo_url` is unique, so re-running only fills gaps; it stops if Commons says slow down. Tests: test/wikimedia.test.js.

**Light mode**: Settings → Appearance → Theme: Dark (default), Light, or Auto (follows the phone). Kept in localStorage `tunr.theme`; a small script in index.html sets `<html data-theme="light">` before the app draws, and `src/lib/theme.js` changes it live (and the browser bar colour). Colours: `scripts/theme-colors.mjs` (`npm run theme`) parses every screen and swaps hard-coded greys and very dark tinted surfaces for `var(--n-xxxxxx)`, bright accent text (gold, mint) for `var(--a-xxxxxx)`, white overlays for `rgba(var(--ink),a)` and near-black bars for `rgba(var(--base),a)`; it writes `src/theme.css` with each variable's dark value (unchanged) and light value (`lightFor`, `darkTextFor`). It leaves accent colours, text on accent buttons, canvas and SVG colours, pure-black dimmers and photo viewers, and the games/3D screens (`DARK_ONLY`). Re-run it after adding screens. Maps switch to Mapbox light-v11.

**Profile counts (101)**: `profile_counts(user)` → `{ went, meets, posts }`: meets checked in at (distinct, not voided), meets posted (not hidden), forum posts (not removed). Your profile shows WENT TO (opens Meet history), MEETS (Meets tab → Posted), POSTS (Posts tab), FOLLOWERS, FOLLOWING; other people's profiles show the same counts plus cars.

**Weekly spin (093)**: a 🎡 card at the top of the checklist opens a 5-slice wheel (1–5 points, `SpinWheel.jsx`); SPIN calls `spin_wheel()`, which picks the number on the server, once per Monday–Sunday Atlanta week (`point_ledger` reason `spin_bonus`, `occurrence` = that Monday, unique), and adds it straight to the balance (already claimed). The wheel turns to land on the server's number. `my_spin()` says whether you've spun and when the next one opens.

**Claiming points (083)**: earned points wait until claimed, Hay Day style. `point_ledger.claimed_at` is null while waiting (a BEFORE INSERT trigger, `point_ledger_hold`, sets it for every positive row except `refund` / `admin_adjust`). Balances count claimed rows only: the migration rewrote every function that does `sum(delta), 0) [into v_x] from public.point_ledger where` to add `claimed_at is not null and`, so **new code must get a balance from `points_balance(uid)` (084), never its own sum**. Voiding a check-in deletes its unclaimed points and revokes the claimed ones (084). Dedupe and done checks still see waiting rows. `claim_points(p_ids bigint[] | null)` claims some or all. The checklist shows READY TO CLAIM (CLAIM ALL / per row) and CLAIM on each task; the badge turns green with the waiting total. Anything that earns points calls `pointsEarned()` (`tunr:points` event) so the badge refreshes; earn toasts say to claim in 📋. Leaderboards and streaks count points when earned.

## Your garage in every game

**How-to videos**: each garage car (row link and the 3D garage INFO tab) links to CarCareKiosk's free repair videos for that make/model/year (`repairLink` in `Showroom.jsx`, `carcarekiosk.com/videos/Make/Model/Year`).

**Clean language (086, 087)**: swear words and slurs become `***` in every chat and everywhere people type (meet titles and descriptions, linkup notes, bios, build notes and models, captions, club/forum descriptions, reports, messages to TUNR: `clean_columns()` triggers on every table, chats included, firing only when those columns are written; 089 retired 086's `clean_body` / `clean_post` and lists every table and column in one place); usernames, club names and forum names with one are refused (`reject_bad_words()`; client `assertClean`). The app masks first (`cleanForSending` in `src/lib/clean.js`) and shows a short warning (`tunr:notice` → toast); a server trigger (`clean_words()`, same regex) masks anything that gets past it. Keep the two lists in step. `test/clean.test.js`.

**Arcade screen**: a TUNR Rush hero card (today's points game) and every game as a phone-style app icon (`AppIcon` in `Arcade.jsx`: gradient art, gloss, badge, progress line). **Track edges**: `edge()` in `f1Render3d.js` holds lines on the inside of a tight bend within its radius, so kerbs and barriers don't fold over (Island Hairpin's hairpin was also widened).

**Paid garage parts (088)**: the big wing, bronze/gold/chrome wheels, lift kit and slammed cost reward points (`garage_parts`, admin prices in Settings → Admin → TUNR Rush, under the scenery prices). Bought once (`unlock_garage_part`; it and `unlock_rush_scenery` both spend through `spend_points()` (089), the one place that checks the claimed balance and writes the ledger), then on every car; all-access accounts own them all. Picking a locked one in the Tuner previews it on the car (not saved) with UNLOCK ⭐ N; `vehicle_parts_guard` stops a car being switched to a part its owner doesn't have (cars that already had one keep it). `src/lib/garageParts.js`.

**App ratings (090)**: "Enjoying TUNR?" stars + optional note (`RatePrompt.jsx`, `app_ratings`), shown now and then by itself (`src/lib/ratePrompt.js`: 5+ visits over 3+ days, 35% chance, at most every 60 days, not for 180 days after rating, never after 3 not-nows) and from Settings → Rate TUNR. After rating, everyone gets the Google review button if `VITE_GOOGLE_REVIEW_URL` is set (never only happy raters; never rewarded). Admin Insights shows the average (`app_rating_summary()`). Google setup steps: `docs/GOOGLE_PROFILE.md`; structured data, robots.txt and sitemap.xml are in place.

**Boosted receipts (091)**: anyone can upload a receipt or invoice from any Boosted business (detailing, photography, merch, other) in Points & rewards → GOT A BOOSTED RECEIPT? (`ReceiptForm`, `submitReceipt`): the photo goes to the private `receipts` bucket (owner + admins only), `submit_receipt()` checks it (one claim per receipt number, one receipt a day (092)) and alerts admins. Admins check it in Settings → Admin → Purchases → RECEIPTS TO CHECK (view the photo, fix the amount, approve or turn down with a reason); approval pays a flat `points_settings.receipt_points` (10 by default, set in Admin → Purchases → RATES; 092) as a 'purchase' row that waits in the checklist. **Detailing tiers**: `DETAIL_TIERS` in `src/lib/feedback.js` (Express $75, Deep Clean $125, Showroom $225, 10% off with TUNR), add-ons and the sponsors list; `request_detail()` accepts the tier names.

**Car models** (`buildCar` in `src/lib/rush3d.js`; Lamborghini/Ferrari/McLaren coupes use the low `exotic` wedge shape): each body is a side profile extruded across the car, then bent into shape (`bodyFit`: nose and tail round in, sides lean in toward the roof, the bottom tucks under, hood and roof crown) and smooth-shaded. Your own car (`sport`) gets a finer mesh (`refine`, crack-free edge splitting), flush wheels with tire sidewalls, brake discs and calipers, side skirts, door seams and handles, window trim and headlight housings; lights, grilles and trim are ray-cast onto the curved surface. Traffic stays on the lighter mesh so the games stay fast.

Each Arcade game has a "Your garage" row (`GarageRow` / `useGarageCar` in `Showroom.jsx`; the pick is kept per game in localStorage as `tunr.<game>.car`, "game" for the game's own car, default your main car):
- **TUNR Rush**: drives your car with its full style (paint, body, wing, wheels, ride height).
- **Drift King**: your car's 3D model (`rush3d.js` `buildCar`) races as the nearest class (`CLASS_FOR_BODY`: hatch/coupe → Tuner, sedan → GT, SUV/truck → Muscle); rivals drive that class.
- **Turbo Ball**: your car's model in place of the battle car (same physics), with the blue ring under it.
- **Park Up**: your car's paint and top-down shape on the same footprint, so stars stay fair.
- **Boosted Karts**: your kart wears your car's paint.
The 3D garage's DRIVE IN TUNR RUSH and "Or play it in" buttons open a game with that car picked (`play:<game>:<car id>`).

## Real cars in 3D: body and brand

- **Body**: until someone picks one in Style, a car's body (coupe, sedan, hatch, SUV, truck) comes from its make and model, chassis codes included (`guessBody` in `rushEngine.js`; "540i (G30)" → sedan, "M4 (F82)" → coupe, "F-150" → truck). `test/f1.test.js` checks 38 real cars. The add-a-car form says which body it will be and has a paint picker (saved to `game_color`).
- **Brand**: `brandOf(make)` picks a front end in `rush3d.js` `buildFront`: simple shapes that read as the brand (BMW twin grille and ring lights, Audi rings, Mercedes star, Subaru hood scoop, Jeep slots, MINI round lights, Genesis crest and so on), not copies of any real car. Every 3D car now has headlights, a grille and amber side markers. Car cards show the front three-quarters.
- 082 adds 27 more makes (Jeep, Ram, GMC, Cadillac, Volvo, Land Rover, MINI and others).

## First open: welcome page, then terms for new accounts

Someone new (not signed in, nothing agreed on this device) sees `Welcome.jsx`: Continue with Google (when Google is on), Sign up with email, Log in, or Continue as guest. A guest agrees with the line by the guest button (`saveTosAccepted(null, "guest_welcome")`, kept on the device only). Accounts agree on the full terms screen: right after signing up, and again only when `TOS_VERSION` changes; it has a "Don't agree? Sign out" way out. The device's record of agreement now notes which account agreed (`userId`), so a guest's agreement never counts for a new account (`hasAcceptedCurrentTos(userId)`, `syncTosToAccount`). The sign-up form no longer counts as agreeing. Phone sign-in isn't offered: it needs a paid SMS provider in Supabase, and accounts depend on a confirmed email (unconfirmed ones are removed after 7 days), so phone-only accounts would need those rules changed first.

