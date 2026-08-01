import { useMemo, useState } from "react";
import { VIBES } from "./data/events.js";
import { isPast, isToday, isThisWeekend, sortKey, displayDate, displayTime } from "./lib/dates.js";
import { loadEvents, loadRsvps, saveRsvp, submitEvent, loadTosAccepted, saveTosAccepted } from "./lib/store.js";
import MeetCard from "./components/MeetCard.jsx";
import MeetDetail from "./components/MeetDetail.jsx";
import MapView from "./components/MapView.jsx";
import SubmitMeet from "./components/SubmitMeet.jsx";
import ProfileTab from "./components/ProfileTab.jsx";
import TermsOfService from "./components/TermsOfService.jsx";

const FILTERS = ["All", "Today", "This Weekend", "JDM", "Euro", "Exotic", "Domestic", "Truck"];

export default function App() {
  const [events, setEvents] = useState(loadEvents);
  const [rsvps, setRsvps] = useState(loadRsvps);
  const [tab, setTab] = useState("discover");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toast, setToast] = useState(null);
  const [tosAccepted, setTosAccepted] = useState(() => Boolean(loadTosAccepted()));
  const [showTerms, setShowTerms] = useState(false);

  const now = new Date();

  const visible = useMemo(() => {
    return events
      .filter((e) => !isPast(e, now))
      .filter((e) => {
        if (filter === "All") return true;
        if (filter === "Today") return isToday(e, now);
        if (filter === "This Weekend") return isThisWeekend(e, now);
        return e.vibe === filter;
      })
      .sort((a, b) => sortKey(a, now) - sortKey(b, now));
  }, [events, filter]);

  const todayCount = useMemo(
    () => events.filter((e) => !isPast(e, now) && isToday(e, now)).length,
    [events]
  );

  const saved = events.filter((e) => rsvps[e.id]);

  function handleRsvp(eventId, status) {
    setRsvps((prev) => saveRsvp(prev, eventId, status));
  }

  function handleSubmit(draft) {
    submitEvent(draft);
    setEvents(loadEvents());
    setShowSubmit(false);
    setTab("discover");
    setFilter("All");
    showToast("🏁 Meet posted — it's live on Discover");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  if (!tosAccepted) {
    return (
      <>
        <GlobalStyles />
        <TermsOfService
          onAccept={() => {
            saveTosAccepted();
            setTosAccepted(true);
          }}
        />
      </>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        background: "#0A0A0A",
        color: "#F0F0F0",
        minHeight: "100vh",
        maxWidth: 430,
        margin: "0 auto",
        position: "relative",
        paddingBottom: 84,
      }}
    >
      <GlobalStyles />

      {/* Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "linear-gradient(180deg, #0A0A0A 85%, transparent)",
          zIndex: 50,
        }}
      >
        <div>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>
            TUN<span style={{ color: "#FF4500" }}>R</span>
          </div>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginTop: 1 }}>
            ATLANTA, GA
          </div>
        </div>
        <button
          className="action-btn"
          onClick={() => setShowSubmit(true)}
          style={{
            background: "#FF4500",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            padding: "9px 15px",
            borderRadius: 5,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          + POST MEET
        </button>
      </div>

      {/* Discover */}
      {tab === "discover" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "0 20px 14px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                className="filter-pill"
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  whiteSpace: "nowrap",
                  background: filter === f ? "#FF4500" : "#161616",
                  color: filter === f ? "#fff" : "#666",
                  border: filter === f ? "1px solid #FF4500" : "1px solid #222",
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          {todayCount > 0 && (
            <div
              style={{
                margin: "0 20px 16px",
                background: "linear-gradient(135deg, #1A0A00, #2A1000)",
                border: "1px solid #FF4500",
                borderRadius: 6,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#FF4500",
                  boxShadow: "0 0 8px #FF4500",
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 11, color: "#FF4500", letterSpacing: 2, fontWeight: 700 }}>
                  HAPPENING TODAY
                </div>
                <div style={{ fontSize: 13, color: "#CCC", marginTop: 1 }}>
                  {todayCount} meet{todayCount === 1 ? "" : "s"} today near you
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {visible.length === 0 ? (
              <EmptyState
                title="No meets match this filter"
                sub="Try a different vibe or clear filters"
              />
            ) : (
              visible.map((event, i) => (
                <MeetCard
                  key={event.id}
                  event={event}
                  rsvp={rsvps[event.id]}
                  onOpen={setSelected}
                  onRsvp={handleRsvp}
                  index={i}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Map */}
      {tab === "map" && (
        <div style={{ animation: "fadeIn 0.3s ease", padding: "0 20px" }}>
          <MapView events={visible} onSelect={setSelected} />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>
              TAP A PIN OR BROWSE
            </div>
            {visible.map((event) => (
              <div
                key={event.id}
                className="meet-card"
                onClick={() => setSelected(event)}
                style={{
                  background: "#111",
                  borderRadius: 8,
                  border: "1px solid #1E1E1E",
                  padding: "10px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: VIBES[event.vibe],
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: VIBES[event.vibe],
                      fontWeight: 800,
                      letterSpacing: 1,
                    }}
                  >
                    {event.vibe}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{event.title}</div>
                <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>
                  {displayDate(event)} · {displayTime(event)} · {event.city}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved */}
      {tab === "saved" && (
        <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1, marginBottom: 6 }}>
            MY MEETS
          </div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
            Meets you're going to or interested in
          </div>
          {saved.length === 0 ? (
            <EmptyState title="No meets saved yet" sub="RSVP to meets in the Discover tab" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {saved.map((event, i) => (
                <MeetCard
                  key={event.id}
                  event={event}
                  rsvp={rsvps[event.id]}
                  onOpen={setSelected}
                  onRsvp={handleRsvp}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom nav */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "rgba(10,10,10,0.96)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid #1A1A1A",
          display: "flex",
          zIndex: 100,
        }}
      >
        {[
          { id: "discover", icon: "≡", label: "DISCOVER" },
          { id: "map", icon: "◎", label: "MAP" },
          { id: "saved", icon: "★", label: "MY MEETS" },
          { id: "profile", icon: "◉", label: "PROFILE" },
        ].map((t) => (
          <button
            key={t.id}
            className="tab-item"
            onClick={() => {
              setTab(t.id);
              setSelected(null);
            }}
            style={{
              flex: 1,
              padding: "12px 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 20, color: tab === t.id ? "#FF4500" : "#333" }}>{t.icon}</span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                fontWeight: 700,
                color: tab === t.id ? "#FF4500" : "#333",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {t.label}
            </span>
            {tab === t.id && (
              <div
                style={{
                  width: 20,
                  height: 2,
                  background: "#FF4500",
                  borderRadius: 2,
                  marginTop: 1,
                }}
              />
            )}
          </button>
        ))}
      </nav>

      {tab === "profile" && <ProfileTab events={events} rsvps={rsvps} onShowTerms={() => setShowTerms(true)} />}

      {selected && (
        <MeetDetail
          event={selected}
          rsvp={rsvps[selected.id]}
          onClose={() => setSelected(null)}
          onRsvp={handleRsvp}
        />
      )}

      {showSubmit && <SubmitMeet onClose={() => setShowSubmit(false)} onSubmit={handleSubmit} />}

      {showTerms && <TermsOfService readOnly onClose={() => setShowTerms(false)} />}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#131315",
            border: "1px solid #FF4500",
            color: "#F0F0F0",
            padding: "11px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 400,
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            maxWidth: 380,
            textAlign: "center",
            animation: "toastIn 0.25s ease",
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #1E1E1E",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      ::-webkit-scrollbar { width: 0; height: 0; }
      @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(14px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      .meet-card { transition: transform 0.18s ease, box-shadow 0.18s ease; cursor: pointer; }
      .meet-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(255,69,0,0.18); }
      .filter-pill { transition: all 0.2s ease; cursor: pointer; border: none; }
      .action-btn { transition: all 0.18s ease; cursor: pointer; border: none; }
      .action-btn:hover { opacity: 0.85; }
      .tab-item { transition: all 0.2s ease; cursor: pointer; background: transparent; border: none; }
      .close-btn { transition: opacity 0.2s; cursor: pointer; }
      .close-btn:hover { opacity: 0.7; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}
