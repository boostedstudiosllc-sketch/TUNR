import { test } from "node:test";
import assert from "node:assert/strict";
import { citySlug, cityName, upcoming, eventJsonLd, meetBody, meetsPage, sitemapXml, injectPage, escapeHtml } from "../api/_lib/seo.js";

const origin = "https://tunr.test";
const now = new Date("2026-11-24T17:00:00Z"); // Tue Nov 24, noon in Atlanta
const meet = (over = {}) => ({
  slug: "friday-meet",
  title: "Friday Night Meet",
  host: "atlmeets",
  city: "Alpharetta, GA",
  location: "3393 Peachtree Rd",
  lat: 34.07,
  lng: -84.27,
  description: "JDM and Euro, all welcome.",
  start_at: "2026-11-28T00:00:00Z", // Fri Nov 27, 7 PM ET
  end_at: "2026-11-28T03:00:00Z",
  timezone: "America/New_York",
  visibility: "public",
  locked: false,
  vibe: "JDM",
  ...over,
});

test("city slugs and names", () => {
  assert.equal(citySlug("Alpharetta, GA"), "alpharetta");
  assert.equal(citySlug("Stone Mountain, GA"), "stone-mountain");
  assert.equal(citySlug(""), "");
  assert.equal(cityName("Atlanta, GA"), "Atlanta");
});

test("upcoming: public meets in the window, soonest first; private, cancelled, hidden and past ones left out", () => {
  const rows = [
    meet({ slug: "later", start_at: "2026-12-05T00:00:00Z", end_at: null }),
    meet(),
    meet({ slug: "private", visibility: "private", locked: true }),
    meet({ slug: "cancelled", cancelled_at: "2026-11-20T00:00:00Z" }),
    meet({ slug: "hidden", hidden: true }),
    meet({ slug: "past", start_at: "2026-11-20T00:00:00Z", end_at: "2026-11-20T03:00:00Z" }),
    meet({ slug: "far", start_at: "2027-06-01T00:00:00Z", end_at: null }),
    meet({ slug: null }),
  ];
  assert.deepEqual(upcoming(rows, now).map((x) => x.row.slug), ["friday-meet", "later"]);
});

test("a weekly meet's next date", () => {
  const [x] = upcoming([meet({ slug: "weekly", recurrence: "weekly:WED", start_at: "2026-01-07T23:00:00Z", end_at: "2026-01-08T02:00:00Z" })], now);
  assert.equal(x.dates.start.toISOString(), "2026-11-25T23:00:00.000Z", "this Wednesday 6 PM ET");
  assert.equal(x.dates.end.toISOString(), "2026-11-26T02:00:00.000Z", "3 hours later");
});

test("Event data: dates, place, status; none for private meets", () => {
  const ld = eventJsonLd(meet(), { origin, now });
  assert.equal(ld["@type"], "Event");
  assert.equal(ld.startDate, "2026-11-28T00:00:00.000Z");
  assert.equal(ld.endDate, "2026-11-28T03:00:00.000Z");
  assert.equal(ld.eventStatus, "https://schema.org/EventScheduled");
  assert.deepEqual(ld.location.address, { "@type": "PostalAddress", streetAddress: "3393 Peachtree Rd", addressLocality: "Alpharetta", addressRegion: "GA", addressCountry: "US" });
  assert.equal(ld.url, "https://tunr.test/m/friday-meet");
  assert.equal(ld.organizer.name, "atlmeets");
  assert.equal(eventJsonLd(meet({ cancelled_at: "2026-11-20T00:00:00Z" }), { origin, now }).eventStatus, "https://schema.org/EventCancelled");
  assert.equal(eventJsonLd(meet({ visibility: "private", locked: true, location: null }), { origin, now }), null);
  assert.equal(eventJsonLd(meet({ location: "Avalon" }), { origin, now }).location.address.streetAddress, undefined, "a venue name isn't a street address");
});

test("meet page text: escaped, cancelled shown, private place never written", () => {
  const body = meetBody(meet({ title: "<b>Meet</b>" }), { origin, now });
  assert.ok(body.includes("&lt;b&gt;Meet&lt;/b&gt;"));
  assert.ok(body.includes("Where: 3393 Peachtree Rd, Alpharetta, GA"));
  assert.ok(body.includes('href="https://tunr.test/meets/alpharetta"'));
  assert.ok(meetBody(meet({ cancelled_at: "x", cancel_reason: "Rain" }), { origin, now }).includes("<strong>Cancelled.</strong> Rain"));
  const priv = meetBody(meet({ locked: true, location: null, description: null }), { origin, now });
  assert.ok(priv.includes("Private meet"));
  assert.ok(!priv.includes("Peachtree"));
});

test("/meets and /meets/<city>", () => {
  const rows = [meet(), meet({ slug: "atl", title: "ATL Cars & Coffee", city: "Atlanta, GA" })];
  const all = meetsPage(rows, { origin, now });
  assert.match(all.title, /Car meets in Georgia/);
  assert.ok(all.body.includes('href="https://tunr.test/m/atl"') && all.body.includes('href="https://tunr.test/m/friday-meet"'));
  assert.ok(all.body.includes('href="https://tunr.test/meets/atlanta"'), "links each city");
  assert.deepEqual(all.jsonLd.map((d) => d["@type"]), ["ItemList", "FAQPage"]);
  const atl = meetsPage(rows, { origin, now, city: "atlanta" });
  assert.match(atl.title, /Car meets in Atlanta, GA/);
  assert.ok(!atl.body.includes("friday-meet"));
  assert.equal(atl.jsonLd.length, 1);
  assert.equal(meetsPage(rows, { origin, now, city: "macon" }).empty, true);
});

test("sitemap: home, /meets, cities, upcoming public meets only", () => {
  const xml = sitemapXml([meet(), meet({ slug: "secret", visibility: "private", locked: true }), meet({ slug: "a&b", city: "Atlanta" })], { origin, now });
  for (const u of ["https://tunr.test/", "https://tunr.test/meets", "https://tunr.test/meets/alpharetta", "https://tunr.test/meets/atlanta", "https://tunr.test/m/friday-meet", "https://tunr.test/m/a%26b"]) assert.ok(xml.includes(`<loc>${u}</loc>`), u);
  assert.ok(!xml.includes("secret"));
});

test("injectPage swaps the tags and the readable text", () => {
  const index = `<html><head><title>TUNR</title><meta name="description" content="x" /><meta property="og:title" content="x" /><link rel="canonical" href="https://tunr.test/" /></head><body><div id="root"><!--seo--><main>home</main><!--/seo--></div></body></html>`;
  const html = injectPage(index, { title: "A & B", description: "D", url: "https://tunr.test/meets", jsonLd: [{ a: "</script>" }], body: "<main>meets</main>", noindex: true });
  assert.ok(html.includes("<title>A &amp; B</title>"));
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes('href="https://tunr.test/meets"'));
  assert.ok(html.includes("<main>meets</main>") && !html.includes("<main>home</main>"));
  assert.ok(html.includes('content="noindex"'));
  assert.ok(!html.includes("</script>\"}"), "JSON can't close its script tag");
  assert.equal(escapeHtml('"<'), "&quot;&lt;");
});
