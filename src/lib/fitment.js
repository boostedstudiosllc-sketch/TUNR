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
// they don't have to know fitment themselves. Accuracy first: "fits" only
// when everything we know agrees; anything we can't confirm is "check";
// a clear mismatch is "no". Some options are either/or and never mix:
// headlights (halogen / xenon / LED / laser, adaptive or not: a 2019 G30
// with adaptive LED headlights won't take the regular LED ones),
// transmission and drivetrain.

const STOP = new Set(["with", "the", "and", "for", "package", "pkg", "option", "options", "only", "of", "w", "a", "an", "car", "cars", "has", "have"]);
const words = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w));
const norm = (s) => String(s || "").trim().toLowerCase();

export const carName = (c) => [c?.year, c?.make === "Other" ? "" : c?.make, c?.model].filter(Boolean).join(" ") || "car";

// ----- either/or options read from plain words -----

const HEADLIGHT = /head\s*-?\s*(light|lamp)s?|\bxenon\b|\bbi-?xenon\b|\bhid\b|\bhalogen\b|\blaser\s*-?\s*light|\blaserlight|\badaptive\s+(led|xenon|hid|light|headlight|beam)/;
const NOT_HEADLIGHT = /\b(tail|fog|interior|ambient|puddle|reverse|brake|turn signal|side marker|license|dome|trunk|underglow)\b/;

// { tech: "halogen" | "xenon" | "led" | "laser" | null, adaptive: true | false | null }, or null.
export function headlightOf(text) {
  const t = String(text || "").toLowerCase();
  if (!HEADLIGHT.test(t) || (NOT_HEADLIGHT.test(t) && !/head\s*-?\s*(light|lamp)/.test(t))) return null;
  const tech = /laser/.test(t) ? "laser" : /xenon|\bhid\b/.test(t) ? "xenon" : /halogen/.test(t) ? "halogen" : /\bled\b/.test(t) ? "led" : null;
  const adaptive = /\bnon\s*-?\s*adaptive|without\s+adaptive|w\/o\s+adaptive|\bno\s+adaptive|not\s+adaptive|\bstatic\b/.test(t)
    ? false
    : /adaptive|\bafs\b|\bahl\b|\bicon\b|\bmatrix\b|\bcornering\b/.test(t)
      ? true
      : tech === "laser"
        ? true // BMW laser lights are adaptive
        : null;
  return { tech, adaptive };
}

export function transmissionOf(text) {
  const t = String(text || "").toLowerCase();
  if (/\bdct\b|\bdsg\b|\bpdk\b|dual\s*-?\s*clutch|\bsmg\b/.test(t)) return "dct";
  if (/\bcvt\b/.test(t)) return "cvt";
  if (/\bmanual\b|\bstick\s*shift|\b\d\s*-?\s*speed\s+manual|\b6mt\b|\b5mt\b|\bmt\b/.test(t)) return "manual";
  if (/\bautomatic\b|\bauto\b|steptronic|torque\s+converter|\b8hp\b|\bzf8\b/.test(t)) return "automatic";
  return null;
}

export function drivetrainOf(text) {
  const t = String(text || "").toLowerCase();
  if (/\bxdrive\b|4matic|quattro|\bawd\b|all\s*-?\s*wheel|4motion|sh\s*-?\s*awd|\b4wd\b|4x4|four\s*-?\s*wheel/.test(t)) return "awd";
  if (/\brwd\b|rear\s*-?\s*wheel\s*drive/.test(t)) return "rwd";
  if (/\bfwd\b|front\s*-?\s*wheel\s*drive/.test(t)) return "fwd";
  return null; // BMW "sDrive" is RWD on some models and FWD on others: not guessed
}

// What we know the car has, from its features, build sheet and trim.
// A value the car lists two different ways counts as unknown.
export function carFacts(car) {
  const out = { headlight: null, transmission: null, drivetrain: null };
  const lights = (car?.features || []).map(headlightOf).filter(Boolean);
  if (lights.length) {
    const pick = (k) => {
      const vals = [...new Set(lights.map((l) => l[k]).filter((v) => v !== null))];
      return vals.length === 1 ? vals[0] : null;
    };
    out.headlight = { tech: pick("tech"), adaptive: pick("adaptive") };
  }
  const one = (fn, sources) => {
    const vals = [...new Set(sources.map(fn).filter(Boolean))];
    return vals.length === 1 ? vals[0] : null;
  };
  out.transmission = one(transmissionOf, [car?.transmission, ...(car?.features || [])]);
  out.drivetrain = one(drivetrainOf, [car?.drivetrain, car?.trim, ...(car?.features || [])]);
  return out;
}

// The feature that meets a plain requirement ("M Sport package"), or null.
// Every word of the requirement must be in one feature.
export function matchFeature(car, requirement) {
  const need = words(requirement);
  if (!need.length) return null;
  const pool = [...(car?.features || []), car?.drivetrain, car?.transmission, car?.engine].filter(Boolean);
  return pool.find((f) => {
    const have = new Set(words(f));
    return need.every((w) => have.has(w));
  }) || null;
}

const lightName = (h) => [h.adaptive === true ? "adaptive" : h.adaptive === false ? "non-adaptive" : "", h.tech ? (h.tech === "led" ? "LED" : h.tech) : "", "headlights"].filter(Boolean).join(" ");

// Headlights: the part's (from the listing) against the car's.
function compareHeadlights(part, car, name, strong) {
  if (!car) return { verdict: "check", text: `It's for cars with ${lightName(part)}. Add your headlight type to your car's features in your garage and TUNR will check.` };
  if (part.tech && car.tech && part.tech !== car.tech) {
    return { verdict: strong ? "no" : "check", text: `${strong ? "Won't fit" : "Likely won't fit"}: it's for ${lightName(part)} and your ${name} has ${lightName(car)}.` };
  }
  if (part.adaptive !== null && car.adaptive !== null && part.adaptive !== car.adaptive) {
    return { verdict: strong ? "no" : "check", text: `${strong ? "Won't fit" : "Likely won't fit"}: it's for ${lightName(part)} and your ${name} has ${lightName(car)}. Adaptive and non-adaptive headlights aren't interchangeable.` };
  }
  if (part.adaptive === true && car.adaptive === null) {
    return { verdict: "check", text: `It needs adaptive headlights; your garage just says ${lightName(car)}. Adaptive and regular units aren't interchangeable: if yours aren't adaptive, it won't fit.` };
  }
  if (part.adaptive === null && car.adaptive === true) {
    return { verdict: "check", text: `The listing doesn't say if these are adaptive. Your ${name} has ${lightName(car)}, and regular units won't fit it. Ask the seller for the part number.` };
  }
  if (part.adaptive === null && car.adaptive === false) {
    return { verdict: "check", text: `The listing doesn't say if these are adaptive. Your ${name} has ${lightName(car)}; adaptive units won't fit it. Ask the seller for the part number.` };
  }
  if (part.tech && !car.tech) return { verdict: "check", text: `It's for ${lightName(part)}; your garage doesn't say which kind yours are.` };
  return null; // agrees
}

const TRANS = { manual: "a manual", automatic: "an automatic", dct: "a dual-clutch (DCT)", cvt: "a CVT" };
const DRIVE = { awd: "all-wheel drive", rwd: "rear-wheel drive", fwd: "front-wheel drive" };

function compareOne(kind, part, car, name, strong) {
  const label = kind === "transmission" ? TRANS : DRIVE;
  if (!car) return { verdict: "check", text: `It's for ${label[part]}${kind === "transmission" ? " transmission" : ""}. Add yours to your car's build sheet so TUNR can check.` };
  if (part === car) return null;
  // "Automatic" and DCT get mixed up; check rather than say no.
  const soft = kind === "transmission" && [part, car].includes("dct") && [part, car].includes("automatic");
  return { verdict: strong && !soft ? "no" : "check", text: `${strong && !soft ? "Won't fit" : "Likely won't fit"}: it's for ${label[part]}${kind === "transmission" ? " transmission" : ""} and your ${name} is ${label[car]}${kind === "transmission" ? "" : ""}.` };
}

// One listing against one car → { verdict: "fits" | "check" | "no" | "unknown", text, reasons }.
export function checkFit(l, car) {
  if (!l || !car) return null;
  const name = carName(car);
  const made = fitLabel(l);

  // The car itself: make, year, model, trim.
  const base = (() => {
    if (l.fit_universal) return null;
    if (!l.fit_make) return { verdict: "unknown", text: "The seller didn't say which car this fits. Ask before you buy." };
    if (norm(l.fit_make) !== norm(car.make)) return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
    if (car.year && l.fit_year_from && (car.year < l.fit_year_from || car.year > (l.fit_year_to ?? l.fit_year_from))) {
      return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
    }
    if (norm(l.fit_model) !== norm(car.model)) {
      if (l.fit_trim && car.trim && trimMatches(l.fit_trim, car)) {
        return { verdict: "check", text: `Made for the ${l.fit_model} ${l.fit_trim}. Your ${car.model} is a ${l.fit_trim} too, so it may fit (many parts are shared). Confirm the part number with the seller.` };
      }
      return { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
    }
    if (!car.year && l.fit_year_from) return { verdict: "check", text: `Made for a ${made}. Add your car's year in your garage so TUNR can check.` };
    if (l.fit_trim && !trimMatches(l.fit_trim, car)) {
      return car.trim
        ? { verdict: "check", text: `Made for the ${l.fit_trim}; your garage says ${car.trim}. Make sure it's the same before you buy.` }
        : { verdict: "check", text: `Made for the ${l.fit_trim}. Add your trim or chassis code in your garage so TUNR can check.` };
    }
    return null;
  })();
  if (base?.verdict === "no" || base?.verdict === "unknown") return { ...base, reasons: [base.text] };

  // Options: what the seller says it needs (strong), and what the title and
  // notes say about either/or options (weaker: "check", never a hard "no").
  const facts = carFacts(car);
  const results = base ? [base] : [];
  const req = l.fit_requires || "";
  const loose = `${l.title || ""} ${l.fits || ""}`;
  const partLight = headlightOf(req) || null;
  const looseLight = partLight ? null : headlightOf(loose);
  if (partLight) results.push(compareHeadlights(partLight, facts.headlight, name, true));
  else if (looseLight && (looseLight.tech || looseLight.adaptive !== null)) results.push(compareHeadlights(looseLight, facts.headlight, name, false));
  else if (looseLight) {
    // "G30 headlight" with no type: most cars come with more than one kind.
    results.push({
      verdict: "check",
      text: facts.headlight
        ? `Headlights for this car come in more than one version, and the listing doesn't say which. Yours are ${lightName(facts.headlight)}. Ask the seller for the part number.`
        : "Headlights for this car come in more than one version, and the listing doesn't say which. Add your headlight type to your car's features, and ask the seller for the part number.",
    });
  }
  for (const [kind, fn] of [["transmission", transmissionOf], ["drivetrain", drivetrainOf]]) {
    const strongVal = fn(req);
    const looseVal = strongVal ? null : fn(loose);
    const val = strongVal || looseVal;
    if (val) results.push(compareOne(kind, val, facts[kind], name, Boolean(strongVal)));
  }
  // Anything else the seller requires ("M Sport package"): word match.
  const known = partLight || transmissionOf(req) || drivetrainOf(req);
  if (req && !known) {
    const f = matchFeature(car, req);
    results.push(f ? null : { verdict: "check", text: `Needs ${req}. Does your ${name} have that? Add it to your car's features in your garage and TUNR will check for you.` });
  }

  const found = results.filter(Boolean);
  const no = found.find((r) => r.verdict === "no");
  if (no) return { ...no, reasons: found.map((r) => r.text) };
  const check = found.find((r) => r.verdict === "check");
  if (check) return { ...check, reasons: found.map((r) => r.text) };
  const why = l.fit_universal ? " (universal part)" : partLight ? `, which has ${lightName(facts.headlight)}` : req ? `: it needs ${req}, and yours has it` : "";
  return { verdict: "fits", text: `Fits your ${name}${why}.`, reasons: [] };
}

// Every word of the listing's trim / chassis code is in the car's model or trim.
function trimMatches(fitTrim, car) {
  const need = words(fitTrim);
  if (!need.length) return true;
  const have = new Set(words(`${car?.model || ""} ${car?.trim || ""}`));
  return need.every((w) => have.has(w));
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
