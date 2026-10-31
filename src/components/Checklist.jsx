import { useEffect, useRef, useState } from "react";
import { claimStarterPoints, claimHostBadges, claimPoints, loadMyStreak, loadPointsSettings, loadPointsSince, loadMyPoints, loadUnclaimed, STREAK_MILESTONES, CLAIM_HINT } from "../lib/points.js";
import { loadMyGame } from "../lib/rush.js";
import { loadProfile } from "../lib/store.js";
import { openInvites } from "../lib/invites.js";
import Sheet, { sheetTitle, muted } from "./Sheet.jsx";
import { SpinCard } from "./SpinWheel.jsx";
import { loadPhotoBallot } from "../lib/photoWeek.js";
import { loadTodaysCar } from "../lib/guessCar.js";
import { loadTaco } from "../lib/tunrTuesdays.js";

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
  photo: ["starter_profile"],
  car: ["starter_car"],
  alerts: ["starter_alerts"],
  member: ["member_bonus"],
  receipt: ["purchase"],
  host: ["host_bonus"],
  photo_week: ["photo_bonus"],
  guess: ["guess_bonus"],
  taco: ["taco_bonus"],
};
// Hosting milestones: [meets, points].
const HOST_STEPS = [
  [5, 10],
  [10, 25],
  [25, 50],
];
const sum = (rows) => rows.reduce((n, r) => n + r.delta, 0);

function setupStep(id, icon, title, text, pts, done) {
  return { group: "SETUP", setup: true, id, icon, title, text, pts: pts > 0 ? `+${pts}` : "", done: Boolean(done), go: () => go("tab:profile") };
}

// Setup steps someone's hidden with ✕ (on this phone).
const HIDDEN_KEY = "tunr.setup.hidden";
function loadHidden() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
  } catch (e) {
    console.warn("Couldn't read hidden setup steps:", e.message);
    return new Set();
  }
}

function hostTask(hosted) {
  const step = HOST_STEPS.find(([at]) => hosted < at);
  return {
    group: "HOSTING",
    id: "host",
    icon: "🏆",
    title: step ? `Host ${step[0]} meets` : "Hosted 25 meets: gold host",
    text: step ? `Post meets on TUNR. Each one counts once it starts. Badges at 5, 10 and 25. ${hosted} so far.` : `All host badges earned. ${hosted} meets hosted.`,
    pts: step ? `+${step[1]}` : "",
    done: !step,
    progress: step ? [hosted, step[0]] : null,
    go: () => go("tab:discover"),
  };
}

async function loadTasks(user) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // Milestones are paid first, so they show as ready to claim below.
  const host = await claimHostBadges().catch((e) => {
    console.warn(e.message);
    return null;
  });
  const [starter, streak, rates, recent, game, profile, points, unclaimed, ballot, carToday, taco] = await Promise.all([
    claimStarterPoints(),
    loadMyStreak(),
    loadPointsSettings(),
    loadPointsSince(user.id, monthStart),
    loadMyGame().catch(() => null),
    loadProfile(user.id),
    loadMyPoints(),
    loadUnclaimed(user.id),
    loadPhotoBallot().catch(() => null),
    loadTodaysCar().catch(() => null),
    loadTaco().catch(() => null),
  ]);
  const today = DAY(now);
  const pays = starter?.pays || { photo: rates.starter_photo_points ?? 5, car: rates.starter_car_points ?? 10, alerts: rates.starter_alerts_points ?? 5 };
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
    ...(carToday?.pool
      ? [{ group: "TODAY", id: "guess", icon: "🔍", title: "Guess today's car", text: "Arcade → Guess the Car. Quicker guesses pay more.", pts: "+1–3", done: Boolean(carToday.guessed), go: () => go("play:guess") }]
      : []),
    // This week.
    ...(taco?.pick?.open
      ? [{ group: "THIS WEEK", id: "taco", icon: "🏁", title: "TUNR Tuesdays pick", text: "Perks → TUNR Tuesdays: MORE or LESS on the TUNR line. Free, today only.", pts: `+${taco.points}`, done: Boolean(taco.pick.my_choice), go: () => go("tab:perks") }]
      : []),
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
    {
      group: "THIS WEEK",
      id: "photo_week",
      icon: "📸",
      title: "Vote for Photo of the week",
      text: `Pick the best meet photo posted this week. Post your own shots from meets: the top photo wins +${rates.photo_points ?? 25}.`,
      pts: `+${rates.photo_points ?? 25}`,
      done: Boolean(ballot?.my_vote),
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
      text: "Detailing, photography or merch: send the receipt or invoice in Perks for points. One a day.",
      pts: `+${rates.receipt_points ?? 10} each`,
      done: recent.some((r) => r.reason === "purchase"),
      go: () => go("tab:perks"),
    },
    // For good.
    hostTask(host?.hosted || 0),
    // Setup: steps to get going, like a bank's "activate your card". Some
    // pay a little (admin-set; 0 = none), most pay nothing.
    { group: "SETUP", setup: true, id: "email", icon: "✉️", title: "Confirm your email", text: "Tap the link we emailed you. Points start after this.", pts: "", done: Boolean(starter?.confirmed), go: null },
    { group: "SETUP", setup: true, id: "details", icon: "👤", title: "Pick a username and write a bio", text: "Profile → Edit profile. So people know who you are.", pts: "", done: Boolean(starter?.details), go: () => go("tab:profile") },
    setupStep("photo", "📸", "Add a profile photo", "Profile → Edit profile.", pays.photo, starter?.photo),
    setupStep("car", "🚗", "Add your car", "Profile → Garage → + Add car.", pays.car, starter?.car),
    setupStep("alerts", "🔔", "Turn on alerts", "Profile → Alerts, on this phone.", pays.alerts, starter?.alerts),
  ];
  if (rates.member_bonus > 0) {
    tasks.push({ group: "ONE TIME", id: "member", icon: "💎", title: "Become a TUNR member", text: "Member discounts at Atlanta shops, plus a one-time bonus.", pts: `+${rates.member_bonus}`, done: Boolean(profile?.isMember), go: () => go("tab:perks") });
  }
  // Each task's waiting points, so it shows CLAIM.
  for (const t of tasks) t.claim = unclaimed.filter((u) => (TASK_REASONS[t.id] || []).includes(u.reason));
  return { tasks, unclaimed, added: starter?.added || 0, balance: Number(points?.balance || 0) };
}

export default function Checklist({ user, onToast }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null); // null: picked for you
  const [hidden, setHidden] = useState(loadHidden);
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
  const visible = data ? data.tasks.filter((t) => !(t.setup && hidden.has(t.id) && !t.done)) : [];
  const left = visible.filter((t) => !t.done && t.group !== "THIS MONTH").length;
  const waiting = data ? data.unclaimed.length : 0;
  const setupLeft = visible.filter((t) => t.setup && !t.done).length;
  // Two tabs, like a bank app's: Setup (steps, mostly no points) and Earn.
  // Opens on Setup while two or more steps are left (a new account), then Earn.
  const shownTab = tab || (setupLeft >= 2 ? "setup" : "earn");
  const groups = [...new Set(visible.filter((t) => Boolean(t.setup) === (shownTab === "setup")).map((t) => t.group))];
  const hide = (id) =>
    setHidden((h) => {
      const next = new Set([...h, id]);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch (e) {
        onToast?.(`Couldn't hide that step on this phone. (${e.message})`);
      }
      return next;
    });

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        aria-label={waiting ? `Points checklist, ${waiting} to claim` : left ? `Points checklist, ${left} to do` : "Points checklist"}
        style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", background: "var(--n-161616)", border: "1px solid var(--n-2a2a2a)", color: "var(--n-dddddd)", fontSize: 17, cursor: "pointer", flexShrink: 0 }}
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
          <SpinCard user={user} onToast={onToast} onSpun={refresh} />
          {data && waiting > 0 && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "linear-gradient(160deg, rgba(34,197,94,0.16), rgba(250,204,21,0.1))", border: "1px solid #166534" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "var(--a-86efac)" }}>🎁 READY TO CLAIM</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#FACC15" }}>⭐ +{sum(data.unclaimed).toLocaleString()}</div>
                </div>
                <button className="action-btn" disabled={claiming} onClick={() => claim(data.unclaimed)} style={claimBtn(true)}>
                  {claiming ? "…" : "CLAIM ALL"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {data.unclaimed.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--n-e5e7eb)", fontFamily: "'Barlow', sans-serif" }}>
                      {u.label}
                      {u.detail ? <span style={{ color: "var(--n-8a94a3)" }}> · {u.detail}</span> : null}
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
            <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
              {error}
            </div>
          )}
          {!data && !error && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}
          {data && (
            <div role="tablist" aria-label="Checklist" style={{ display: "flex", gap: 6, marginTop: 14 }}>
              {[
                ["earn", "⭐ EARN POINTS"],
                ["setup", `SETUP${setupLeft ? ` · ${setupLeft}` : " ✓"}`],
              ].map(([id, name]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={shownTab === id}
                  onClick={() => setTab(id)}
                  style={{ padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${shownTab === id ? "var(--n-f0f0f0)" : "var(--n-2a2f3a)"}`, background: "transparent", color: shownTab === id ? "var(--n-f0f0f0)" : "var(--n-8a94a3)", fontSize: 13, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {data && shownTab === "setup" && (
            <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>
              {setupLeft ? "Steps to get set up. A few pay a little; the rest just help. ✕ hides one you don't want." : "All set up."}
              {hidden.size > 0 && (
                <button
                  onClick={() => {
                    setHidden(new Set());
                    try {
                      localStorage.removeItem(HIDDEN_KEY);
                    } catch (e) {
                      onToast?.(`Couldn't show the hidden steps. (${e.message})`);
                    }
                  }}
                  style={{ background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, cursor: "pointer", padding: "0 0 0 6px", fontSize: 12.5 }}
                >
                  Show hidden ({hidden.size})
                </button>
              )}
            </div>
          )}
          {groups.map((g) => {
            const list = visible.filter((t) => t.group === g);
            const done = list.filter((t) => t.done).length;
            return (
              <div key={g} style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "var(--n-8a94a3)", marginBottom: 6 }}>
                  <span>{g}</span>
                  <span style={{ color: done === list.length ? "#10B981" : "var(--n-8a94a3)" }}>
                    {done}/{list.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((t) => (
                    <Task
                      key={t.id}
                      task={t}
                      onHide={t.setup && !t.done && t.id !== "email" ? () => hide(t.id) : null}
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

function Task({ task, onGo, onClaim, onHide = null }) {
  const [have, need] = task.progress || [];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 10px 10px 12px",
        borderRadius: 12,
        background: task.done ? "rgba(16,185,129,0.08)" : "var(--n-15181e)",
        border: `1px solid ${task.done ? "#14532D" : "var(--n-262b34)"}`,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 26, width: 32, textAlign: "center", filter: task.done ? "none" : "saturate(0.9)" }}>
        {task.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 900, color: task.done ? "var(--a-a7f3d0)" : "var(--n-f0f0f0)" }}>{task.title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--n-8a94a3)", fontFamily: "'Barlow', sans-serif", lineHeight: 1.35, marginTop: 1 }}>{task.text}</span>
        {need ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--n-262b34)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(have / need) * 100}%`, background: task.done ? "#10B981" : "#FACC15", borderRadius: 3 }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--n-b9c2cf)" }}>
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
      {onHide && (
        <button onClick={onHide} aria-label={`Hide "${task.title}"`} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--n-8a94a3)", fontSize: 17, lineHeight: 1, padding: "2px 2px 6px 4px", cursor: "pointer" }}>
          ✕
        </button>
      )}
    </div>
  );
}
