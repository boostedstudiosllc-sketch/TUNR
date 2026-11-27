// What the Help assistant knows (api/_routes/help.js sends it to the AI with
// every question). Plain facts about the app, written for members. Keep it
// in step with the app: when a feature changes, change it here too.

export const HELP_SUGGESTIONS = [
  "How do I post a meet?",
  "How do points work?",
  "How does the parts fit check work?",
  "How do I turn on alerts?",
  "How do I cancel TUNR+?",
  "What's a linkup?",
];

export const HELP_GUIDE = `
TUNR is a free app for Georgia's car scene, made by Boosted Studios LLC. It works in any phone browser and can be added to the home screen. Contact: boostedstudiosllc@gmail.com, or Profile → ⚙️ Settings → Contact us.

THE TABS (bottom of the screen)
- Discover: upcoming car meets, car shows and cruise-ins. Filters (All, Following, Today, This Weekend, vibes like JDM, Euro, Exotic, Domestic, Truck), search, sort (soonest, most going, nearest), a month calendar view, and the banner slides at the top.
- Map: meets on a map, filtered by time (on now, next 2 hours, tonight, or a custom range), with optional photo-spot pins.
- Community: Linkups, Forums, Clubs and Parts (the parts marketplace).
- My Meets: meets you RSVP'd to.
- Perks: points, rewards, partner discounts, the Arcade (games), TUNR Tuesdays, scratch cards and the merch shop.
- Profile: your garage, meets, posts and clubs. Settings are behind the ⚙️ on your profile.
- Top bar: ☀️/🌙 switches light and dark mode (Settings → Theme also has Auto, which follows your phone), P is "where I parked", 📋 is your checklist of points to claim, 🔔 is your alerts inbox, + POST MEET posts a meet.

ACCOUNTS
- Sign up with email and password. You must be 18 or older.
- Confirm your email by tapping the link we email you. Until you do, you can browse and RSVP, but not chat, post, or use linkups. Unconfirmed accounts are deleted after 7 days (after two emails). Didn't get it? Check spam, or use "Resend email" at the top of the app.
- Forgot your password: on the log-in screen, tap "Forgot password".
- Delete your account: Profile → ⚙️ Settings, at the bottom → DELETE MY ACCOUNT. It can't be undone.

MEETS
- Open a meet for the date, time, place, weather, who's going, the meet chat, photos, and buttons: NAVIGATE (Google Maps), 🚙 WAZE, CALENDAR, PARKED (remember where you parked), SHARE (a picture card you can save or share).
- RSVP: GOING, MAYBE or NOT GOING. When going, pick how: with your car, as a photographer, or both. Tap your answer again to take it back.
- Follow a host from the meet page to see their meets under the Following filter.
- If a meet is cancelled or moved (new time or place), everyone who said going or maybe gets an alert. Cancelled meets show a ❌ CANCELLED banner and don't take RSVPs.
- Something wrong with a listing? Use "Something wrong with this meet? Tell us" on the meet page.
- Private meets: the place is hidden until the host lets you in (passcode or a join request).

POSTING A MEET (hosts)
- Tap + POST MEET. Upload a flyer and TUNR's AI fills in the details (check them), or type them in. Add the address so it gets a map pin. Meets can repeat weekly or monthly.
- Edit with ✎ EDIT on your meet. Cancel with CANCEL MEET (optional reason), and PUT THIS MEET BACK ON to undo it.
- Co-hosts: invite by username from your meet. Host verification (a ✓ next to your host name) is in Settings → Host verification.
- 🚀 PROMOTE THIS MEET: a paid boost. Featured pins it at the top of Discover; Spotlight also adds a banner slide and one alert to members nearby. Prices are shown before you pay. Promotion buys placement, not a number of people.
- Fan awards: hosts can turn on awards (Best Build, Best Interior and so on, or their own) and members vote.
- Hosts are fully responsible for their meets. Street racing, burnouts, takeovers and anything illegal are banned.

LINKUPS AND "WHO'S DOWN?"
- A linkup is a quick get-together today or tomorrow: photos, cruise or hang, public or private. Start one from Community → Linkups → START A LINKUP. One live linkup per person, 6 a day. Everyone agrees to the linkup rules once.
- 🙋 WHO'S DOWN? asks people nearby before you pick a spot (now, tonight or tomorrow). People with linkup alerts on get told and tap I'M DOWN. Then tap MAKE IT A LINKUP, and everyone who was down is told it's on. Your spot is rounded to about half a mile and others only see the distance.
- CONVOY: drive together and see each other on a live map. Only people in the convoy see your location, and only while you share it. Don't use your phone while driving: let a passenger handle it.

PARTS MARKETPLACE (Community → Parts)
- Buy and sell car parts. Every listing says what car it fits (make, model, years, optional trim or chassis code, "only fits cars with…", part number) or Universal.
- 🚗 Fits which car? filters to parts for a car in your garage or any car.
- Fit check: each listing is compared with your garage cars: ✅ FITS YOUR CAR, ⚠️ CHECK FIT, ❌ WON'T FIT, ❓ no fitment given. It's an estimate from what the seller entered and what your garage says. It can be wrong. Always confirm with the part number, your VIN, the seller, or a mechanic before you buy. TUNR isn't part of the sale.
- Message the seller from the listing. Payment, shipping, pickup and returns are agreed between buyer and seller, not TUNR. Meet in a public place in daylight. Never send money to someone you haven't verified.
- Alerts: "Parts for my car" (Settings → Alerts) tells you when a part for a car in your garage is listed, and when you add a car that parts are already listed for.
- Not allowed: stolen parts, parts with VINs removed, emissions-defeat devices, airbags, recalled items, anything illegal to sell.

GARAGE
- Profile → Garage → + ADD CAR: year, make, model, photos, build sheet (trim, engine, power, mods, features like adaptive headlights). Adding the trim and features makes the parts fit check more accurate.
- VIN (optional): decode it to fill in the details. Only you can see it.
- 3D garage: your cars on a turntable; drive them in the games.
- A second car unlocks after you invite one friend who joins.

POINTS AND REWARDS (Perks tab)
- Earn points by checking in at meets (you must actually be there; check-in uses your location), the Daily Pit Stop, streaks, TUNR Rush, TUNR Tuesdays picks, invites, getting-started steps, Boost Day, and purchases from Boosted Studios. Claim waiting points from the 📋 checklist.
- Boost Day: one weekday a week, opt in, RSVP Going to a meet before it starts, check in there and stay 20 minutes for bonus points. Members find out on the day.
- Comeback bonus: if you've been away a while you may get an alert with bonus points to claim within 48 hours. Turn these off in Settings → Alerts → Comeback rewards.
- Spend points on rewards, scratch cards, TUNR Rush scenery and stickers. One free scratch card a week.
- Points have no cash value, can't be sold or transferred, and can be changed or removed for cheating.

TUNR+ MEMBERSHIP
- $4.99 a month or $39.99 a year. Includes members-only perks and discounts, restoring a lost Daily Pit Stop streak once every 30 days, and more. Join from Perks or Settings → TUNR+ membership.
- Cancel any time: Settings → TUNR+ membership → MANAGE BILLING (card, plan, cancel). You keep the benefits until the end of the period you paid for. Payments aren't refundable except where the law requires.

MERCH SHOP
- Perks → TUNR MERCH: hats and shirts. Pick a size, check out by card. TUNR+ members get a discount. Track orders under "Your orders". Problems with an order: email us.

ALERTS
- Turn on phone alerts in Settings → Alerts (on iPhone, add TUNR to your home screen first: Share → Add to Home Screen). Choose what you hear about: linkups near you, meet reminders, activity, promoted meets, Boost Day, parts for my car, comeback rewards.

COMMUNITY
- Forums: posts, votes and comments; anyone with a confirmed email can start one. Clubs: car clubs and crews with chat.
- Photo spots: places to shoot cars, with directions. Respect property rules; no trespassing.
- Block or report anyone from their profile or a comment. Reports are reviewed within 24 hours.

ARCADE (Perks)
- Free games: TUNR Rush (the one that earns points, once a day), Drift King, Boosted Karts, Turbo Ball, drag racing, Park Up, Car Stack, Guess the Car and more. Some can be played with a friend.

PRIVACY AND SAFETY
- Your exact location is only used when you choose: checking in, convoys, "who's down", distances. Private info stays private. See Settings → Privacy Policy and Terms of Service.
- Attending meets and linkups is at your own risk. TUNR lists meets but doesn't organize or supervise them.

WHEN SOMETHING GOES WRONG
- Error messages say why in plain words. "No connection": check your signal. "You've been signed out": log in again. "TUNR's server is having trouble": try again in a minute.
- Still stuck: Settings → Contact us, or email boostedstudiosllc@gmail.com.
`.trim();
