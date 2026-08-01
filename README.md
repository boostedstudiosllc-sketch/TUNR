# TUNR

Find car meets near you. A mobile-first React app for discovering, RSVPing to, and posting local car meets — seeded with real Atlanta-area events.

## Stack

- React 18 + Vite
- Mapbox GL (map tab + static maps in event details)
- localStorage persistence for RSVPs and user-posted meets (designed to swap to Supabase)

## Project layout

```
src/
  data/events.js        # seed events (real GA meets, with sources)
  lib/dates.js          # recurrence + date display/filter logic
  lib/store.js          # data layer: seed + localStorage (future: Supabase)
  components/
    MeetCard.jsx        # event card w/ RSVP buttons
    MeetDetail.jsx      # bottom-sheet detail view
    MapView.jsx         # Mapbox GL map with vibe-colored pins
    SubmitMeet.jsx      # 2-step post-a-meet flow
  App.jsx               # tabs, filters, state
```

## Run locally

```bash
cp .env.example .env.local   # then set VITE_MAPBOX_TOKEN
npm install
npm run dev
```

The app works without a Mapbox token — the map tab shows a placeholder and event
detail maps are hidden until `VITE_MAPBOX_TOKEN` is set.

## Backend (Supabase)

1. Create a Supabase project and run `supabase/migrations/001_init.sql` in the
   SQL Editor (schema, row-level security, seed events).
2. In Supabase: Authentication → URL Configuration → set Site URL to your
   deployed URL (email sign-in links redirect there).
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars.

Without these vars the app runs in guest mode: seed events + device-local
RSVPs and posts.

## Deploy (Vercel)

1. vercel.com → Add New → Project → import this repo
2. Set the production branch to this branch (or merge to `main`)
3. Add env vars: `VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Vite

## Content policy

Meets promoting street racing, takeovers, or other illegal activity are not
listed. See the in-app posting flow for the full rules.
