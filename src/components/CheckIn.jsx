import { useEffect, useState } from "react";
import {
  POINTS,
  isPointsMeet,
  setPointsMeet,
  getCheckinCode,
  preciseLocation,
  checkIn,
  checkinMessage,
  myCheckin,
} from "../lib/points.js";
import { loadProfile } from "../lib/store.js";
import { field, bigButton, muted, label } from "./Sheet.jsx";

// The ⭐ box on a meet that gives points. Attendees check in with today's
// code and their location; the host (or an admin) sees the code to post at
// the meet; admins switch points on and off. The database decides whether a
// check-in counts, so this only collects what it needs and shows the answer.
export default function CheckIn({ event, user, onNeedAccount, onToast }) {
  const [on, setOn] = useState(null); // null = loading
  // Only for showing the admin controls; the database checks it again.
  const [isAdmin, setIsAdmin] = useState(false);
  const [code, setCode] = useState("");
  const [hostCode, setHostCode] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isHost = Boolean(event.canManage);

  useEffect(() => {
    if (!user) return setIsAdmin(false);
    let alive = true;
    loadProfile(user.id)
      .then((p) => alive && setIsAdmin(Boolean(p?.isAdmin)))
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    setOn(null);
    setMessage("");
    isPointsMeet(event.id)
      .then((v) => alive && setOn(v))
      .catch((e) => alive && (setOn(false), setMessage(e.message)));
    return () => {
      alive = false;
    };
  }, [event.id]);

  // A check-in in the last 12 hours means this occurrence is done.
  useEffect(() => {
    if (!on || !user || isHost) return;
    let alive = true;
    myCheckin(event.id, user.id)
      .then((c) => {
        if (!alive || !c || c.voided_at) return;
        setCheckedIn(Date.now() - new Date(c.created_at).getTime() < 12 * 3600 * 1000);
      })
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [on, user?.id, event.id, isHost]);

  useEffect(() => {
    if (!on || !(isHost || isAdmin)) return;
    let alive = true;
    getCheckinCode(event.id)
      .then((r) => alive && setHostCode(r))
      .catch((e) => alive && setHostCode({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [on, isHost, isAdmin, event.id]);

  async function toggle() {
    setBusy(true);
    try {
      await setPointsMeet(event.id, !on);
      setOn(!on);
      onToast(on ? "Points turned off for this meet" : "⭐ This meet now gives points");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!user) return onNeedAccount();
    if (code.replace(/[^A-Za-z0-9]/g, "").length < 6) {
      setMessage("Enter the 6-character code from the host or the sign at the meet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const pos = await preciseLocation();
      const result = await checkIn(event.id, code, pos);
      if (result.status === "ok") {
        setCheckedIn(true);
        onToast(`⭐ Checked in: +${result.points} points${result.rsvp_bonus ? " (RSVP bonus)" : ""}`);
      } else {
        setMessage(checkinMessage(result));
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (on === null) return null;
  if (!on && !isAdmin) {
    return message ? <div style={{ ...muted, color: "#F87171", marginTop: 12 }}>{message}</div> : null;
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.6, color: on ? "#FACC15" : "#888" }}>
          {on ? "⭐ POINTS MEET" : "⭐ POINTS: OFF"}
        </div>
        {isAdmin && (
          <button onClick={toggle} disabled={busy} style={smallButton}>
            {on ? "TURN OFF" : "TURN ON"}
          </button>
        )}
      </div>

      {!on && (
        <div style={{ ...muted, marginTop: 6 }}>
          Admin only: turn on to let people earn points here. Only do this for meets you trust, and
          check the map pin is right: check-ins must be within a quarter mile of it.
        </div>
      )}

      {on && (
        <div style={{ ...muted, marginTop: 4 }}>
          Check in at the meet for <b style={{ color: "#F0F0F0" }}>+{POINTS.checkin} points</b>, plus{" "}
          <b style={{ color: "#F0F0F0" }}>+{POINTS.rsvpBonus}</b> if you said you're going before it started.
        </div>
      )}

      {on && (isHost || isAdmin) && (
        <div style={{ marginTop: 12, background: "#0D0D0D", border: "1px dashed #3A3A3A", borderRadius: 10, padding: "10px 12px" }}>
          <div style={label}>TODAY'S CHECK-IN CODE {isHost ? "(HOSTS ONLY)" : "(ADMIN)"}</div>
          {hostCode === null ? (
            <div style={muted}>Loading…</div>
          ) : hostCode.status === "ok" ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 6, color: "#FACC15" }}>{hostCode.code}</div>
              <div style={{ ...muted, fontSize: 12 }}>
                Post it on a sign or say it at the meet. It changes every meet day, so don't post it online.
              </div>
            </>
          ) : hostCode.status === "not_today" ? (
            <div style={muted}>The code shows up here on the day of the meet.</div>
          ) : (
            <div style={{ ...muted, color: "#F87171" }}>
              {hostCode.message || `Couldn't get the code. (${hostCode.status})`}
            </div>
          )}
          {isHost && <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>Hosts don't earn points at their own meet.</div>}
        </div>
      )}

      {on && !isHost && (
        checkedIn ? (
          <div style={{ marginTop: 12, fontSize: 15, fontWeight: 800, color: "#10B981" }}>✓ You're checked in. Enjoy the meet!</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <input
              style={{ ...field, textAlign: "center", letterSpacing: 6, fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}
              placeholder="CODE"
              aria-label="Check-in code"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="action-btn"
              onClick={submit}
              disabled={busy}
              style={{ ...bigButton, marginTop: 8, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "CHECKING…" : "📍 CHECK IN"}
            </button>
            <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
              Works from 30 minutes before the start until the meet ends, within a quarter mile of
              the pin. TUNR checks your location once and keeps only how far you were.
            </div>
          </div>
        )
      )}

      {message && (
        <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
          {message}
        </div>
      )}
    </div>
  );
}

const box = {
  marginTop: 12,
  background: "linear-gradient(180deg, #1A1500 0%, #111 100%)",
  border: "1px solid #3A3000",
  borderRadius: 12,
  padding: "12px 14px 14px",
};

const smallButton = {
  padding: "8px 12px",
  minHeight: 36,
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#CCC",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};
