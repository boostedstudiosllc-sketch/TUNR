import { useMemo, useState } from "react";
import { VIBES } from "../data/events.js";
import { occurrencesInMonth, todayKey, displayTime } from "../lib/dates.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// The month at a glance: every meet on the day it happens (weekly and
// monthly meets on each of their dates), tap a day to see what's on.
export default function CalendarView({ events, rsvps, onOpen, now = new Date() }) {
  const today = todayKey(now);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [picked, setPicked] = useState(today);

  // day key -> meets that day, soonest first.
  const byDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      for (const key of occurrencesInMonth(e, year, month)) {
        (map[key] = map[key] || []).push(e);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.start || "").slice(11).localeCompare((b.start || "").slice(11)));
    }
    return map;
  }, [events, year, month]);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const total = Object.values(byDay).reduce((n, list) => n + list.length, 0);
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const selected = picked && picked.startsWith(monthKey) ? picked : null;
  const dayMeets = selected ? byDay[selected] || [] : [];
  // The next day this month with something on, after the one picked.
  const nextDay = selected
    ? Object.keys(byDay).filter((k) => k > selected).sort()[0] || null
    : null;

  function shift(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) (m = 12), (y -= 1);
    if (m > 12) (m = 1), (y += 1);
    setYear(y);
    setMonth(m);
    const thisMonth = `${y}-${String(m).padStart(2, "0")}`;
    setPicked(today.startsWith(thisMonth) ? today : null);
  }

  function goToday() {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)));
    setPicked(today);
  }

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NavButton label="Previous month" onClick={() => shift(-1)}>‹</NavButton>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>
            {MONTH_NAMES[month - 1].toUpperCase()} {year}
          </div>
          <div style={{ fontSize: 11, color: "#666", fontFamily: "'Barlow', sans-serif" }}>
            {total} {total === 1 ? "meet" : "meets"}
          </div>
        </div>
        <NavButton label="Next month" onClick={() => shift(1)}>›</NavButton>
      </div>

      {!today.startsWith(monthKey) && (
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <button
            onClick={goToday}
            style={{ background: "none", border: "none", color: "#3CABFD", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}
          >
            Back to today
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 12 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1, paddingBottom: 4 }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key = `${monthKey}-${String(day).padStart(2, "0")}`;
          const meets = byDay[key] || [];
          const isToday = key === today;
          const isPicked = key === selected;
          const past = key < today;
          const mine = meets.some((e) => rsvps[e.id] === "going");
          return (
            <button
              key={i}
              onClick={() => setPicked(key)}
              aria-label={`${MONTH_NAMES[month - 1]} ${day}: ${meets.length} ${meets.length === 1 ? "meet" : "meets"}`}
              aria-pressed={isPicked}
              style={{
                aspectRatio: "1 / 1.05",
                padding: "4px 0 3px",
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                background: isPicked ? "rgba(0, 128, 240,0.16)" : meets.length ? "#141414" : "transparent",
                border: `1px solid ${isPicked ? "#0080F0" : isToday ? "#555" : meets.length ? "#222" : "transparent"}`,
                opacity: past && !isPicked ? 0.45 : 1,
                color: "#E6E6E6",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: isToday ? 900 : 700, color: isToday ? "#3CABFD" : undefined }}>
                {day}
              </span>
              <span style={{ display: "flex", gap: 2, alignItems: "center", minHeight: 8 }}>
                {meets.slice(0, 3).map((e, j) => (
                  <span
                    key={j}
                    style={{ width: 6, height: 6, borderRadius: "50%", background: VIBES[e.vibe] || "#0080F0" }}
                  />
                ))}
                {meets.length > 3 && <span style={{ fontSize: 9, color: "#999", fontWeight: 700 }}>+{meets.length - 3}</span>}
              </span>
              {mine ? (
                <span style={{ fontSize: 8, color: "#0080F0", fontWeight: 800, letterSpacing: 0.4 }}>GOING</span>
              ) : (
                <span style={{ fontSize: 8 }}>&nbsp;</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {Object.entries(VIBES).map(([name, color]) => (
          <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#888" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            {name}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {selected ? (
          <>
            <div style={{ fontSize: 12, color: "#888", letterSpacing: 1.6, fontWeight: 700, marginBottom: 8 }}>
              {dayLabel(selected).toUpperCase()}
              {selected === today && " · TODAY"}
            </div>
            {dayMeets.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666", fontFamily: "'Barlow', sans-serif" }}>
                No meets this day.
                {nextDay && (
                  <>
                    {" "}
                    <button
                      onClick={() => setPicked(nextDay)}
                      style={{ background: "none", border: "none", padding: 0, color: "#3CABFD", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}
                    >
                      Next up: {dayLabel(nextDay)} →
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dayMeets.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onOpen(e)}
                    className="meet-card"
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      textAlign: "left",
                      background: "#111",
                      border: "1px solid #222",
                      borderLeft: `3px solid ${VIBES[e.vibe] || "#0080F0"}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: "#E6E6E6",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 58, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: "#3CABFD" }}>
                      {displayTime(e)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#777", marginTop: 1, fontFamily: "'Barlow', sans-serif" }}>
                        @{e.host} · {e.city}
                        {e.recurrence && " · repeats"}
                      </div>
                    </div>
                    {rsvps[e.id] === "going" && (
                      <span style={{ fontSize: 9.5, color: "#0080F0", fontWeight: 800, letterSpacing: 0.8 }}>GOING</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#666", fontFamily: "'Barlow', sans-serif" }}>Tap a day to see its meets.</div>
        )}
      </div>
    </div>
  );
}

function NavButton({ children, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: "#161616",
        border: "1px solid #2A2A2A",
        color: "#DDD",
        fontSize: 22,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function dayLabel(key) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
