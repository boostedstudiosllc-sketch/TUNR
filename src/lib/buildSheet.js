// The build sheet for a car (111_build_sheets_and_car_photos.sql): the
// choices, and how it reads on the build page. Pure, so it's tested in
// test/buildSheet.test.js.

export const DRIVETRAINS = ["RWD", "FWD", "AWD", "4WD"];
export const TRANSMISSIONS = ["Manual", "Automatic", "DCT", "CVT", "Sequential"];

// Stage: how far the build has gone, with how full the meter is.
export const STAGES = [
  ["stock", "Stock", "Factory fresh", 0.06],
  ["mild", "Bolt-ons", "Intake, exhaust, the basics", 0.25],
  ["stage1", "Stage 1", "Tuned on the stock turbo or motor", 0.45],
  ["stage2", "Stage 2", "Supporting mods, more power", 0.65],
  ["stage3", "Stage 3", "Big turbo or big parts", 0.85],
  ["built", "Built", "Forged, swapped, fully built", 1],
];
export const STAGE = Object.fromEntries(STAGES.map(([id, name, blurb, meter]) => [id, { name, blurb, meter }]));

export const MOD_CATS = [
  ["engine", "⚙️", "Engine & power"],
  ["suspension", "🔩", "Suspension & brakes"],
  ["wheels", "🛞", "Wheels & tires"],
  ["exterior", "🎨", "Exterior & aero"],
  ["interior", "💺", "Interior"],
  ["audio", "🔊", "Audio & tech"],
  ["other", "📦", "Other"],
];
export const MOD_CAT = Object.fromEntries(MOD_CATS.map(([id, icon, name]) => [id, { icon, name }]));

// Mods grouped by category, in MOD_CATS order: [{ cat, icon, name, mods }].
export function modsByCategory(mods) {
  const list = Array.isArray(mods) ? mods : [];
  return MOD_CATS.map(([cat, icon, name]) => ({ cat, icon, name, mods: list.filter((m) => m?.cat === cat).map((m) => m.name) })).filter((g) => g.mods.length);
}

// Adds a mod (trimmed, no repeats in that category); returns the new list.
export function addMod(mods, cat, name) {
  const n = String(name || "").trim().slice(0, 80);
  const list = Array.isArray(mods) ? mods : [];
  if (!n || !MOD_CAT[cat] || list.length >= 60) return list;
  if (list.some((m) => m.cat === cat && m.name.toLowerCase() === n.toLowerCase())) return list;
  return [...list, { cat, name: n }];
}

// The headline numbers that are filled in: [{ label, value }].
export function specs(car) {
  return [
    car?.horsepower && { label: "HP", value: String(car.horsepower) },
    car?.torque && { label: "LB-FT", value: String(car.torque) },
    car?.drivetrain && { label: "DRIVE", value: car.drivetrain },
    car?.transmission && { label: "TRANS", value: car.transmission === "Automatic" ? "Auto" : car.transmission },
  ].filter(Boolean);
}

// How much of the build sheet is filled in, 0–1 (for the owner's nudge).
export function sheetComplete(car) {
  const parts = [car?.engine, car?.drivetrain, car?.transmission, car?.horsepower, car?.stage, (car?.mods || []).length > 0, car?.build_notes, (car?.photoCount || 0) > 0];
  return parts.filter(Boolean).length / parts.length;
}

// CarCareKiosk's free how-to videos for this exact car. Their pages are
// named by engine as well ("1995_BMW_540i_4.0L_V8"), which we don't have, so
// this searches their site for the year, make and model, which always lands
// on the right car's videos. (Extras like "(G30)" are left out.)
export function repairLink(v) {
  const words = [v?.year, v?.make, v?.model]
    .filter(Boolean)
    .map((x) => String(x).replace(/\(.*?\)/g, "").trim())
    .filter(Boolean)
    .join(" ");
  if (!words) return "https://www.carcarekiosk.com/";
  return `https://www.google.com/search?q=${encodeURIComponent(`site:carcarekiosk.com ${words}`)}`;
}
