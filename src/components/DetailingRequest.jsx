import { useEffect, useState } from "react";
import { DETAIL_SERVICES, requestDetail } from "../lib/feedback.js";
import { loadVehicles } from "../lib/store.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const carName = (c) => [c.year, c.make, c.model].filter(Boolean).join(" ");

// Boosted Detailing has no website or booking page, so people ask for a
// detail here. It lands in the admin inbox (061_detailing_requests_and_shirt.sql)
// and the reply comes back as an alert.
export default function DetailingRequest({ user, onClose, onToast, onNeedAccount }) {
  const [service, setService] = useState(DETAIL_SERVICES[0]);
  const [cars, setCars] = useState([]);
  const [car, setCar] = useState("");
  const [when, setWhen] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadVehicles(user.id).then((list) => {
      setCars(list);
      if (list[0]) setCar(carName(list[0]));
    });
  }, [user?.id]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await requestDetail({ service, car, when, area, phone, email, notes });
      setSent(true);
      onToast("🧽 Request sent");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} label="Request a detail" zIndex={320}>
      <div style={sheetTitle}>🧽 REQUEST A DETAIL</div>
      {!user ? (
        <>
          <div style={{ ...muted, marginTop: 6 }}>Sign in to send Boosted Detailing a request. We reply right here in the app.</div>
          <button className="action-btn" onClick={onNeedAccount} style={{ ...bigButton, marginTop: 14 }}>SIGN IN</button>
        </>
      ) : sent ? (
        <>
          <div style={{ ...muted, color: "#DDD", marginTop: 6 }}>
            Thanks! Boosted Detailing has your request and will reply with a time and price. You'll get
            an alert, and you can see the reply in Settings → Contact us.
          </div>
          <button className="action-btn" onClick={onClose} style={{ ...bigButton, marginTop: 14 }}>DONE</button>
        </>
      ) : (
        <>
          <div style={{ ...muted, marginTop: 4 }}>
            Tell us what you need and we'll get back to you with a time and price. Your{" "}
            <b style={{ color: "#3CABFD" }}>10% TUNR discount</b> is included automatically.
          </div>

          <div style={{ ...label, marginTop: 14 }}>WHAT DO YOU NEED?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DETAIL_SERVICES.map((s) => (
              <button key={s} onClick={() => setService(s)} aria-pressed={service === s} style={{ ...chip, ...(service === s ? chipOn : {}) }}>
                {s}
              </button>
            ))}
          </div>

          <div style={{ ...label, marginTop: 14 }}>YOUR CAR</div>
          {cars.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {cars.map((c) => (
                <button key={c.id} onClick={() => setCar(carName(c))} style={{ ...chip, ...(car === carName(c) ? chipOn : {}) }}>
                  {carName(c)}
                </button>
              ))}
            </div>
          )}
          <input style={field} maxLength={80} placeholder="Year, make and model" value={car} onChange={(e) => setCar(e.target.value)} />

          <div style={{ ...label, marginTop: 14 }}>WHEN WORKS FOR YOU? (OPTIONAL)</div>
          <input style={field} maxLength={120} placeholder="e.g. weekends, weekdays after 5" value={when} onChange={(e) => setWhen(e.target.value)} />

          <div style={{ ...label, marginTop: 14 }}>YOUR AREA (OPTIONAL)</div>
          <input style={field} maxLength={80} placeholder="e.g. Marietta" value={area} onChange={(e) => setArea(e.target.value)} />

          <div style={{ ...label, marginTop: 14 }}>PHONE (OPTIONAL)</div>
          <input style={field} type="tel" maxLength={20} placeholder="To text you back faster" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <div style={{ ...label, marginTop: 14 }}>EMAIL FOR A REPLY (OPTIONAL)</div>
          <input style={field} type="email" maxLength={254} placeholder="Leave empty to use your account email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div style={{ ...label, marginTop: 14 }}>ANYTHING ELSE? (OPTIONAL)</div>
          <textarea
            style={{ ...field, minHeight: 80 }}
            maxLength={1000}
            placeholder="Pet hair, stains, swirl marks, a show coming up…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 10 }}>{error}</div>}
          <button className="action-btn" disabled={busy} onClick={send} style={{ ...bigButton, marginTop: 14, opacity: busy ? 0.6 : 1 }}>
            {busy ? "SENDING…" : "SEND REQUEST"}
          </button>
          <button className="action-btn" onClick={onClose} style={{ ...quietButton, marginTop: 8 }}>CANCEL</button>
        </>
      )}
    </Sheet>
  );
}

const chip = {
  padding: "8px 12px",
  minHeight: 36,
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 18,
  color: "#BBB",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};
const chipOn = { border: "1px solid #0080F0", color: "#3CABFD", background: "rgba(0, 128, 240,0.12)" };
