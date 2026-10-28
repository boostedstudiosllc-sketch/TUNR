import { useEffect, useMemo, useState } from "react";
import { VIBES } from "./data/events.js";
import {
  isPast,
  isToday,
  isThisWeekend,
  sortKey,
  occurrencesBetween,
  timeWindow,
  todayKey,
  displayDate,
  displayTime,
} from "./lib/dates.js";
import { withDistances } from "./lib/geo.js";
import {
  loadEvents,
  loadRsvps,
  saveRsvp,
  loadGoingAs,
  saveGoingAs,
  submitEvent,
  hasAcceptedCurrentTos,
  saveTosAccepted,
  syncTosToAccount,
  loadTosAccepted,
  signOut,
  onAuthChange,
  hasBackend,
  completeSignInFromUrl,
  ensureProfile,
  loadFollows,
  loadConnections,
  toggleFollow,
  track,
} from "./lib/store.js";
import MeetCard from "./components/MeetCard.jsx";
import MeetDetail from "./components/MeetDetail.jsx";
import MapView from "./components/MapView.jsx";
import SubmitMeet from "./components/SubmitMeet.jsx";
import ProfileTab from "./components/ProfileTab.jsx";
import TermsOfService from "./components/TermsOfService.jsx";
import PrivacyPolicy from "./components/PrivacyPolicy.jsx";
import AuthForm from "./components/AuthForm.jsx";
import Welcome from "./components/Welcome.jsx";
import EditMeet from "./components/EditMeet.jsx";
import HostProfile from "./components/HostProfile.jsx";
import CalendarView from "./components/CalendarView.jsx";
import TimeFilter from "./components/TimeFilter.jsx";
import PersonProfile from "./components/PersonProfile.jsx";
import TodayStrip from "./components/TodayStrip.jsx";
import HostPitch from "./components/HostPitch.jsx";
import PerksTab from "./components/PerksTab.jsx";
import JoinPage from "./components/JoinPage.jsx";
import CommunityTab from "./components/CommunityTab.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import Checklist from "./components/Checklist.jsx";
import AlertSettings from "./components/AlertSettings.jsx";
import HomeScreenPrompt from "./components/HomeScreenPrompt.jsx";
import ConfirmEmailBanner from "./components/ConfirmEmail.jsx";
import SetPasswordSheet from "./components/SetPassword.jsx";
import { AccountContext, confirmMyEmail } from "./lib/account.js";
import { loadPhotoSpots } from "./lib/community.js";
import { CARD_PARAM, rememberPendingCard, hasPendingCard } from "./lib/points.js";
import { INVITE_PARAM, rememberPendingInvite, takePendingInvite, claimInvite } from "./lib/invites.js";
import InviteSheet from "./components/InviteSheet.jsx";
import { useLocationStatus } from "./components/LocationAccess.jsx";
import { recordSignIn } from "./lib/activity.js";
import { CAR_PARAM } from "./lib/buildpage.js";
import BuildPage from "./components/BuildPage.jsx";

const BASE_FILTERS = ["All", "Today", "This Weekend", "✨ Showcase", "⭐ Points", "JDM", "Euro", "Exotic", "Domestic", "Truck"];

const SORTS = [
  { id: "soonest", label: "SOONEST" },
  { id: "popular", label: "MOST GOING" },
  { id: "nearest", label: "NEAREST" },
];

// Going or maybe. "Not going" is an answer, not a saved meet.
const isSaved = (status) => status === "going" || status === "interested";

export default function App() {
  const [events, setEvents] = useState([]);
  const [rsvps, setRsvps] = useState({});
  // How you're going to each meet you said yes to: "car" | "photographer" | "both".
  const [goingAs, setGoingAs] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("discover");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toast, setToast] = useState(null);
  // First open: the welcome page (sign in, sign up, or browse as a guest).
  // A guest agrees to the terms there; an account reads and agrees to them on
  // their own screen after signing up (and again only when they change).
  const [welcomed, setWelcomed] = useState(() => Boolean(loadTosAccepted()));
  const [guestTos, setGuestTos] = useState(() => hasAcceptedCurrentTos());
  const [accountTos, setAccountTos] = useState(null); // signed in: agreed to these terms? null while checking
  // /hosts is the pitch page sent to prospective hosts, /join the link in the
  // bio. Kept as plain path matching rather than a router.
  const [showHostPitch, setShowHostPitch] = useState(
    () => typeof window !== "undefined" && /^\/hosts\/?$/.test(window.location.pathname)
  );
  const [showJoin, setShowJoin] = useState(
    () => typeof window !== "undefined" && /^\/join\/?$/.test(window.location.pathname)
  );
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [search, setSearch] = useState("");
  const [follows, setFollows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [hostView, setHostView] = useState(null);
  // A person opened from a chat message (their account id).
  const [personView, setPersonView] = useState(null);
  // Accounts you follow; their meets show under Following.
  const [followingPeople, setFollowingPeople] = useState([]);
  const [sort, setSort] = useState("soonest");
  // Discover as a list or as a month calendar.
  const [view, setView] = useState("list");
  // The map's "when": a preset, or a custom date and time range.
  const [mapWhen, setMapWhen] = useState(() => ({
    preset: "any",
    custom: { date: todayKey(), from: "17:00", to: "19:00" },
  }));
  const [position, setPosition] = useState(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  // The invite screen, opened from the profile or a locked feature.
  const [inviting, setInviting] = useState(null);
  // The map's photo-spot layer (forum posts tagged 📸 with a pin).
  const [showSpots, setShowSpots] = useState(false);
  const [spots, setSpots] = useState([]);
  // Whether this account's email is confirmed (null while unknown).
  const [account, setAccount] = useState(null);
  // Something in Community to open, from an alert: { type, id }.
  const [communityOpen, setCommunityOpen] = useState(null);
  // An alert tapped before the meets had loaded ("meet:<id>").
  const [pendingLink, setPendingLink] = useState(
    () => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("open")) || null
  );
  const [locating, setLocating] = useState(false);
  // A game to start ("play:rush:<car id>" from the garage's DRIVE button).
  const [launch, setLaunch] = useState(null);

  // Ticks so the "starts in" countdowns stay honest while the app is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Opened a friend's invite link (?invite=…): kept until they've signed up,
  // then credited to that friend. Only new accounts can be credited.
  // A "Scan my build" sticker opens ?car=<id>&invite=<owner's code>: show
  // that car's page, and credit the owner if the scanner signs up.
  const [carView, setCarView] = useState(
    () => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get(CAR_PARAM)) || null
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get(INVITE_PARAM);
    const car = params.get(CAR_PARAM);
    if (!code && !car) return;
    if (code) rememberPendingInvite(code, car ? { source: "scan", vehicle: car } : {});
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (!user) return;
    const pending = takePendingInvite();
    if (!pending?.code) return;
    // After ensureProfile has had a moment to create the profile row.
    const t = setTimeout(() => {
      claimInvite(pending)
        .then((r) => {
          if (r?.status === "ok") showToast(`🎉 You joined with @${r.inviter || "a friend"}'s invite`);
        })
        .catch((e) => showToast(e.message));
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);
  // Screens without a link handler (the leaderboard) open things through this.
  useEffect(() => {
    const go = (e) => e.detail?.link && openLink(e.detail.link);
    window.addEventListener("tunr:open", go);
    return () => window.removeEventListener("tunr:open", go);
  });
  // Short notices from anywhere in the app (e.g. the language warning).
  useEffect(() => {
    const show = (e) => e.detail?.message && showToast(e.detail.message);
    window.addEventListener("tunr:notice", show);
    return () => window.removeEventListener("tunr:notice", show);
  });
  useEffect(() => {
    const open = (e) => setInviting({ reason: e.detail?.reason || "" });
    window.addEventListener("tunr:invites", open);
    return () => window.removeEventListener("tunr:invites", open);
  }, []);

  // Scanned a points card (?card=…): hold the code until they're signed in,
  // then it opens on the Perks tab with the code filled in.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get(CARD_PARAM);
    if (!code) return;
    rememberPendingCard(code);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (!hasPendingCard()) return;
    if (user) {
      setTab("perks");
      return;
    }
    // The saved sign-in can take a moment to load; only then ask them to sign in.
    const t = setTimeout(() => {
      setTab("profile");
      showToast("Sign in or create a free account to add your points card");
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);

  // Track auth session
  useEffect(() => {
    const unsubscribe = onAuthChange((u, event) => {
      setUser(u);
      // Arrived from a password-reset email: ask for the new password.
      if (event === "PASSWORD_RECOVERY") setSettingPassword(true);
      // For Settings → Sign-in history (the database skips repeats).
      if (u && event === "SIGNED_IN") recordSignIn();
      if (u) {
        ensureProfile(u);
      }
    });
    return unsubscribe;
  }, []);

  // Has this account agreed to the current terms (here or on another device)?
  useEffect(() => {
    if (!user) {
      setAccountTos(null);
      return undefined;
    }
    const here = hasAcceptedCurrentTos(user.id);
    setAccountTos(here ? true : null);
    let alive = true;
    syncTosToAccount(user).then((ok) => alive && setAccountTos(ok || here));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Confirmed yet? Arriving from the emailed link confirms it right here.
  useEffect(() => {
    if (!user || !hasBackend()) {
      setAccount(null);
      return;
    }
    let alive = true;
    confirmMyEmail()
      .then((a) => {
        if (!alive) return;
        setAccount((prev) => {
          if (prev && !prev.confirmed && a.confirmed) showToast("✅ Email confirmed — chat, posting and linkups are unlocked");
          return a;
        });
      })
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [user?.id, user?.last_sign_in_at]);

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
      loadGoingAs(user?.id || null),
    ])
      .then(([evts, r, f, g]) => {
        if (cancelled) return;
        setEvents(evts);
        setRsvps(r);
        setFollows(f);
        setGoingAs(g);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Meets matching the chosen filter and search, past ones included (the
  // calendar shows earlier days of the month); the list drops those.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withDistances(events, position)
      .filter((e) => {
        if (filter === "All") return true;
        if (filter === "Following")
          return (
            follows.includes(e.host) ||
            (e.cohosts || []).some((c) => follows.includes(c)) ||
            (e.createdBy && followingPeople.includes(e.createdBy))
          );
        if (filter === "Today") return isToday(e, now);
        if (filter === "This Weekend") return isThisWeekend(e, now);
        if (filter === "⭐ Points") return Boolean(e.boostPoints);
        if (filter === "✨ Showcase") return e.meetStyle === "showcase";
        return e.vibe === filter;
      })
      .filter((e) => {
        if (!q) return true;
        const haystack = [e.title, e.host, e.location, e.city, ...(e.tags || []), ...(e.cohosts || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [events, filter, search, follows, followingPeople, position]);

  const visible = useMemo(() => {
    return matching
      .filter((e) => !isPast(e, now))
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
  }, [matching, sort]);

  // Meets on the map: the Discover filters, narrowed to the chosen time.
  // Each keeps the start of its occurrence in that window, for the list.
  const mapWindow = useMemo(
    () => timeWindow(mapWhen.preset, now, mapWhen.custom),
    [mapWhen, now]
  );
  const mapEvents = useMemo(() => {
    const shown = visible;
    if (!mapWindow) return shown;
    return shown
      .map((e) => {
        const hit = occurrencesBetween(e, mapWindow.from, mapWindow.to)[0];
        return hit ? { ...e, windowStart: hit.start } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.windowStart - b.windowStart);
  }, [visible, mapWindow]);

  const todayCount = useMemo(
    () => events.filter((e) => !isPast(e, now) && isToday(e, now)).length,
    [events, now]
  );

  // Meets you RSVP'd to that are on today. Locked private meets are left out —
  // you can't have RSVP'd to one, and it has no time worth counting down to.
  const todayMine = useMemo(
    () =>
      events
        .filter((e) => isSaved(rsvps[e.id]) && !e.locked && !isPast(e, now) && isToday(e, now))
        .sort((a, b) => sortKey(a, now) - sortKey(b, now)),
    [events, rsvps, now]
  );

  const saved = events.filter((e) => isSaved(rsvps[e.id]));

  // Browsing is open to everyone: meets came from public listings, and a wall
  // in front of them costs reach without buying anything. The account is what
  // gates *acting* — RSVPing, a garage, posting, and eventually reminders.
  const needsAccount = Boolean(hasBackend() && !user);
  const unlocked = visible;

  function refreshFollowingPeople() {
    if (!user) return setFollowingPeople([]);
    loadConnections("following").then((rows) => setFollowingPeople(rows.map((r) => r.user_id)));
  }

  useEffect(refreshFollowingPeople, [user?.id]);

  function handleRsvp(eventId, status) {
    // The natural place to ask for an account: they've already decided they
    // want this meet. Far easier a yes than a wall on the way in.
    if (needsAccount) {
      setSelected(null);
      setTab("profile");
      showToast("Create a free account to RSVP");
      track("rsvp_needs_account", { eventId });
      return;
    }
    // Optimistic update; persistence happens in the store.
    setRsvps((prev) => {
      const turningOff = prev[eventId] === status;
      const next = { ...prev };
      if (turningOff) delete next[eventId];
      else next[eventId] = status;
      saveRsvp(prev, eventId, status, user?.id || null, goingAs[eventId] || "car").catch((e) => {
        // Put the answer back so the screen doesn't claim something unsaved.
        setRsvps(prev);
        showToast(e.message);
      });
      if (!turningOff) track("rsvp", { eventId, status });
      return next;
    });
  }

  function handleGoingAs(eventId, as) {
    const before = goingAs[eventId] || "car";
    if (as === before) return;
    setGoingAs((g) => ({ ...g, [eventId]: as }));
    saveGoingAs(eventId, as, user?.id || null).catch((e) => {
      setGoingAs((g) => ({ ...g, [eventId]: before }));
      showToast(e.message);
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

  // Where an alert points: "linkup:<id>", "meet:<id>" or "person:<id>".
  function openLink(link) {
    const [type, id] = String(link || "").split(":");
    if (!id) return;
    if (type === "linkup" || type === "post" || type === "forum" || type === "club") {
      setSelected(null);
      setPersonView(null);
      setTab("community");
      setCommunityOpen({ type, id });
    } else if (type === "person") {
      setPersonView(id);
    } else if (type === "tab") {
      // "tab:perks" and the like, from pages inside Settings.
      setSelected(null);
      setTab(id);
    } else if (type === "play") {
      // Straight into an Arcade game, in a particular car.
      setSelected(null);
      setPersonView(null);
      setTab("perks");
      setLaunch({ game: id, vehicle: String(link).split(":")[2] || null });
    } else if (type === "meet") {
      const found = events.find((e) => e.id === id);
      if (found) {
        setTab("discover");
        setSelected(found);
      } else if (loading) {
        setPendingLink(link);
      } else {
        showToast("That meet isn't listed any more.");
      }
    }
  }

  // Opened by tapping an alert (?open=…), once there's something to open.
  useEffect(() => {
    if (!pendingLink || loading) return;
    const link = pendingLink;
    setPendingLink(null);
    if (window.location.search.includes("open=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    openLink(link);
  }, [pendingLink, loading]);

  // An alert tapped while the app was already open.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => e.data && e.data.type === "open" && setPendingLink(e.data.link);
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Location's setting on this device, so features that need it show as
  // locked while it's blocked (see Settings → Location).
  const [locStatus] = useLocationStatus();

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
      (err) => {
        setLocating(false);
        showToast(
          err && err.code === 1
            ? "Distances need location, and it's blocked for TUNR. Profile → ⚙️ → Location shows how to turn it on."
            : `Couldn't get your location (${(err && err.message) || "timed out"}).`
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  if (showHostPitch) {
    return (
      <>
        <GlobalStyles />
        <HostPitch
          user={user}
          onStart={(postMeet) => {
            window.history.replaceState({}, document.title, "/");
            setShowHostPitch(false);
            if (postMeet) setShowSubmit(true);
            else setTab("profile");
          }}
        />
      </>
    );
  }

  if (showJoin) {
    return (
      <>
        <GlobalStyles />
        <JoinPage
          user={user}
          onEnter={() => {
            window.history.replaceState({}, document.title, "/");
            setShowJoin(false);
            setTab("discover");
          }}
        />
      </>
    );
  }

  // Someone new who scanned a car's sticker sees the build first; the terms
  // come when they go on into the app.
  const needsWelcome = !user && !welcomed;
  const needsTerms = user ? accountTos === false : welcomed && !guestTos;

  if (needsWelcome && carView) {
    return (
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#F0F0F0", background: "#0A0A0A", minHeight: "100vh" }}>
        <GlobalStyles />
        <BuildPage
          vehicleId={carView}
          user={user}
          onClose={() => setCarView(null)}
          onOpenPerson={(id) => {
            setCarView(null);
            setPersonView(id);
          }}
          onJoin={() => {
            setCarView(null);
            setTab("profile");
          }}
          onToast={showToast}
        />
      </div>
    );
  }

  if (needsWelcome) {
    return (
      <>
        <GlobalStyles />
        <Welcome
          onGuest={() => {
            saveTosAccepted(null, "guest_welcome");
            setWelcomed(true);
            setGuestTos(true);
          }}
        />
      </>
    );
  }

  // A new account (or anyone, when the terms change) reads and agrees.
  if (needsTerms) {
    return (
      <>
        <GlobalStyles />
        <TermsOfService
          onAccept={() => {
            if (user) {
              saveTosAccepted(user.id).catch((e) => showToast(e.message));
              setAccountTos(true);
            } else {
              saveTosAccepted(null, "guest_terms");
              setGuestTos(true);
            }
          }}
          onDecline={
            user
              ? () =>
                  signOut()
                    .then(() => setTab("discover"))
                    .catch((e) => showToast(e.message))
              : null
          }
        />
      </>
    );
  }

  return (
    <AccountContext.Provider value={account}>
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
          // Clear of the iPhone status bar.
          padding: "calc(16px + env(safe-area-inset-top)) 20px 12px",
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
            TUN<span style={{ color: "#0080F0" }}>R</span>
          </div>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginTop: 1 }}>
            ATLANTA, GA
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Checklist user={user} onToast={showToast} />
        <NotificationBell user={user} onOpenLink={openLink} onToast={showToast} onOpenSettings={() => setShowAlerts(true)} />
        <button
          className="action-btn"
          onClick={() => {
            if (needsAccount) {
              setTab("profile");
              showToast("Create a free account to post a meet");
              return;
            }
            setShowSubmit(true);
          }}
          style={{
            background: "#0080F0",
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
      </div>

      {/* Every tab: until the email's confirmed. */}
      <ConfirmEmailBanner account={account} onToast={showToast} />

      {/* Discover */}
      {tab === "discover" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <HomeScreenPrompt />
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
                  background: filter === f ? "#0080F0" : "#161616",
                  color: filter === f ? "#fff" : "#666",
                  border: filter === f ? "1px solid #0080F0" : "1px solid #222",
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
              {view === "list" ? "SORT" : ""}
            </span>
            {view === "list" && SORTS.map((s) => (
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
                  background: sort === s.id ? "rgba(0, 128, 240,0.14)" : "transparent",
                  color: sort === s.id ? "#0080F0" : "#666",
                  border: `1px solid ${sort === s.id ? "#0080F0" : "#242424"}`,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {s.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", border: "1px solid #242424", borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
              {[
                ["list", "☰ LIST"],
                ["calendar", "📅 MONTH"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id);
                    track("discover_view", { view: id });
                  }}
                  aria-pressed={view === id}
                  style={{
                    padding: "5px 10px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    whiteSpace: "nowrap",
                    border: "none",
                    background: view === id ? "rgba(0, 128, 240,0.14)" : "transparent",
                    color: view === id ? "#0080F0" : "#666",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
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
                {locating ? "LOCATING…" : locStatus === "denied" ? "🔒 DISTANCES NEED LOCATION (TAP FOR HELP)" : "📍 SHOW DISTANCES FROM ME"}
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
                background: "linear-gradient(135deg, #000F1F, #001A33)",
                border: "1px solid #0080F0",
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
                  background: "#0080F0",
                  boxShadow: "0 0 8px #0080F0",
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 11, color: "#0080F0", letterSpacing: 2, fontWeight: 700 }}>
                  HAPPENING TODAY
                </div>
                <div style={{ fontSize: 13, color: "#CCC", marginTop: 1 }}>
                  {todayCount} meet{todayCount === 1 ? "" : "s"} today near you
                </div>
              </div>
            </div>
          )}

          {view === "calendar" ? (
            <CalendarView events={matching} rsvps={rsvps} onOpen={setSelected} now={now} />
          ) : (
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
                {needsAccount && (
                  <div
                    style={{
                      background: "#111",
                      border: "1px solid #2A2A2A",
                      borderRadius: 12,
                      padding: "18px 20px",
                      marginTop: 2,
                    }}
                  >
                    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.3 }}>
                      KEEP TRACK OF THESE
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#999",
                        marginTop: 7,
                        marginBottom: 14,
                        lineHeight: 1.6,
                        fontFamily: "'Barlow', sans-serif",
                      }}
                    >
                      Browsing is free and always will be. A free account lets you RSVP, save meets,
                      add your car, and post your own.
                    </div>
                    <AuthForm />
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      )}

      {/* Map */}
      {tab === "map" && (
        <div style={{ animation: "fadeIn 0.3s ease", padding: "0 20px" }}>
          <div style={{ marginBottom: 10 }}>
            <TimeFilter
              value={mapWhen}
              onChange={(v) => {
                setMapWhen(v);
                if (v.preset !== mapWhen.preset) track("map_time_filter", { preset: v.preset });
              }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#AAA", marginBottom: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showSpots}
              onChange={(e) => {
                setShowSpots(e.target.checked);
                if (e.target.checked && !spots.length) {
                  loadPhotoSpots()
                    .then(setSpots)
                    .catch((err) => showToast(err.message));
                }
              }}
              style={{ accentColor: "#38BDF8" }}
            />
            📸 Show photo spots from the forums
          </label>
          <MapView
            events={mapEvents}
            onSelect={setSelected}
            spots={showSpots ? spots : []}
            onSelectSpot={(spot) => openLink(`post:${spot.id}`)}
          />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>
              {mapWindow
                ? `${mapEvents.length} ${mapEvents.length === 1 ? "MEET" : "MEETS"} · ${windowLabel(mapWindow).toUpperCase()}`
                : "TAP A PIN OR BROWSE"}
            </div>
            {mapWindow && mapEvents.length === 0 && (
              <div style={{ fontSize: 13, color: "#666", fontFamily: "'Barlow', sans-serif" }}>
                Nothing on then. Try a wider time, or clear the vibe filter on Discover.
              </div>
            )}
            {mapEvents.map((event) => (
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
                  {event.windowStart ? whenLabel(event.windowStart) : `${displayDate(event)} · ${displayTime(event)}`} ·{" "}
                  {event.city}
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
          {needsAccount ? (
            <div
              style={{
                background: "#111",
                border: "1px solid #0080F0",
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

      {/* Linkups */}
      {tab === "community" && (
        <CommunityTab
          user={user}
          events={events}
          position={position}
          open={communityOpen}
          onOpened={() => setCommunityOpen(null)}
          onOpenMeet={(e) => setSelected(e)}
          onNeedAccount={() => {
            setTab("profile");
            showToast("Create a free account first");
          }}
          onToast={showToast}
          onOpenPerson={setPersonView}
          onShowTerms={() => setShowTerms(true)}
          onOpenAlerts={() => setShowAlerts(true)}
        />
      )}

      {showAlerts && user && <AlertSettings user={user} onClose={() => setShowAlerts(false)} onToast={showToast} />}
      {settingPassword && user && <SetPasswordSheet onClose={() => setSettingPassword(false)} onToast={showToast} />}
      {carView && (
        <BuildPage
          vehicleId={carView}
          user={user}
          onClose={() => setCarView(null)}
          onOpenPerson={(id) => {
            setCarView(null);
            setPersonView(id);
          }}
          onJoin={() => {
            setCarView(null);
            setTab("profile");
            showToast("Create your free account. The car's owner gets credit for bringing you!");
          }}
          onToast={showToast}
        />
      )}
      {inviting && user && (
        <InviteSheet
          reason={inviting.reason}
          onClose={() => setInviting(null)}
          onToast={showToast}
          onOpenPerson={(id) => {
            setInviting(null);
            setPersonView(id);
          }}
        />
      )}

      {/* Perks */}
      {tab === "perks" && (
        <PerksTab
          user={user}
          launch={launch}
          onLaunched={() => setLaunch(null)}
          onNeedAccount={() => {
            setTab("profile");
            showToast("Create a free account first");
          }}
          onToast={showToast}
        />
      )}

      {/* Profile */}
      {tab === "profile" && (
        <ProfileTab
          events={events}
          rsvps={rsvps}
          user={user}
          onShowTerms={() => setShowTerms(true)}
          onShowPrivacy={() => setShowPrivacy(true)}
          onOpenAlerts={() => setShowAlerts(true)}
          onOpenLink={openLink}
          onOpenMeet={(e) => setSelected(e)}
          onToast={showToast}
          onCohostChange={refreshEvents}
          onOpenPerson={setPersonView}
          onFollowingChange={refreshFollowingPeople}
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
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 100,
        }}
      >
        {[
          { id: "discover", icon: "≡", label: "DISCOVER" },
          { id: "map", icon: "◎", label: "MAP" },
          { id: "community", icon: "👥", label: "COMMUNITY" },
          { id: "saved", icon: "★", label: "MY MEETS" },
          { id: "perks", icon: "🎟", label: "PERKS" },
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
                color: tab === t.id ? "#0080F0" : "#8C96A5",
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
                    background: "#0080F0",
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
                fontSize: 10,
                letterSpacing: 1.3,
                fontWeight: 800,
                color: tab === t.id ? "#0080F0" : "#8C96A5",
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
                  background: "#0080F0",
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
          goingAs={goingAs[selected.id] || "car"}
          onGoingAs={(as) => handleGoingAs(selected.id, as)}
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
          onOpenPerson={setPersonView}
          onJoined={refreshEvents}
        />
      )}

      {personView && (
        <PersonProfile
          personId={personView}
          user={user}
          onClose={() => setPersonView(null)}
          onToast={showToast}
          onNeedAccount={() => {
            setPersonView(null);
            setSelected(null);
            setTab("profile");
            showToast("Create a free account first");
          }}
          onOpenHost={(h) => {
            setPersonView(null);
            setSelected(null);
            setHostView(h);
          }}
          onChanged={refreshFollowingPeople}
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
          onToast={showToast}
          onCohostChange={refreshEvents}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshEvents();
            showToast("Saved");
          }}
        />
      )}

      {showTerms && <TermsOfService readOnly onClose={() => setShowTerms(false)} />}

      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#131315",
            border: "1px solid #0080F0",
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
    </AccountContext.Provider>
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
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .meet-card { transition: transform 0.18s ease, box-shadow 0.18s ease; cursor: pointer; }
      .meet-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0, 128, 240,0.18); }
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

// "Fri, Oct 16 · 7:00 PM" for an occurrence on the map list.
function whenLabel(date) {
  const day = date.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

// The window the map is showing, e.g. "Fri, Oct 16, 5:00 PM – 7:00 PM".
function windowLabel({ from, to }) {
  const opts = { timeZone: "America/New_York" };
  const day = (d) => d.toLocaleDateString("en-US", { ...opts, weekday: "short", month: "short", day: "numeric" });
  const time = (d) => d.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  if (from.getTime() === to.getTime()) return `on now · ${time(from)}`;
  return day(from) === day(to) ? `${day(from)}, ${time(from)} – ${time(to)}` : `${day(from)} ${time(from)} – ${day(to)} ${time(to)}`;
}
