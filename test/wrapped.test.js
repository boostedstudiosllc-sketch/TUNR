import { test } from "node:test";
import assert from "node:assert/strict";
import { wrappedSlides, wrappedYearToOffer, shareStats } from "../src/lib/wrappedSlides.js";

const year = {
  year: 2026, username: "karan", checkins: 14, meets: 9, stayed: 3, cities: 3, top_city: "Atlanta, GA",
  top_meet: { title: "Cobb Cars & Coffee", times: 5 }, top_vibe: "JDM", first_meet: { title: "Tuner Night", at: "2026-03-07T00:00:00Z" },
  busiest_month: "June", best_streak: 6, top_percent: 4, points_earned: 1240, points_spent: 300,
  hosted: 0, photos: 12, photo_wins: 1, comments: 0, linkups: 2, clubs: 0, rush_runs: 31, rush_best: 2600,
  car: { year: 2019, make: "Subaru", model: "WRX STI" },
};

test("wrapped: a full year tells the whole story, in order", () => {
  const s = wrappedSlides(year);
  assert.deepEqual(s.map((x) => x.id), ["intro", "meets", "fave", "scene", "streak", "points", "made", "rush", "car", "share"]);
  assert.equal(s[1].big, "9");
  assert.deepEqual(s[1].lines, ["14 check-ins in all.", "You stayed to the end 3 times.", "That's the top 4% of TUNR."]);
  assert.equal(s[2].lines[1], "It started with Tuner Night in March.");
  assert.equal(s[3].lines[1], "Meets in 3 cities, mostly Atlanta, GA.");
  assert.equal(s[5].big, "⭐ 1,240");
  assert.deepEqual([s[6].big, ...s[6].lines], ["Posted 12 photos", "Won Photo of the week 1 time", "Started 2 linkups"]);
  assert.equal(s[8].big, "2019 Subaru WRX STI");
});

test("wrapped: quiet parts are left out, and no meets is a short story", () => {
  const s = wrappedSlides({ ...year, best_streak: 1, points_earned: 0, photos: 0, photo_wins: 0, linkups: 0, rush_runs: 0, top_percent: 80, car: null });
  assert.deepEqual(s.map((x) => x.id), ["intro", "meets", "fave", "scene", "share"]);
  assert.equal(s[1].lines.length, 2);
  const none = wrappedSlides({ year: 2026, username: null, checkins: 0, car: null });
  assert.deepEqual(none.map((x) => x.id), ["intro", "empty"]);
  assert.equal(none[0].lines[0], "You, here's your year in cars.");
  assert.deepEqual(wrappedSlides(null), []);
});

test("wrapped: offered in December, and in January for last year", () => {
  assert.equal(wrappedYearToOffer(new Date(2026, 11, 3)), 2026);
  assert.equal(wrappedYearToOffer(new Date(2027, 0, 20)), 2026);
  assert.equal(wrappedYearToOffer(new Date(2026, 9, 29)), null);
  assert.deepEqual(shareStats(year)[0], ["9", "MEETS"]);
});
