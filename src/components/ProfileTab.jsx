import { useEffect, useRef, useState } from "react";
import { loadProfile, hasBackend, getPerson, loadMyCohostInvites } from "../lib/store.js";
import { useAccount } from "../lib/account.js";
import { loadPosts, loadPersonClubs, kindLabel } from "../lib/community.js";
import { displayDate, displayTime, isPast, sortKey } from "../lib/dates.js";
import { photoPageLink } from "../lib/photographer.js";
import AuthForm from "./AuthForm.jsx";
import Garage from "./Garage.jsx";
import { Badges } from "./Badge.jsx";
import Connections from "./Connections.jsx";
import EditProfile, { Avatar } from "./EditProfile.jsx";
import { openInvites } from "../lib/invites.js";
import SettingsScreen from "./SettingsScreen.jsx";
import { PostCard, Segments, Logo } from "./CommunityBits.jsx";

const legalButton = {
  flex: 1,
  padding: "12px 0",
  background: "#111",
  border: "1px solid #2A2A2A",
  borderRadius: 10,
  color: "#666",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const TABS = [
  { id: "garage", icon: "🚗", label: "GARAGE" },
  { id: "meets", icon: "📅", label: "MEETS" },
  { id: "posts", icon: "💬", label: "POSTS" },
  { id: "clubs", icon: "🏁", label: "CLUBS" },
];
const TAB_KEY = "tunr.profile.tab";

// Height of the app's sticky header, so the tab bar sticks just under it.
const HEADER_HEIGHT = 80;

function readTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some((t) => t.id === saved) ? saved : "garage";
  } catch (e) {
    // Storage can be off (private mode); the first tab is fine then.
    console.warn(e.message);
    return "garage";
  }
}

export default function ProfileTab(props) {
  if (!props.user) return <SignedOut onShowTerms={props.onShowTerms} onShowPrivacy={props.onShowPrivacy} />;
  // Keyed so a different account starts from a clean slate.
  return <SignedIn key={props.user.id} {...props} />;
}

function SignedOut({ onShowTerms, onShowPrivacy }) {
  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "16px 20px" }}>
      {hasBackend() ? (
        <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Create your account</div>
          <div style={{ fontSize: 12.5, color: "#777", marginTop: 5, lineHeight: 1.6, fontFamily: "'Barlow', sans-serif" }}>
            Your RSVPs count toward the public numbers, your posted meets go live for everyone,
            and your profile follows you across devices.
          </div>
          <div style={{ marginTop: 12 }}>
            <AuthForm />
          </div>
        </div>
      ) : (
        <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 10, padding: "16px 18px", marginBottom: 12, fontSize: 12.5, color: "#777", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif" }}>
          Accounts aren't set up in this build (no Supabase keys), so there's no profile to show.
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="action-btn" onClick={onShowTerms} style={legalButton}>
          📄 TERMS
        </button>
        <button className="action-btn" onClick={onShowPrivacy} style={legalButton}>
          🔒 PRIVACY
        </button>
      </div>
    </div>
  );
}

function SignedIn({
  events,
  rsvps,
  user,
  onOpenAlerts,
  onOpenLink,
  onOpenMeet,
  onShowTerms,
  onShowPrivacy,
  onToast,
  onCohostChange,
  onOpenPerson,
  onFollowingChange,
}) {
  const account = useAccount();
  // The same rule Settings uses for its Email row.
  const unconfirmed = Boolean(account && account.confirmed === false);

  const [profile, setProfile] = useState(null); // null = loading
  // Follower / following counts and badges, and which list is open (null = none).
  const [social, setSocial] = useState(null);
  const [connections, setConnections] = useState(null);
  const [clubs, setClubs] = useState(null);
  const [clubsError, setClubsError] = useState("");
  const [cohostInvites, setCohostInvites] = useState(0);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(null); // null = closed, else { page }
  const [tab, setTab] = useState(readTab);
  const [meetFilter, setMeetFilter] = useState("going");
  const tabsTop = useRef(null);

  const refreshSocial = () => getPerson(user.id).then(setSocial);

  useEffect(() => {
    let alive = true;
    refreshSocial();
    loadProfile(user.id)
      .then((p) => alive && setProfile(p))
      .catch((e) => {
        if (!alive) return;
        setProfile({ username: "", city: "Atlanta, GA" });
        onToast(e.message);
      });
    loadPersonClubs(user.id)
      .then((c) => alive && setClubs(c))
      .catch((e) => {
        if (!alive) return;
        setClubs([]);
        setClubsError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Co-host invites live in Settings now; a pointer here makes sure nobody
  // misses one. Re-checked whenever Settings closes.
  useEffect(() => {
    if (settings) return;
    let alive = true;
    loadMyCohostInvites(user.id)
      .then((rows) => alive && setCohostInvites(rows.length))
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [settings]);

  function chooseTab(id, scroll = false) {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch (e) {
      console.warn(e.message);
    }
    if (scroll && tabsTop.current) {
      const y = tabsTop.current.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  }

  const p = profile || { username: "", city: "" };
  // Meets still to come, not ones already over.
  const goingCount = events.filter((e) => rsvps[e.id] === "going" && !isPast(e, new Date())).length;
  const page = p.isPhotographer ? photoPageLink(p.photoPage) : null;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ padding: "2px 16px 16px" }}>
        {/* @handle and the way into Settings */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: 0.3,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.username ? `@${p.username}` : profile ? "Your profile" : ""}
          </div>
          <button
            className="action-btn"
            onClick={() => setSettings({ page: null })}
            aria-label={unconfirmed ? "Settings (your email isn't confirmed)" : "Settings"}
            title="Settings"
            style={{
              position: "relative",
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: "50%",
              background: "#141414",
              border: "1px solid #2A2A2A",
              color: "#F0F0F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GearIcon />
            {unconfirmed && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 1,
                  right: 1,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#EF4444",
                  border: "2px solid #0A0A0A",
                }}
              />
            )}
          </button>
        </div>

        {/* Photo and counts */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <Avatar url={p.avatarUrl} name={p.username} size={84} ring ringColor={p.profileColor || social?.profile_color || undefined} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-around" }}>
            <Stat
              n={goingCount}
              label="GOING"
              onClick={() => {
                setMeetFilter("going");
                chooseTab("meets", true);
              }}
            />
            <Stat n={social?.followers} label="FOLLOWERS" onClick={() => setConnections("followers")} />
            <Stat n={social?.following} label="FOLLOWING" onClick={() => setConnections("following")} />
          </div>
        </div>

        {/* Name, badges, city, bio, links */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {p.username && (
              <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.4, overflowWrap: "anywhere", color: p.profileColor || undefined }}>
                {p.username.toUpperCase()}
              </span>
            )}
            {(p.dayOne || p.foundingHost || p.isPhotographer || social?.connector) && (
              <Badges
                dayOne={p.dayOne}
                dayOneNumber={p.dayOneNumber}
                foundingHost={p.foundingHost}
                photographer={p.isPhotographer}
                photographerVerified={p.isPhotographer && social?.photographer_verified}
                connector={social?.connector}
                size={18}
              />
            )}
          </div>
          {p.city && (
            <div style={{ fontSize: 12.5, color: "#777", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>📍 {p.city}</div>
          )}
          {p.bio && (
            <div
              style={{
                fontSize: 13.5,
                color: "#DDD",
                marginTop: 6,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "'Barlow', sans-serif",
              }}
            >
              {p.bio}
            </div>
          )}
          {page && (
            <a
              href={page.href}
              target="_blank"
              rel="noreferrer nofollow"
              style={{ display: "inline-block", fontSize: 12.5, color: "#38BDF8", marginTop: 5, fontWeight: 700, textDecoration: "none", fontFamily: "'Barlow', sans-serif" }}
            >
              📸 {page.label}
            </a>
          )}
          {p.isPhotographer && social && (
            <div>
              <button
                onClick={() => onOpenPerson && onOpenPerson(user.id)}
                style={{ background: "none", border: "none", padding: "10px 0", marginTop: -5, color: "#7DD3FC", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}
              >
                {social.photographer_verified
                  ? "📸✓ Verified photographer"
                  : "📸 Photographer · see your profile →"}
              </button>
            </div>
          )}
        </div>

        {clubs && clubs.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 12, paddingBottom: 2, scrollbarWidth: "none" }}>
            {clubs.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenLink && onOpenLink(`club:${c.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  flexShrink: 0,
                  background: "#141414",
                  border: "1px solid #242424",
                  borderRadius: 18,
                  padding: "7px 12px 7px 6px",
                  color: "#DDD",
                  fontSize: 12.5,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  cursor: "pointer",
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                <Logo url={c.logo_url} fallback={kindLabel(c.kind).split(" ")[0]} size={24} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="action-btn" onClick={() => setEditing(true)} disabled={!profile} style={headerButton}>
            EDIT PROFILE
          </button>
          <button className="action-btn" onClick={onOpenAlerts} style={headerButton}>
            🔔 ALERTS
          </button>
          <button className="action-btn" onClick={() => openInvites()} style={headerButton}>
            🎁 INVITE
          </button>
        </div>

        {profile && !p.username && (
          <button
            className="action-btn"
            onClick={() => setEditing(true)}
            style={{
              ...noticeCard,
              background: "rgba(255,69,0,0.1)",
              border: "1px solid #FF4500",
            }}
          >
            <span style={{ fontSize: 22 }}>✍️</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>Pick a username to finish your profile</span>
              <span style={{ display: "block", fontSize: 12, color: "#B9A79C", marginTop: 2, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif" }}>
                It's how people find you, and the name your meets and posts go out under.
              </span>
            </span>
            <span style={{ color: "#FF7A00", fontSize: 20 }}>›</span>
          </button>
        )}

        {cohostInvites > 0 && (
          <button className="action-btn" onClick={() => setSettings({ page: "cohosts" })} style={noticeCard}>
            <span style={{ fontSize: 20 }}>🤝</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800 }}>
              {cohostInvites === 1 ? "1 co-host invite is waiting" : `${cohostInvites} co-host invites are waiting`}
            </span>
            <span style={{ color: "#555", fontSize: 20 }}>›</span>
          </button>
        )}
      </div>

      {/* Tabs: the bar sticks under the app header while you scroll */}
      <div ref={tabsTop} />
      <div
        role="tablist"
        aria-label="Profile sections"
        style={{
          position: "sticky",
          top: HEADER_HEIGHT,
          zIndex: 40,
          display: "flex",
          background: "#0A0A0A",
          borderTop: "1px solid #1A1A1A",
          borderBottom: "1px solid #1E1E1E",
          // The header fades out over its last few pixels; this fills that
          // band so scrolled content doesn't peek through above the tabs.
          boxShadow: "0 -14px 0 #0A0A0A",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => chooseTab(t.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "9px 0 7px",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${active ? "#FF4500" : "transparent"}`,
                color: active ? "#F0F0F0" : "#8A8A8A",
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1.1, filter: active ? "none" : "grayscale(1)", opacity: active ? 1 : 0.55 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" style={{ padding: "14px 16px 8px", minHeight: 280 }}>
        {tab === "garage" && <Garage user={user} onToast={onToast} />}
        {tab === "meets" && (
          <MeetsPanel events={events} rsvps={rsvps} filter={meetFilter} onFilter={setMeetFilter} onOpenMeet={onOpenMeet} />
        )}
        {tab === "posts" && <PostsPanel user={user} onOpenLink={onOpenLink} onToast={onToast} />}
        {tab === "clubs" && <ClubsPanel clubs={clubs} error={clubsError} onOpenLink={onOpenLink} />}
      </div>

      {connections && (
        <Connections
          user={user}
          initial={connections}
          onClose={() => setConnections(null)}
          onToast={onToast}
          onOpenPerson={(id) => {
            setConnections(null);
            onOpenPerson && onOpenPerson(id);
          }}
          onChanged={() => {
            refreshSocial();
            onFollowingChange && onFollowingChange();
          }}
        />
      )}

      {settings && (
        <SettingsScreen
          user={user}
          profile={p}
          initialPage={settings.page}
          onClose={() => setSettings(null)}
          onToast={onToast}
          onEditProfile={() => setEditing(true)}
          onOpenAlerts={onOpenAlerts}
          onShowTerms={onShowTerms}
          onShowPrivacy={onShowPrivacy}
          onOpenLink={onOpenLink}
          onCohostChange={onCohostChange}
        />
      )}

      {/* Above Settings (290), since Settings can open it too. */}
      {editing && profile && (
        <EditProfile
          user={user}
          profile={profile}
          zIndex={295}
          onClose={() => setEditing(false)}
          onToast={onToast}
          onSaved={(next) => {
            // isAdmin and the badges aren't edited here; keep them.
            setProfile((prev) => ({ ...prev, ...next }));
            refreshSocial();
            onToast("Profile saved");
          }}
        />
      )}
    </div>
  );
}

function MeetsPanel({ events, rsvps, filter, onFilter, onOpenMeet }) {
  const now = new Date();
  const lists = {
    going: events.filter((e) => rsvps[e.id] === "going"),
    saved: events.filter((e) => rsvps[e.id] === "interested"),
    posted: events.filter((e) => e.submittedByUser),
  };
  const rows = [...lists[filter]].sort((a, b) => sortKey(a, now) - sortKey(b, now));
  const empty = {
    going: ["🏁", "No meets yet", "Tap GOING on a meet and it shows up here, so you can find it on the day."],
    saved: ["★", "Nothing saved", "Tap ★ MAYBE on a meet to keep it here while you decide."],
    posted: ["📣", "You haven't posted a meet", "Running one? Use + POST MEET at the top of the app to put it on the map."],
  }[filter];

  return (
    <>
      <Segments
        options={[
          ["going", `GOING · ${lists.going.length}`],
          ["saved", `SAVED · ${lists.saved.length}`],
          ["posted", `POSTED · ${lists.posted.length}`],
        ]}
        value={filter}
        onChange={onFilter}
      />
      {rows.length === 0 ? (
        <Empty icon={empty[0]} title={empty[1]} text={empty[2]} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {rows.map((e) => {
            const past = isPast(e, now);
            const photo = e.photoUrl || e.flyerUrl;
            return (
              <button
                key={e.id}
                onClick={() => onOpenMeet && onOpenMeet(e)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  background: "#111",
                  border: "1px solid #222",
                  borderRadius: 10,
                  padding: 10,
                  color: "inherit",
                  cursor: "pointer",
                  opacity: past ? 0.55 : 1,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 8,
                    flexShrink: 0,
                    overflow: "hidden",
                    background: "#1A1A1A",
                    border: "1px solid #242424",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  {photo ? <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📅"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#FF7A00", fontWeight: 700, letterSpacing: 0.6, marginTop: 1 }}>
                    {past ? "PAST · " : ""}
                    {displayDate(e)} · {displayTime(e)}
                  </div>
                  {e.city && (
                    <div style={{ fontSize: 12, color: "#777", marginTop: 1, fontFamily: "'Barlow', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📍 {e.city}
                    </div>
                  )}
                </div>
                <span style={{ color: "#444", fontSize: 20, flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function PostsPanel({ user, onOpenLink, onToast }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadPosts({ userId: user.id, sort: "new" })
      .then((rows) => alive && setPosts(rows))
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [user.id]);

  if (!posts) return <Muted>Loading your posts…</Muted>;
  if (error) return <Muted style={{ color: "#EF4444" }}>{error}</Muted>;
  if (posts.length === 0) {
    return (
      <Empty
        icon="💬"
        title="No posts yet"
        text="Ask a question, share a build or drop a photo spot in Community, then Forums. Your posts show up here."
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          showForum
          user={user}
          onNeedAccount={() => {}}
          onToast={onToast}
          onOpen={() => onOpenLink && onOpenLink(`post:${post.id}`)}
        />
      ))}
    </div>
  );
}

function ClubsPanel({ clubs, error, onOpenLink }) {
  if (!clubs) return <Muted>Loading your clubs…</Muted>;
  if (error) return <Muted style={{ color: "#EF4444" }}>{error}</Muted>;
  if (clubs.length === 0) {
    return (
      <Empty
        icon="🏁"
        title="No clubs yet"
        text="Find your people in Community, then Clubs: car clubs, crews and photo groups near you."
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {clubs.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpenLink && onOpenLink(`club:${c.id}`)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            textAlign: "left",
            background: "#111",
            border: "1px solid #222",
            borderRadius: 10,
            padding: 10,
            color: "inherit",
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          <Logo url={c.logo_url} fallback={kindLabel(c.kind).split(" ")[0]} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, marginTop: 2, color: c.role === "member" ? "#777" : "#FF7A00" }}>
              {String(c.role || "member").toUpperCase()} · {kindLabel(c.kind).replace(/^\S+\s+/, "").toUpperCase()}
            </div>
          </div>
          <span style={{ color: "#444", fontSize: 20, flexShrink: 0 }}>›</span>
        </button>
      ))}
    </div>
  );
}

function Stat({ n, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ flex: 1, minHeight: 44, background: "none", border: "none", padding: "4px 2px", cursor: "pointer", color: "inherit", textAlign: "center", minWidth: 0, fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.1 }}>
        {n === undefined || n === null ? "–" : Number(n).toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: 10, color: "#8A8A8A", letterSpacing: 1.2, fontWeight: 700, marginTop: 2 }}>{label}</div>
    </button>
  );
}

function Empty({ icon, title, text }) {
  return (
    <div style={{ textAlign: "center", padding: "34px 18px 24px" }}>
      <div style={{ fontSize: 34, opacity: 0.85 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 900, marginTop: 8, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#777", marginTop: 4, lineHeight: 1.55, fontFamily: "'Barlow', sans-serif", maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
        {text}
      </div>
    </div>
  );
}

function Muted({ children, style }) {
  return (
    <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6, padding: "10px 2px", fontFamily: "'Barlow', sans-serif", ...style }}>
      {children}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const headerButton = {
  flex: 1,
  padding: "10px 0",
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#F0F0F0",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.4,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const noticeCard = {
  width: "100%",
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  background: "#111",
  border: "1px solid #2A2A2A",
  borderRadius: 10,
  padding: "13px 16px",
  color: "#F0F0F0",
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};
