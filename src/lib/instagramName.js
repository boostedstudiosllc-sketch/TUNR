// "@NawfSide.TM ", "instagram.com/nawfside.tm/" → "nawfside.tm"; null if it
// can't be an Instagram name. Shared by the admin page and the importer
// (api/_lib/instagram.js).
export function cleanUsername(text) {
  const u = String(text || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(u) ? u : null;
}
