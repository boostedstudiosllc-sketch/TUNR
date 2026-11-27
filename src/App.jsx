import { useEffect, useMemo, useRef, useState } from "react";
import { toastMs, uncaughtText, errorText } from "./lib/toast.js";
import LoadError from "./components/LoadError.jsx";
import { startErrorLog } from "./lib/appErrors.js";

// Technical reasons go to the admins' app error log; members see plain words.
startErrorLog();
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
import ThemeToggle from "./components/ThemeToggle.jsx";
import ComebackSheet from "./components/ComebackSheet.jsx";
import HelpChat from "./components/HelpChat.jsx";
import { markSeen } from "./lib/comeback.js";
import RatePrompt from "./components/RatePrompt.jsx";
import Checklist from "./components/Checklist.jsx";
import ParkedCar from "./components/ParkedCar.jsx";
import PeopleStrip from "./components/PeopleStrip.jsx";
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
import PhotoOfWeek from "./components/PhotoOfWeek.jsx";
import { JOIN_KEY } from "./lib/gameRooms.js";
import { saveSnapshot, loadSnapshot, offlineLine } from "./lib/offline.js";
import Convoy from "./components/Convoy.jsx";
import PhotoSpots from "./components/PhotoSpots.jsx";
import Membership from "./components/Membership.jsx";
import Shop from "./components/Shop.jsx";
import BoostSheet from "./components/Boost.jsx";
import HomeSlides from "./components/HomeSlides.jsx";
import { loadPromoted } from "./lib/promotions.js";
import { withPromoted, pinPromoted } from "./lib/promoRules.js";
import SetupTour from "./components/SetupTour.jsx";
import PitStopPopup from "./components/PitStop.jsx";
import { SETUP_KEY, OPEN_EVENT as SETUP_OPEN, shouldAutoShow } from "./lib/setupSteps.js";
import { loadPitStop, OPEN_EVENT as PIT_OPEN, SHOWN_KEY as PIT_SHOWN, atlToday } from "./lib/pitStop.js";
import { OPEN_EVENT as SPOTS_OPEN } from "./lib/photoSpots.js";
import { joinConvoy, CONVOY_KEY, OPEN_EVENT as CONVOY_OPEN } from "./lib/convoy.js";
import { errorReason } from "./lib/errors.js";

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
  // Why meets (or your RSVPs) didn't load, shown above the list; TRY AGAIN
  // bumps meetsTry to load again.
  const [meetsError, setMeetsError] = useState("");
  const [meetsTry, setMeetsTry] = useState(0);
  const [tab, setTab] = useState("discover");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toasts, setToasts] = useState([]);
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
  // The convoy you're in (Convoy.jsx). It stays mounted while minimised so
  // your location keeps sharing as you use the rest of the app.
  const [convoyId, setConvoyId] = useState(() => {
    try {
      return localStorage.getItem(CONVOY_KEY) || null;
    } catch (e) {
      console.warn(`Couldn't read the convoy on this phone. (${e.message})`);
      return null;
    }
  });
  const [convoyOpen, setConvoyOpen] = useState(false);
  // First-run setup screens (SetupTour.jsx): by themselves once for a new
  // account on this phone; every screen from Settings → Setup & permissions.
  const [setupTour, setSetupTour] = useState(null); // null | "auto" | "all"
  useEffect(() => {
    const open = () => setSetupTour("all");
    window.addEventListener(SETUP_OPEN, open);
    return () => window.removeEventListener(SETUP_OPEN, open);
  }, []);
  useEffect(() => {
    if (!user || accountTos !== true) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SETUP_KEY) === "1";
    } catch (e) {
      console.warn(`Couldn't read the setup state on this phone. (${e.message})`);
    }
    if (shouldAutoShow({ seen, createdAt: user.created_at })) setSetupTour("auto");
  }, [user?.id, accountTos]);
  // The Daily Pit Stop pops up once a day, when there's a point to claim.
  const [pitStop, setPitStop] = useState(null); // its status, while showing
  const showPitStop = (force) =>
    loadPitStop()
      .then((s) => {
        if (s?.on && (force || !s.today_done)) setPitStop(s);
      })
      .catch((e) => (force ? showToast(e.message) : console.warn(e.message)));
  useEffect(() => {
    const open = () => showPitStop(true);
    window.addEventListener(PIT_OPEN, open);
    return () => window.removeEventListener(PIT_OPEN, open);
  }, []);
  useEffect(() => {
    if (!user || accountTos !== true || setupTour) return;
    try {
      if (localStorage.getItem(PIT_SHOWN) === atlToday()) return;
      localStorage.setItem(PIT_SHOWN, atlToday());
    } catch (e) {
      console.warn(`Couldn't remember today's Pit Stop on this phone. (${e.message})`);
      return;
    }
    showPitStop(false);
  }, [user?.id, accountTos, setupTour]); // eslint-disable-line react-hooks/exhaustive-deps

  // Photo spots: the discover screen (PhotoSpots.jsx), opened from anywhere.
  const [spotsOpen, setSpotsOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const open = () => setSpotsOpen(true);
    window.addEventListener(SPOTS_OPEN, open);
    return () => window.removeEventListener(SPOTS_OPEN, open);
  }, []);
  useEffect(() => {
    const open = (e) => {
      const id = e.detail?.id;
      if (!id) return;
      try {
        localStorage.setItem(CONVOY_KEY, id);
      } catch (err) {
        console.warn(`Couldn't remember the convoy on this phone. (${err.message})`);
      }
      setConvoyId(id);
      setConvoyOpen(true);
    };
    window.addEventListener(CONVOY_OPEN, open);
    return () => window.removeEventListener(CONVOY_OPEN, open);
  }, []);
  // A convoy code from a link (?convoy=CODE) or an invite alert ("convoy:CODE").
  const [convoyCode, setConvoyCode] = useState(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("convoy")) || null);
  useEffect(() => {
    if (!convoyCode || !user) return;
    const code = convoyCode;
    setConvoyCode(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has("convoy")) {
      params.delete("convoy");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    joinConvoy(code)
      .then(({ id }) => window.dispatchEvent(new CustomEvent(CONVOY_OPEN, { detail: { id } })))
      .catch((e) => showToast(e.message));
  }, [convoyCode, user]);

  // A friend's game room link (?play=<game>&room=CODE, or the older
  // ?drag=CODE): into the Arcade, that game, that room.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const game = params.get("play") || (params.get("drag") ? "drag" : null);
    const code = params.get("room") || params.get("drag");
    if (!game || !code) return;
    try {
      sessionStorage.setItem(JOIN_KEY, `${game}:${code}`);
    } catch (e) {
      showToast(`Couldn't open that game room. (${errorReason(e)})`);
      return;
    }
    for (const k of ["play", "room", "drag"]) params.delete(k);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    setTab("perks");
    setLaunch({ game, vehicle: null });
  }, []);

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

  // Offline: the banner, and the meets saved from the last good load
  // (src/lib/offline.js). Games and the parked-car card need no network.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  // A welcome-back points offer (136), shown when the app opens.
  const [comeback, setComeback] = useState(null);
  const seenPing = useRef(0);
  useEffect(() => {
    if (!user?.id || !online) return;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - seenPing.current < 10 * 60e3) return;
      seenPing.current = Date.now();
      markSeen()
        .then((offer) => offer && setComeback(offer))
        .catch((e) => showToast(errorText("Couldn't check for your welcome-back bonus.", e), true));
    };
    ping();
    document.addEventListener("visibilitychange", ping);
    return () => document.removeEventListener("visibilitychange", ping);
  }, [user?.id, online]);
  const [savedMeetsAt, setSavedMeetsAt] = useState(null); // when showing saved meets
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
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
    // null: couldn't reach TUNR to check (offline). Don't block the app with
    // the terms for that; this runs again when the phone is back online.
    syncTosToAccount(user).then((ok) => alive && setAccountTos(ok === null ? (here ? true : null) : ok || here));
    return () => {
      alive = false;
    };
  }, [user?.id, online]);

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
      .catch((e) => showToast(errorText("Couldn't load your account.", e), true));
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

  // Promoted meets (120): marked and pinned at the top of the list.
  const [promoted, setPromoted] = useState([]);
  useEffect(() => {
    if (!online) return;
    loadPromoted()
      .then(setPromoted)
      .catch((e) => showToast(errorText("Couldn't load promoted meets.", e), true));
  }, [online, user?.id]);
  // Back from buying merch (?shop=thanks).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("shop")) return;
    params.delete("shop");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    showToast("🛍️ Thanks for your order! We'll let you know when it ships.");
  }, []);
  // Back from joining TUNR+ (?member=welcome).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("member")) return;
    params.delete("member");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    showToast("💎 Welcome to TUNR+! Your perks switch on as soon as the payment's through.");
    setMemberOpen(true);
  }, []);
  // Back from paying to promote a meet (?promoted=<id>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("promoted")) return;
    params.delete("promoted");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    showToast("🚀 Payment received. Your meet is promoted (it can take a few seconds to show).");
    setTimeout(() => loadPromoted().then(setPromoted).catch((e) => showToast(errorText("Couldn't load promoted meets.", e), true)), 4000);
  }, []);

  // Load events + rsvps whenever the signed-in user changes (or the phone
  // comes back online). A failed part never empties the list: with no
  // network, the last saved meets show instead, marked as saved.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const uid = user?.id || null;
    const failed = Symbol("failed");
    // A phone that knows it's offline goes straight to the saved meets
    // (the network library would otherwise keep retrying for a while).
    if (!online) {
      const saved = loadSnapshot(window.localStorage, uid);
      if (saved) {
        setEvents(saved.events);
        setRsvps(saved.rsvps || {});
        setFollows(saved.follows || []);
        setGoingAs(saved.goingAs || {});
        setSavedMeetsAt(saved.at);
      }
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    // A bad connection gets 10 seconds before the saved meets show.
    // The first thing that failed is shown, with why (saved meets or not).
    let why = null;
    const soft = (p) =>
      Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), 10000))]).catch((e) => ((why = why || e), failed));
    Promise.all([soft(loadEvents(uid)), soft(loadRsvps(uid)), soft(loadFollows(uid)), soft(loadGoingAs(uid))])
      .then(([evts, r, f, g]) => {
        if (cancelled) return;
        // The meets themselves first; then your RSVPs, follows and how you're going.
        const problem =
          evts !== failed && evts.offline && evts.reason && navigator.onLine !== false
            ? evts.reason
            : why
              ? errorText(evts === failed ? "Couldn't load meets." : "Couldn't load your RSVPs and follows.", why)
              : "";
        setMeetsError(problem);
        const fresh = evts !== failed && !evts.offline;
        const saved = fresh ? null : loadSnapshot(window.localStorage, uid);
        if (saved) {
          setEvents(saved.events);
          setRsvps(r !== failed && Object.keys(r).length ? r : saved.rsvps || {});
          setFollows(f !== failed && f.length ? f : saved.follows || []);
          setGoingAs(g !== failed && Object.keys(g).length ? g : saved.goingAs || {});
          setSavedMeetsAt(saved.at);
          return;
        }
        setSavedMeetsAt(null);
        setEvents(evts === failed ? [] : evts);
        if (r !== failed) setRsvps(r);
        if (f !== failed) setFollows(f);
        if (g !== failed) setGoingAs(g);
        if (fresh && r !== failed && f !== failed && g !== failed) {
          saveSnapshot(window.localStorage, uid, { events: evts, rsvps: r, follows: f, goingAs: g });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, online, meetsTry]);

  // Meets matching the chosen filter and search, past ones included (the
  // calendar shows earlier days of the month); the list drops those.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withDistances(withPromoted(events, promoted), position)
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
  }, [events, promoted, filter, search, follows, followingPeople, position]);

  const visible = useMemo(() => {
    const sorted = matching
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
    // Promoted meets first (labelled), then the chosen order.
    return pinPromoted(sorted);
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
    } catch (e) {
      setFollows((f) => (isFollowing ? [...f, host] : f.filter((h) => h !== host)));
      showToast(errorText(isFollowing ? `Couldn't unfollow @${host}.` : `Couldn't follow @${host}.`, e), true);
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
    if (type === "linkup" || type === "shout" || type === "post" || type === "forum" || type === "club" || type === "listing" || type === "listing-chat" || type === "listing-fit") {
      setSelected(null);
      setPersonView(null);
      setTab("community");
      setCommunityOpen({ type, id });
    } else if (type === "person") {
      setPersonView(id);
    } else if (type === "open") {
      // Screens that aren't tabs (from the Discover banner and alerts).
      if (id === "photo-spots") setSpotsOpen(true);
      else if (id === "pitstop") showPitStop(true);
      else if (id === "setup") setSetupTour("all");
      else if (id === "membership") (setPitStop(null), setMemberOpen(true));
      else if (id === "shop") setShopOpen(true);
      else if (id === "boost") (setPitStop(null), setBoostOpen(true));
      else if (id === "help") setHelpOpen(true);
      else if (id === "comeback")
        markSeen()
          .then((offer) => (offer ? setComeback(offer) : showToast("That bonus was already claimed or has ended.")))
          .catch((e) => showToast(errorText("Couldn't open your welcome-back bonus.", e), true));
    } else if (type === "convoy") {
      setConvoyCode(id);
    } else if (type === "tab") {
      // "tab:perks" and the like, from pages inside Settings.
      setSelected(null);
      setTab(id);
    } else if (type === "room") {
      // A friend's invite to an Arcade game room ("room:<game>:<code>").
      const code = String(link).split(":")[2] || "";
      try {
        sessionStorage.setItem(JOIN_KEY, `${id}:${code}`);
      } catch (e) {
        showToast(`Couldn't open that game room. (${errorReason(e)})`);
        return;
      }
      setSelected(null);
      setPersonView(null);
      setTab("perks");
      setLaunch({ game: id, vehicle: null });
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

  // Messages stack (up to 3, newest at the bottom), so a small failure never
  // hides a bigger one. Each has its own time; errors stay up longer (they
  // carry a reason to read). The same message isn't shown twice at once.
  const toastId = useRef(0);
  function showToast(msg, error = /^(Couldn't|Can't|Something didn't)|\(.+\)$/.test(String(msg || ""))) {
    if (!msg) return;
    const text = String(msg);
    const id = ++toastId.current;
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, text, error }].slice(-3));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), toastMs(text, error));
  }

  // Messages from anywhere (src/lib/toast.js), and failures nobody caught:
  // the member sees what went wrong instead of nothing happening.
  useEffect(() => {
    let last = "";
    let lastAt = 0;
    const show = (text, error) => {
      if (!text || (text === last && Date.now() - lastAt < 5000)) return;
      last = text;
      lastAt = Date.now();
      showToast(text, error);
    };
    const onToast = (e) => show(e.detail?.message, Boolean(e.detail?.error));
    const onRejection = (e) => show(uncaughtText(e.reason), true);
    const onError = (e) => show(uncaughtText(e.error || e.message), true);
    window.addEventListener("tunr:toast", onToast);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("tunr:toast", onToast);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  // The message pop-up, on every screen (the welcome, terms and landing pages too).
  const toastView = toasts.length > 0 && (
    <div style={{ position: "fixed", bottom: 92, left: "50%", transform: "translateX(-50%)", width: "min(380px, calc(100vw - 32px))", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 520, pointerEvents: "none" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.error ? "alert" : "status"}
          onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
          style={{
            pointerEvents: "auto",
            maxWidth: "100%",
            boxSizing: "border-box",
            background: "var(--n-131315)",
            border: `1px solid ${t.error ? "#EF4444" : "#0080F0"}`,
            color: "var(--n-f0f0f0)",
            padding: "11px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            textAlign: "center",
            animation: "toastUp 0.25s ease",
            fontFamily: "'Barlow', sans-serif",
            cursor: "pointer",
          }}
        >
          {t.error ? "⚠️ " : ""}
          {t.text}
        </div>
      ))}
    </div>
  );

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
        {toastView}
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
        {toastView}
      </>
    );
  }

  // Someone new who scanned a car's sticker sees the build first; the terms
  // come when they go on into the app.
  const needsWelcome = !user && !welcomed;
  const needsTerms = user ? accountTos === false : welcomed && !guestTos;

  if (needsWelcome && carView) {
    return (
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "var(--n-f0f0f0)", background: "var(--n-0a0a0a)", minHeight: "100vh" }}>
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
        {toastView}
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
        {toastView}
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
        {toastView}
      </>
    );
  }

  return (
    <AccountContext.Provider value={account}>
    <div
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        background: "var(--n-0a0a0a)",
        color: "var(--n-f0f0f0)",
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
          background: "linear-gradient(180deg, var(--n-0a0a0a) 85%, transparent)",
          zIndex: 50,
        }}
      >
        <div>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>
            TUN<span style={{ color: "#0080F0" }}>R</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--n-555555)", letterSpacing: 2, marginTop: 1 }}>
            ATLANTA, GA
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ThemeToggle />
        <ParkedCar onToast={showToast} />
        <Checklist user={user} onToast={showToast} />
        <RatePrompt user={user} onToast={showToast} />
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
            padding: "9px 12px",
            borderRadius: 5,
            fontFamily: "'Barlow Condensed', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          + POST<span className="hide-narrow"> MEET</span>
        </button>
        </div>
      </div>

      {/* Every tab: no signal, or meets from the last good load. */}
      {offlineLine({ online, savedAt: savedMeetsAt }) && (
        <div role="status" style={{ margin: "0 20px 10px", padding: "9px 12px", borderRadius: 10, background: "var(--n-161616)", border: "1px solid var(--n-2a2a2a)", color: "var(--n-cccccc)", fontSize: 13, fontFamily: "'Barlow', sans-serif", display: "flex", gap: 8, alignItems: "center" }}>
          <span aria-hidden="true">📴</span>
          <span style={{ flex: 1 }}>{offlineLine({ online, savedAt: savedMeetsAt })}</span>
          {!online && (
            <button onClick={() => setTab("perks")} style={{ background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
              Play ›
            </button>
          )}
        </div>
      )}

      {/* Every tab: until the email's confirmed. */}
      <ConfirmEmailBanner account={account} onToast={showToast} />

      {/* Discover */}
      {tab === "discover" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <HomeScreenPrompt />
          {!search && <HomeSlides user={user} events={withPromoted(events, promoted)} rsvps={rsvps} />}
          <TodayStrip events={todayMine} rsvps={rsvps} now={now} onOpen={setSelected} />

          <div style={{ padding: "0 20px 12px", position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 33,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--n-555555)",
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
              placeholder="Search meets, hosts, people, places…"
              style={{
                width: "100%",
                background: "var(--n-161616)",
                border: "1px solid var(--n-2a2a2a)",
                borderRadius: 20,
                padding: "10px 38px",
                color: "var(--n-f0f0f0)",
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
                  color: "var(--n-666666)",
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            )}
          </div>
          {search && <PeopleStrip user={user} query={search} onFollowed={refreshFollowingPeople} onToast={showToast} />}
          {!search && (
            <PhotoOfWeek
              user={user}
              onToast={showToast}
              onNeedAccount={() => {
                setTab("profile");
                showToast("Create a free account first");
              }}
            />
          )}
          {!search && (
            <button
              onClick={() => setSpotsOpen(true)}
              style={{ width: "calc(100% - 40px)", display: "flex", alignItems: "center", gap: 12, margin: "10px 20px 0", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--n-1f2a3a)", background: "linear-gradient(135deg, var(--n-0b1e3f), var(--n-111111))", color: "var(--n-f0f0f0)", textAlign: "left", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span aria-hidden="true" style={{ fontSize: 28 }}>📸</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>PHOTO SPOTS</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--n-9aa4b2)", fontFamily: "'Barlow', sans-serif" }}>Where to shoot your car: bridges, rooftops, murals, night lights</span>
              </span>
              <span aria-hidden="true" style={{ fontSize: 20, color: "var(--n-9aa4b2)" }}>›</span>
            </button>
          )}
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
                  background: filter === f ? "#0080F0" : "var(--n-161616)",
                  color: filter === f ? "#fff" : "#666",
                  border: filter === f ? "1px solid #0080F0" : "1px solid var(--n-222222)",
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
              rowGap: 8,
              flexWrap: "wrap", // the LIST / MONTH toggle drops a line on small phones
              padding: "0 20px 14px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--n-555555)",
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
                  color: sort === s.id ? "#0080F0" : "var(--n-666666)",
                  border: `1px solid ${sort === s.id ? "#0080F0" : "var(--n-242424)"}`,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {s.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--n-242424)", borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
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
                    color: view === id ? "#0080F0" : "var(--n-666666)",
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
                  background: "var(--n-111111)",
                  border: "1px dashed var(--n-2a2a2a)",
                  borderRadius: 10,
                  color: "var(--n-777777)",
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
                background: "linear-gradient(135deg, var(--n-000f1f), var(--n-001a33))",
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
                <div style={{ fontSize: 13, color: "var(--n-cccccc)", marginTop: 1 }}>
                  {todayCount} meet{todayCount === 1 ? "" : "s"} today near you
                </div>
              </div>
            </div>
          )}

          {view === "calendar" ? (
            <CalendarView events={matching} rsvps={rsvps} onOpen={setSelected} now={now} />
          ) : (
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {!loading && <LoadError message={meetsError} onRetry={() => (setMeetsError(""), setMeetsTry((n) => n + 1))} style={{ margin: 0 }} />}
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
                      background: "var(--n-111111)",
                      border: "1px solid var(--n-2a2a2a)",
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
                        color: "var(--n-999999)",
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--n-aaaaaa)", marginBottom: 8, cursor: "pointer" }}>
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
            📸 Show photo spots
            <button onClick={(e) => (e.preventDefault(), setSpotsOpen(true))} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
              Browse all ›
            </button>
          </label>
          <MapView
            events={mapEvents}
            onSelect={setSelected}
            spots={showSpots ? spots : []}
            onSelectSpot={(spot) => openLink(`post:${spot.id}`)}
          />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: "var(--n-555555)", letterSpacing: 2, fontWeight: 700 }}>
              {mapWindow
                ? `${mapEvents.length} ${mapEvents.length === 1 ? "MEET" : "MEETS"} · ${windowLabel(mapWindow).toUpperCase()}`
                : "TAP A PIN OR BROWSE"}
            </div>
            {mapWindow && mapEvents.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--n-666666)", fontFamily: "'Barlow', sans-serif" }}>
                Nothing on then. Try a wider time, or clear the vibe filter on Discover.
              </div>
            )}
            {mapEvents.map((event) => (
              <div
                key={event.id}
                className="meet-card"
                onClick={() => setSelected(event)}
                style={{
                  background: "var(--n-111111)",
                  borderRadius: 8,
                  border: "1px solid var(--n-1e1e1e)",
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
                <div style={{ fontSize: 11, color: "var(--n-777777)", marginTop: 3 }}>
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
          <div style={{ fontSize: 13, color: "var(--n-555555)", marginBottom: 20 }}>
            Meets you're going to or interested in
          </div>
          {needsAccount ? (
            <div
              style={{
                background: "var(--n-111111)",
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
                  color: "var(--n-999999)",
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
          background: "rgba(var(--base),0.96)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid var(--n-1a1a1a)",
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
                color: tab === t.id ? "#0080F0" : "var(--n-8c96a5)",
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
                color: tab === t.id ? "#0080F0" : "var(--n-8c96a5)",
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

      {setupTour && user && <SetupTour all={setupTour === "all"} onDone={() => (setSetupTour(null), setPitStop(null))} onToast={showToast} />}
      {pitStop && !setupTour && <PitStopPopup status={pitStop} onClose={() => setPitStop(null)} onToast={showToast} />}
      {helpOpen && <HelpChat onClose={() => setHelpOpen(false)} />}
      {comeback && <ComebackSheet offer={comeback} onClose={() => setComeback(null)} onToast={showToast} />}
      {boostOpen && (
        <BoostSheet
          user={user}
          onClose={() => setBoostOpen(false)}
          onToast={showToast}
          onNeedAccount={() => {
            setBoostOpen(false);
            setTab("profile");
            showToast("Create a free account first");
          }}
          onShowToday={() => {
            setBoostOpen(false);
            setSelected(null);
            setTab("discover");
            setFilter("Today");
          }}
        />
      )}
      {shopOpen && (
        <Shop
          user={user}
          onClose={() => setShopOpen(false)}
          onNeedAccount={() => {
            setShopOpen(false);
            setTab("profile");
            showToast("Create a free account first");
          }}
        />
      )}
      {memberOpen && (
        <Membership
          user={user}
          onClose={() => setMemberOpen(false)}
          onNeedAccount={() => {
            setMemberOpen(false);
            setTab("profile");
            showToast("Create a free account first");
          }}
        />
      )}
      {spotsOpen && (
        <PhotoSpots
          user={user}
          onClose={() => setSpotsOpen(false)}
          onToast={showToast}
          onShowTerms={() => setShowTerms(true)}
          onNeedAccount={() => {
            setSpotsOpen(false);
            setTab("profile");
            showToast("Create a free account first");
          }}
        />
      )}
      {convoyId && user && (
        <Convoy
          key={convoyId}
          id={convoyId}
          user={user}
          hidden={!convoyOpen}
          onMinimize={() => setConvoyOpen(false)}
          onClosed={() => {
            setConvoyOpen(false);
            setConvoyId(null);
          }}
          onToast={showToast}
        />
      )}
      {convoyId && user && !convoyOpen && (
        <button
          onClick={() => setConvoyOpen(true)}
          aria-label="Open your convoy"
          style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(74px + env(safe-area-inset-bottom))", zIndex: 150, padding: "9px 16px", borderRadius: 999, border: "1px solid #10B981", background: "var(--n-0b1a13)", color: "#34D399", fontSize: 14, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
        >
          🚗 CONVOY · OPEN MAP
        </button>
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

      {toastView}
    </div>
    </AccountContext.Provider>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div
      style={{
        background: "var(--n-111111)",
        border: "1px solid var(--n-1e1e1e)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--n-555555)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--n-444444)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      ::-webkit-scrollbar { width: 0; height: 0; }
      @media (max-width: 379px) { .hide-narrow { display: none; } }
      /* Games: holding a button steers, it never selects text or opens the copy menu. */
      .tunr-game, .tunr-game * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
      .tunr-game input, .tunr-game textarea { -webkit-user-select: text; user-select: text; }
      @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes toastUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
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
