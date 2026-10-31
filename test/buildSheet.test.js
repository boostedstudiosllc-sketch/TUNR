import { test } from "node:test";
import assert from "node:assert/strict";
import { modsByCategory, addMod, specs, sheetComplete, repairLink, STAGES } from "../src/lib/buildSheet.js";
import { CAR_MODELS, modelsFor } from "../src/data/carModels.js";

test("mods: added once per category, grouped in order", () => {
  let m = addMod([], "wheels", " 20in forged ");
  m = addMod(m, "engine", "JB4 tune");
  m = addMod(m, "wheels", "20IN FORGED");
  m = addMod(m, "rockets", "nope");
  assert.deepEqual(m, [{ cat: "wheels", name: "20in forged" }, { cat: "engine", name: "JB4 tune" }]);
  assert.deepEqual(modsByCategory(m).map((g) => g.cat), ["engine", "wheels"]);
});

test("specs show only what's filled in", () => {
  assert.deepEqual(specs({ horsepower: 420, drivetrain: "AWD", transmission: "Automatic" }).map((s) => `${s.label} ${s.value}`), ["HP 420", "DRIVE AWD", "TRANS Auto"]);
  assert.equal(specs({}).length, 0);
  assert.ok(sheetComplete({}) === 0 && sheetComplete({ engine: "B58", drivetrain: "AWD" }) > 0);
  assert.equal(STAGES.length, 6);
});

test("the how-to link is for the exact car", () => {
  const url = repairLink({ year: 2018, make: "BMW", model: "540i (G30)" });
  assert.match(url, /carcarekiosk\.com/);
  assert.ok(decodeURIComponent(url).includes("site:carcarekiosk.com 2018 BMW 540i"));
  assert.ok(!decodeURIComponent(url).includes("G30"));
  assert.equal(repairLink({}), "https://www.carcarekiosk.com/");
});

test("every make has its models to pick from", () => {
  for (const [make, models] of Object.entries(CAR_MODELS)) {
    assert.ok(models.length > 0, `${make} has models`);
    assert.equal(new Set(models).size, models.length, `${make} has no repeats`);
  }
  assert.ok(modelsFor("bmw").includes("540i"));
  assert.ok(modelsFor("Nissan").includes("Skyline GT-R"), "imports seen at meets are in");
  assert.ok(modelsFor("Honda").includes("Civic"));
  assert.ok(modelsFor("Scion").includes("FR-S"));
  assert.deepEqual(modelsFor("Nope"), []);
});
