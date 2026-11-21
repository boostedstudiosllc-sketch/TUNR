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
// they don't have to know fitment themselves. Accuracy first:
//   fits   only when everything we know agrees
//   check  anything we can't confirm
//   no     a clear mismatch in make / model / year or the listing's
//          "only fits cars with"; a mismatch found only in the title or
//          notes is a "check" ("Likely won't fit"), never a hard no.
// Some options are either/or and never mix: headlights (halogen / xenon /
// LED / laser, adaptive or not: a 2019 G30 with adaptive LED headlights
// won't take the regular LED ones), transmission and drivetrain.
// Text is read clause by clause, so "won't fit non-adaptive", "not for
// halogen" and "Manual only (not DCT)" mean what they say.
// Tested hard in test/fitCheck.test.js and test/fitCheckHard.test.js.

const STOP = new Set(["with", "the", "and", "for", "package", "pkg", "option", "options", "only", "of", "w", "a", "an", "car", "cars", "has", "have", "models", "model", "fits", "fit", "will", "does", "is", "are", "my", "your", "on", "in", "to", "it"]);
const plural = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

// Lower case, one spelling for words people write many ways.
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[’`]/g, "'")
    .replace(/\bhe+a?d\s*-?\s*(?:light|lite|lamp|lght)s?\b/g, "headlight")
    .replace(/\bw\s*\/\s*o(?:ut)?\b/g, "without")
    .replace(/\b(?:won't|wont)\b/g, "will not")
    .replace(/\b(?:doesn't|doesnt)\b/g, "does not")
    .replace(/\b(?:isn't|isnt|is not)\b/g, "not")
    .replace(/\bpre\s*-?\s*lci\b/g, "prelci")
    .replace(/\bm\s*-?\s*sport\b|\bmsport\b/g, "m sport")
    .replace(/\bbi\s*-?\s*xenon\b/g, "xenon")
    .replace(/\blaser\s*-?\s*lights?\b|\blaserlights?\b/g, "laser")
    .replace(/\bstatic\b/g, "nonadaptive")
    .replace(/\b(?:non|without|no|not)\s*-?\s*(?:adaptive|afs|ahl|matrix|cornering)\b/g, "nonadaptive")
    .replace(/\b(?:icon\s+)?(?:adaptive|afs|ahl|matrix|cornering)\b/g, "adaptive")
    .replace(/\s+/g, " ")
    .trim();
}

// Split into clauses: commas, brackets, "and", " - ", sentences…
const splitClauses = (t) =>
  t
    .split(/[,;()[\]|+&]|\.\s|\.$|\s-\s|\s\/\s|\band\b|\balso\b|\bbut\b|:/)
    .map((c) => c.trim())
    .filter(Boolean);

// A clause that says what it does NOT fit. → [negated, rest]
const NEG = /^(?:will not fit|does not fit|not compatible with|incompatible with|not for|not|no|non|excludes?|except)\b\s*-?\s*/;
function negation(clause) {
  if (NEG.test(clause)) return [true, clause.replace(NEG, "").trim()];
  const m = clause.match(/\b(?:will not fit|does not fit|not compatible with|not for)\b\s*/);
  if (m) return [true, clause.slice(m.index + m[0].length).trim()];
  return [false, clause];
}

const NOT_HEADLIGHT = /\b(tail|taillights?|fog|interior|ambient|puddle|reverse|brake|turn signal|side marker|license|dome|trunk|underglow|cruise|suspension|damper|steering)\b/;
const NOT_A_UNIT = /headlight\s*(washer|bracket|tab|repair|bulb|cover|harness|wiring|switch|module|ballast|adjust|lens|seal|trim|hole|clip|bolt|level)/;

function lightOfClause(c) {
  const hasLightWord = /headlight|\blight|\blamp|\blaser\b/.test(c);
  const tag = /\b(laser|xenon|hid|halogen|led)\b|\badaptive\b|\bnonadaptive\b/.test(c);
  if (!tag) return null;
  if (NOT_HEADLIGHT.test(c) && !/headlight/.test(c)) return null;
  if (/\badaptive\b/.test(c) && !hasLightWord && !/\b(led|xenon|hid|halogen|laser)\b/.test(c) && /\b(cruise|suspension|damper|steering|m drive|seat)\b/.test(c)) return null;
  // "kit for halogen headlights": what comes after "for" is what the car needs.
  const forType = c.match(/\bfor (?:\w+ ){0,2}?(laser|xenon|hid|halogen|led)\b/);
  const techs = [...new Set((c.match(/\b(laser|xenon|hid|halogen|led)\b/g) || []).map((t) => (t === "hid" ? "xenon" : t)))];
  const tech = forType ? (forType[1] === "hid" ? "xenon" : forType[1]) : techs.length === 1 ? techs[0] : null;
  const adaptive = /\bnonadaptive\b/.test(c) && /\badaptive\b/.test(c) ? "any" : /\bnonadaptive\b/.test(c) ? false : /\badaptive\b/.test(c) ? true : tech === "laser" ? true : null;
  return { tech, adaptive, techs: forType ? [tech] : techs };
}

const NOT_GEARBOX_AFTER = "(?!\\s*-?\\s*(?:dimming|dim|climate|high|headlight|light|wiper|tailgate|trunk|liftgate|parking|park|braking|brake|emergency|start|stop|hold|lock|fold|seat|mirror|window|level|a\\/c|ac|hvac|temperature|air))";
function gearOf(c) {
  if (/\b(?:owner'?s|service|repair|workshop)\s+manual\b/.test(c)) return null;
  if (/\bdct\b|\bdsg\b|\bpdk\b|dual\s*-?\s*clutch|\bsmg\b/.test(c)) return "dct";
  if (/\bcvt\b|continuously variable/.test(c)) return "cvt";
  if (new RegExp(`\\bmanual\\b${NOT_GEARBOX_AFTER}`).test(c) || /\bstick\s*-?\s*shift|\b[456]\s*-?\s*mt\b|\b\d\s*-?\s*speed\s+manual\b/.test(c)) return "manual";
  if (new RegExp(`\\bautomatic\\b${NOT_GEARBOX_AFTER}`).test(c) || /\bauto\s*(?:trans|transmission|gearbox|box)\b|^auto$|steptronic|torque\s+converter|\b8\s*-?\s*hp\b|\bzf\s*8/.test(c)) return "automatic";
  return null;
}

function driveOf(c) {
  if (/(all|four|4)\s*-?\s*wheel\s*steer|active steering|integral/.test(c) && !/drive|awd|xdrive|4matic|quattro/.test(c)) return null;
  if (/\bxdrive\b|4matic|quattro|\bawd\b|all\s*-?\s*wheel\s*drive|4motion|sh\s*-?\s*awd|\b4wd\b|4x4|four\s*-?\s*wheel\s*drive/.test(c)) return "awd";
  if (/\brwd\b|rear\s*-?\s*wheel\s*drive/.test(c)) return "rwd";
  if (/\bfwd\b|front\s*-?\s*wheel\s*drive/.test(c)) return "fwd";
  return null; // BMW "sDrive" is RWD on some models and FWD on others: not guessed
}

const plainWords = (c) =>
  c
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map(plural);

// Everything a piece of text says, clause by clause.
// → { light: { tech, notTech[], adaptive }, gear: { is[], not[] }, drive: { is[], not[] }, plain: { need[], not[] }, unit }
export function readText(text) {
  const out = { light: null, gear: { is: [], not: [] }, drive: { is: [], not: [] }, plain: { need: [], not: [] }, unit: false, product: false };
  const t = normalize(text);
  if (!t) return out;
  if (/headlight/.test(t) && !NOT_A_UNIT.test(t)) out.unit = true;
  if (/\b(bulbs?|conversion|retrofit|kit)\b/.test(t)) out.product = true;
  const forType = t.match(/\bfor (?:\w+ ){0,2}?(laser|xenon|hid|halogen|led)\b/);
  out.forTech = forType ? (forType[1] === "hid" ? "xenon" : forType[1]) : null;
  const light = { techs: new Set(), notTech: new Set(), adaptive: null };
  let sawLight = false;
  const setAdaptive = (v) => {
    if (v === null) return;
    if (light.adaptive === null) light.adaptive = v;
    else if (light.adaptive !== v) light.adaptive = "any";
  };
  for (const raw of splitClauses(t)) {
    const [neg, c] = negation(raw);
    if (!c) continue;
    let typed = false;
    const l = lightOfClause(c);
    if (l) {
      typed = true;
      sawLight = true;
      if (neg) {
        l.techs.forEach((x) => light.notTech.add(x));
        if (l.adaptive === true) setAdaptive(false);
        else if (l.adaptive === false) setAdaptive(true);
      } else {
        l.techs.forEach((x) => light.techs.add(x));
        if (l.tech === null && l.techs.length > 1) light.ambiguous = true;
        if (l.tech) light.forced = light.forced || (l.techs.length === 1 && l.techs[0] === l.tech ? null : l.tech);
        setAdaptive(l.adaptive);
      }
    }
    const g = gearOf(c);
    if (g) {
      typed = true;
      out.gear[neg ? "not" : "is"].push(g);
    }
    const d = driveOf(c);
    if (d) {
      typed = true;
      out.drive[neg ? "not" : "is"].push(d);
    }
    if (!typed) {
      const w = plainWords(c).filter((x) => x !== "headlight" || NOT_A_UNIT.test(c) || plainWords(c).length > 1);
      if (w.length && !(w.length === 1 && w[0] === "headlight") && !/^(g\d\d|f\d\d|e\d\d)$/.test(w.join(" "))) out.plain[neg ? "not" : "need"].push(w);
    }
  }
  if (sawLight) {
    const techs = [...light.techs];
    out.light = {
      tech: light.forced || (techs.length === 1 && !light.ambiguous ? techs[0] : null),
      notTech: [...light.notTech],
      adaptive: light.adaptive,
    };
  }
  return out;
}

// { tech, adaptive } for a piece of text, or null if it isn't about headlights.
export function headlightOf(text) {
  const l = readText(text).light;
  if (!l) return null;
  return { tech: l.tech, adaptive: l.adaptive === "any" ? null : l.adaptive };
}
const single = (arr) => {
  const u = [...new Set(arr)];
  return u.length === 1 ? u[0] : null;
};
export const transmissionOf = (text) => single(readText(text).gear.is);
export const drivetrainOf = (text) => single(readText(text).drive.is);

const norm = (s) => String(s || "").trim().toLowerCase();
const squash = (s) => norm(s).replace(/[^a-z0-9]/g, "");
export const carName = (c) => [c?.year, c?.make === "Other" ? "" : c?.make, c?.model].filter(Boolean).join(" ") || "car";

// What we know the car has, from its features, build sheet and trim.
// Anything the car lists two different ways counts as unknown.
export function carFacts(car) {
  const feats = (car?.features || []).filter((f) => typeof f === "string" && f.trim());
  const lights = [];
  const gears = [];
  const drives = [];
  const has = [];
  const hasNot = [];
  for (const f of feats) {
    const r = readText(f);
    if (r.light) lights.push(r.light);
    gears.push(...r.gear.is);
    drives.push(...r.drive.is);
    has.push(...r.plain.need);
    hasNot.push(...r.plain.not);
  }
  for (const src of [car?.transmission]) gears.push(...readText(src).gear.is);
  for (const src of [car?.drivetrain, car?.trim]) drives.push(...readText(src).drive.is);
  let headlight = null;
  if (lights.length) {
    const techs = [...new Set(lights.map((l) => l.tech).filter(Boolean))];
    const ads = [...new Set(lights.map((l) => l.adaptive).filter((v) => v !== null && v !== "any"))];
    headlight = { tech: techs.length === 1 ? techs[0] : null, adaptive: ads.length === 1 ? ads[0] : null, conflict: techs.length > 1 || ads.length > 1 };
  }
  // A transmission the build sheet doesn't recognise (e.g. Sequential) makes it unknown.
  const unknownGear = car?.transmission && !readText(car.transmission).gear.is.length;
  return { headlight, transmission: unknownGear ? null : single(gears), drivetrain: single(drives), has, hasNot };
}

// The feature that meets a plain requirement ("M Sport package"), or null.
// Same words, nothing more or less ("Sport package" isn't "M Sport package").
export function matchFeature(car, requirement) {
  const need = readText(requirement).plain.need;
  if (!need.length) return null;
  const feats = (car?.features || []).filter((f) => typeof f === "string" && f.trim());
  const pool = [...feats, car?.drivetrain, car?.transmission, car?.engine].filter(Boolean);
  const key = (w) => [...new Set(w)].sort().join(" ");
  return pool.find((f) => need.every((n) => readText(f).plain.need.some((h) => key(h) === key(n)))) || null;
}

const lightName = (h) =>
  [h.adaptive === true ? "adaptive" : h.adaptive === false ? "non-adaptive" : "", h.tech ? (h.tech === "led" ? "LED" : h.tech) : "", "headlights"].filter(Boolean).join(" ");
const TRANS = { manual: "a manual", automatic: "an automatic", dct: "a dual-clutch (DCT)", cvt: "a CVT" };
const DRIVE = { awd: "all-wheel drive", rwd: "rear-wheel drive", fwd: "front-wheel drive" };

// Headlights: the part's needs against the car.
function compareLights(part, car, name, strong) {
  const bad = (why) => ({ verdict: strong ? "no" : "check", text: `${strong ? "Won't fit" : "Likely won't fit"}: ${why}` });
  if (!car || (!car.tech && car.adaptive === null)) {
    return { verdict: "check", text: `It's for cars with ${lightName({ ...part, adaptive: part.adaptive === "any" ? null : part.adaptive })}. Add your headlight type to your car's features in your garage and TUNR will check.` };
  }
  if (car.conflict) return { verdict: "check", text: "Your garage lists more than one headlight type for this car. Fix that so TUNR can check." };
  if (car.tech && part.notTech.includes(car.tech)) return bad(`the listing says it's not for ${lightName({ tech: car.tech, adaptive: null })}, and that's what your ${name} has.`);
  if (part.tech && car.tech && part.tech !== car.tech) return bad(`it's for ${lightName(part)} and your ${name} has ${lightName(car)}.`);
  const pa = part.adaptive === null && part.tech === "halogen" ? false : part.adaptive;
  const ca = car.adaptive === null && car.tech === "halogen" ? false : car.adaptive;
  if (pa !== "any") {
    if (pa !== null && ca !== null && pa !== ca) return bad(`it's for ${lightName(part)} and your ${name} has ${lightName(car)}. Adaptive and non-adaptive headlights aren't interchangeable.`);
    if (pa === true && ca === null) return { verdict: "check", text: `It needs adaptive headlights; your garage just says ${lightName(car)}. Adaptive and regular units aren't interchangeable: if yours aren't adaptive, it won't fit.` };
    if (pa === false && ca === null) return { verdict: "check", text: `It's a non-adaptive unit; your garage just says ${lightName(car)}. If yours are adaptive, it won't fit. Add "adaptive" or "non-adaptive" to your car's features.` };
    if (pa === null && ca !== null) return { verdict: "check", text: `The listing doesn't say if these are adaptive. Your ${name} has ${lightName(car)}, and the other kind won't fit. Ask the seller for the part number.` };
    if (pa === null && ca === null) return { verdict: "check", text: `Neither the listing nor your garage says if these are adaptive, and adaptive and regular units aren't interchangeable. Ask the seller for the part number.` };
  }
  if (part.tech && !car.tech) return { verdict: "check", text: `It's for ${lightName(part)}; your garage doesn't say which kind yours are.` };
  return null; // agrees
}

function compareChoice(kind, part, carVal, name, strong) {
  const label = kind === "gear" ? TRANS : DRIVE;
  const what = (v) => `${label[v]}${kind === "gear" ? " transmission" : ""}`;
  const want = single(part.is);
  if (!want && !part.not.length) return null;
  if (!want && part.is.length > 1) return { verdict: "check", text: "The listing names more than one; check which yours is." };
  if (!carVal) return { verdict: "check", text: `It's for ${want ? what(want) : `cars without ${what(part.not[0])}`}. Add yours to your car's build sheet so TUNR can check.` };
  if (part.not.includes(carVal)) return { verdict: strong ? "no" : "check", text: `${strong ? "Won't fit" : "Likely won't fit"}: the listing says it's not for ${what(carVal)}, and your ${name} is.` };
  if (!want || want === carVal) return null;
  // "Automatic" gets used for DCTs and CVTs too: check rather than say no.
  const soft = kind === "gear" && [want, carVal].includes("automatic") && ([want, carVal].includes("dct") || [want, carVal].includes("cvt"));
  return { verdict: strong && !soft ? "no" : "check", text: `${strong && !soft ? "Won't fit" : "Likely won't fit"}: it's for ${what(want)} and your ${name} is ${label[carVal]}.` };
}

const key = (w) => [...new Set(w)].sort().join(" ");
function comparePlain(part, facts, name, strong, raw) {
  const out = [];
  for (const n of part.need) {
    if (facts.has.some((h) => key(h) === key(n))) continue;
    out.push({ verdict: "check", text: `Needs ${n.join(" ")}${raw ? "" : ""}. Does your ${name} have that? Add it to your car's features in your garage and TUNR will check for you.` });
  }
  for (const n of part.not) {
    if (facts.has.some((h) => key(h) === key(n))) out.push({ verdict: strong ? "no" : "check", text: `${strong ? "Won't fit" : "Likely won't fit"}: the listing says it's not for cars with ${n.join(" ")}, and your ${name} has it.` });
  }
  return out;
}

// Merge what fit_requires says (strong) with what the title and notes say
// (weak). A field set in both that disagrees makes the listing unclear.
function mergeSide(strong, weak) {
  const res = [];
  // headlights
  let light = null;
  let lightStrong = false;
  if (strong.light && (strong.light.tech || strong.light.adaptive !== null || strong.light.notTech.length)) {
    light = { ...strong.light };
    lightStrong = true;
    if (weak.light) {
      if (weak.product) {
        // the title describes the bulb or kit itself
      } else if (!light.tech && weak.light.tech) light = { ...light, tech: weak.light.tech, weakTech: true };
      else if (light.tech && weak.light.tech && weak.light.tech !== light.tech) res.push({ verdict: "check", text: `The listing is unclear: it says ${lightName({ tech: light.tech, adaptive: null })} in one place and ${lightName({ tech: weak.light.tech, adaptive: null })} in another. Ask the seller for the part number.` });
      if (light.adaptive !== null && weak.light.adaptive !== null && weak.light.adaptive !== "any" && light.adaptive !== "any" && weak.light.adaptive !== light.adaptive) {
        res.push({ verdict: "check", text: "The listing is unclear about whether these are adaptive. Ask the seller for the part number." });
      }
    }
  } else if (weak.light && (weak.light.tech || weak.light.adaptive !== null || weak.light.notTech.length)) {
    light = { ...weak.light };
  }
  // A bulb or conversion kit: the light type in its title is the product, not the car.
  // ("HID kit for halogen headlights": the car needs halogen.)
  if (weak.product && !lightStrong) light = weak.forTech ? { tech: weak.forTech, adaptive: null, notTech: [] } : null;
  const choice = (k) => {
    if (strong[k].is.length || strong[k].not.length) {
      const sv = single(strong[k].is);
      const wv = single(weak[k].is);
      if (sv && wv && sv !== wv) res.push({ verdict: "check", text: `The listing is unclear: it says ${(k === "gear" ? TRANS : DRIVE)[sv]} in one place and ${(k === "gear" ? TRANS : DRIVE)[wv]} in another.` });
      return { val: strong[k], strong: true };
    }
    return { val: weak[k], strong: false };
  };
  return { light, lightStrong, gear: choice("gear"), drive: choice("drive"), plain: strong.plain, unit: (weak.unit && !weak.product) || strong.unit, extra: res };
}

// Every word of the listing's trim / chassis code is in the car's model or trim.
function trimMatches(fitTrim, car) {
  const need = plainWords(normalize(fitTrim));
  if (!need.length) return true;
  const have = new Set(plainWords(normalize(`${car?.model || ""} ${car?.trim || ""}`)));
  return need.every((w) => have.has(w));
}

const VERSION_WORDS = new Set(["xdrive", "sdrive", "4matic", "quattro", "awd", "rwd", "fwd", "4motion", "4wd", "sedan", "coupe", "hatchback", "hatch", "wagon", "touring", "convertible", "cabriolet", "cabrio", "gran", "sportback", "lwb", "swb"]);

// Same model, allowing "C 300" = "C300" and "540i xDrive" ⊇ "540i".
function modelMatch(listingModel, carModel) {
  if (squash(listingModel) === squash(carModel)) return "same";
  const lw = plainWords(normalize(listingModel));
  const cw = new Set(plainWords(normalize(carModel)));
  if (lw.length && lw.every((w) => cw.has(w))) return "same";
  const cl = plainWords(normalize(carModel));
  const lset = new Set(lw);
  // The listing adds words: a drivetrain or body ("540i xDrive") is the same
  // car, worth a check; anything else ("WRX STI") is a different model.
  if (cl.length && cl.every((w) => lset.has(w))) {
    const extra = lw.filter((w) => !cl.includes(w));
    return extra.every((w) => VERSION_WORDS.has(w)) ? "narrower" : "different";
  }
  return "different";
}

// One listing against one car → { verdict: "fits" | "check" | "no" | "unknown", text, reasons }.
export function checkFit(l, car) {
  if (!l || !car) return null;
  const name = carName(car);
  const made = fitLabel(l);
  const results = [];

  if (!l.fit_universal) {
    if (!l.fit_make) return { verdict: "unknown", text: "The seller didn't say which car this fits. Ask before you buy.", reasons: [] };
    const nope = { verdict: "no", text: `Doesn't fit your ${name}. It's made for a ${made}.` };
    if (squash(l.fit_make) !== squash(car.make)) return { ...nope, reasons: [nope.text] };
    if (car.year && l.fit_year_from && (car.year < l.fit_year_from || car.year > (l.fit_year_to ?? l.fit_year_from))) return { ...nope, reasons: [nope.text] };
    if (!l.fit_model) results.push({ verdict: "check", text: `The seller says it fits a ${l.fit_make} but didn't say which model. Ask before you buy.` });
    else {
      const m = modelMatch(l.fit_model, car.model);
      if (m === "narrower") results.push({ verdict: "check", text: `It's for the ${l.fit_model}; your garage says ${car.model}. Make sure it's the same version.` });
      else if (m === "different") {
        if (l.fit_trim && car.trim && trimMatches(l.fit_trim, car) && /\b[a-z]\d{2}\b/i.test(l.fit_trim)) {
          results.push({ verdict: "check", text: `Made for the ${l.fit_model} ${l.fit_trim}. Your ${car.model} is a ${l.fit_trim} too, so it may fit (many parts are shared). Confirm the part number with the seller.` });
        } else return { ...nope, reasons: [nope.text] };
      }
    }
    if (!car.year && l.fit_year_from) results.push({ verdict: "check", text: `Made for a ${made}. Add your car's year in your garage so TUNR can check.` });
    if (l.fit_trim && !trimMatches(l.fit_trim, car)) {
      results.push(car.trim
        ? { verdict: "check", text: `Made for the ${l.fit_trim}; your garage says ${car.trim}. Make sure it's the same before you buy.` }
        : { verdict: "check", text: `Made for the ${l.fit_trim}. Add your trim or chassis code in your garage so TUNR can check.` });
    }
  }

  const facts = carFacts(car);
  const side = mergeSide(readText(l.fit_requires), readText(`${l.title || ""}. ${l.fits || ""}`));
  results.push(...side.extra);
  if (side.light) results.push(compareLights(side.light, facts.headlight, name, side.lightStrong && !side.light.weakTech));
  else if (side.unit) {
    results.push({
      verdict: "check",
      text: facts.headlight
        ? `Headlights for this car come in more than one version, and the listing doesn't say which. Yours are ${lightName(facts.headlight)}. Ask the seller for the part number.`
        : "Headlights for this car come in more than one version, and the listing doesn't say which. Add your headlight type to your car's features, and ask the seller for the part number.",
    });
  }
  results.push(compareChoice("gear", side.gear.val, facts.transmission, name, side.gear.strong));
  results.push(compareChoice("drive", side.drive.val, facts.drivetrain, name, side.drive.strong));
  results.push(...comparePlain(side.plain, facts, name, true));

  const found = results.filter(Boolean);
  const no = found.find((r) => r.verdict === "no");
  if (no) return { ...no, reasons: found.map((r) => r.text) };
  const check = found.find((r) => r.verdict === "check");
  if (check) return { ...check, reasons: found.map((r) => r.text) };
  const why = l.fit_universal ? " (universal part)" : side.light && facts.headlight ? `, which has ${lightName(facts.headlight)}` : side.plain.need.length ? ": it has what the listing needs" : "";
  return { verdict: "fits", text: `Fits your ${name}${why}.`, reasons: [] };
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
