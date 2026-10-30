import { test } from "node:test";
import assert from "node:assert/strict";
import { noteReport, followReports } from "../src/lib/remoteMotion.js";

test("remote cars glide between reports instead of jumping", () => {
  const car = { x: 0, z: 0, heading: 0 };
  noteReport(car, { t: 0, x: 0, z: 0, heading: 0 });
  noteReport(car, { t: 0.125, x: 2.5, z: 0, heading: 0.1 }); // 20 m/s
  const xs = [];
  for (let i = 1; i <= 15; i++) {
    followReports(car, 0.125 + i / 120, 1 / 120);
    xs.push(car.x);
  }
  // Keeps moving forward, smoothly, toward where it should be by now.
  assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]));
  assert.ok(car.x > 2 && car.x < 5, `x ${car.x}`);
  // A big jump (lag spike) just puts it there.
  noteReport(car, { t: 5, x: 200, z: 0, heading: 0 });
  assert.equal(car.x, 200);
});
