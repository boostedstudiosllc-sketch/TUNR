import { useEffect, useState } from "react";
import { loadBoost, optInBoost, boostCheckIn, boostConfirm, remindAt } from "../lib/boost.js";
import { boostStep, countdown, clock } from "../lib/boostRules.js";
import { isToday } from "../lib/dates.js";
import Sheet, { sheetTitle, muted, bigButton, quietButton } from "./Sheet.jsx";

const GOLD = "#F59E0B";
const changed = () => window.dispatchEvent(new Event("tunr:boost"));

// Today's Boost Day state, kept fresh (and a ticking clock while waiting).
function useBoost(user) {
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const refresh = () =>
    loadBoost()
      .then((s) => (setStatus(s), setError("")))
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
    window.addEventListener("tunr:boost", refresh);
    return () => window.removeEventListener("tunr:boost", refresh);
  }, [user?.id]);
  const waiting = status?.checked_in_at && !status?.confirmed_at;
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const stop = remindAt(status.confirm_at, () => setNow(Date.now()));
    return () => (clearInterval(t), stop());
  }, [waiting, status?.confirm_at]);
  return { status, now, error, refresh };
}

function Steps({ status, now }) {
  const rows = [
    ["Opt in", Boolean(status.opted_in)],
    ["RSVP Going to a meet today, before it starts", Boolean(status.checked_in_at) || null],
    ["Check in when you get there", Boolean(status.checked_in_at)],
    [`Stay ${status.stay_minutes} minutes, then confirm`, Boolean(status.confirmed_at)],
  ];
  return (
    <div style={{ marginTop: 12 }}>
      {rows.map(([t, done], i) => (
        <div key={t} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontFamily: "'Barlow', sans-serif", fontSize: 14.5, color: done ? "#10B981" : "var(--n-cccccc)" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${done ? "#10B981" : "var(--n-444444)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{done ? "✓" : i + 1}</span>
          {t}
          {i === 3 && status.checked_in_at && !status.confirmed_at && Date.parse(status.confirm_at) > now && <b style={{ marginLeft: "auto", color: GOLD }}>{countdown(status.confirm_at, now)}</b>}
        </div>
      ))}
    </div>
  );
}

// The Boost Day sheet ("open:boost": the banner, alerts).
export default function BoostSheet({ user, onClose, onNeedAccount, onShowToday, onToast }) {
  const { status, now, error, refresh } = useBoost(user);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const step = boostStep(status, now);
  const run = async (fn, done) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fn();
      onToast?.(typeof done === "function" ? done(r) : done);
      changed();
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} label="Boost Day" zIndex={320}>
      <div style={{ ...sheetTitle, color: GOLD }}>🔥 BOOST DAY</div>
      {status === null && !error && <div style={{ ...muted, marginTop: 8 }}>Loading…</div>}
      {status && !status.active && <div style={{ ...muted, marginTop: 8 }}>Today isn't a Boost Day. One weekday a week is: you'll get an alert that morning.</div>}
      {status?.active && (
        <>
          <div style={{ ...muted, marginTop: 4, color: "var(--n-dddddd)", fontSize: 14.5 }}>{step.text}</div>
          <Steps status={status} now={now} />
          {step.step === "opt_in" && (
            <button disabled={busy} onClick={() => (user ? run(optInBoost, "🔥 You're in! RSVP to a meet and show up.") : onNeedAccount?.())} style={{ ...bigButton, marginTop: 12, background: GOLD, color: "var(--n-111111)" }}>
              {user ? (busy ? "…" : `🔥 OPT IN (+${status.points} POINTS)`) : "CREATE A FREE ACCOUNT TO JOIN"}
            </button>
          )}
          {step.step === "check_in" && (
            <>
              <button onClick={onShowToday} style={{ ...bigButton, marginTop: 12 }}>
                SEE TODAY'S MEETS
              </button>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>At the meet, open it in TUNR and tap 📍 CHECK IN FOR THE BOOST.</div>
            </>
          )}
          {step.step === "confirm" && (
            <button disabled={busy} onClick={() => run(boostConfirm, (r) => `🔥 Boost hit! +${r.earned} points`)} style={{ ...bigButton, marginTop: 12, background: GOLD, color: "var(--n-111111)" }}>
              {busy ? "CHECKING…" : "📍 CONFIRM I'M STILL HERE"}
            </button>
          )}
          {step.step === "wait" && <div style={{ ...muted, marginTop: 10 }}>You can confirm at {clock(status.confirm_at)}. TUNR will remind you.</div>}
          <div style={{ ...muted, fontSize: 11.5, marginTop: 12 }}>Free to join, nothing to lose. One boost per person per day; hosts can't earn it at their own meet. TUNR checks your location when you check in and when you confirm.</div>
        </>
      )}
      {(error || msg) && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {msg || error}
        </div>
      )}
    </Sheet>
  );
}

// On a meet page: on Boost Day, for a meet happening today.
export function BoostCard({ event, user, onToast }) {
  const { status, now, refresh } = useBoost(user);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!status?.active || !user || !isToday(event)) return null;
  const step = boostStep(status, now);
  const here = status.event_id === event.id;
  const elsewhere = status.checked_in_at && !here;
  const run = async (fn, done) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fn();
      onToast?.(typeof done === "function" ? done(r) : done);
      changed();
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${GOLD}`, background: "rgba(245,158,11,0.1)" }}>
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 1.2, color: GOLD }}>🔥 BOOST DAY · +{status.points} POINTS</div>
      <div style={{ ...muted, marginTop: 2, color: "var(--n-dddddd)" }}>
        {step.step === "done"
          ? step.text
          : step.step === "opt_in"
            ? "Opt in, RSVP Going before this meet starts, and show up for bonus points."
            : elsewhere
              ? `You checked in at ${status.event_title || "another meet"}. One boost a day.`
              : here && step.step === "wait"
                ? `Checked in. Confirm at ${clock(status.confirm_at)} (${countdown(status.confirm_at, now)}).`
                : here && step.step === "confirm"
                  ? "Time's up: confirm you're still here."
                  : "At the meet? Check in (you need to have RSVP'd Going before it started)."}
      </div>
      {step.step === "opt_in" && (
        <button disabled={busy} onClick={() => run(optInBoost, "🔥 You're in!")} style={{ ...bigButton, marginTop: 8, background: GOLD, color: "var(--n-111111)" }}>
          🔥 OPT IN
        </button>
      )}
      {step.step === "check_in" && (
        <button disabled={busy} onClick={() => run(() => boostCheckIn(event.id), (r) => `📍 Checked in. Confirm at ${clock(r.confirm_at)}.`)} style={{ ...bigButton, marginTop: 8, background: GOLD, color: "var(--n-111111)" }}>
          {busy ? "CHECKING…" : "📍 CHECK IN FOR THE BOOST"}
        </button>
      )}
      {here && step.step === "confirm" && (
        <button disabled={busy} onClick={() => run(boostConfirm, (r) => `🔥 Boost hit! +${r.earned} points`)} style={{ ...bigButton, marginTop: 8, background: GOLD, color: "var(--n-111111)" }}>
          {busy ? "CHECKING…" : "📍 CONFIRM I'M STILL HERE"}
        </button>
      )}
      {msg && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 6 }}>
          {msg}
        </div>
      )}
      {here && step.step === "wait" && <button disabled style={{ ...quietButton, marginTop: 8, opacity: 0.6 }}>CONFIRM IN {countdown(status.confirm_at, now)}</button>}
    </div>
  );
}
