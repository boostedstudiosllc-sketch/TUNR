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

## Deploy (Vercel)

1. vercel.com → Add New → Project → import this repo
2. Set the production branch to this branch (or merge to `main`)
3. Add env var `VITE_MAPBOX_TOKEN` with your Mapbox public token
4. Deploy — Vercel auto-detects Vite

## Content policy

Meets promoting street racing, takeovers, or other illegal activity are not
listed. See the in-app posting flow for the full rules.
