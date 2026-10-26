import test from "node:test";
import assert from "node:assert/strict";
import { linkupStatus, sortLinkups, pickedStart, defaultPick, startProblem } from "../src/lib/linkupTime.js";
import { judgeReverse } from "../src/lib/geocode.js";
import { friendlyWriteError } from "../src/lib/errors.js";

const NOW = new Date("2026-10-16T22:00:00Z"); // 6:00 PM in Atlanta
const at = (mins) => new Date(NOW.getTime() + mins * 60000).toISOString();
const L = (over) => ({ startsAt: at(30), endsAt: at(150), cancelled: false, myRole: null, ...over });

test("linkup timing reads naturally", () => {
  assert.equal(linkupStatus(L({ startsAt: at(35) }), NOW).text, "In 35 min · 6:35 PM");
  assert.equal(linkupStatus(L({ startsAt: at(90) }), NOW).text, "In 1 hr 30 min · 7:30 PM");
  assert.equal(linkupStatus(L({ startsAt: at(1) }), NOW).text, "Starting now");
  const live = linkupStatus(L({ startsAt: at(-20), endsAt: at(100) }), NOW);
  assert.deepEqual([live.live, live.text], [true, "Live · until 7:40 PM"]);
  assert.equal(linkupStatus(L({ startsAt: at(-200), endsAt: at(-10) }), NOW).text, "Ended");
  assert.equal(linkupStatus(L({ cancelled: true }), NOW).text, "Cancelled");
  assert.equal(linkupStatus(L({ startsAt: at(150) }), NOW).text, "In 2 hr 30 min · 8:30 PM");
  assert.equal(linkupStatus(L({ startsAt: at(240) }), NOW).text, "Today · 10:00 PM");
  assert.equal(linkupStatus(L({ startsAt: at(15 * 60) }), NOW).text, "Tomorrow · 9:00 AM");
});

test("picking a linkup's start time on the wheel", () => {
  const now = new Date(2026, 9, 16, 18, 2); // 6:02 PM, phone's clock
  assert.deepEqual(defaultPick(now), { day: "today", hour: 6, minute: 35, ampm: "PM" });
  assert.deepEqual(defaultPick(new Date(2026, 9, 16, 23, 50)), { day: "tomorrow", hour: 12, minute: 20, ampm: "AM" });
  const tonight = pickedStart({ day: "today", hour: 9, minute: 30, ampm: "PM" }, now);
  assert.equal(tonight.getTime(), new Date(2026, 9, 16, 21, 30).getTime());
  const noon = pickedStart({ day: "tomorrow", hour: 12, minute: 0, ampm: "PM" }, now);
  assert.equal(noon.getTime(), new Date(2026, 9, 17, 12, 0).getTime());
  const midnight = pickedStart({ day: "tomorrow", hour: 12, minute: 15, ampm: "AM" }, now);
  assert.equal(midnight.getTime(), new Date(2026, 9, 17, 0, 15).getTime());
  assert.equal(startProblem(tonight, now), null);
  assert.match(startProblem(pickedStart({ day: "today", hour: 9, minute: 0, ampm: "AM" }, now), now), /already passed/);
});

test("yours first, then nearest, then soonest", () => {
  const list = [
    { id: "far", miles: 20, startsAt: at(10) },
    { id: "near", miles: 2, startsAt: at(90) },
    { id: "asked", miles: 30, startsAt: at(60), myRole: "requested" },
    { id: "mine", miles: 40, startsAt: at(100), myRole: "host" },
    { id: "unknown", miles: null, startsAt: at(5) },
  ];
  const order = sortLinkups(list, (l) => l.miles).map((l) => l.id);
  assert.deepEqual(order.slice(0, 2), ["mine", "asked"]);
  assert.ok(order.indexOf("near") < order.indexOf("far"));
  assert.deepEqual(sortLinkups(list.slice(0, 2), () => null).map((l) => l.id), ["far", "near"]);
});

test("reverse geocoding gives a street and the area", () => {
  const json = {
    features: [
      {
        id: "address.1",
        place_type: ["address"],
        address: "250",
        text: "Jackson Street Northeast",
        context: [
          { id: "neighborhood.1", text: "Old Fourth Ward" },
          { id: "place.1", text: "Atlanta" },
        ],
      },
    ],
  };
  assert.deepEqual(judgeReverse(json), { placeName: "250 Jackson Street Northeast", area: "Old Fourth Ward, Atlanta" });
  assert.deepEqual(judgeReverse({ features: [{ id: "place.9", place_type: ["place"], text: "Duluth", context: [] }] }), {
    placeName: "",
    area: "Duluth",
  });
  assert.deepEqual(judgeReverse({}), { placeName: "", area: "" });
});

test("linkup and confirmation errors read as sentences", () => {
  assert.match(friendlyWriteError({ message: "linkup_starts_within_2_hours" }, "x"), /within the next 2 hours/);
  assert.match(friendlyWriteError({ message: "needs_a_car" }, "x"), /garage/);
  assert.equal(friendlyWriteError({ message: "something new" }, "Couldn't post."), "Couldn't post. (something new)");
});
