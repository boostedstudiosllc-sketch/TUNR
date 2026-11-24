import { useEffect, useState } from "react";
import { LINKUP_KINDS, kindOf } from "../lib/linkups.js";
import { currentPosition } from "../lib/alerts.js";
import { reverseGeocode } from "../lib/geocode.js";
import { loadShouts, postShout, shoutDown, cancelShout } from "../lib/shouts.js";
import { SHOUT_WHEN, shoutHeadline, shoutMeta, downLine } from "../lib/shoutRules.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// "Who's down?": a quick shout before anyone picks a spot. People nearby
// with linkup alerts hear it and tap I'M DOWN; the poster sees who and
// makes it a real linkup (onMakeLinkup opens LinkupForm, prefilled).
export default function Shouts({ user, position, focusId, refreshKey, onToast, onMakeLinkup, requireTerms }) {
  const [shouts, setShouts] = useState(null);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState("");

  function refresh() {
    return loadShouts(position)
      .then((rows) => {
        setShouts(rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
    return () => clearInterval(timer);
  }, [user?.id, position?.lat, position?.lng, refreshKey]);

  async function act(id, fn, done) {
    setBusy(id);
    try {
      await fn();
      if (done) onToast(done);
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  const mine = (shouts || []).find((s) => s.mine);
  const list = (shouts || []).slice().sort((a, b) => (b.id === focusId) - (a.id === focusId) || (b.mine === true) - (a.mine === true));

  return (
    <div style={{ marginTop: 8 }}>
      {!mine && (
        <button onClick={() => requireTerms(() => setPosting(true))} style={{ ...quietButton, padding: "12px 0", fontSize: 14, color: "var(--a-fbbf24)", border: "1px solid #F59E0B" }}>
          🙋 WHO'S DOWN? ASK PEOPLE NEARBY
        </button>
      )}
      {error && <div style={{ ...muted, color: "var(--a-ef4444)", marginTop: 8 }}>{error}</div>}
      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {list.map((s) => (
            <ShoutCard
              key={s.id}
              shout={s}
              focused={s.id === focusId}
              busy={busy === s.id}
              onDown={() => act(s.id, () => shoutDown(s.id, !s.i_am_down), s.i_am_down ? "Taken back" : "🙋 You're down. They'll see it.")}
              onCancel={() => act(s.id, () => cancelShout(s.id), "Shout cancelled")}
              onMakeLinkup={() => onMakeLinkup(s)}
            />
          ))}
        </div>
      )}
      {posting && (
        <ShoutForm
          onClose={() => setPosting(false)}
          onPosted={(r) => {
            setPosting(false);
            onToast(r.told ? `🙋 Sent to ${r.told} ${r.told === 1 ? "person" : "people"} nearby` : "🙋 Your shout is up. Nobody nearby has linkup alerts on yet.");
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShoutCard({ shout: s, focused, busy, onDown, onCancel, onMakeLinkup }) {
  const kind = kindOf(s.kind);
  const small = { ...quietButton, flex: 1, padding: "9px 0", fontSize: 12.5, marginTop: 0 };
  return (
    <div style={{ background: "var(--n-141414)", border: `1px solid ${focused || s.mine ? "#F59E0B" : "var(--n-222222)"}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 26 }}>{kind.emoji}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>🙋 {shoutHeadline(s, kind.label)}?</div>
          <div style={{ ...muted, fontSize: 12.5 }}>{shoutMeta(s)}</div>
        </div>
      </div>
      {s.note && <div style={{ fontSize: 13.5, color: "var(--n-dddddd)", marginTop: 8, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif" }}>{s.note}</div>}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-fbbf24)", marginTop: 8 }}>{downLine(s)}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {s.mine ? (
          <>
            <button disabled={busy} onClick={onMakeLinkup} style={{ ...small, background: "#0080F0", border: "none", color: "#fff" }}>
              ⚡ MAKE IT A LINKUP
            </button>
            <button disabled={busy} onClick={onCancel} style={{ ...small, flex: "0 0 30%" }}>
              CANCEL
            </button>
          </>
        ) : (
          <button disabled={busy} aria-pressed={Boolean(s.i_am_down)} onClick={onDown} style={{ ...small, background: s.i_am_down ? "rgba(245,158,11,0.15)" : undefined, color: s.i_am_down ? "var(--a-fbbf24)" : undefined, border: `1px solid ${s.i_am_down ? "#F59E0B" : "var(--n-2a2a2a)"}` }}>
            {s.i_am_down ? "✓ YOU'RE DOWN · TAKE IT BACK" : "🙋 I'M DOWN"}
          </button>
        )}
      </div>
    </div>
  );
}

function ShoutForm({ onClose, onPosted }) {
  const [draft, setDraft] = useState({ kind: "cruise", when: "tonight", area: "", note: "", lat: null, lng: null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function locate() {
    setBusy("gps");
    setError("");
    try {
      const pos = await currentPosition();
      const where = await reverseGeocode(pos.lat, pos.lng, { token: MAPBOX_TOKEN }).catch(() => ({ area: "" }));
      setDraft((d) => ({ ...d, lat: pos.lat, lng: pos.lng, area: d.area || where.area || "" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    locate();
  }, []);

  async function send() {
    setBusy("send");
    setError("");
    try {
      onPosted(await postShout(draft));
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  const ready = draft.lat != null && !busy;
  return (
    <Sheet onClose={onClose} label="Who's down?">
      <div style={sheetTitle}>🙋 WHO'S DOWN?</div>
      <div style={{ ...muted, marginTop: 4 }}>No spot needed yet. People nearby with linkup alerts get a heads-up and tap I'M DOWN. Then you make it a linkup.</div>
      <div style={{ ...label, marginTop: 14 }}>TO DO WHAT</div>
      <div style={{ display: "flex", gap: 6 }}>
        {LINKUP_KINDS.map((k) => (
          <Chip key={k.id} active={draft.kind === k.id} onClick={() => set({ kind: k.id })}>
            {k.emoji} {k.label.toUpperCase()}
          </Chip>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>WHEN</div>
      <div style={{ display: "flex", gap: 6 }}>
        {SHOUT_WHEN.map(([id, text]) => (
          <Chip key={id} active={draft.when === id} onClick={() => set({ when: id })}>
            {text}
          </Chip>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>ROUGH AREA</div>
      <input value={draft.area} maxLength={80} onChange={(e) => set({ area: e.target.value })} placeholder="Midtown, Buford, Marietta…" style={field} />
      <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
        {busy === "gps" ? "Finding you…" : draft.lat != null ? "📍 Using your location, rounded to about half a mile. Only the distance is shown." : "Location is needed to find people nearby."}
        {draft.lat == null && busy !== "gps" && (
          <button onClick={locate} style={{ background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, cursor: "pointer", padding: "0 0 0 6px", font: "inherit" }}>
            TRY AGAIN
          </button>
        )}
      </div>
      <div style={{ ...label, marginTop: 14 }}>NOTE (OPTIONAL)</div>
      <input value={draft.note} maxLength={140} onChange={(e) => set({ note: e.target.value })} placeholder="Back roads run, then food?" style={field} />
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}
      <button disabled={!ready} onClick={send} style={{ ...bigButton, marginTop: 16, opacity: ready ? 1 : 0.5 }}>
        {busy === "send" ? "SENDING…" : "ASK WHO'S DOWN"}
      </button>
    </Sheet>
  );
}
