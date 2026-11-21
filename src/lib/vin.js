// VINs (131_vehicle_vins.sql): tidy what people type, check the check digit
// (catches most typos), and turn NHTSA's decoder answer into garage fields.
// No network here (api/_routes/vin.js calls NHTSA), so it's unit-tested
// (test/vin.test.js).

// Upper case, no spaces or dashes; letters that look like digits fixed
// (VINs never use I, O or Q).
export function cleanVin(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IO]/g, (c) => (c === "I" ? "1" : "0"))
    .replace(/Q/g, "0");
}

const VALUES = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// The 9th character is a check digit on every car sold in North America.
export function vinCheckDigitOk(vin) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin || "")) return false;
  const sum = [...vin].reduce((n, c, i) => n + (/\d/.test(c) ? Number(c) : VALUES[c]) * WEIGHTS[i], 0);
  const r = sum % 11;
  return vin[8] === (r === 10 ? "X" : String(r));
}

// → "" when it looks right, otherwise what's wrong.
export function vinProblem(vin) {
  if (!vin) return "Type the 17-character VIN (on the driver's side of the dashboard, the door jamb, or your registration).";
  if (vin.length !== 17) return `A VIN has 17 characters; that's ${vin.length}.`;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "A VIN only has letters and numbers.";
  if (!vinCheckDigitOk(vin)) return "That VIN doesn't add up, so there's probably a typo. Check it against your registration.";
  return "";
}

// NHTSA's result → { year, make, model, trim, body, drivetrain, transmission, engine, series }.
// makes: TUNR's make list (to match "MERCEDES-BENZ" to "Mercedes-Benz").
export function fromVpic(r, makes = []) {
  if (!r || !r.Make) return null;
  // With TUNR's make list: its spelling, or "Other". Without: NHTSA's as-is.
  const make = makes.length ? makes.find((m) => m.toLowerCase() === String(r.Make).toLowerCase()) || "Other" : String(r.Make);
  const drive = String(r.DriveType || "");
  const drivetrain = /4x4|4wd|four/i.test(drive) ? "4WD" : /awd|all/i.test(drive) ? "AWD" : /rwd|rear/i.test(drive) ? "RWD" : /fwd|front/i.test(drive) ? "FWD" : "";
  const trans = String(r.TransmissionStyle || "");
  const transmission = /dual|dct/i.test(trans) ? "DCT" : /cvt|continuously/i.test(trans) ? "CVT" : /manual/i.test(trans) ? "Manual" : /automatic/i.test(trans) ? "Automatic" : "";
  const litres = Number(r.DisplacementL);
  const engine = [litres ? `${litres.toFixed(1)}L` : "", r.EngineCylinders ? `${r.EngineCylinders}-cylinder` : "", r.EngineModel || "", /electric/i.test(r.FuelTypePrimary || "") ? "electric" : ""].filter(Boolean).join(" ");
  return {
    year: Number(r.ModelYear) || null,
    make,
    model: String(r.Model || "").trim(),
    trim: [r.Trim, r.Trim2].filter(Boolean).join(" ").trim(),
    series: String(r.Series || "").trim(),
    body: String(r.BodyClass || "").replace(/\/.*$/, "").trim(),
    drivetrain,
    transmission,
    engine,
  };
}

// One line for the garage: "2019 BMW 540i xDrive · Sedan · AWD · Automatic · 3.0L 6-cylinder".
export function decodedLine(d) {
  if (!d) return "";
  return [[d.year, d.make, d.model, d.trim].filter(Boolean).join(" "), d.body, d.drivetrain, d.transmission, d.engine].filter(Boolean).join(" · ");
}

// Shown in the garage: only the last 6 characters.
export const maskVin = (vin) => (vin ? `•••••••••••${String(vin).slice(-6)}` : "");
