import { label, field } from "./Sheet.jsx";

// The mailing address form, used for mailed stickers (StickerOrder.jsx) and
// mailed rewards (Rewards.jsx). The last address used is remembered on this
// phone, so it's filled in next time.

const ADDRESS_KEY = "tunr.sticker.address"; // (first used for stickers)
export const EMPTY_ADDRESS = { name: "", line1: "", line2: "", city: "", state: "GA", zip: "" };

export function loadSavedAddress() {
  try {
    return { ...EMPTY_ADDRESS, ...JSON.parse(localStorage.getItem(ADDRESS_KEY) || "{}") };
  } catch (e) {
    console.warn("Couldn't read the saved address:", e.message);
    return EMPTY_ADDRESS;
  }
}

export function rememberAddress(addr) {
  try {
    const { name, line1, line2, city, state, zip } = addr;
    localStorage.setItem(ADDRESS_KEY, JSON.stringify({ name, line1, line2, city, state, zip }));
  } catch (e) {
    console.warn("Couldn't remember the address:", e.message);
  }
}

export default function AddressFields({ addr, onChange, title = "MAIL IT TO" }) {
  const set = (patch) => onChange({ ...addr, ...patch });
  return (
    <>
      <div style={{ ...label, marginTop: 14 }}>{title}</div>
      <input style={field} autoComplete="name" placeholder="Full name" maxLength={80} value={addr.name} onChange={(e) => set({ name: e.target.value })} />
      <input style={{ ...field, marginTop: 6 }} autoComplete="address-line1" placeholder="Street address" maxLength={120} value={addr.line1} onChange={(e) => set({ line1: e.target.value })} />
      <input style={{ ...field, marginTop: 6 }} autoComplete="address-line2" placeholder="Apt, suite (optional)" maxLength={120} value={addr.line2} onChange={(e) => set({ line2: e.target.value })} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input style={{ ...field, flex: 3 }} autoComplete="address-level2" placeholder="City" maxLength={60} value={addr.city} onChange={(e) => set({ city: e.target.value })} />
        <input
          style={{ ...field, flex: 1, textTransform: "uppercase" }}
          autoComplete="address-level1"
          aria-label="State"
          placeholder="GA"
          maxLength={2}
          value={addr.state}
          onChange={(e) => set({ state: e.target.value.replace(/[^a-z]/gi, "").toUpperCase() })}
        />
        <input
          style={{ ...field, flex: 2 }}
          autoComplete="postal-code"
          inputMode="numeric"
          placeholder="ZIP"
          maxLength={10}
          value={addr.zip}
          onChange={(e) => set({ zip: e.target.value.replace(/[^0-9-]/g, "") })}
        />
      </div>
    </>
  );
}
