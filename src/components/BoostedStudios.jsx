import { useEffect, useState } from "react";
import { loadBoostedBusinesses, saveBoostedBusiness } from "../lib/boosted.js";
import { openInvites } from "../lib/invites.js";
import DetailingRequest from "./DetailingRequest.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

export function BoostedSheet({ onClose, ...rest }) {
  return (
    <Sheet onClose={onClose} label="Boosted Studios" zIndex={296}>
      <div style={sheetTitle}>BOOSTED STUDIOS</div>
      <BoostedPage {...rest} />
    </Sheet>
  );
}

// Every business in the Boosted Studios family, with how to reach each.
export default function BoostedPage({ onOpenPerks, user, onToast, onNeedAccount }) {
  const [rows, setRows] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    loadBoostedBusinesses()
      .then((r) => setRows(r.filter((b) => b.active)))
      .catch((e) => (setError(e.message), setRows([])));
  }, []);

  return (
    <div>
      <div style={{ ...muted, marginTop: 4 }}>
        TUNR is part of Boosted Studios Production LLC, an Atlanta car-culture company. Here's
        everything we do.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>{error}</div>}
      {rows === null && <div style={{ ...muted, marginTop: 14 }}>Loading…</div>}
      {(rows || []).map((b) => (
        <div key={b.id} style={card}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, var(--n-001a33), var(--n-141414))",
                border: "1px solid var(--n-002a55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                flexShrink: 0,
              }}
            >
              {b.icon}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 19, fontWeight: 900, letterSpacing: 0.4 }}>{b.name}</span>
              {b.tagline && <span style={{ display: "block", ...muted, fontSize: 12.5 }}>{b.tagline}</span>}
            </span>
          </div>
          {b.description && <div style={{ ...muted, color: "var(--n-cccccc)", marginTop: 10 }}>{b.description}</div>}
          {b.perk && (
            <button onClick={onOpenPerks} style={perkButton}>
              🏷️ {b.perk.discount_text} for TUNR members: {b.perk.title} →
            </button>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {b.slug === "tunr" && (
              <button onClick={() => openInvites()} style={chip}>🎁 Invite friends</button>
            )}
            {b.contact_form && (
              <button onClick={() => setRequesting(true)} style={{ ...chip, ...chipHot }}>🧽 Request a detail</button>
            )}
            {b.booking_url && <a href={b.booking_url} target="_blank" rel="noreferrer" style={{ ...chip, ...chipHot }}>📅 Book</a>}
            {b.website && <a href={b.website} target="_blank" rel="noreferrer" style={chip}>🌐 Website</a>}
            {(b.instagram || []).map((h) => (
              <a key={h} href={`https://instagram.com/${h}`} target="_blank" rel="noreferrer" style={chip}>
                📷 @{h}
              </a>
            ))}
            {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} style={chip}>📞 Call</a>}
            {b.email && <a href={`mailto:${b.email}?subject=${encodeURIComponent(b.name)}`} style={chip}>✉️ Email</a>}
          </div>
        </div>
      ))}
      {requesting && (
        <DetailingRequest user={user} onClose={() => setRequesting(false)} onToast={onToast} onNeedAccount={onNeedAccount} />
      )}
    </div>
  );
}

const EMPTY = { name: "", icon: "🏁", tagline: "", description: "", website: "", booking_url: "", instagram: "", email: "", phone: "", sort: 100, active: true, contact_form: false };

// Admins edit the page here: links, wording, order, or add a new business.
export function BoostedAdmin({ onToast }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    loadBoostedBusinesses()
      .then(setRows)
      .catch((e) => (setError(e.message), setRows([])));
  useEffect(() => {
    refresh();
  }, []);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    if (!draft.name.trim()) return setError("Give the business a name.");
    for (const k of ["website", "booking_url"]) {
      if (draft[k] && !/^https:\/\//.test(draft[k].trim())) return setError("Links have to start with https://");
    }
    setBusy(true);
    setError("");
    try {
      await saveBoostedBusiness(draft);
      onToast("Saved");
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    const input = (key, name, placeholder, extra = {}) => (
      <div style={{ marginTop: 10 }}>
        <div style={label}>{name}</div>
        <input style={field} placeholder={placeholder} value={draft[key] ?? ""} onChange={(e) => set({ [key]: e.target.value })} {...extra} />
      </div>
    );
    return (
      <div>
        {input("name", "NAME", "Boosted Detailing", { maxLength: 60 })}
        {input("icon", "ICON (ONE EMOJI)", "🧽", { maxLength: 8 })}
        {input("tagline", "ONE-LINE TAGLINE", "Detailing for enthusiasts", { maxLength: 80 })}
        <div style={{ marginTop: 10 }}>
          <div style={label}>DESCRIPTION</div>
          <textarea style={{ ...field, minHeight: 80 }} maxLength={600} value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
        </div>
        {input("booking_url", "BOOKING LINK (OPTIONAL)", "https://…", { autoCapitalize: "none" })}
        {input("website", "WEBSITE (OPTIONAL)", "https://…", { autoCapitalize: "none" })}
        {input("instagram", "INSTAGRAM (OPTIONAL, UP TO 3, SEPARATE WITH COMMAS)", "@boostedstudios.png, @boostedstudios.portfolio", { autoCapitalize: "none" })}
        {input("email", "EMAIL (OPTIONAL)", "you@example.com", { autoCapitalize: "none", type: "email" })}
        {input("phone", "PHONE (OPTIONAL)", "(404) 555-0100", { inputMode: "tel" })}
        {input("sort", "ORDER (LOWER SHOWS FIRST)", "100", { inputMode: "numeric" })}
        <label style={{ ...muted, display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={draft.active !== false} onChange={(e) => set({ active: e.target.checked })} /> Show it on the page
        </label>
        <label style={{ ...muted, display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <input type="checkbox" checked={Boolean(draft.contact_form)} onChange={(e) => set({ contact_form: e.target.checked })} /> Take detail
          requests in the app (they land in Settings → Inbox)
        </label>
        {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button disabled={busy} onClick={save} style={{ ...bigButton, flex: 1 }}>{busy ? "SAVING…" : "SAVE"}</button>
          <button disabled={busy} onClick={() => (setDraft(null), setError(""))} style={{ ...quietButton, flex: 1 }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={muted}>
        What shows on the Boosted Studios page (Settings → About). Add booking links, websites and
        Instagram handles here; empty ones don't show. The Boosted Detailing discount itself lives in
        Perks.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}
      <button onClick={() => setDraft({ ...EMPTY })} style={{ ...bigButton, marginTop: 12 }}>+ ADD A BUSINESS</button>
      {(rows || []).map((b) => (
        <button
          key={b.id}
          onClick={() => setDraft({ ...EMPTY, ...b, instagram: (b.instagram || []).map((h) => `@${h}`).join(", "), sort: String(b.sort) })}
          style={{ ...card, width: "100%", textAlign: "left", color: "var(--n-f0f0f0)", cursor: "pointer", opacity: b.active ? 1 : 0.5 }}
        >
          <span style={{ fontSize: 16, fontWeight: 900 }}>
            {b.icon} {b.name}
            {b.active ? "" : " (hidden)"}
          </span>
          <span style={{ display: "block", ...muted, fontSize: 12 }}>
            {[b.contact_form && "request form", b.booking_url && "booking", b.website && "website", b.instagram?.length && `Instagram ×${b.instagram.length}`, b.email && "email", b.phone && "phone"]
              .filter(Boolean)
              .join(" · ") || "No links yet"}
          </span>
        </button>
      ))}
    </div>
  );
}

const card = {
  marginTop: 12,
  background: "var(--n-121212)",
  border: "1px solid var(--n-222222)",
  borderRadius: 14,
  padding: "14px 14px",
  boxSizing: "border-box",
  display: "block",
};

const chip = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  minHeight: 36,
  boxSizing: "border-box",
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 18,
  color: "var(--n-dddddd)",
  fontSize: 12.5,
  fontWeight: 800,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};

const chipHot = { background: "#0080F0", borderColor: "#0080F0", color: "#fff" };

const perkButton = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: "10px 12px",
  background: "rgba(16,185,129,0.08)",
  border: "1px solid #14532D",
  borderRadius: 10,
  color: "#34D399",
  fontSize: 13,
  fontWeight: 800,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "'Barlow', sans-serif",
};
