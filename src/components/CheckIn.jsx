import { useEffect, useState } from "react";
import {
  POINTS,
  setMeetPoints,
  getCheckinCode,
  preciseLocation,
  checkIn,
  checkinMessage,
  myCheckin,
  stayCheckIn,
  stayMessage,
} from "../lib/points.js";
import { loadProfile } from "../lib/store.js";
import { field, bigButton, muted, label } from "./Sheet.jsx";

const BOOSTS = [10, 25, 50];

// The ⭐ box on a meet. Any meet gives a point for checking in (location and
// meet hours only); a boosted meet gives more and needs the host's code. The
// host (or an admin) sees the code to post at the meet; admins set the boost.
// The database decides whether a check-in counts.
export default function CheckIn({ event, user, onNeedAccount, onToast, onChanged }) {
  // Only for showing the admin controls; the database checks it again.
  const [isAdmin, setIsAdmin] = useState(false);
  const [boost, setBoost] = useState(event.boostPoints ?? null);
  const [custom, setCustom] = useState("");
  const [code, setCode] = useState("");
  const [hostCode, setHostCode] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [stayed, setStayed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isHost = Boolean(event.canManage);
  const base = Number(event.basePoints || 0);
  const on = Boolean(boost) || base > 0;

  useEffect(() => {
    setBoost(event.boostPoints ?? null);
    setMessage("");
    setCode("");
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

  useEffect(() => {
    if (!boost || !(isHost || isAdmin)) return setHostCode(null);
    let alive = true;
    getCheckinCode(event.id)
      .then((r) => alive && setHostCode(r))
      .catch((e) => alive && setHostCode({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [boost, isHost, isAdmin, event.id]);

  async function changeBoost(points) {
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
    if (boost && code.replace(/[^A-Za-z0-9]/g, "").length < 6) {
      setMessage("Enter the 6-character code from the host or the sign at the meet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const pos = await preciseLocation();
      const result = await checkIn(event.id, boost ? code : null, pos);
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
            Check in with the code shown at the meet for <b style={{ color: "#F0F0F0" }}>+{boost}</b>, plus{" "}
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
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))}
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

      {boost && (isHost || isAdmin) && (
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
            <div style={{ ...muted, color: "#F87171" }}>{hostCode.message || `Couldn't get the code. (${hostCode.status})`}</div>
          )}
        </div>
      )}
      {isHost && on && <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>Hosts don't earn points at their own meet.</div>}

      {on && !isHost &&
        (checkedIn ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#10B981" }}>✓ You're checked in. Enjoy the meet!</div>
            {stayed ? (
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: "#10B981" }}>🏁 Stayed the whole meet: +1</div>
            ) : (
              <>
                <button className="action-btn" onClick={stay} disabled={busy} style={{ ...stayButton, opacity: busy ? 0.6 : 1 }}>
                  {busy ? "CHECKING…" : "🏁 STILL HERE AT THE END? +1"}
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
            {boost && (
              <input
                style={{ ...field, textAlign: "center", letterSpacing: 6, fontSize: 18, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}
                placeholder="CODE"
                aria-label="Check-in code"
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            )}
            <button className="action-btn" onClick={submit} disabled={busy} style={{ ...bigButton, opacity: busy ? 0.6 : 1 }}>
              {busy ? "CHECKING…" : `📍 CHECK IN · +${boost || base}`}
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
