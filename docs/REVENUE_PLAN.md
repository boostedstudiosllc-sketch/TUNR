# TUNR revenue plan (Nov 2026)

How the biggest apps make money, and the version of each that fits a
meet-first car app. Ordered by what to build first. Points stay free and
can't be bought (that keeps scratch cards and rewards on the right side of
the law); money comes from members, hosts, shops and sponsors.

## What the winners do

| App | Main money | What to take from it |
|---|---|---|
| Duolingo | Freemium subscription (Super, Max); $1.04B revenue in 2025, 12.2M paid subscribers | Streaks + a paid tier that protects them (streak freeze). Higher tiers raise revenue per user. |
| Strava | ~90% from a Premium subscription (about $80/yr); sponsored brand challenges | A small share of users paying (2–15%) is enough when the free app is great. Brands pay for challenges. |
| Eventbrite | Per-ticket service fee (flat + %); promoted listings growing fastest | A fee on paid tickets; hosts pay to promote events. |
| Whatnot | ~8% commission + payment fee on sales (about 12.5% effective) | A cut of marketplace sales; lower rates for big sellers. |
| CarMeets, GarageApp | Paid tiers ($5–6/mo), paid promotion and featured listings | Car fans pay small subscriptions; hosts pay to be featured. A paywall at sign-up gets complaints: don't. |

## TUNR's plan, in order

1. ✅ **Built (Nov 2026): promoted meets** (Featured / Spotlight, Stripe Checkout; see DEVELOPER_HANDOFF.md). Sponsored banner slides for shops can use the Home banner admin today. Original idea: **Promoted meets and sponsored banner slides** (easiest, no app-store cut: sold to hosts and shops on the web). A host pays to pin a meet at the top of Discover, put it in the Discover banner, and alert members nearby. Suggested: $15 for a week of featured listing, $25 with a banner slide, $10 per "alert members within 25 mi". Built on: the Discover banner (119), meet alerts.
2. **Boosted shops: paid listing for local businesses** (detailers, tint, wraps, tuners). Monthly ($29–49) for a verified shop page, deals for members, and a monthly banner slot. Built on: Boosted businesses, member discounts.
3. **Paid tickets for car shows and registrations.** Hosts sell show-car entry and spectator tickets in TUNR; buyer pays a service fee (for example $0.99 + 3%). Stripe Connect pays hosts directly. Biggest long-term revenue, more work (payouts, refunds, check-in scanning; QR check-ins already exist).
4. ✅ **Built (Nov 2026): TUNR+ membership** ($4.99/mo or $39.99/yr, Stripe subscriptions; see DEVELOPER_HANDOFF.md). Perks today: member shop discounts, a streak restore once a month, profile colors, every garage car and starting a club without invites, every Park Up level. (Welcome points are off until a lawyer OKs them: points buy scratch cards.) Ideas for later: bigger convoys, early RSVP to limited meets. Not a free monthly scratch card: paid members getting chances to win is the gambling problem below. On the web, Stripe; in the App Store app, Apple's in-app purchase rules apply (check current rules for linking to web checkout).
5. **Sponsored challenges** (Strava-style): a brand sponsors "Detail Week" or a TUNR Rush season; members earn points, the brand gets its logo, banner and a giveaway. Sold per campaign.
6. **Parts marketplace fee** (Whatnot-style, later): optional secure checkout on Parts listings at 6–8%, or paid "bump to top". Needs payments, disputes and shipping first.
7. ✅ **Built (Nov 2026): merch shop** (a hat and a shirt, Stripe Checkout with shipping, TUNR+ members 10% off; Settings → Admin → Merch shop → OPEN THE SHOP when photos and stock are in).
8. **Photographer packs**: meet photographers sell full-resolution photo packs; TUNR keeps 15%.

## Don't

- Don't sell points or let money buy scratch cards (gambling rules).
- Don't paywall sign-up or the core meet list.
- Don't sell members' data or exact locations.

## Sources

- Sensor Tower, State of Mobile 2026: https://sensortower.com/press/press-release-boosted-by-gen-ai-services-consumers-spent-more-money-in-apps-than-games-for-first-time
- Duolingo FY2025 results: https://investors.duolingo.com/node/11661/html
- Strava (Sacra estimates): https://sacra.com/research/strava
- Eventbrite FY2025 10-K: https://www.sec.gov/Archives/edgar/data/1475115/000147511526000005/eb-20251231.htm
- Whatnot take rate (Sacra): https://sacra.com/research/whatnot-at-359m-yr/
- CarMeets (App Store): https://apps.apple.com/us/app/carmeets/id1422571802?l=ko
- GarageApp (App Store): https://apps.apple.com/us/app/-/id6444295085
