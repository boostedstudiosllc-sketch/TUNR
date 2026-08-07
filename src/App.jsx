import { useEffect, useMemo, useState } from "react";
import { VIBES } from "./data/events.js";
import {
  isPast,
  isToday,
  isThisWeekend,
  sortKey,
  displayDate,
  displayTime,
} from "./lib/dates.js";
import { withDistances } from "./lib/geo.js";
import {
  loadEvents,
  loadRsvps,
  saveRsvp,
  submitEvent,
  loadTosAccepted,
  saveTosAccepted,
  syncTosToAccount,
  onAuthChange,
  hasBackend,
  completeSignInFromUrl,
  ensureProfile,
  loadFollows,
  toggleFollow,
  track,
} from "./lib/store.js";
import MeetCard from "./components/MeetCard.jsx";
import MeetDetail from "./components/MeetDetail.jsx";
import MapView from "./components/MapView.jsx";
import SubmitMeet from "./components/SubmitMeet.jsx";
import ProfileTab from "./components/ProfileTab.jsx";
import TermsOfService from "./components/TermsOfService.jsx";
import LockedMeets from "./components/LockedMeets.jsx";
import AuthForm from "./components/AuthForm.jsx";
import EditMeet from "./components/EditMeet.jsx";
import HostProfile from "./components/HostProfile.jsx";
import TodayStrip from "./components/TodayStrip.jsx";

const BASE_FILTERS = ["All", "Today", "This Weekend", "JDM", "Euro", "Exotic", "Domestic", "Truck"];

// Meets a signed-out visitor can see before the sign-in wall.
const FREE_PREVIEW_COUNT = 2;

const SORTS = [
  { id: "soonest", label: "SOONEST" },
  { id: "popular", label: "MOST GOING" },
  { id: "nearest", label: "NEAREST" },
];

export default function App() {
  const [events, setEvents] = useState([]);
  const [rsvps, setRsvps] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("discover");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toast, setToast] = useState(null);
  const [tosAccepted, setTosAccepted] = useState(() => Boolean(loadTosAccepted()));
  const [showTerms, setShowTerms] = useState(false);
  const [search, setSearch] = useState("");
  const [follows, setFollows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [hostView, setHostView] = useState(null);
  const [sort, setSort] = useState("soonest");
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);

  // Ticks so the "starts in" countdowns stay honest while the app is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Track auth session
  useEffect(() => {
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
      if (u) {
        ensureProfile(u);
        syncTosToAccount(u.id);
      }
    });
    return unsubscribe;
  }, []);

  // Record a session start once.
  useEffect(() => {
    track("app_opened", { path: window.location.pathname });
  }, []);

  // A shared /m/<slug> link opens straight to that meet.
  useEffect(() => {
    if (!events.length) return;
    const match = /^\/m\/([^/?#]+)/.exec(window.location.pathname);
    if (!match) return;
    const key = decodeURIComponent(match[1]);
    const found = events.find((e) => e.slug === key || e.id === key);
    if (found) {
      setSelected(found);
      track("shared_link_opened", { slug: key });
    }
    window.history.replaceState({}, document.title, "/");
  }, [events]);

  // Finish the emailed sign-in link, and say so if it failed.
  useEffect(() => {
    completeSignInFromUrl().then((res) => {
      if (!res) return;
      if (res.error) showToast(res.error);
      else if (res.signedIn) showToast("✓ Signed in — all meets unlocked");
    });
  }, []);

  // Load events + rsvps whenever the signed-in user changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadEvents(user?.id || null),
      loadRsvps(user?.id || null),
      loadFollows(user?.id || null),
    ])
      .then(([evts, r, f]) => {
        if (cancelled) return;
        setEvents(evts);
        setRsvps(r);
        setFollows(f);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withDistances(events, position)
      .filter((e) => !isPast(e, now))
      .filter((e) => {
        if (filter === "All") return true;
        if (filter === "Following") return follows.includes(e.host);
        if (filter === "Today") return isToday(e, now);
        if (filter === "This Weekend") return isThisWeekend(e, now);
        return e.vibe === filter;
      })
      .filter((e) => {
        if (!q) return true;
        const haystack = [e.title, e.host, e.location, e.city, ...(e.tags || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (sort === "popular") return (b.going || 0) - (a.going || 0);
        if (sort === "nearest") {
          // Events without a known distance sort after those with one.
          const da = a.distanceMi ?? Infinity;
          const db = b.distanceMi ?? Infinity;
          if (da !== db) return da - db;
        }
        return sortKey(a, now) - sortKey(b, now);
      });
  }, [events, filter, search, follows, sort, position]);

  const todayCount = useMemo(
    () => events.filter((e) => !isPast(e, now) && isToday(e, now)).length,
    [events, now]
  );

  // Meets you RSVP'd to that are on today. Locked private meets are left out —
  // you can't have RSVP'd to one, and it has no time worth counting down to.
  const todayMine = useMemo(
    () =>
      events
        .filter((e) => rsvps[e.id] && !e.locked && !isPast(e, now) && isToday(e, now))
        .sort((a, b) => sortKey(a, now) - sortKey(b, now)),
    [events, rsvps, now]
  );

  const saved = events.filter((e) => rsvps[e.id]);

  const gated = Boolean(hasBackend() && !user);
  const unlocked = gated ? visible.slice(0, FREE_PREVIEW_COUNT) : visible;
  const lockedEvents = gated ? visible.slice(FREE_PREVIEW_COUNT) : [];

  function handleRsvp(eventId, status) {
    // Optimistic update; persistence happens in the store.
    setRsvps((prev) => {
      const turningOff = prev[eventId] === status;
      const next = { ...prev };
      if (turningOff) delete next[eventId];
      else next[eventId] = status;
      saveRsvp(prev, eventId, status, user?.id || null).catch(() => {});
      if (!turningOff) track("rsvp", { eventId, status });
      return next;
    });
  }

  async function handleSubmit(draft) {
    try {
      await submitEvent(draft, user?.id || null);
      const evts = await loadEvents(user?.id || null);
      setEvents(evts);
      setShowSubmit(false);
      setTab("discover");
      setFilter("All");
      track("meet_posted", {});
      showToast("🏁 Meet posted — it's live on Discover");
    } catch (e) {
      showToast(e.message || "Couldn't post the meet. Check your connection and try again.");
    }
  }

  async function handleToggleFollow(host) {
    const isFollowing = follows.includes(host);
    setFollows((f) => (isFollowing ? f.filter((h) => h !== host) : [...f, host]));
    try {
      await toggleFollow(host, user.id, isFollowing);
      track(isFollowing ? "host_unfollowed" : "host_followed", { host });
    } catch {
      setFollows((f) => (isFollowing ? [...f, host] : f.filter((h) => h !== host)));
    }
  }

  async function refreshEvents() {
    const evts = await loadEvents(user?.id || null);
    setEvents(evts);
    const fresh = evts.find((e) => e.id === selected?.id);
    if (fresh) setSelected(fresh);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      showToast("This browser can't share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        track("location_granted", {});
      },
      () => {
        setLocating(false);
        showToast("Couldn't get your location — check browser permissions.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
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
            saveTosAccepted(user?.id || null);
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
          onClick={() => {
            if (gated) {
              setTab("profile");
              showToast("Create a free account to post a meet");
              return;
            }
            setShowSubmit(true);
          }}
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
          <TodayStrip events={todayMine} rsvps={rsvps} now={now} onOpen={setSelected} />

          <div style={{ padding: "0 20px 12px", position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 33,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#555",
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value.trim().length === 3) track("search", { q: e.target.value.trim() });
              }}
              placeholder="Search meets, hosts, places…"
              style={{
                width: "100%",
                background: "#161616",
                border: "1px solid #2A2A2A",
                borderRadius: 20,
                padding: "10px 38px",
                color: "#F0F0F0",
                fontSize: 13.5,
                outline: "none",
                fontFamily: "'Barlow', sans-serif",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 30,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#666",
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "0 20px 14px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {(user ? ["All", "Following", ...BASE_FILTERS.slice(1)] : BASE_FILTERS).map((f) => (
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

          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "0 20px 14px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#555",
                letterSpacing: 1.4,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              SORT
            </span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                className="filter-pill"
                onClick={() => {
                  setSort(s.id);
                  track("sort_changed", { sort: s.id });
                  if (s.id === "nearest" && !position) requestLocation();
                }}
                style={{
                  padding: "5px 11px",
                  borderRadius: 16,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  whiteSpace: "nowrap",
                  background: sort === s.id ? "rgba(255,69,0,0.14)" : "transparent",
                  color: sort === s.id ? "#FF4500" : "#666",
                  border: `1px solid ${sort === s.id ? "#FF4500" : "#242424"}`,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {!position && (
            <div style={{ padding: "0 20px 14px" }}>
              <button
                className="action-btn"
                onClick={requestLocation}
                disabled={locating}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "#111",
                  border: "1px dashed #2A2A2A",
                  borderRadius: 10,
                  color: "#777",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {locating ? "LOCATING…" : "📍 SHOW DISTANCES FROM ME"}
              </button>
            </div>
          )}

          {todayCount > 0 && todayMine.length === 0 && (
            <div
              className="meet-card"
              onClick={() => {
                setFilter("Today");
                track("today_banner_tapped", { count: todayCount });
              }}
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
            {loading ? (
              <EmptyState title="Loading meets…" sub="Pulling the latest events" />
            ) : visible.length === 0 ? (
              <EmptyState
                title={search ? `No meets match "${search.trim()}"` : "No meets match this filter"}
                sub={search ? "Try a different word" : "Try a different vibe or clear filters"}
              />
            ) : (
              <>
                {unlocked.map((event, i) => (
                  <MeetCard
                    key={event.id}
                    event={event}
                    rsvp={rsvps[event.id]}
                    onOpen={setSelected}
                    onRsvp={handleRsvp}
                    onOpenHost={setHostView}
                    now={now}
                    index={i}
                  />
                ))}
                {lockedEvents.length > 0 && (
                  <LockedMeets
                    events={lockedEvents}
                    lockedCount={lockedEvents.length}
                    onError={showToast}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Map */}
      {tab === "map" && (
        <div style={{ animation: "fadeIn 0.3s ease", padding: "0 20px" }}>
          <MapView events={unlocked} onSelect={setSelected} />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>
              TAP A PIN OR BROWSE
            </div>
            {unlocked.map((event) => (
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
            {gated && lockedEvents.length > 0 && (
              <div
                style={{
                  background: "#111",
                  border: "1px solid #FF4500",
                  borderRadius: 12,
                  padding: "18px 18px",
                  marginTop: 4,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
                <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.4 }}>
                  {lockedEvents.length} MORE ON THE MAP
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#999",
                    marginTop: 6,
                    marginBottom: 14,
                    lineHeight: 1.6,
                    fontFamily: "'Barlow', sans-serif",
                  }}
                >
                  Free account — see every pin near you.
                </div>
                <AuthForm />
              </div>
            )}
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
          {gated ? (
            <div
              style={{
                background: "#111",
                border: "1px solid #FF4500",
                borderRadius: 12,
                padding: "22px 20px",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 0.4 }}>
                SAVE YOUR MEETS
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#999",
                  marginTop: 7,
                  marginBottom: 16,
                  lineHeight: 1.6,
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                Free account — RSVP, keep a list of the meets you're hitting, and get them on any device.
              </div>
              <AuthForm />
            </div>
          ) : saved.length === 0 ? (
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
                  onOpenHost={setHostView}
                  now={now}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile */}
      {tab === "profile" && (
        <ProfileTab
          events={events}
          rsvps={rsvps}
          user={user}
          onShowTerms={() => setShowTerms(true)}
          onToast={showToast}
          onOpenHost={(h) => {
            setSelected(null);
            setHostView(h);
          }}
        />
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
            <span
              style={{
                fontSize: 20,
                color: tab === t.id ? "#FF4500" : "#333",
                position: "relative",
              }}
            >
              {t.icon}
              {t.id === "saved" && todayMine.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -9,
                    minWidth: 15,
                    height: 15,
                    padding: "0 4px",
                    borderRadius: 8,
                    background: "#FF4500",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 800,
                    lineHeight: "15px",
                    textAlign: "center",
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {todayMine.length}
                </span>
              )}
            </span>
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

      {selected && (
        <MeetDetail
          event={selected}
          rsvp={rsvps[selected.id]}
          onClose={() => setSelected(null)}
          onRsvp={handleRsvp}
          user={user}
          following={follows.includes(selected.host)}
          onToggleFollow={handleToggleFollow}
          onEdit={() => setEditing(selected)}
          onNeedAccount={() => {
            setSelected(null);
            setTab("profile");
            showToast("Create a free account first");
          }}
          onToast={showToast}
          onOpenHost={(h) => {
            setSelected(null);
            setHostView(h);
          }}
          onJoined={refreshEvents}
        />
      )}

      {showSubmit && (
        <SubmitMeet user={user} onClose={() => setShowSubmit(false)} onSubmit={handleSubmit} />
      )}

      {hostView && (
        <HostProfile
          host={hostView}
          events={events}
          rsvps={rsvps}
          user={user}
          following={follows.includes(hostView)}
          onToggleFollow={handleToggleFollow}
          onOpenMeet={(e) => {
            setHostView(null);
            setSelected(e);
          }}
          onRsvp={handleRsvp}
          onClose={() => setHostView(null)}
          onNeedAccount={() => {
            setHostView(null);
            setTab("profile");
            showToast("Create a free account first");
          }}
        />
      )}

      {editing && (
        <EditMeet
          event={editing}
          user={user}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshEvents();
            showToast("Saved");
          }}
        />
      )}

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
