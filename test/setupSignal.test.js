import test from "node:test";
import assert from "node:assert/strict";
import { SETUP_EVENT, setupChanged } from "../src/lib/setupSignal.js";

test("a finished setup step tells the checklist to check again", () => {
  const target = new EventTarget();
  let heard = 0;
  target.addEventListener(SETUP_EVENT, () => heard++);
  setupChanged(target);
  setupChanged(target);
  assert.equal(heard, 2);
});

test("no window (or a broken one) never throws", () => {
  assert.doesNotThrow(() => setupChanged(null));
  assert.doesNotThrow(() => setupChanged({}));
  assert.doesNotThrow(() => setupChanged({ dispatchEvent() { throw new Error("nope"); } }));
});
