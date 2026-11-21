import { test } from "node:test";
import assert from "node:assert/strict";
import { fitLabel, fitWarning, fitProblem, fitRow, fitFilter, filterLabel, YEARS } from "../src/lib/fitment.js";

test("what a part fits, in words", () => {
  assert.equal(fitLabel({ fit_make: "Subaru", fit_model: "WRX", fit_year_from: 2015, fit_year_to: 2021 }), "2015–2021 Subaru WRX");
  assert.equal(fitLabel({ fit_make: "Honda", fit_model: "S2000", fit_year_from: 2004, fit_year_to: 2004 }), "2004 Honda S2000");
  assert.equal(fitLabel({ fit_universal: true }), "Universal fit");
  assert.equal(fitLabel({ fit_make: "Other", fit_model: "Yugo GV", fit_year_from: 1987 }), "1987 Yugo GV");
  assert.equal(fitLabel({ title: "old listing" }), "", "listings from before fitment show nothing");
  // The G30 headlight case: trim, what the car needs, and the part number.
  const lamp = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2017, fit_year_to: 2020, fit_trim: "G30", fit_requires: "Adaptive LED headlights" };
  assert.equal(fitLabel(lamp), "2017–2020 BMW 540i G30");
  assert.equal(fitWarning(lamp), "Only fits cars with Adaptive LED headlights");
  assert.equal(fitWarning({}), "");
});

test("the sell form needs make, model and year (or universal)", () => {
  assert.match(fitProblem({}), /make/);
  assert.match(fitProblem({ fit_make: "Honda" }), /model/);
  assert.match(fitProblem({ fit_make: "Honda", fit_model: "Civic" }), /year/);
  assert.match(fitProblem({ fit_make: "Honda", fit_model: "Civic", fit_year_from: "2010", fit_year_to: "2004" }), /before the first/);
  assert.equal(fitProblem({ fit_make: "Honda", fit_model: "Civic", fit_year_from: "2016" }), "");
  assert.equal(fitProblem({ fit_universal: true }), "");
  assert.deepEqual(fitRow({ fit_make: "Honda", fit_model: " Civic ", fit_year_from: "2016", fit_year_to: "" }), { fit_universal: false, fit_make: "Honda", fit_model: "Civic", fit_year_from: 2016, fit_year_to: 2016, fit_trim: null, fit_requires: null, part_number: null });
  assert.deepEqual(fitRow({ fit_universal: true, fit_make: "Honda", fit_trim: "Si", part_number: " 123 45 " }), { fit_universal: true, fit_make: null, fit_model: null, fit_year_from: null, fit_year_to: null, fit_trim: null, fit_requires: null, part_number: "123 45" });
});

test("the Parts filter: that car's parts plus universal ones", () => {
  assert.equal(fitFilter(null), null);
  assert.equal(fitFilter({ make: "Subaru" }), 'fit_universal.is.true,and(fit_make.eq."Subaru")');
  assert.equal(
    fitFilter({ make: "BMW", model: "650i, Alpina B6", year: 2012 }),
    'fit_universal.is.true,and(fit_make.eq."BMW",fit_model.eq."650i, Alpina B6",fit_year_from.lte.2012,fit_year_to.gte.2012)',
    "commas in a model name are quoted"
  );
  assert.equal(filterLabel({ make: "BMW", model: "M2", year: 2019 }), "Fits 2019 BMW M2");
  assert.equal(
    fitFilter({ make: "BMW", year: 2019, trim: "G30" }),
    'fit_universal.is.true,and(fit_make.eq."BMW",fit_year_from.lte.2019,fit_year_to.gte.2019,or(fit_trim.is.null,fit_trim.ilike."*G30*"))',
    "a trim narrows it, but parts for every trim still show"
  );
  assert.equal(fitFilter({ make: "BMW", trim: "*,()" }), 'fit_universal.is.true,and(fit_make.eq."BMW")', "filter characters in a typed trim are dropped");
  assert.equal(filterLabel({ make: "BMW", model: "540i", year: 2019, trim: "G30" }), "Fits 2019 BMW 540i G30");
  assert.equal(filterLabel({ make: "Honda" }), "Fits Honda");
  assert.equal(YEARS[0], new Date().getFullYear() + 1, "next year's models first");
  assert.equal(YEARS.at(-1), 1950);
});

import { checkFit, bestFit, matchFeature } from "../src/lib/fitment.js";

const lamp = { fit_make: "BMW", fit_model: "540i", fit_year_from: 2017, fit_year_to: 2020, fit_trim: "G30", fit_requires: "Adaptive LED headlights" };
const my540 = { year: 2019, make: "BMW", model: "540i", trim: "xDrive G30", features: ["Adaptive LED headlights", "M Sport package"] };

test("TUNR tells you if a part fits your car", () => {
  assert.equal(checkFit(lamp, my540).verdict, "fits");
  assert.match(checkFit(lamp, my540).text, /yours has Adaptive LED headlights/);
  // Same car without the adaptive lights listed: we can't be sure.
  const plain = { ...my540, features: ["LED headlights"] };
  assert.equal(checkFit(lamp, plain).verdict, "check", "plain LED isn't adaptive");
  assert.match(checkFit(lamp, plain).text, /^Needs Adaptive LED headlights/);
  // Wrong car, wrong year.
  assert.equal(checkFit(lamp, { year: 2019, make: "BMW", model: "M2" }).verdict, "no");
  assert.equal(checkFit(lamp, { year: 2014, make: "BMW", model: "540i", trim: "F10" }).verdict, "no");
  assert.equal(checkFit(lamp, { year: 2019, make: "Audi", model: "A6" }).verdict, "no");
  assert.match(checkFit(lamp, { year: 2019, make: "Audi", model: "A6" }).text, /made for a 2017–2020 BMW 540i G30/);
  // Same chassis, another model: likely, confirm.
  const my530 = { year: 2018, make: "BMW", model: "530i", trim: "G30", features: ["Adaptive LED headlights"] };
  assert.equal(checkFit(lamp, my530).verdict, "check");
  assert.match(checkFit(lamp, my530).text, /likely fits/);
  // Missing details on the car: ask for them.
  assert.match(checkFit(lamp, { make: "BMW", model: "540i" }).text, /Add your car's year/);
  assert.match(checkFit({ ...lamp, fit_requires: null }, { year: 2019, make: "BMW", model: "540i" }).text, /Add your trim or chassis code/);
  assert.equal(checkFit({ ...lamp, fit_requires: null }, { year: 2019, make: "BMW", model: "540i", trim: "F10" }).verdict, "check", "a different trim: check, don't guess");
  // Universal and unknown.
  assert.equal(checkFit({ fit_universal: true }, my540).verdict, "fits");
  assert.equal(checkFit({ title: "old" }, my540).verdict, "unknown");
  assert.equal(checkFit(lamp, null), null);
});

test("features and the build sheet count", () => {
  assert.equal(matchFeature({ features: ["adaptive led headlights"] }, "Adaptive LED headlights"), "adaptive led headlights");
  assert.equal(matchFeature({ features: ["Adaptive headlights"] }, "Adaptive LED headlights"), null, "every word of the requirement");
  assert.equal(matchFeature({ drivetrain: "AWD" }, "AWD only"), "AWD", "the build sheet's drivetrain counts");
  assert.equal(matchFeature({ transmission: "Manual" }, "Manual transmission"), null);
  assert.equal(matchFeature({ features: ["Manual transmission"] }, "manual"), "Manual transmission");
});

test("the best answer across your garage", () => {
  const m2 = { year: 2019, make: "BMW", model: "M2" };
  const best = bestFit(lamp, [m2, my540]);
  assert.equal(best.verdict, "fits");
  assert.equal(best.car, my540);
  assert.equal(bestFit(lamp, [m2]).verdict, "no");
  assert.equal(bestFit(lamp, []), null, "no cars: nothing to say");
});
