// Guess the Car photos from Wikimedia Commons (free, no key). The admin's
// own phone or computer asks Commons for each car below, keeps one freely
// licensed outdoor shot of the whole car, and saves it with its credit
// (photographer, licence, link), which the licences require. Runs in the
// browser: Commons allows that (origin=*), and it isn't rate-limited there
// the way shared cloud servers are.

const API = "https://commons.wikimedia.org/w/api.php";

// [make, model, search words]. Cars you'd see at a Georgia meet.
export const CAR_LIST = [
  ["Nissan", "GT-R", "Nissan GT-R R35"], ["Nissan", "Skyline GT-R", "Nissan Skyline GT-R R34"], ["Nissan", "370Z", "Nissan 370Z"], ["Nissan", "Z", "Nissan Z 2023"], ["Nissan", "350Z", "Nissan 350Z"], ["Nissan", "240SX", "Nissan 240SX"], ["Nissan", "Silvia S15", "Nissan Silvia S15"],
  ["Toyota", "Supra", "Toyota GR Supra"], ["Toyota", "Supra MK4", "Toyota Supra A80"], ["Toyota", "GR86", "Toyota GR86"], ["Toyota", "AE86", "Toyota AE86 Trueno"], ["Toyota", "Camry TRD", "Toyota Camry TRD"], ["Toyota", "Tacoma", "Toyota Tacoma"], ["Toyota", "4Runner", "Toyota 4Runner"], ["Toyota", "GR Corolla", "Toyota GR Corolla"],
  ["Honda", "Civic Type R", "Honda Civic Type R FK8"], ["Honda", "Civic Si", "Honda Civic Si"], ["Honda", "S2000", "Honda S2000"], ["Honda", "NSX", "Honda NSX"], ["Honda", "Accord", "Honda Accord 2018"], ["Honda", "Prelude", "Honda Prelude"],
  ["Acura", "Integra Type R", "Acura Integra Type R"], ["Acura", "NSX", "Acura NSX 2017"], ["Acura", "TLX Type S", "Acura TLX Type S"],
  ["Subaru", "WRX STI", "Subaru WRX STI"], ["Subaru", "BRZ", "Subaru BRZ"], ["Subaru", "Impreza WRX", "Subaru Impreza WRX GC8"],
  ["Mazda", "MX-5 Miata", "Mazda MX-5 ND"], ["Mazda", "RX-7", "Mazda RX-7 FD"], ["Mazda", "RX-8", "Mazda RX-8"], ["Mazda", "Mazdaspeed3", "Mazdaspeed3"],
  ["Mitsubishi", "Lancer Evolution", "Mitsubishi Lancer Evolution X"], ["Mitsubishi", "3000GT", "Mitsubishi 3000GT"], ["Mitsubishi", "Eclipse", "Mitsubishi Eclipse 1997"],
  ["Lexus", "IS 350", "Lexus IS 350"], ["Lexus", "LC 500", "Lexus LC 500"], ["Lexus", "RC F", "Lexus RC F"], ["Infiniti", "Q50", "Infiniti Q50"], ["Infiniti", "G35", "Infiniti G35 coupe"], ["Infiniti", "Q60", "Infiniti Q60"],
  ["BMW", "M3", "BMW M3 G80"], ["BMW", "M3 E46", "BMW M3 E46"], ["BMW", "M4", "BMW M4 F82"], ["BMW", "M5", "BMW M5 F90"], ["BMW", "M2", "BMW M2"], ["BMW", "X5 M", "BMW X5 M"], ["BMW", "i8", "BMW i8"],
  ["Mercedes-Benz", "AMG GT", "Mercedes-AMG GT"], ["Mercedes-Benz", "C63 AMG", "Mercedes-AMG C63"], ["Mercedes-Benz", "G-Class", "Mercedes-Benz G-Class G63"], ["Mercedes-Benz", "S-Class", "Mercedes-Benz S-Class W223"],
  ["Audi", "R8", "Audi R8"], ["Audi", "RS3", "Audi RS3 sedan"], ["Audi", "RS5", "Audi RS5"], ["Audi", "RS6 Avant", "Audi RS6 Avant C8"], ["Audi", "TT", "Audi TT"],
  ["Volkswagen", "Golf GTI", "Volkswagen Golf GTI Mk7"], ["Volkswagen", "Golf R", "Volkswagen Golf R"], ["Volkswagen", "Jetta GLI", "Volkswagen Jetta GLI"],
  ["Porsche", "911 GT3", "Porsche 911 GT3 992"], ["Porsche", "911 Turbo", "Porsche 911 Turbo S"], ["Porsche", "Cayman", "Porsche 718 Cayman"], ["Porsche", "Taycan", "Porsche Taycan"], ["Porsche", "Cayenne", "Porsche Cayenne"],
  ["Ford", "Mustang GT", "Ford Mustang GT 2018"], ["Ford", "Mustang Shelby GT500", "Shelby GT500 2020"], ["Ford", "Mustang Fox Body", "Ford Mustang fox body"], ["Ford", "F-150 Raptor", "Ford F-150 Raptor"], ["Ford", "Bronco", "Ford Bronco 2021"], ["Ford", "GT", "Ford GT 2017"], ["Ford", "Focus RS", "Ford Focus RS"],
  ["Chevrolet", "Corvette C8", "Chevrolet Corvette C8"], ["Chevrolet", "Corvette C7", "Chevrolet Corvette C7"], ["Chevrolet", "Camaro SS", "Chevrolet Camaro SS"], ["Chevrolet", "Camaro ZL1", "Chevrolet Camaro ZL1"], ["Chevrolet", "Silverado", "Chevrolet Silverado"], ["Chevrolet", "Impala SS", "Chevrolet Impala SS 1996"], ["Chevrolet", "Chevelle SS", "Chevrolet Chevelle SS"],
  ["Dodge", "Challenger", "Dodge Challenger SRT Hellcat"], ["Dodge", "Charger", "Dodge Charger SRT"], ["Dodge", "Viper", "Dodge Viper"], ["Dodge", "Durango SRT", "Dodge Durango SRT"],
  ["Cadillac", "CT5-V Blackwing", "Cadillac CT5-V Blackwing"], ["Cadillac", "Escalade", "Cadillac Escalade"], ["Pontiac", "GTO", "Pontiac GTO 1967"], ["Pontiac", "Firebird Trans Am", "Pontiac Firebird Trans Am"], ["Buick", "Grand National", "Buick Grand National"],
  ["Jeep", "Wrangler", "Jeep Wrangler JL"], ["Jeep", "Grand Cherokee Trackhawk", "Jeep Grand Cherokee Trackhawk"], ["Ram", "TRX", "Ram 1500 TRX"], ["GMC", "Sierra", "GMC Sierra"],
  ["Tesla", "Model 3", "Tesla Model 3"], ["Tesla", "Model S Plaid", "Tesla Model S"], ["Hyundai", "Elantra N", "Hyundai Elantra N"], ["Hyundai", "Veloster N", "Hyundai Veloster N"], ["Kia", "Stinger", "Kia Stinger"], ["Genesis", "G70", "Genesis G70"],
  ["Lamborghini", "Huracán", "Lamborghini Huracan"], ["Lamborghini", "Aventador", "Lamborghini Aventador"], ["Lamborghini", "Urus", "Lamborghini Urus"], ["Ferrari", "488", "Ferrari 488 GTB"], ["Ferrari", "F8 Tributo", "Ferrari F8 Tributo"], ["Ferrari", "SF90", "Ferrari SF90 Stradale"],
  ["McLaren", "720S", "McLaren 720S"], ["McLaren", "570S", "McLaren 570S"], ["Aston Martin", "Vantage", "Aston Martin Vantage 2018"], ["Bentley", "Continental GT", "Bentley Continental GT"], ["Rolls-Royce", "Cullinan", "Rolls-Royce Cullinan"],
  ["Alfa Romeo", "Giulia Quadrifoglio", "Alfa Romeo Giulia Quadrifoglio"], ["MINI", "Cooper S", "Mini Cooper S F56"], ["Volvo", "240", "Volvo 240"],
];

// Shots that aren't the whole car from outside, or aren't the real thing.
const SKIP = /\b(interior|engine|motor|dashboard|cockpit|seats?|steering|badge|emblem|logo|wheels?|rims?|tyres?|tires?|brakes?|exhaust|detail|headlights?|taillights?|grille|trunk|boot|toy|lego|diecast|die-cast|matchbox|drawing|diagram|crash|wreck|accident|police|taxi|race|racing|rally|nascar|cutaway|chassis)\b|scale.?model|model.?car|hot.?wheels|\.(svg|gif|tiff?)$/i;
const FREE = /^(cc0|public domain|pd|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?)$/i;

const strip = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// The best photo among a search's results (pages from the API), or null.
// Wide, big, freely licensed, title names the car, nothing on the skip list.
export function pickPhoto(pages, words) {
  const want = words.toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !/^(19|20)\d\d$/.test(w));
  const scored = [];
  for (const p of Object.values(pages || {})) {
    const info = p.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const title = String(p.title || "").replace(/^File:/, "");
    const license = strip(meta.LicenseShortName?.value);
    if (!info?.thumburl || !info.descriptionurl) continue;
    if (!/\.(jpe?g|png|webp)$/i.test(title) || SKIP.test(title)) continue;
    if (!FREE.test(license)) continue;
    if (!(info.width >= 1000 && info.width > info.height * 1.15 && info.width < info.height * 2.4)) continue;
    const t = title.toLowerCase();
    const hits = want.filter((w) => t.includes(w)).length;
    if (hits < Math.min(2, want.length)) continue;
    scored.push({ score: hits * 10 - (p.index || 0), title, info, license, artist: strip(meta.Artist?.value) || "Unknown photographer" });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return {
    photo_url: best.info.thumburl,
    source_url: best.info.descriptionurl,
    credit: `Photo: ${best.artist.slice(0, 90)} · ${best.license} · Wikimedia Commons`.slice(0, 200),
  };
}

export function searchUrl(words) {
  const q = `"${words}" -interior -engine -dashboard -toy -lego -diecast`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "20",
    gsrsearch: q,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1280",
    iiextmetadatafilter: "LicenseShortName|Artist",
  });
  return `${API}?${params}`;
}

// Finds a photo for one car, or null. Throws with the reason if Commons fails.
export async function findCarPhoto(words, fetchImpl = fetch) {
  const res = await fetchImpl(searchUrl(words));
  if (!res.ok) throw new Error(`Wikimedia said ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikimedia said ${data.error.code || data.error.info}`);
  return pickPhoto(data.query?.pages, words);
}
