// "Does it fit MY car?" (src/lib/fitment.js checkFit). Accuracy matters more
// than anything here: a ✅ that's wrong costs a buyer money. These cases
// lean on the owner's own example: a 2019 BMW G30 with adaptive LED
// headlights won't take the regular LED headlights, even though both are
// "2019 G30 headlights".
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFit, bestFit, headlightOf, transmissionOf, drivetrainOf, carFacts, matchFeature } from "../src/lib/fitment.js";

// ---------- the cars in people's garages ----------
const adaptive540 = { year: 2019, make: "BMW", model: "540i", trim: "xDrive G30", features: ["Adaptive LED headlights"], transmission: "Automatic" };
const nonAdaptive540 = { year: 2019, make: "BMW", model: "540i", trim: "G30", features: ["LED headlights (non-adaptive)"] };
const unclear540 = { year: 2019, make: "BMW", model: "540i", trim: "G30", features: ["LED headlights"] }; // didn't say adaptive or not
const bare540 = { year: 2019, make: "BMW", model: "540i", trim: "G30", features: [] };
const adaptive530 = { year: 2018, make: "BMW", model: "530i", trim: "G30", features: ["Adaptive LED headlights"] };
const halogen530 = { year: 2017, make: "BMW", model: "530i", trim: "G30", features: ["Halogen headlights"] };
const lci540 = { year: 2021, make: "BMW", model: "540i", trim: "G30 LCI", features: ["Adaptive LED headlights"] };
const f10 = { year: 2015, make: "BMW", model: "535i", trim: "F10", features: ["Adaptive xenon headlights"] };
const m2manual = { year: 2018, make: "BMW", model: "M2", trim: "F87", transmission: "Manual", drivetrain: "RWD" };
const m2dct = { year: 2018, make: "BMW", model: "M2", trim: "F87", transmission: "DCT", drivetrain: "RWD" };
const m2bare = { year: 2018, make: "BMW", model: "M2", trim: "F87" };
const wrx = { year: 2018, make: "Subaru", model: "WRX", transmission: "Manual", drivetrain: "AWD" };

// ---------- the parts for sale ----------
const g30 = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2017, fit_year_to: 2020, fit_trim: "G30" };
const adaptiveLamp = { ...g30, title: "G30 adaptive LED headlight (left)", category: "lighting", fit_requires: "Adaptive LED headlights", part_number: "63117214961" };
const regularLamp = { ...g30, title: "G30 LED headlight (left)", category: "lighting", fit_requires: "LED headlights (non-adaptive)" };
const vagueLamp = { ...g30, title: "G30 headlight (left)", category: "lighting", fit_requires: "LED headlights" };
const titleOnlyLed = { ...g30, title: "2019 BMW G30 LED headlight left", category: "lighting" };
const titleOnlyGeneric = { ...g30, title: "G30 headlight left", category: "lighting" };
const titleHalogen = { ...g30, title: "G30 halogen headlight", category: "lighting" };
const laserLamp = { ...g30, title: "G30 laser headlight", category: "lighting", fit_requires: "Laser lights" };
const lciLamp = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2021, fit_year_to: 2023, fit_trim: "G30 LCI", title: "G30 LCI adaptive LED headlight", fit_requires: "Adaptive LED headlights" };
const taillight = { ...g30, title: "G30 LED taillight (right)", category: "lighting" };
const fogs = { ...g30, title: "G30 LED fog lights", category: "lighting" };
const m2shifter = { fit_make: "BMW", fit_model: "M2", fit_year_from: 2016, fit_year_to: 2020, title: "M2 short shifter", fit_requires: "Manual transmission" };
const m2dctPaddles = { fit_make: "BMW", fit_model: "M2", fit_year_from: 2016, fit_year_to: 2020, title: "M2 carbon paddles", fit_requires: "DCT" };
const xdriveShaft = { ...g30, title: "540i front driveshaft", category: "engine", fit_requires: "xDrive (AWD)" };
const rwdPart = { ...g30, title: "540i rear diff mount", fit_requires: "RWD" };
const mSportBumper = { ...g30, title: "G30 M Sport front bumper", category: "aero", fit_requires: "M Sport package" };
const ledBulbs = { fit_universal: true, title: "H7 LED bulb conversion kit", category: "lighting", fit_requires: "Halogen headlights" };
const seat = { fit_universal: true, title: "Bride Zeta III seat", category: "interior" };

const v = (l, car) => checkFit(l, car).verdict;

test("the owner's case: 2019 G30 headlights, adaptive vs regular", () => {
  assert.equal(v(adaptiveLamp, adaptive540), "fits", "adaptive lamp, adaptive car");
  assert.equal(v(regularLamp, adaptive540), "no", "REGULAR LED lamp on an ADAPTIVE car: won't fit");
  assert.match(checkFit(regularLamp, adaptive540).text, /aren't interchangeable/);
  assert.equal(v(adaptiveLamp, nonAdaptive540), "no", "adaptive lamp on a non-adaptive car: won't fit");
  assert.equal(v(regularLamp, nonAdaptive540), "fits", "regular lamp, regular car");
});

test("when either side doesn't say, it's CHECK, never a guessed ✅", () => {
  assert.equal(v(vagueLamp, adaptive540), "check", "seller says just 'LED headlights'");
  assert.match(checkFit(vagueLamp, adaptive540).text, /doesn't say if these are adaptive/);
  assert.equal(v(vagueLamp, nonAdaptive540), "check");
  assert.equal(v(adaptiveLamp, unclear540), "check", "garage says just 'LED headlights'");
  assert.match(checkFit(adaptiveLamp, unclear540).text, /if yours aren't adaptive, it won't fit/);
  assert.equal(v(adaptiveLamp, bare540), "check", "no headlight type in the garage");
  assert.match(checkFit(adaptiveLamp, bare540).text, /Add your headlight type/);
  assert.equal(v(titleOnlyLed, adaptive540), "check", "title says LED but not adaptive");
  assert.equal(v(titleOnlyGeneric, adaptive540), "check", "a headlight with no type at all");
  assert.match(checkFit(titleOnlyGeneric, adaptive540).text, /more than one version/);
  assert.equal(v(titleOnlyGeneric, bare540), "check", "headlight, and we don't know yours either");
  assert.equal(v(titleOnlyLed, bare540), "check");
});

test("different headlight technology never fits", () => {
  assert.equal(v(adaptiveLamp, halogen530), "no", "LED lamp, halogen car (also a different model, still no)");
  assert.equal(v(laserLamp, adaptive540), "no", "laser vs adaptive LED");
  assert.equal(v(titleHalogen, adaptive540), "check", "halogen in the title only: strong warning, not a hard no");
  assert.match(checkFit(titleHalogen, adaptive540).text, /Likely won't fit/);
  assert.equal(v(ledBulbs, adaptive540), "no", "LED bulbs for halogen housings on an LED car");
  assert.equal(v(ledBulbs, halogen530), "fits");
});

test("years, generations and facelifts", () => {
  assert.equal(v(adaptiveLamp, lci540), "no", "pre-LCI lamp (2017–2020) on a 2021 LCI");
  assert.equal(v(lciLamp, lci540), "fits");
  assert.equal(v(lciLamp, adaptive540), "no", "LCI lamp on a 2019");
  assert.equal(v(adaptiveLamp, f10), "no", "F10 is a different generation (2015)");
  assert.match(checkFit(adaptiveLamp, f10).text, /made for a 2017–2020 BMW 540i G30/);
});

test("same chassis, another model: maybe, confirm the part number", () => {
  assert.equal(v(adaptiveLamp, adaptive530), "check");
  assert.match(checkFit(adaptiveLamp, adaptive530).text, /530i is a G30 too/);
  assert.equal(v(regularLamp, adaptive530), "no", "and a headlight mismatch still wins");
});

test("lights that aren't headlights don't trigger the headlight check", () => {
  assert.equal(v(taillight, adaptive540), "fits");
  assert.equal(v(fogs, adaptive540), "fits");
  assert.equal(headlightOf("LED tail lights"), null);
  assert.equal(headlightOf("Adaptive cruise control"), null, "adaptive cruise isn't a headlight");
  assert.equal(carFacts({ features: ["Adaptive cruise control"] }).headlight, null);
});

test("transmissions", () => {
  assert.equal(v(m2shifter, m2manual), "fits");
  assert.equal(v(m2shifter, m2dct), "no", "a manual shifter on a DCT car");
  assert.equal(v(m2shifter, m2bare), "check", "we don't know the transmission");
  assert.equal(v(m2dctPaddles, m2dct), "fits");
  assert.equal(v(m2dctPaddles, m2manual), "no");
  assert.equal(v(m2dctPaddles, { ...m2bare, transmission: "Automatic" }), "check", "'automatic' vs DCT gets mixed up: check");
});

test("drivetrains (xDrive read from the trim)", () => {
  assert.equal(v(xdriveShaft, adaptive540), "fits", "trim says xDrive");
  assert.equal(v(xdriveShaft, bare540), "check", "nothing says how it's driven");
  assert.equal(v(xdriveShaft, { ...bare540, drivetrain: "RWD" }), "no");
  assert.equal(v(rwdPart, adaptive540), "no", "an RWD part on an xDrive car");
  assert.equal(drivetrainOf("sDrive30i"), null, "sDrive is RWD on some BMWs and FWD on others: not guessed");
});

test("other requirements, makes, universal and old listings", () => {
  assert.equal(v(mSportBumper, { ...adaptive540, features: ["Adaptive LED headlights", "M Sport package"] }), "fits");
  assert.equal(v(mSportBumper, adaptive540), "check");
  assert.equal(v(adaptiveLamp, wrx), "no", "wrong make");
  assert.equal(v(adaptiveLamp, { ...adaptive540, make: "bmw", model: "540I" }), "fits", "case doesn't matter");
  assert.equal(v(seat, adaptive540), "fits");
  assert.equal(v({ title: "Old listing" }, adaptive540), "unknown");
  assert.equal(checkFit(adaptiveLamp, null), null);
});

test("a car that lists two headlight types counts as unknown", () => {
  const mixed = { ...bare540, features: ["LED headlights", "Halogen headlights"] };
  assert.equal(carFacts(mixed).headlight.tech, null);
  assert.equal(v(adaptiveLamp, mixed), "check");
});

test("reading headlight types", () => {
  const cases = [
    ["Adaptive LED headlights", "led", true],
    ["Icon Adaptive LED headlights", "led", true],
    ["LED headlights (non-adaptive)", "led", false],
    ["LED headlights without adaptive", "led", false],
    ["Static LED headlights", "led", false],
    ["LED headlights", "led", null],
    ["Bi-xenon adaptive headlights", "xenon", true],
    ["HID headlights", "xenon", null],
    ["Halogen headlights", "halogen", null],
    ["Laserlight", "laser", true],
    ["Laser lights", "laser", true],
  ];
  for (const [text, tech, adaptive] of cases) assert.deepEqual(headlightOf(text), { tech, adaptive }, text);
  assert.equal(headlightOf("Headlight"), null, "no type mentioned: nothing to compare (the 'which version?' check covers it)");
});

test("reading transmissions", () => {
  const cases = [["6-speed manual", "manual"], ["Manual transmission", "manual"], ["Steptronic", "automatic"], ["Automatic (8-speed)", "automatic"], ["auto", "automatic"], ["DCT", "dct"], ["7-speed dual-clutch", "dct"], ["CVT", "cvt"], ["Sport package", null]];
  for (const [text, want] of cases) assert.equal(transmissionOf(text), want, text);
});

test("plain feature matching needs every word", () => {
  assert.equal(matchFeature({ features: ["M Sport package"] }, "M Sport"), "M Sport package");
  assert.equal(matchFeature({ features: ["Sport package"] }, "M Sport package"), null);
});

test("the best answer across a garage", () => {
  const best = bestFit(adaptiveLamp, [m2manual, adaptive540]);
  assert.equal(best.verdict, "fits");
  assert.equal(best.car, adaptive540);
  assert.equal(bestFit(regularLamp, [adaptive540, m2manual]).verdict, "no", "neither car takes the regular lamp");
  assert.equal(bestFit(vagueLamp, [nonAdaptive540, adaptive540]).verdict, "check");
  assert.equal(bestFit(adaptiveLamp, []), null);
});

test("more headlight wording sellers and owners use", () => {
  const lamp = (fit_requires, title = "G30 headlight") => ({ ...g30, title, category: "lighting", fit_requires });
  assert.equal(v(lamp("Halogen headlights"), adaptive540), "no");
  assert.equal(v(lamp("Adaptive headlights"), adaptive540), "fits", "adaptive (tech unsaid) on an adaptive LED car");
  assert.equal(v(lamp("Adaptive headlights"), nonAdaptive540), "no");
  assert.equal(v(lamp("Adaptive headlights"), unclear540), "check");
  assert.equal(v(lamp("Non-adaptive headlights"), adaptive540), "no");
  assert.equal(v(lamp("Xenon headlights"), adaptive540), "no");
  assert.equal(v(lamp(null, "G30 adaptive LED headlight"), adaptive540), "fits", "title says adaptive LED, car agrees");
  assert.equal(v(lamp(null, "G30 adaptive LED headlight"), nonAdaptive540), "check", "title only: a strong warning, not a hard no");
  assert.match(checkFit(lamp(null, "G30 adaptive LED headlight"), nonAdaptive540).text, /Likely won't fit/);
  assert.equal(v(lamp("Adaptive LED headlights"), { ...adaptive540, features: ["Xenon headlights"] }), "no");
});

test("two requirements at once must both hold", () => {
  const both = { ...g30, title: "540i xDrive adaptive headlight harness", fit_requires: "Adaptive LED headlights and xDrive" };
  assert.equal(v(both, adaptive540), "fits");
  assert.equal(v(both, nonAdaptive540), "no", "headlights wrong");
  assert.equal(v(both, { ...adaptive540, trim: "G30", drivetrain: "RWD" }), "no", "drivetrain wrong");
  assert.equal(v(both, { ...adaptive540, trim: "G30" }), "check", "drivetrain unknown");
});

test("missing year in the garage is a check, not a guess", () => {
  assert.equal(v(adaptiveLamp, { ...adaptive540, year: null }), "check");
  assert.equal(v(seat, { make: "BMW", model: "540i" }), "fits", "universal parts don't need the year");
});
