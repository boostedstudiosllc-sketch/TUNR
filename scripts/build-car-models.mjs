// Builds src/data/carModels.js: every model for each make in the add-a-car
// make list, so the model is picked from a list, never typed.
//
// Source: NHTSA's free vehicle database (vPIC), passenger cars, SUVs/vans
// (MPV) and pickups (truck) for each make, plus a hand-kept list of cars
// that are common at meets but were never sold in the US (JDM imports and
// the like), in EXTRA below. Re-run once a year for new models:
//
//   node scripts/build-car-models.mjs
//
// Needs internet access. Makes come from MAKES (keep in step with the
// car_makes table: 082_more_makes.sql and earlier).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MAKES = ["Acura", "Alfa Romeo", "Aston Martin", "Audi", "BMW", "Bentley", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ferrari", "Fiat", "Ford", "GMC", "Genesis", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lotus", "Lucid", "MINI", "Maserati", "Mazda", "McLaren", "Mercedes-Benz", "Mitsubishi", "Nissan", "Polestar", "Pontiac", "Porsche", "Ram", "Rivian", "Rolls-Royce", "Saab", "Scion", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo"];

// Never sold new in the US (or sold under another name), but seen at meets.
const EXTRA = {
  Nissan: ["180SX", "200SX", "Silvia", "Silvia S13", "Silvia S14", "Silvia S15", "Skyline", "Skyline GT-R", "Skyline GT-R R32", "Skyline GT-R R33", "Skyline GT-R R34", "Stagea", "Laurel", "Cefiro", "Fairlady Z", "Pulsar GTI-R", "Figaro"],
  Toyota: ["Chaser", "Mark II", "Cresta", "Soarer", "Aristo", "Crown", "Century", "Sprinter Trueno", "Corolla Levin", "Celica GT-Four", "Altezza", "MR-S", "Hilux", "Land Cruiser 70", "GR Yaris"],
  Honda: ["Integra Type R", "Civic Type R", "Beat", "City", "NSX-R", "S660", "Accord Euro R", "Torneo", "CR-X", "Civic Hatchback", "Civic Coupe"],
  Acura: ["Integra Type R", "Integra Type S", "NSX Type S", "TLX Type S", "RSX Type-S"],
  Lexus: ["IS F", "IS 250", "IS 300", "IS 350", "IS 500", "GS F", "GS 300", "GS 400", "GS 430", "RC F", "RC 350", "LC 500", "SC 300", "SC 400", "LS 400", "LS 460", "LS 500"],
  "Mercedes-Benz": ["C63 AMG", "E63 AMG", "G63 AMG", "CLA 45 AMG", "AMG GT R", "SLS AMG", "190E 2.3-16"],
  Infiniti: ["G35", "G37", "Q50 Red Sport", "Q60 Red Sport"],
  Dodge: ["Challenger SRT Hellcat", "Charger SRT Hellcat", "Viper ACR"],
  Mazda: ["RX-7 FD", "RX-7 FC", "Savanna RX-7", "Cosmo", "Eunos Roadster", "AZ-1", "Autozam AZ-1"],
  Mitsubishi: ["Lancer Evolution", "Lancer Evolution IX", "Lancer Evolution X", "GTO", "FTO", "Pajero", "Delica"],
  Subaru: ["Impreza WRX STI", "Impreza 22B", "Legacy B4", "Forester STI", "Sambar"],
  Suzuki: [],
  Volkswagen: ["Golf R32", "Scirocco", "Corrado", "Polo GTI"],
  Ford: ["Escort RS Cosworth", "Sierra RS Cosworth", "Focus RS", "Fiesta ST"],
  Chevrolet: ["Chevelle", "Nova", "El Camino", "Bel Air", "Monte Carlo", "Caprice", "Impala SS"],
  BMW: ["M3 E30", "M3 E36", "M3 E46", "M3 E92", "M4 Competition", "M5 Competition", "1M"],
};

// Not really models (chassis-only listings and the like).
const SKIP = /chassis|cutaway|stripped|incomplete|motor ?home|\bbus\b|glider|cab[- ]?over|^L[PS]*\d{4}$/i;

async function models(make, type) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/vehicletype/${type}?format=json`;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`NHTSA said ${res.status}`);
      const data = await res.json();
      return (data.Results || []).filter((r) => r.Make_Name?.toLowerCase() === make.toLowerCase()).map((r) => r.Model_Name.trim());
    } catch (e) {
      if (i === 3) throw new Error(`${make} ${type}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const out = {};
for (const make of MAKES) {
  const names = new Set(EXTRA[make] || []);
  for (const type of ["car", "mpv", "truck"]) for (const m of await models(make, type)) if (m && !SKIP.test(m)) names.add(m);
  out[make] = [...names].sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
  console.log(make, out[make].length);
  await new Promise((r) => setTimeout(r, 300));
}

// NHTSA files Scion's cars under Toyota ("Scion tC").
out.Scion = [...new Set([...(out.Scion || []), ...out.Toyota.filter((m) => /^Scion /.test(m)).map((m) => m.replace(/^Scion /, ""))])].sort();

const body = `// Every model for each make, for the add-a-car form's model list (pick one;
// no typing). Built by scripts/build-car-models.mjs from NHTSA's vehicle
// database plus imports common at meets. Don't edit by hand: add to EXTRA in
// that script and re-run it.
// Built ${new Date().toISOString().slice(0, 10)}.

export const CAR_MODELS = ${JSON.stringify(out, null, 0).replace(/\],"/g, '],\n  "').replace(/^\{"/, '{\n  "').replace(/\]\}$/, ']\n}')};

// The models for a make (case doesn't matter), or [] for one not listed.
export function modelsFor(make) {
  if (!make) return [];
  const key = Object.keys(CAR_MODELS).find((k) => k.toLowerCase() === String(make).toLowerCase());
  return key ? CAR_MODELS[key] : [];
}
`;
fs.writeFileSync(path.join(ROOT, "src/data/carModels.js"), body);
console.log("wrote src/data/carModels.js");
