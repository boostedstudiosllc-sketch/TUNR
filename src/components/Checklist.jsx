import { useEffect, useRef, useState } from "react";
import { claimStarterPoints, claimPoints, loadMyStreak, loadPointsSettings, loadPointsSince, loadMyPoints, loadUnclaimed, POINTS, STREAK_MILESTONES, CLAIM_HINT } from "../lib/points.js";
import { loadMyGame } from "../lib/rush.js";
import { loadProfile } from "../lib/store.js";
import { openInvites } from "../lib/invites.js";
import Sheet, { sheetTitle, muted } from "./Sheet.jsx";

// The points checklist (the 📋 in the header): every way to earn points as a
// task, with what's done today, this week and for good, and a GO button to
// the place you do it. Like a farm game's task board: points you earn wait
// here until you tap CLAIM (only claimed points are in your balance).

const DAY = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // TUNR days are Atlanta days
const go = (link) => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link } }));

// Which ledger reasons each task pays out as.
const TASK_REASONS = {
  checkin: ["checkin", "rsvp_bonus", "welcome_bonus"],
  stay: ["stay_bonus"],
  rush: ["game_bonus"],
  streak: ["streak_bonus"],
  friends: ["referral_bonus"],
  profile: ["starter_profile"],
  car: ["starter_car"],
  alerts: ["starter_alerts"],
  member: ["member_bonus"],
  receipt: ["purchase"],
};
const sum = (rows) => rows.reduce((n, r) => n + r.delta, 0);

async function loadTasks(user) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [starter, streak, rates, recent, game, profile, points, unclaimed] = await Promise.all([
    claimStarterPoints(),
    loadMyStreak(),
    loadPointsSettings(),
    loadPointsSince(user.id, monthStart),
    loadMyGame().catch(() => null),
    loadProfile(user.id),
    loadMyPoints(),
    loadUnclaimed(user.id),
  ]);
  const today = DAY(now);
  const todays = (reason) => recent.some((r) => r.reason === reason && DAY(r.at) === today);
  const referrals = recent.filter((r) => r.reason === "referral_bonus").length;
  const next = STREAK_MILESTONES.find(([w]) => w > (streak?.current || 0));
  const tasks = [
    // Today.
    { group: "TODAY", id: "checkin", icon: "📍", title: "Check in at a meet", text: "At the meet, during it. Boosted meets pay more.", pts: "+1–10", done: todays("checkin"), go: () => go("tab:discover") },
    { group: "TODAY", id: "stay", icon: "🏁", title: "Stay to the end", text: "Check in again near the end of a meet you arrived at early.", pts: "+1", done: todays("stay_bonus"), go: () => go("tab:discover") },
    {
      group: "TODAY",
      id: "rush",
      icon: "🎮",
      title: "Clear today's TUNR Rush level",
      text: "Easy +1, Medium +2, Hard +3. One level a day.",
      pts: "+1–3",
      done: Boolean(game?.today?.done) || todays("game_bonus"),
      go: () => go("play:rush"),
    },
    // This week.
    {
      group: "THIS WEEK",
      id: "streak",
      icon: streak?.current ? "🔥" : "🧊",
      title: streak?.this_week ? `Streak kept: ${streak.current} ${streak.current === 1 ? "week" : "weeks"}` : "Keep your weekly streak",
      text: next ? `Check in at a meet by Sunday night. ${next[0]} weeks in a row pays +${next[1]}.` : "Check in at a meet by Sunday night.",
      pts: next ? `+${next[1]}` : "BONUS",
      done: Boolean(streak?.this_week),
      progress: next ? [Math.min(streak?.current || 0, next[0]), next[0]] : null,
      go: () => go("tab:discover"),
    },
    // This month.
    {
      group: "THIS MONTH",
      id: "friends",
      icon: "🤝",
      title: "Bring friends to a meet",
      text: "Share your invite link or your car's QR. You get points when they check in at their first meet. Up to 10 a month.",
      pts: `+${rates.referral_points} each`,
      done: referrals >= 10,
      progress: [Math.min(referrals, 10), 10],
      go: () => openInvites(),
    },
    {
      group: "THIS MONTH",
      id: "receipt",
      icon: "🧾",
      title: "Upload a Boosted receipt",
      text: "Detailing, photography or merch: send the receipt or invoice in Perks for points.",
      pts: `+${rates.points_per_dollar} per $1`,
      done: recent.some((r) => r.reason === "purchase"),
      go: () => go("tab:perks"),
    },
    // For good.
    { group: "GETTING STARTED", id: "email", icon: "✉️", title: "Confirm your email", text: "Tap the link we emailed you. Points start after this.", pts: "", done: Boolean(starter?.confirmed), go: null },
    { group: "GETTING STARTED", id: "profile", icon: "👤", title: "Profile photo, username and bio", text: "Profile → Edit profile.", pts: `+${POINTS.profile}`, done: Boolean(starter?.profile), go: () => go("tab:profile") },
    { group: "GETTING STARTED", id: "car", icon: "🚗", title: "Add your car", text: "Profile → Garage → + Add car.", pts: `+${POINTS.car}`, done: Boolean(starter?.car), go: () => go("tab:profile") },
    { group: "GETTING STARTED", id: "alerts", icon: "🔔", title: "Turn on alerts", text: "Profile → Alerts, on this phone.", pts: `+${POINTS.alerts}`, done: Boolean(starter?.alerts), go: () => go("tab:profile") },
  ];
  if (rates.member_bonus > 0) {
    tasks.push({ group: "GETTING STARTED", id: "member", icon: "💎", title: "Become a TUNR member", text: "Member discounts at Atlanta shops, plus a one-time bonus.", pts: `+${rates.member_bonus}`, done: Boolean(profile?.isMember), go: () => go("tab:perks") });
  }
  // Each task's waiting points, so it shows CLAIM.
  for (const t of tasks) t.claim = unclaimed.filter((u) => (TASK_REASONS[t.id] || []).includes(u.reason));
  return { tasks, unclaimed, added: starter?.added || 0, balance: Number(points?.balance || 0) };
}

export default function Checklist({ user, onToast }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const latest = useRef(0);

  // Only the newest load lands (an older, slower one never undoes a claim).
  function refresh() {
    const ticket = ++latest.current;
    loadTasks(user)
      .then((d) => {
        if (ticket !== latest.current) return;
        setData(d);
        setError("");
        if (d.added > 0) onToast(`⭐ +${d.added} getting-started points. ${CLAIM_HINT}`);
      })
      .catch((e) => ticket === latest.current && setError(e.message));
  }

  // Just the points waiting to claim (for the badge): one small request.
  function refreshWaiting() {
    const ticket = ++latest.current;
    loadUnclaimed(user.id)
      .then((unclaimed) => {
        if (ticket !== latest.current) return;
        setData((d) => d && { ...d, unclaimed, tasks: d.tasks.map((t) => ({ ...t, claim: unclaimed.filter((u) => (TASK_REASONS[t.id] || []).includes(u.reason)) })) });
      })
      .catch((e) => console.warn(e.message));
  }

  useEffect(() => {
    if (!user) {
      setData(null);
      return undefined;
    }
    refresh();
    // New points anywhere in the app (or coming back to it) update the badge.
    const again = () => refreshWaiting();
    const onShow = () => document.visibilityState === "visible" && refreshWaiting();
    window.addEventListener("tunr:points", again);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("tunr:points", again);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [user?.id]);

  async function claim(rows) {
    if (!rows.length || claiming) return;
    setClaiming(true);
    try {
      const r = await claimPoints(rows.length === data.unclaimed.length ? null : rows.map((x) => x.id));
      onToast(`⭐ +${r.claimed} points claimed! You have ${Number(r.balance).toLocaleString()}.`);
      refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setClaiming(false);
    }
  }

  if (!user) return null;
  const left = data ? data.tasks.filter((t) => !t.done && t.group !== "THIS MONTH").length : 0;
  const waiting = data ? data.unclaimed.length : 0;
  const groups = data ? [...new Set(data.tasks.map((t) => t.group))] : [];

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        aria-label={waiting ? `Points checklist, ${waiting} to claim` : left ? `Points checklist, ${left} to do` : "Points checklist"}
        style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", background: "#161616", border: "1px solid #2A2A2A", color: "#DDD", fontSize: 17, cursor: "pointer", flexShrink: 0 }}
      >
        📋
        {(waiting > 0 || left > 0) && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: 9,
              background: waiting ? "#22C55E" : "#FACC15",
              color: "#111",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "17px",
              fontFamily: "'Barlow Condensed', sans-serif",
              boxSizing: "border-box",
            }}
          >
            {waiting ? `+${sum(data.unclaimed)}` : left}
          </span>
        )}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} label="Points checklist" zIndex={320} portal>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={sheetTitle}>📋 POINTS CHECKLIST</div>
            {data && <div style={{ fontSize: 16, fontWeight: 900, color: "#FACC15", whiteSpace: "nowrap" }}>⭐ {data.balance.toLocaleString()}</div>}
          </div>
          <div style={{ ...muted, marginTop: 4 }}>Everything that earns points. Tap GO to do it, then CLAIM to add the points to your balance.</div>
          {data && waiting > 0 && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "linear-gradient(160deg, rgba(34,197,94,0.16), rgba(250,204,21,0.1))", border: "1px solid #166534" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#86EFAC" }}>🎁 READY TO CLAIM</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#FACC15" }}>⭐ +{sum(data.unclaimed).toLocaleString()}</div>
                </div>
                <button className="action-btn" disabled={claiming} onClick={() => claim(data.unclaimed)} style={claimBtn(true)}>
                  {claiming ? "…" : "CLAIM ALL"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {data.unclaimed.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#E5E7EB", fontFamily: "'Barlow', sans-serif" }}>
                      {u.label}
                      {u.detail ? <span style={{ color: "#8A94A3" }}> · {u.detail}</span> : null}
                    </span>
                    <span style={{ fontWeight: 900, color: "#FACC15" }}>+{u.delta}</span>
                    <button className="action-btn" disabled={claiming} onClick={() => claim([u])} style={claimBtn(false)}>
                      CLAIM
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
              {error}
            </div>
          )}
          {!data && !error && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}
          {groups.map((g) => {
            const list = data.tasks.filter((t) => t.group === g);
            const done = list.filter((t) => t.done).length;
            return (
              <div key={g} style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3", marginBottom: 6 }}>
                  <span>{g}</span>
                  <span style={{ color: done === list.length ? "#10B981" : "#8A94A3" }}>
                    {done}/{list.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((t) => (
                    <Task
                      key={t.id}
                      task={t}
                      onClaim={() => claim(t.claim)}
                      onGo={() => {
                        setOpen(false);
                        t.go?.();
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </Sheet>
      )}
    </>
  );
}

const claimBtn = (big) => ({
  padding: big ? "9px 16px" : "4px 10px",
  borderRadius: 8,
  border: "none",
  background: "#22C55E",
  color: "#06210F",
  fontSize: big ? 15 : 12,
  fontWeight: 900,
  letterSpacing: 1,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
  boxShadow: big ? "0 4px 14px rgba(34,197,94,0.35)" : "none",
});

function Task({ task, onGo, onClaim }) {
  const [have, need] = task.progress || [];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 10px 10px 12px",
        borderRadius: 12,
        background: task.done ? "rgba(16,185,129,0.08)" : "#15181e",
        border: `1px solid ${task.done ? "#14532D" : "#262B34"}`,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 26, width: 32, textAlign: "center", filter: task.done ? "none" : "saturate(0.9)" }}>
        {task.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 900, color: task.done ? "#A7F3D0" : "#F0F0F0" }}>{task.title}</span>
        <span style={{ display: "block", fontSize: 12, color: "#8A94A3", fontFamily: "'Barlow', sans-serif", lineHeight: 1.35, marginTop: 1 }}>{task.text}</span>
        {need ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <span style={{ flex: 1, height: 6, borderRadius: 3, background: "#262B34", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(have / need) * 100}%`, background: task.done ? "#10B981" : "#FACC15", borderRadius: 3 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#B9C2CF" }}>
              {have}/{need}
            </span>
          </span>
        ) : null}
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
        {task.pts && <span style={{ fontSize: 13, fontWeight: 900, color: "#FACC15", whiteSpace: "nowrap" }}>⭐ {task.pts}</span>}
        {task.claim?.length ? (
          <button className="action-btn" onClick={onClaim} style={claimBtn(false)}>
            CLAIM +{sum(task.claim)}
          </button>
        ) : null}
        {task.done ? (
          task.claim?.length ? null : (
            <span style={{ fontSize: 12, fontWeight: 900, color: "#10B981", letterSpacing: 1 }}>✓ DONE</span>
          )
        ) : task.go ? (
          <button
            className="action-btn"
            onClick={onGo}
            style={{ padding: "5px 14px", borderRadius: 8, border: "none", background: "#0080F0", color: "#fff", fontSize: 13, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            GO
          </button>
        ) : null}
      </span>
    </div>
  );
}
