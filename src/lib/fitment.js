// Which car a part fits (128_listing_fitment.sql): make, model, a year
// range, or "universal". Words, checks and the Parts tab filter. No network
// here, so it's unit-tested (test/fitment.test.js).

const THIS_YEAR = new Date().getFullYear();
// Newest first, back to 1950, plus next year's models.
export const YEARS = Array.from({ length: THIS_YEAR + 2 - 1950 }, (_, i) => THIS_YEAR + 1 - i);

// "2015–2021 Subaru WRX", "2004 Honda S2000", "Universal fit", or "" (old listing).
export function fitLabel(l) {
  if (!l) return "";
  if (l.fit_universal) return "Universal fit";
  if (!l.fit_make) return "";
  const from = l.fit_year_from;
  const to = l.fit_year_to ?? from;
  const years = from ? (to && to !== from ? `${from}–${to}` : `${from}`) : "";
  return [years, l.fit_make === "Other" ? "" : l.fit_make, l.fit_model, l.fit_trim].filter(Boolean).join(" ");
}

// The catch a buyer must see: "Only fits cars with Adaptive LED headlights".
export const fitWarning = (l) => (l?.fit_requires ? `Only fits cars with ${l.fit_requires}` : "");

// Checks the sell form's fitment. → an error message, or "".
export function fitProblem(d) {
  if (d.fit_universal) return "";
  if (!d.fit_make) return "Pick the make the part fits (or tick Universal).";
  if (!String(d.fit_model || "").trim()) return "Pick the model the part fits.";
  if (!d.fit_year_from) return "Pick the year (or first year) it fits.";
  if (d.fit_year_to && Number(d.fit_year_to) < Number(d.fit_year_from)) return "The last year can't be before the first.";
  return "";
}

// The database row's fitment fields from the form.
export function fitRow(d) {
  const text = (v, max) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max) || null;
  const extra = { fit_requires: text(d.fit_requires, 80), part_number: text(d.part_number, 40) };
  if (d.fit_universal) return { fit_universal: true, fit_make: null, fit_model: null, fit_year_from: null, fit_year_to: null, fit_trim: null, ...extra };
  const from = Number(d.fit_year_from) || null;
  const to = Number(d.fit_year_to) || from;
  return { fit_universal: false, fit_make: d.fit_make || null, fit_model: text(d.fit_model, 60), fit_year_from: from, fit_year_to: to, fit_trim: text(d.fit_trim, 60), ...extra };
}

// A value inside a PostgREST filter, quoted (models can have commas or brackets).
const q = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// The Parts tab filter { make, model, year } → a PostgREST or() string:
// parts for that car, plus universal ones. null when no make is picked.
export function fitFilter(f) {
  if (!f?.make) return null;
  const parts = [`fit_make.eq.${q(f.make)}`];
  if (f.model) parts.push(`fit_model.eq.${q(f.model)}`);
  if (f.year) parts.push(`fit_year_from.lte.${Number(f.year)}`, `fit_year_to.gte.${Number(f.year)}`);
  // A trim narrows it, but parts that fit every trim still show.
  const trim = String(f.trim || "").replace(/[*,()"\\]/g, " ").trim();
  if (trim) parts.push(`or(fit_trim.is.null,fit_trim.ilike.${q(`*${trim}*`)})`);
  return `fit_universal.is.true,and(${parts.join(",")})`;
}

// The chip text for an active filter: "Fits 2019 BMW M2".
export const filterLabel = (f) => (f?.make ? `Fits ${[f.year, f.make, f.model, f.trim].filter(Boolean).join(" ")}` : "");

// ---------- does it fit YOUR car? ----------
// The Parts tab checks each listing against the buyer's garage cars, so
// they don't have to know fitment themselves.

const STOP = new Set(["with", "the", "and", "for", "package", "pkg", "option", "options", "only", "of", "w", "a", "an", "car", "cars"]);
const words = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w));
const norm = (s) => String(s || "").trim().toLowerCase();

export const carName = (c) => [c?.year, c?.make === "Other" ? "" : c?.make, c?.model].filter(Boolean).join(" ") || "car";

// Everything we know the car has: its features list (130), plus the build
// sheet's drivetrain, transmission and engine.
function featurePool(car) {
  return [...(car?.features || []), car?.drivetrain, car?.transmission, car?.engine].filter(Boolean);
}

// The feature that meets a requirement, or null. Every word of the
// requirement must be in one feature ("Adaptive LED headlights" needs all
// three), so a plain "LED headlights" doesn't count as adaptive.
export function matchFeature(car, requirement) {
  const need = words(requirement);
  if (!need.length) return null;
  return featurePool(car).find((f) => {
    const have = new Set(words(f));
    return need.every((w) => have.has(w));
  }) || null;
}

// Every word of the listing's trim / chassis code is in the car's model or trim.
function trimMatches(fitTrim, car) {
  const need = words(fitTrim);
  if (!need.length) return true;
  const have = new Set(words(`${car?.model || ""} ${car?.trim || ""}`));
  return need.every((w) => have.has(w));
}

// One listing against one car → { verdict: "fits" | "check" | "no" | "unknown", text }.
export function checkFit(l, car) {
  if (!l || !car) return null;
  const name = carName(car);
  const requirement = (extra = "") => {
    if (!l.fit_requires) return { verdict: "fits", text: `Fits your ${name}${extra}.` };
    const f = matchFeature(car, l.fit_requires);
    if (f) return { verdict: "fits", text: `Fits your ${name}: it needs ${l.fit_requires}, and yours has ${f}.` };
    return { verdict: "check", text: `Needs ${l.fit_requires}. Does your ${name} have that? Add it to your car's features in your garage and TUNR will check for you.` };
  };
  if (l.fit_universal) return requirement(" (universal part)");
  if (!l.fit_make) return { verdict: "unknown", text: "The seller didn't say which car this fits. Ask before you buy." };
  const made = fitLabel(l);
  if (norm(l.fit_make) !== norm(car.make)) return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
  if (car.year && l.fit_year_from && (car.year < l.fit_year_from || car.year > (l.fit_year_to ?? l.fit_year_from))) {
    return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
  }
  if (norm(l.fit_model) !== norm(car.model)) {
    // Same chassis, different model (a 540i G30 part on a 530i G30): often shared.
    if (l.fit_trim && car.trim && trimMatches(l.fit_trim, car)) {
      return { verdict: "check", text: `Made for the ${l.fit_model} ${l.fit_trim}. Your ${car.model} is a ${l.fit_trim} too, so it likely fits. Confirm with the seller.` };
    }
    return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
  }
  if (!car.year && l.fit_year_from) return { verdict: "check", text: `Made for a ${made}. Add your car's year in your garage so TUNR can check.` };
  if (l.fit_trim && !trimMatches(l.fit_trim, car)) {
    return car.trim
      ? { verdict: "check", text: `Made for the ${l.fit_trim}; your garage says ${car.trim}. Make sure it's the same before you buy.` }
      : { verdict: "check", text: `Made for the ${l.fit_trim}. Add your trim or chassis code in your garage so TUNR can check.` };
  }
  return requirement();
}

const RANK = { fits: 3, check: 2, no: 1, unknown: 0 };

// The best answer across the buyer's garage → { verdict, text, car } or null (no cars).
export function bestFit(l, cars = []) {
  let best = null;
  for (const car of cars) {
    const r = checkFit(l, car);
    if (r && (!best || RANK[r.verdict] > RANK[best.verdict])) best = { ...r, car };
  }
  return best;
}

export const FIT_BADGE = {
  fits: { icon: "✅", short: "FITS YOUR CAR", color: "#10B981" },
  check: { icon: "⚠️", short: "CHECK FIT", color: "#F59E0B" },
  no: { icon: "❌", short: "WON'T FIT", color: "#EF4444" },
  unknown: { icon: "❓", short: "FIT UNKNOWN", color: "#94A3B8" },
};
