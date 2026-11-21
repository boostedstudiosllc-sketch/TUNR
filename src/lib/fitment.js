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
  return [years, l.fit_make === "Other" ? "" : l.fit_make, l.fit_model].filter(Boolean).join(" ");
}

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
  if (d.fit_universal) return { fit_universal: true, fit_make: null, fit_model: null, fit_year_from: null, fit_year_to: null };
  const from = Number(d.fit_year_from) || null;
  const to = Number(d.fit_year_to) || from;
  return { fit_universal: false, fit_make: d.fit_make || null, fit_model: String(d.fit_model || "").trim() || null, fit_year_from: from, fit_year_to: to };
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
  return `fit_universal.is.true,and(${parts.join(",")})`;
}

// The chip text for an active filter: "Fits 2019 BMW M2".
export const filterLabel = (f) => (f?.make ? `Fits ${[f.year, f.make, f.model].filter(Boolean).join(" ")}` : "");
