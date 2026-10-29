# TUNR on Google: setup kit

Everything here is ready to paste. Each step needs **your** Google account, because Google
sends the verification code to the owner. Claude can't sign in for you.

## What's already done in the app
- The site tells Google what TUNR is, using structured data in `index.html`: the name, logo, a
  description, that it's run by Boosted Studios LLC, that it serves Georgia, and that it's a
  free app. This is what Google's search card uses.
- `robots.txt` and `sitemap.xml` are live, so Google can find and crawl the site.
- The "Enjoying TUNR?" pop-up offers a Google review button as soon as you set
  `VITE_GOOGLE_REVIEW_URL` (see step 3).

## 1. Google Search Console (free, 10 minutes)
This gets TUNR into Google search.
1. Go to search.google.com/search-console and click **Add property**, then **URL prefix**.
   Enter `https://tunr-gules.vercel.app/`.
2. Verify it with the **HTML tag** option. Send Claude the tag and it will add it to
   `index.html` (it's not a secret).
3. Go to **Sitemaps** and submit `sitemap.xml`.
4. Recommended: buy a short domain such as tunr.app (about $12 a year), add it in Vercel, and
   repeat these steps for it. It looks more trustworthy than a vercel.app address.

## 2. Google Business Profile (the map listing and reviews)
**Important:** Google doesn't allow online-only businesses on Business Profile, so TUNR (an
app) can't have one on its own. **Boosted Studios LLC can.** It does in-person work
(photography and detailing) around Atlanta. Set it up as a **service-area business** with the
address hidden, and mention TUNR in it.

Go to business.google.com, choose **Add business**, and paste:

| Field | Paste |
|---|---|
| Business name | Boosted Studios |
| Primary category | Car detailing service |
| Extra categories | Photographer · Event planner |
| Service areas | Atlanta, GA · Metro Atlanta · Georgia |
| Address | Your address (it's only for verification; tick **hide my address**) |
| Phone | Your business phone |
| Website | https://tunr-gules.vercel.app/ |

**Description** (up to 750 characters):
> Boosted Studios is the team behind TUNR, Georgia's car scene app. Find car meets near you,
> RSVP, check in for reward points, show off your build in a 3D garage and play free car
> games, all at tunr-gules.vercel.app. We also do automotive photography and detailing around
> Metro Atlanta: rolling shots, meet coverage, full details and interior and exterior work.
> Bring your car, we'll make it look its best.

**Services to list:** Full detail · Interior detail · Exterior detail · Automotive
photography · Car meet coverage.

**Photos:** the TUNR logo (`public/icon-512.png`), 3 to 5 shots from your meets, and a cover
photo of a lineup of cars.

Google verifies by video, phone or postcard. When it's verified, open the profile and click
**Ask for reviews** to copy the review link.

## 3. Turn on the Google review button in the app
In Vercel go to **Settings → Environment Variables**, add `VITE_GOOGLE_REVIEW_URL` set to the
link from step 2, then redeploy. The rating pop-up then shows **⭐ REVIEW TUNR ON GOOGLE** to
everyone who rates.

Two rules keep the profile safe:
- **Ask everyone, not only the happy people.** The app already does this: the button shows
  whatever stars someone gives. Google removes profiles that filter who gets asked.
- **Never pay for reviews.** No reward points or discounts for a Google review. That breaks
  Google's rules and the FTC's.

## 4. Optional: Google Play
To get TUNR in the Play Store with Play Store reviews, wrap the web app with PWABuilder
(pwabuilder.com, free) and open a Google Play developer account ($25 once).
- **Short description (80 characters):**
  > Georgia car meets: find, RSVP, earn points, 3D garage and car games.
- **Full description:** use the Business Profile description above, followed by a
  bullet list of features (meets map, check-in points, clubs, linkups, the 3D garage, the
  arcade).
