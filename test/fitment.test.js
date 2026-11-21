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
