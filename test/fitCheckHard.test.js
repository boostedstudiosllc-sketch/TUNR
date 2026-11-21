// Trying to break "Does it fit MY car?" (src/lib/fitment.js checkFit) with the
// wording real sellers and owners type. The owner's rules: "fits" only when
// everything known agrees; anything we can't confirm is "check"; a clear
// mismatch in the listing's fit_requires (or make / model / year) is "no";
// a mismatch only in the title or notes is "check" ("Likely won't fit").
// A wrong "fits" costs a buyer money, so those are the worst failures here.
//
// One test per case, so a failure names the exact input. Cases marked
// "BUG:" failed against fitment.js when written: they are real bugs. Fix the
// code, don't loosen the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFit, bestFit, headlightOf, transmissionOf, drivetrainOf } from "../src/lib/fitment.js";

// want: "fits" | "check" | "no" | "unknown", or { not: "fits" } / { not: "no" }.
function fit(label, listing, car, want, textRe) {
  test(label, () => {
    const r = checkFit(listing, car);
    const ctx = `\n  listing: ${JSON.stringify(listing)}\n  car: ${JSON.stringify(car)}\n  got: ${JSON.stringify(r)}`;
    if (typeof want === "string") assert.equal(r?.verdict, want, `${label}${ctx}`);
    else assert.notEqual(r?.verdict, want.not, `${label}${ctx}`);
    if (textRe) assert.match(r.text, textRe, `${label}${ctx}`);
  });
}
const reads = (label, fn, input, want) => test(label, () => assert.deepEqual(fn(input), want, `${label}: ${JSON.stringify(input)}`));
const NOT_FITS = { not: "fits" };
const NOT_NO = { not: "no" };

// ---------- cars ----------
const g30 = (features, extra = {}) => ({ year: 2019, make: "BMW", model: "540i", trim: "G30", features, ...extra });
const adaptiveCar = g30(["Adaptive LED headlights"]);
const regularCar = g30(["LED headlights (non-adaptive)"]);
const ledCar = g30(["LED headlights"]); // owner didn't say adaptive or not
const laserCar = g30(["BMW Laserlight"]);
const halogenCar = g30(["Halogen headlights"], { year: 2017, model: "530i" });
const m2manual = { year: 2018, make: "BMW", model: "M2", trim: "F87", transmission: "Manual", drivetrain: "RWD" };
const m2dct = { ...m2manual, transmission: "DCT" };

// ---------- listings ----------
const G30 = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2017, fit_year_to: 2020, fit_trim: "G30" };
const req = (fit_requires, title = "G30 headlight (left)", more = {}) => ({ ...G30, title, fit_requires, category: "lighting", ...more });
const titled = (title, fits) => ({ ...G30, title, fits, category: "lighting" });
const M2 = { fit_make: "BMW", fit_model: "M2", fit_year_from: 2016, fit_year_to: 2020 };

// =====================================================================
// 1. The owner's example (adaptive vs regular LED), written many ways.
// =====================================================================

for (const r of [
  "LED headlights (non-adaptive)", "Non adaptive LED headlights", "NON-ADAPTIVE LED HEADLIGHTS", "nonadaptive led headlights",
  "LED headlights w/o adaptive", "LED headlights W/O Adaptive", "LED headlights without adaptive", "LED head lights, not adaptive",
  "LED head-lamps (no adaptive)", "Static LED headlamps",
]) {
  fit(`seller: regular LED "${r}" on an adaptive car → no`, req(r), adaptiveCar, "no");
  fit(`seller: regular LED "${r}" on a regular car → fits`, req(r), regularCar, "fits");
}
for (const r of [
  "Adaptive LED headlights", "ADAPTIVE LED HEADLIGHTS", "adaptive led headlight", "Icon Adaptive LED headlights", "Adaptive LED",
  "Adaptive-LED head light", "LED headlamps (adaptive)", "Headlights: LED, adaptive",
]) {
  fit(`seller: adaptive LED "${r}" on an adaptive car → fits`, req(r), adaptiveCar, "fits");
  fit(`seller: adaptive LED "${r}" on a regular car → no`, req(r), regularCar, "no");
}
for (const f of ["Adaptive LED headlights", "Icon Adaptive LED", "adaptive led", "ADAPTIVE LED HEADLIGHTS", "Adaptive LED head lights", "Adaptive LED headlamps"]) {
  fit(`garage "${f}": adaptive lamp fits`, req("Adaptive LED headlights"), g30([f]), "fits");
  fit(`garage "${f}": regular lamp no`, req("LED headlights (non-adaptive)"), g30([f]), "no");
}
for (const f of ["LED headlights (non-adaptive)", "Non adaptive LED headlights", "LED headlights w/o adaptive", "Static LED headlights"]) {
  fit(`garage "${f}": adaptive lamp no`, req("Adaptive LED headlights"), g30([f]), "no");
  fit(`garage "${f}": regular lamp fits`, req("LED headlights (non-adaptive)"), g30([f]), "fits");
}

// When the garage just says "LED headlights", adaptive is unknown: the
// owner's example says a regular unit may well not fit.
fit("BUG: regular LED unit, garage just says 'LED headlights' → not fits", req("LED headlights (non-adaptive)"), ledCar, NOT_FITS);
fit("BUG: seller 'LED headlights', garage 'LED headlights', nobody says adaptive → not fits", req("LED headlights"), ledCar, NOT_FITS);
fit("BUG: title 'G30 LED headlight', garage 'LED headlights' → not fits", titled("2019 BMW G30 LED headlight left"), ledCar, NOT_FITS);
fit("adaptive unit, garage 'LED headlights' → check", req("Adaptive LED headlights"), ledCar, "check");
const f10 = { year: 2014, make: "BMW", model: "535i", trim: "F10", features: ["Xenon headlights"] };
const f10lamp = { fit_make: "BMW", fit_model: "535i", fit_year_from: 2011, fit_year_to: 2016, fit_trim: "F10", title: "F10 xenon headlight", fit_requires: "Xenon headlights (non-adaptive)" };
fit("BUG: non-adaptive xenon unit, garage just says 'Xenon headlights' → not fits", f10lamp, f10, NOT_FITS);
fit("non-adaptive xenon unit, adaptive xenon car → no", f10lamp, { ...f10, features: ["Adaptive xenon headlights"] }, "no");

// =====================================================================
// 2. Negations: the seller says what it DOESN'T fit.
// =====================================================================

fit("BUG: adaptive part 'won't fit non-adaptive', adaptive car → fits", req("Adaptive LED headlights (won't fit non-adaptive)"), adaptiveCar, "fits");
fit("BUG: adaptive part 'won't fit non-adaptive', regular car → not fits", req("Adaptive LED headlights (won't fit non-adaptive)"), regularCar, NOT_FITS);
fit("BUG: 'Adaptive LED headlights, not for static' on a regular car → not fits", req("Adaptive LED headlights, not for static"), regularCar, NOT_FITS);
fit("BUG: 'LED headlights. Does not fit adaptive' on an adaptive car → not fits", req("LED headlights. Does not fit adaptive"), adaptiveCar, NOT_FITS);
fit("BUG: 'LED headlights - NOT for adaptive models' on an adaptive car → not fits", req("LED headlights - NOT for adaptive models"), adaptiveCar, NOT_FITS);
fit("BUG: 'LED headlights (isn't adaptive)' on an adaptive car → not fits", req("LED headlights (isn't adaptive)"), adaptiveCar, NOT_FITS);
fit("BUG: 'LED headlights w/out adaptive' on an adaptive car → not fits", req("LED headlights w/out adaptive"), adaptiveCar, NOT_FITS);
fit("BUG: 'LED headlights (not for halogen cars)' on a halogen car → not fits", req("LED headlights (not for halogen cars)", "G30 LED headlight", { fit_model: "530i" }), halogenCar, NOT_FITS);
fit("BUG: 'Adaptive LED headlights (not Laserlight)' on a laser car → not fits", req("Adaptive LED headlights (not Laserlight)"), laserCar, NOT_FITS);
fit("BUG: 'Adaptive LED headlights (not Laserlight)' on an adaptive LED car → not no", req("Adaptive LED headlights (not Laserlight)"), adaptiveCar, NOT_NO);
fit("BUG: 'Fits adaptive and non-adaptive' harness, adaptive car → not a hard no", req("Fits adaptive and non-adaptive LED headlights", "G30 headlight wiring harness"), adaptiveCar, NOT_NO);

reads("BUG: 'Xenon headlights w/o AHL' is non-adaptive xenon", headlightOf, "Xenon headlights w/o AHL", { tech: "xenon", adaptive: false });
reads("BUG: 'Bi-xenon non-AFS headlight' is non-adaptive xenon", headlightOf, "Bi-xenon non-AFS headlight", { tech: "xenon", adaptive: false });
reads("BUG: 'Xenon headlights without AFS' is non-adaptive xenon", headlightOf, "Xenon headlights without AFS", { tech: "xenon", adaptive: false });
reads("BUG: 'LED headlights (non-matrix)' is non-adaptive LED", headlightOf, "LED headlights (non-matrix)", { tech: "led", adaptive: false });
const A4 = { fit_make: "Audi", fit_model: "A4", fit_year_from: 2017, fit_year_to: 2023, fit_trim: "B9" };
const a4car = { year: 2020, make: "Audi", model: "A4", trim: "B9 45 TFSI quattro" };
fit("BUG: Audi non-matrix lamp on a Matrix LED car → not fits", { ...A4, title: "A4 B9 LED headlight", fit_requires: "LED headlights (non-matrix)" }, { ...a4car, features: ["Matrix LED headlights"] }, NOT_FITS);
fit("BUG: Audi Matrix lamp on a car that says non-matrix LED → not fits", { ...A4, title: "A4 Matrix LED headlight", fit_requires: "Matrix LED headlights" }, { ...a4car, features: ["LED headlights (non-matrix)"] }, NOT_FITS);
fit("Audi Matrix lamp on a Matrix car → fits", { ...A4, title: "A4 Matrix LED headlight", fit_requires: "Matrix LED headlights" }, { ...a4car, features: ["Matrix LED headlights"] }, "fits");
fit("Audi Matrix lamp on a xenon car → no", { ...A4, title: "A4 Matrix LED headlight", fit_requires: "Matrix LED headlights" }, { ...a4car, features: ["Xenon headlights"] }, "no");
fit("Audi Matrix lamp, garage has no lights listed → check", { ...A4, title: "A4 Matrix LED headlight", fit_requires: "Matrix LED headlights" }, a4car, "check");

fit("'DCT only, not manual' on a manual M2 → not fits", { ...M2, title: "M2 DCT paddles", fit_requires: "DCT only, not manual" }, m2manual, NOT_FITS);
fit("BUG: 'Manual only (not DCT)' on a DCT M2 → not fits", { ...M2, title: "M2 short shifter", fit_requires: "Manual only (not DCT)" }, m2dct, NOT_FITS);
fit("BUG: 'Manual only (not DCT)' on a manual M2 → not no", { ...M2, title: "M2 short shifter", fit_requires: "Manual only (not DCT)" }, m2manual, NOT_NO);
fit("BUG: 'RWD only, not for xDrive' on an AWD 540i → not fits", req("RWD only, not for xDrive", "540i rear diff mount"), g30([], { drivetrain: "AWD" }), NOT_FITS);
reads("BUG: 'Non-xDrive' is not xDrive", drivetrainOf, "Non-xDrive", null);

// =====================================================================
// 3. Words that look like an option but aren't.
// =====================================================================

reads("BUG: 'Auto-dimming mirrors' isn't a gearbox", transmissionOf, "Auto-dimming mirrors", null);
reads("BUG: 'Auto high beams' isn't a gearbox", transmissionOf, "Auto high beams", null);
reads("BUG: 'Automatic climate control' isn't a gearbox", transmissionOf, "Automatic climate control", null);
reads("BUG: 'Manual seats' isn't a gearbox", transmissionOf, "Manual seats", null);
fit("BUG: requires 'Auto-dimming mirror', manual car → not a hard no (gearbox is irrelevant)", { ...G30, title: "G30 auto-dimming mirror glass", fit_requires: "Auto-dimming mirror" }, g30(["Adaptive LED headlights"], { transmission: "Manual" }), NOT_NO);
fit("BUG: requires automatic transmission, car only lists 'Automatic climate control' → not fits", { ...G30, title: "540i transmission cooler", fit_requires: "Automatic transmission" }, g30(["Automatic climate control"]), NOT_FITS);
fit("BUG: requires manual transmission, car only lists 'Manual seats' → not fits", { ...G30, title: "540i shifter", fit_requires: "Manual transmission" }, g30(["Manual seats"]), NOT_FITS);
reads("BUG: 'four-wheel steering' isn't AWD", drivetrainOf, "Integral Active Steering (four-wheel steering)", null);
reads("BUG: 'All-wheel steering' isn't AWD", drivetrainOf, "All-wheel steering", null);
fit("BUG: requires xDrive, car only lists 'All-wheel steering' → not fits", { ...G30, title: "540i xDrive front driveshaft", fit_requires: "xDrive (AWD)" }, g30(["All-wheel steering"]), NOT_FITS);
fit("requires 'Headlight washers', car doesn't list them → not fits", { ...G30, title: "G30 M Sport front bumper", fit_requires: "Headlight washers" }, adaptiveCar, NOT_FITS);
fit("BUG: universal 'HID kit for halogen headlights' (title only) on a xenon car → not fits", { fit_universal: true, title: "H7 HID xenon conversion kit for halogen headlights", category: "lighting" }, { ...f10 }, NOT_FITS);

// =====================================================================
// 4. Two requirements at once; requirement and title disagree.
// =====================================================================

const lightsAndMSport = req("Adaptive LED headlights and M Sport package", "G30 M Sport bumper with headlight washer holes");
fit("BUG: needs adaptive LED + M Sport; car has the lights, no M Sport → not fits", lightsAndMSport, adaptiveCar, NOT_FITS);
fit("needs adaptive LED + M Sport; car has both → fits", lightsAndMSport, g30(["Adaptive LED headlights", "M Sport package"]), "fits");
fit("needs adaptive LED + M Sport; lights wrong → no", lightsAndMSport, g30(["LED headlights (non-adaptive)", "M Sport package"]), "no");
fit("BUG: needs 'Manual transmission, Competition'; car manual, Competition unknown → not fits", { ...M2, title: "M2 Competition shift knob", fit_requires: "Manual transmission, Competition" }, { ...m2manual, features: [] }, NOT_FITS);
const xdriveAuto = req("xDrive, 8-speed automatic", "540i xDrive transfer case");
fit("needs xDrive + automatic; car both → fits", xdriveAuto, g30([], { trim: "G30 xDrive", transmission: "Automatic" }), "fits");
fit("needs xDrive + automatic; car manual → no", xdriveAuto, g30([], { trim: "G30 xDrive", transmission: "Manual" }), "no");
fit("needs xDrive + automatic; car RWD → no", xdriveAuto, g30([], { drivetrain: "RWD", transmission: "Automatic" }), "no");
fit("needs xDrive + automatic; drivetrain unknown → check", xdriveAuto, g30([], { transmission: "Automatic" }), "check");
fit("BUG: requires 'Adaptive headlights', title says XENON, car is adaptive LED → not fits", req("Adaptive headlights", "BMW adaptive XENON headlight"), adaptiveCar, NOT_FITS);
fit("BUG: requires 'Automatic', title says DCT, car automatic → not fits", { ...M2, title: "M2 DCT shift paddles", fit_requires: "Automatic" }, { year: 2018, make: "BMW", model: "M2", transmission: "Automatic" }, NOT_FITS);

// =====================================================================
// 5. Generations, facelifts, models.
// =====================================================================

const lciLamp = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2020, fit_year_to: 2023, fit_trim: "LCI", title: "G30 LCI adaptive LED headlight", fit_requires: "Adaptive LED headlights" };
fit("BUG: LCI part on a 2020 the owner calls 'G30 pre-LCI' → not fits", lciLamp, g30(["Adaptive LED headlights"], { year: 2020, trim: "G30 pre-LCI" }), NOT_FITS);
fit("LCI part on a 2020 G30 LCI → fits", lciLamp, g30(["Adaptive LED headlights"], { year: 2020, trim: "G30 LCI" }), "fits");
fit("LCI part on a 2020 G30, LCI not stated → check", lciLamp, g30(["Adaptive LED headlights"], { year: 2020 }), "check");
fit("pre-LCI part on a 2020 G30 LCI → not fits", { ...lciLamp, fit_trim: "Pre-LCI", title: "G30 pre-LCI headlight" }, g30(["Adaptive LED headlights"], { year: 2020, trim: "G30 LCI" }), NOT_FITS);
fit("G30 part on a G31 Touring → check", req("Adaptive LED headlights"), g30(["Adaptive LED headlights"], { trim: "G31" }), "check");
const M5 = { fit_make: "BMW", fit_model: "M5", fit_year_from: 2018, fit_year_to: 2020, fit_trim: "F90", title: "F90 M5 front bumper" };
const m5car = { year: 2019, make: "BMW", model: "M5", trim: "F90 Competition", features: ["Adaptive LED headlights"], drivetrain: "AWD" };
fit("F90 part on an F90 Competition → fits", M5, m5car, "fits");
fit("F90 Competition part on a plain F90 → check", { ...M5, fit_trim: "F90 Competition" }, { ...m5car, trim: "F90" }, "check");
fit("540i G30 part on an M5 → no", req("Adaptive LED headlights"), { ...m5car, trim: "F90" }, "no");
fit("F90 laser lamp on adaptive LED M5 → no", { ...M5, fit_requires: "Laserlight" }, m5car, "no");
fit("RWD part on an (M xDrive) M5 → no", { ...M5, fit_requires: "RWD" }, m5car, "no");
fit("BUG: Mercedes 'C 300' vs listing 'C300' → not a hard no", { fit_make: "Mercedes-Benz", fit_model: "C300", fit_year_from: 2015, fit_year_to: 2021, title: "W205 C300 grille" }, { year: 2018, make: "Mercedes-Benz", model: "C 300", trim: "W205" }, NOT_NO);
fit("BUG: garage model '540i xDrive' vs listing '540i' → not a hard no", { ...G30, fit_trim: null, title: "540i intake" }, { year: 2019, make: "BMW", model: "540i xDrive" }, NOT_NO);

// =====================================================================
// 6. Gearboxes and drivetrains, BMW and other makes.
// =====================================================================

for (const [t, want] of [["8-speed Steptronic", "automatic"], ["Steptronic Sport", "automatic"], ["ZF 8HP", "automatic"], ["7-speed M DCT", "dct"], ["SMG III", "dct"], ["6MT", "manual"], ["6 speed manual", "manual"], ["Stick shift", "manual"], ["MANUAL", "manual"], ["Sequential", null]]) {
  reads(`gearbox words: "${t}"`, transmissionOf, t, want);
}
const f80shifter = { fit_make: "BMW", fit_model: "M3", fit_year_from: 2015, fit_year_to: 2018, title: "F80 short shifter", fit_requires: "6-speed manual" };
const m3 = { year: 2016, make: "BMW", model: "M3", trim: "F80" };
fit("F80 manual shifter on DCT → no", f80shifter, { ...m3, transmission: "DCT" }, "no");
fit("F80 manual shifter on manual → fits", f80shifter, { ...m3, transmission: "Manual" }, "fits");
fit("F80 manual shifter on automatic → no", f80shifter, { ...m3, transmission: "Automatic" }, "no");
fit("F80 manual shifter, gearbox 'Sequential' (unread) → check", f80shifter, { ...m3, transmission: "Sequential" }, "check");
fit("F80 manual shifter, garage says Manual and lists 7-speed M DCT → check", f80shifter, { ...m3, transmission: "Manual", features: ["7-speed M DCT"] }, "check");

const shaft = req("xDrive", "540i front driveshaft");
fit("xDrive part, trim 'G30 xDrive' → fits", shaft, g30([], { trim: "G30 xDrive" }), "fits");
fit("xDrive part, drivetrain AWD → fits", shaft, g30([], { drivetrain: "AWD" }), "fits");
fit("xDrive part, feature 'xDrive' → fits", shaft, g30(["xDrive"]), "fits");
fit("xDrive part, RWD → no", shaft, g30([], { drivetrain: "RWD" }), "no");
fit("xDrive part, trim xDrive but drivetrain RWD (contradiction) → check", shaft, g30([], { trim: "G30 xDrive", drivetrain: "RWD" }), "check");
fit("xDrive part, 'sDrive' not guessed → check", shaft, g30([], { trim: "540i sDrive" }), "check");
fit("xDrive in title only, RWD car → check, Likely won't fit", { ...G30, title: "540i xDrive front driveshaft" }, g30([], { drivetrain: "RWD" }), "check", /Likely won't fit/);

const c43 = { fit_make: "Mercedes-Benz", fit_model: "C43 AMG", fit_year_from: 2017, fit_year_to: 2021, title: "C43 front axle", fit_requires: "4MATIC" };
const c43car = { year: 2019, make: "Mercedes-Benz", model: "C43 AMG", trim: "W205" };
fit("4MATIC part, trim 'W205 4MATIC' → fits", c43, { ...c43car, trim: "W205 4MATIC" }, "fits");
fit("4MATIC part, feature '4MATIC+' → fits", c43, { ...c43car, features: ["4MATIC+"] }, "fits");
fit("4MATIC part, RWD → no", c43, { ...c43car, drivetrain: "RWD" }, "no");
fit("4MATIC part, drivetrain unknown → check", c43, c43car, "check");
fit("make case doesn't matter (mercedes-benz)", c43, { ...c43car, make: "mercedes-benz" }, "check");
fit("Audi FWD part on quattro (read from trim) → no", { ...A4, title: "A4 axle", fit_requires: "FWD" }, a4car, "no");

const wrxShifter = { fit_make: "Subaru", fit_model: "WRX", fit_year_from: 2015, fit_year_to: 2021, title: "WRX short throw shifter", fit_requires: "6-speed manual" };
const wrxCar = { year: 2018, make: "Subaru", model: "WRX", drivetrain: "AWD" };
fit("WRX manual shifter, manual → fits", wrxShifter, { ...wrxCar, transmission: "Manual" }, "fits");
fit("WRX manual shifter, CVT → no", wrxShifter, { ...wrxCar, transmission: "CVT" }, "no");
fit("WRX 'Symmetrical AWD' → fits", { ...wrxShifter, fit_requires: "Symmetrical AWD" }, wrxCar, "fits");
fit("STI part on a WRX → no", { ...wrxShifter, fit_model: "WRX STI" }, { ...wrxCar, transmission: "Manual" }, "no");
// Subaru sells the WRX CVT as its "automatic"; like DCT vs automatic, that's a check.
fit("BUG: WRX part 'Automatic', car CVT → not a hard no", { ...wrxShifter, title: "WRX transmission mount", fit_requires: "Automatic" }, { ...wrxCar, transmission: "CVT" }, NOT_NO);

const civic = { fit_make: "Honda", fit_model: "Civic", fit_year_from: 2017, fit_year_to: 2021, fit_trim: "Si", title: "Civic Si shifter", fit_requires: "Manual" };
const civicCar = { year: 2019, make: "Honda", model: "Civic", trim: "Si" };
fit("Civic Si manual shifter, manual → fits", civic, { ...civicCar, transmission: "Manual" }, "fits");
fit("Civic Si manual shifter, gearbox unknown → check", civic, civicCar, "check");
fit("Civic Si part on a Type R → check", civic, { ...civicCar, trim: "Type R", transmission: "Manual" }, "check");
fit("Honda SH-AWD part on FWD → no", { ...civic, fit_trim: null, fit_requires: "SH-AWD" }, { ...civicCar, drivetrain: "FWD" }, "no");

// =====================================================================
// 7. Plain-word requirements (M Sport and friends).
// =====================================================================

const bumper = req("M Sport package", "G30 M Sport front bumper");
fit("M Sport bumper, 'M Sport package' → fits", bumper, g30(["M Sport package"]), "fits");
fit("M Sport bumper, 'm sport pkg' → fits", bumper, g30(["m sport pkg"]), "fits");
fit("M Sport bumper, 'M-Sport' → fits", bumper, g30(["M-Sport"]), "fits");
fit("M Sport bumper, 'Sport package' → check", bumper, g30(["Sport package"]), "check");
fit("M Sport brakes, car has M Sport package → check", req("M Sport brakes", "G30 M Sport calipers"), g30(["M Sport package"]), "check");
fit("BUG: M Sport bumper, owner wrote 'Non-M Sport' → not fits", bumper, g30(["Non-M Sport"]), NOT_FITS);
fit("BUG: M Sport bumper, owner wrote 'No M Sport package' → not fits", bumper, g30(["No M Sport package"]), NOT_FITS);
fit("BUG: requires 'Sport package', car has 'M Sport package' (different BMW bumpers) → not fits", req("Sport package", "Sport package front lip"), g30(["M Sport package"]), NOT_FITS);

// =====================================================================
// 8. Contradictory and missing data.
// =====================================================================

const saysBoth = g30(["Adaptive LED headlights", "LED headlights (non-adaptive)"]);
fit("garage says adaptive AND non-adaptive: adaptive lamp → check", req("Adaptive LED headlights"), saysBoth, "check");
fit("BUG: garage says adaptive AND non-adaptive: regular lamp → not fits", req("LED headlights (non-adaptive)"), saysBoth, NOT_FITS);
fit("garage says adaptive LED AND Laserlight: LED lamp → check", req("Adaptive LED headlights"), g30(["Adaptive LED headlights", "Laserlight"]), "check");
fit("garage says adaptive LED AND Laserlight: laser lamp → check", req("Laserlight"), g30(["Adaptive LED headlights", "Laserlight"]), "check");

fit("old listing with no fitment → unknown", { title: "Headlight" }, adaptiveCar, "unknown");
fit("listing has no years, model matches → fits", { ...G30, fit_year_from: null, fit_year_to: null, title: "G30 bumper" }, adaptiveCar, "fits");
fit("car has no year → check", req("Adaptive LED headlights"), { ...adaptiveCar, year: null }, "check");
fit("car has no features → check", req("Adaptive LED headlights"), { ...adaptiveCar, features: undefined }, "check");
fit("car has no trim, listing needs G30 → check", req("Adaptive LED headlights"), { ...adaptiveCar, trim: null }, "check");
fit("headlight title, empty requirement → check", req(""), adaptiveCar, "check");
fit("headlight title, blank requirement → check", req("   "), adaptiveCar, "check");
fit("BUG: listing says BMW but no model (older listing) → not a hard no", { ...G30, fit_model: null, fit_trim: null, title: "BMW wheel bolts" }, adaptiveCar, NOT_NO);
test("null inputs and junk features don't throw", () => {
  assert.equal(checkFit(req("Adaptive LED headlights"), null), null);
  assert.equal(checkFit(null, adaptiveCar), null);
  assert.equal(checkFit(req("Adaptive LED headlights"), g30([null, "", "Adaptive LED headlights"])).verdict, "fits");
});

// =====================================================================
// 9. Title / notes only: a mismatch is a check, never a hard no.
// =====================================================================

for (const [l, car] of [
  [titled("G30 halogen headlight"), adaptiveCar],
  [titled("G30 non-adaptive LED headlight"), adaptiveCar],
  [titled("G30 headlamp", "Adaptive LED unit, pulled from a 2019"), regularCar],
  [titled("G30 LASER head light"), adaptiveCar],
  [titled("G30 Icon Adaptive LED headlight"), regularCar],
  [{ ...G30, title: "540i manual conversion shifter" }, g30([], { transmission: "Automatic" })],
  [{ ...G30, title: "540i 6MT shifter" }, g30([], { transmission: "DCT" })],
]) {
  fit(`title only "${l.title}${l.fits ? ` / ${l.fits}` : ""}" → check, Likely won't fit`, l, car, "check", /Likely won't fit/);
}
fit("title 'G30 adaptive LED headlight', adaptive car → fits", titled("G30 adaptive LED headlight"), adaptiveCar, "fits");
fit("title 'head-lamp' + notes 'non adaptive LED', regular car → fits", titled("G30 head-lamp", "non adaptive LED"), regularCar, "fits");

// =====================================================================
// 10. Lights that aren't headlights; misspellings; punctuation.
// =====================================================================

for (const t of ["G30 LED tail light", "G30 LED taillights", "G30 fog lamps", "Ambient lighting kit", "LED puddle lights", "Interior LED dome light", "G30 LED reverse light"]) {
  reads(`not a headlight: "${t}"`, headlightOf, t, null);
}
fit("LED tail light on an adaptive car → fits", titled("G30 LED tail light (right)"), adaptiveCar, "fits");
test("headlight + tail light bundle still counts as a headlight", () => assert.notEqual(headlightOf("G30 LED headlight and tail light set"), null));

fit("BUG: title 'G30 LED headlite' (slang spelling) on an adaptive car → not fits", titled("2019 G30 LED headlite left"), adaptiveCar, NOT_FITS);
fit("BUG: title 'G30 LED hedlight' (typo) on an adaptive car → not fits", titled("2019 G30 LED hedlight left"), adaptiveCar, NOT_FITS);
fit("title 'head light' → check", titled("2019 G30 LED head light left"), adaptiveCar, "check");
fit("title 'head-lamp' → check", titled("2019 G30 LED head-lamp left"), adaptiveCar, "check");
fit("title 'HEADLAMP' → check", titled("2019 G30 LED HEADLAMP L"), adaptiveCar, "check");

reads("BUG: en dash 'NON–ADAPTIVE'", headlightOf, "LED headlights (NON–ADAPTIVE)", { tech: "led", adaptive: false });
reads("BUG: non-breaking hyphen 'non‑adaptive'", headlightOf, "LED headlights, non‑adaptive", { tech: "led", adaptive: false });
reads("extra spaces and !!", headlightOf, "Adaptive  LED   headlights!!", { tech: "led", adaptive: true });
reads("'LED/adaptive headlights'", headlightOf, "LED/adaptive headlights", { tech: "led", adaptive: true });
reads("'BI-XENON headlights'", headlightOf, "BI-XENON headlights", { tech: "xenon", adaptive: null });
reads("'Bixenon'", headlightOf, "Bixenon", { tech: "xenon", adaptive: null });
reads("'Halogen head-lights'", headlightOf, "Halogen head-lights", { tech: "halogen", adaptive: null });

// =====================================================================
// 11. Across a whole garage.
// =====================================================================

test("bestFit picks the car that fits from a mixed garage", () => {
  const b = bestFit(req("Adaptive LED headlights"), [regularCar, { year: 2018, make: "Subaru", model: "WRX" }, adaptiveCar]);
  assert.equal(b.verdict, "fits");
  assert.equal(b.car, adaptiveCar);
  assert.equal(bestFit(req("Adaptive LED headlights"), [regularCar, { year: 2018, make: "Subaru", model: "WRX" }]).verdict, "no");
});
test("BUG: bestFit, regular lamp; garage has an adaptive car and an 'LED headlights' car → not fits", () => {
  assert.notEqual(bestFit(req("LED headlights (non-adaptive)"), [adaptiveCar, ledCar]).verdict, "fits");
});
