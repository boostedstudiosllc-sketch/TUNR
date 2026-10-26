import { useEffect, useState } from "react";
import {
  POINTS,
  setMeetPoints,
  preciseLocation,
  checkIn,
  checkinMessage,
  myCheckin,
  stayCheckIn,
  stayMessage,
} from "../lib/points.js";
import { loadProfile } from "../lib/store.js";
import { askForLocation } from "../lib/location.js";
import { useLocationStatus, LocationNotice } from "./LocationAccess.jsx";
import { field, bigButton, muted, label } from "./Sheet.jsx";

const BOOSTS = [5, 10];

// The ⭐ box on a meet. Any meet gives a point for checking in, and a boosted
// meet gives more; either way the phone's location proves you're there
// (within a quarter mile of the pin, during the meet). No codes. Admins set
// the boost. The database decides whether a check-in counts.
export default function CheckIn({ event, user, onNeedAccount, onToast, onChanged }) {
  // Only for showing the admin controls; the database checks it again.
  const [isAdmin, setIsAdmin] = useState(false);
  const [boost, setBoost] = useState(event.boostPoints ?? null);
  const [custom, setCustom] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [stayed, setStayed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isHost = Boolean(event.canManage);
  const [locStatus, setLocStatus] = useLocationStatus();
  const [asking, setAsking] = useState(false);

  async function turnOnLocation() {
    setAsking(true);
    setLocStatus(await askForLocation());
    setAsking(false);
  }
  const base = Number(event.basePoints || 0);
  const on = Boolean(boost) || base > 0;

  useEffect(() => {
    setBoost(event.boostPoints ?? null);
    setMessage("");
  }, [event.id, event.boostPoints]);

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

  // A check-in in the last 12 hours means this occurrence is done.
  useEffect(() => {
    if (!on || !user || isHost) return;
    let alive = true;
    myCheckin(event.id, user.id)
      .then((c) => {
        if (!alive || !c || c.voided_at) return;
        const recent = Date.now() - new Date(c.created_at).getTime() < 12 * 3600 * 1000;
        setCheckedIn(recent);
        setStayed(recent && Boolean(c.stayed_at));
      })
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [on, user?.id, event.id, isHost]);

  async function changeBoost(points) {
    if (points > 10) return onToast("Boosted meets top out at 10 points.");
    setBusy(true);
    try {
      await setMeetPoints(event.id, points);
      setBoost(points || null);
      onToast(points ? `⭐ Boosted to ${points} points` : `Back to the regular ${base || 0} point${base === 1 ? "" : "s"}`);
      onChanged && onChanged();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stay() {
    setBusy(true);
    setMessage("");
    try {
      const result = await stayCheckIn(event.id, await preciseLocation());
      if (result.status === "ok") {
        setStayed(true);
        onToast("🏁 +1 for staying the whole meet. Respect!");
      } else {
        setMessage(stayMessage(result));
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!user) return onNeedAccount();
    setBusy(true);
    setMessage("");
    try {
      const pos = await preciseLocation();
      const result = await checkIn(event.id, null, pos);
      if (result.status === "ok") {
        setCheckedIn(true);
        onToast(`⭐ Checked in: +${result.points} point${result.points === 1 ? "" : "s"}${result.rsvp_bonus ? " (RSVP bonus)" : ""}`);
      } else {
        setMessage(checkinMessage(result));
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!on && !isAdmin) return null;

  return (
    <div style={boost ? boostedBox : box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.6, color: boost ? "#FACC15" : on ? "#E5C76B" : "#888" }}>
          {boost ? `⭐ BOOSTED: +${boost} POINTS` : on ? `+${base} POINT${base === 1 ? "" : "S"} FOR CHECKING IN` : "⭐ NO POINTS"}
        </div>
      </div>

      <div style={{ ...muted, marginTop: 4 }}>
        {boost ? (
          <>
            Check in at the meet for <b style={{ color: "#F0F0F0" }}>+{boost}</b>, plus{" "}
            <b style={{ color: "#F0F0F0" }}>+{POINTS.rsvpBonus}</b> if you RSVP'd going before it started.
          </>
        ) : on ? (
          <>Every meet gives a point when you check in there. Boosted ⭐ meets give more.</>
        ) : (
          <>This meet doesn't give the regular point (no map pin, or posted less than a day ahead). You can still boost it.</>
        )}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 10 }}>
          <div style={label}>ADMIN: BOOST THIS MEET</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BOOSTS.map((n) => (
              <button key={n} disabled={busy} onClick={() => changeBoost(n)} style={{ ...chip, ...(boost === n ? chipOn : {}) }}>
                +{n}
              </button>
            ))}
            <input
              style={{ ...field, width: 74, padding: "7px 8px", textAlign: "center" }}
              inputMode="numeric"
              placeholder="Other"
              aria-label="Custom boosted points"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onKeyDown={(e) => e.key === "Enter" && Number(custom) > 0 && changeBoost(Number(custom))}
            />
            {custom && (
              <button disabled={busy} onClick={() => changeBoost(Number(custom))} style={chip}>
                SET
              </button>
            )}
            {boost && (
              <button disabled={busy} onClick={() => changeBoost(null)} style={{ ...chip, color: "#F87171" }}>
                REMOVE BOOST
              </button>
            )}
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>
            Check the map pin is right: check-ins must be within a quarter mile of it.
          </div>
        </div>
      )}

      {isHost && on && <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>Hosts don't earn points at their own meet.</div>}

      {on && !isHost && !(checkedIn && stayed) && (
        <LocationNotice status={locStatus} onTurnOn={turnOnLocation} busy={asking} />
      )}

      {on && !isHost &&
        (checkedIn ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#10B981" }}>✓ You're checked in. Enjoy the meet!</div>
            {stayed ? (
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: "#10B981" }}>🏁 Stayed the whole meet: +1</div>
            ) : (
              <>
                <button
                  className="action-btn"
                  onClick={stay}
                  disabled={busy || locStatus === "denied" || locStatus === "unsupported"}
                  style={{ ...stayButton, opacity: busy || locStatus === "denied" || locStatus === "unsupported" ? 0.5 : 1 }}
                >
                  {busy ? "CHECKING…" : locStatus === "denied" ? "🔒 TURN ON LOCATION FOR THE STAY BONUS" : "🏁 STILL HERE AT THE END? +1"}
                </button>
                <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
                  Check in again from 30 minutes before the listed end time until an hour after it, at the
                  meet, for a bonus point.
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <button
              className="action-btn"
              onClick={submit}
              disabled={busy || locStatus === "denied" || locStatus === "unsupported"}
              style={{
                ...bigButton,
                ...(locStatus === "denied" || locStatus === "unsupported" ? { background: "#1A1A1A", color: "#777", border: "1px solid #2A2A2A" } : {}),
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy
                ? "CHECKING…"
                : locStatus === "denied" || locStatus === "unsupported"
                  ? "🔒 TURN ON LOCATION TO CHECK IN"
                  : `📍 CHECK IN · +${boost || base}`}
            </button>
            <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
              Works from 30 minutes before the start until the meet ends, within a quarter mile of the
              pin. TUNR checks your location once and keeps only how far you were.
            </div>
          </div>
        ))}

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
  background: "#121212",
  border: "1px solid #2A2A2A",
  borderRadius: 12,
  padding: "12px 14px 14px",
};

const boostedBox = {
  ...box,
  background: "linear-gradient(180deg, #1A1500 0%, #111 100%)",
  border: "1px solid #3A3000",
};

const chip = {
  padding: "7px 12px",
  minHeight: 34,
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#CCC",
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: 0.5,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};

const stayButton = {
  ...bigButton,
  marginTop: 10,
  background: "#141414",
  border: "1px solid #10B981",
  color: "#10B981",
};

const chipOn = { borderColor: "#FACC15", color: "#FACC15", background: "rgba(250,204,21,0.1)" };
