import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  signOut,
  loadMyVerification,
  loadBlockedAccounts,
  loadRestrictedAccounts,
  loadMyCohostInvites,
} from "../lib/store.js";
import { useAccount, requestConfirmationEmail, shortDate, CLEANUP_WHY } from "../lib/account.js";
import HostVerification, { VerificationQueue, HostInvites } from "./HostVerification.jsx";
import { RestrictedAccounts, BlockedAccounts, DeleteAccount } from "./AccountSettings.jsx";
import ModerationQueue from "./ModerationQueue.jsx";
import CommunityReports from "./CommunityReports.jsx";
import SignupStats from "./SignupStats.jsx";
import Insights from "./Insights.jsx";
import { CohostInvites } from "./Cohosts.jsx";
import { ListingRequestsQueue } from "./ListingRequest.jsx";
import { SetPasswordForm } from "./SetPassword.jsx";
import { SHOP_OPEN } from "../lib/points.js";
import { openInvites } from "../lib/invites.js";
import { MeetHistory, InviteHistory, TransactionLog, SignInHistory, AlertSound } from "./ActivityPages.jsx";
import { FeedbackPage, FeedbackInbox } from "./Feedback.jsx";
import { LocationPage, LocationPill, useLocationStatus } from "./LocationAccess.jsx";
import { loadMyStreak, setHiddenFromLeaderboards } from "../lib/points.js";
import BoostedPage, { BoostedAdmin } from "./BoostedStudios.jsx";
import RushAdmin from "./RushAdmin.jsx";
import RewardsPanel, { RewardsAdmin, RedemptionsAdmin, CheckinsAdmin, PurchasesAdmin, CardsAdmin, IssuesAdmin } from "./Rewards.jsx";

const PAGES = {
  email: "Email",
  password: "Password",
  points: "Points & rewards",
  meetHistory: "Meet history",
  inviteHistory: "Invite history",
  transactions: "Transaction log",
  signIns: "Sign-in history",
  alertSound: "Alert sound",
  location: "Location",
  contact: "Contact us",
  boosted: "Boosted businesses",
  boostedAdmin: "Boosted businesses",
  rushAdmin: "TUNR Rush",
  suggestions: "Suggestion box",
  inbox: "Inbox",
  host: "Host verification",
  restricted: "Restricted accounts",
  blocked: "Blocked accounts",
  cohosts: "Co-host invites",
  insights: "Insights",
  reports: "Community reports",
  moderation: "Moderation queue",
  listings: "Listing requests",
  verifyQueue: "Host verification queue",
  hostInvites: "Host invites",
  signups: "Sign-up stats",
  rewardsAdmin: "Rewards",
  claims: "Reward claims",
  purchases: "Purchases",
  cards: "Points cards",
  pointsHelp: "Points help",
  checkins: "Check-ins",
};

// Everything you can set or change, in one place, Instagram-style: grouped
// rows on the main page, each opening its own page with a Back button.
export default function SettingsScreen({
  user,
  profile,
  initialPage = null,
  onClose,
  onToast,
  onEditProfile,
  onOpenAlerts,
  onShowTerms,
  onShowPrivacy,
  onOpenLink,
  onCohostChange,
}) {
  const account = useAccount();
  // Same rule as the dot on the profile's gear.
  const unconfirmed = Boolean(account && account.confirmed === false);
  const [page, setPage] = useState(initialPage);
  const [verification, setVerification] = useState(undefined); // undefined = loading
  const [counts, setCounts] = useState({});
  const [locStatus] = useLocationStatus();
  const [onBoards, setOnBoards] = useState(null);
  useEffect(() => {
    loadMyStreak()
      .then((s) => setOnBoards(!s?.hidden))
      .catch((e) => console.warn(e.message));
  }, []);

  async function toggleBoards() {
    const next = !onBoards;
    setOnBoards(next);
    try {
      await setHiddenFromLeaderboards(user.id, !next);
      onToast(next ? "You're back on the leaderboards" : "Hidden from the leaderboards");
    } catch (e) {
      setOnBoards(!next);
      onToast(e.message);
    }
  }
  const scroller = useRef(null);
  const mainScroll = useRef(0);

  // Refreshed each time the main list shows, so a change made on a page
  // (unblocking someone, asking to be verified) is reflected when you return.
  useEffect(() => {
    if (page) return;
    let alive = true;
    loadMyVerification(user.id)
      .then((v) => alive && setVerification(v))
      .catch((e) => console.warn(e.message));
    Promise.all([loadBlockedAccounts(), loadRestrictedAccounts(), loadMyCohostInvites(user.id)])
      .then(([b, r, c]) => alive && setCounts({ blocked: b.length, restricted: r.length, cohosts: c.length }))
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [page, user.id]);

  // Pages start at the top; coming back puts the list where you left it.
  useLayoutEffect(() => {
    if (!scroller.current) return;
    scroller.current.scrollTop = page ? 0 : mainScroll.current;
  }, [page]);

  function open(next) {
    if (scroller.current) mainScroll.current = scroller.current.scrollTop;
    setPage(next);
  }

  const back = () => (page ? setPage(null) : onClose());

  // The phone's back gesture (and Escape on a computer) steps back through
  // Settings instead of leaving TUNR: one history entry while it's open.
  const pageRef = useRef(page);
  pageRef.current = page;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    window.history.pushState({ tunrSettings: true }, "");
    const onPop = () => {
      if (pageRef.current) {
        setPage(null);
        window.history.pushState({ tunrSettings: true }, "");
      } else {
        closeRef.current();
      }
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (pageRef.current) setPage(null);
      else closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Links to a post, club, linkup or meet open on another tab, so Settings
  // closes first; a person opens on top of it.
  function follow(link) {
    if (!String(link || "").startsWith("person:")) onClose();
    onOpenLink && onOpenLink(link);
  }

  async function doSignOut() {
    try {
      await signOut();
    } catch (e) {
      onToast(e.message);
    }
  }

  const hostStatus =
    verification === undefined
      ? ""
      : verification?.status === "approved"
        ? "✓ Verified"
        : verification?.status === "pending"
          ? "Pending"
          : verification?.status === "rejected"
            ? "Not approved"
            : "Get verified";

  return (
    <div
      role="dialog"
      aria-label="Settings"
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        zIndex: 290,
        background: "#0A0A0A",
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow Condensed', sans-serif",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <style>{`.tunr-settings-empty{display:none}.tunr-settings-body:empty+.tunr-settings-empty{display:block;opacity:0;animation:tunrSettingsEmpty .3s ease 1.5s forwards}@keyframes tunrSettingsEmpty{to{opacity:1}}`}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 12px",
          borderBottom: "1px solid #1E1E1E",
          background: "#0A0A0A",
          flexShrink: 0,
        }}
      >
        <button
          className="action-btn"
          onClick={back}
          aria-label={page ? "Back" : "Close settings"}
          style={{
            background: "none",
            color: "#F0F0F0",
            padding: "6px 8px",
            fontSize: page ? 14 : 22,
            fontWeight: 800,
            letterSpacing: 1,
            lineHeight: 1,
            minWidth: 64,
            minHeight: 44,
            textAlign: "left",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {page ? "‹ BACK" : "✕"}
        </button>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 0.6,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {page ? PAGES[page].toUpperCase() : "SETTINGS"}
        </div>
        <div style={{ minWidth: 64 }} />
      </div>

      <div
        ref={scroller}
        style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "6px 16px 48px" }}
      >
        {page ? (
          <div style={{ paddingTop: 12 }}>
            <SubPage
              page={page}
              user={user}
              profile={profile}
              account={account}
              onToast={onToast}
              onCohostChange={onCohostChange}
              onFollow={follow}
            />
          </div>
        ) : (
          <>
            <Section title="ACCOUNT">
              <Row
                icon="👤"
                label="Edit profile"
                value={profile.username ? `@${profile.username}` : "Add a username"}
                valueColor={profile.username ? "#777" : "#FF7A00"}
                onClick={onEditProfile}
              />
              <Row
                icon="✉️"
                label="Email"
                sub={user.email}
                right={account ? <StatusPill ok={!unconfirmed} /> : null}
                onClick={() => open("email")}
              />
              <Row icon="🔑" label="Password" sub="Change your password" onClick={() => open("password")} />
              <Row icon="⭐" label="Points & rewards" sub="Check in at meets, trade points for merch" onClick={() => open("points")} />
              <Row icon="🎁" label="Invite friends" sub="Unlock more cars, clubs and profile flair" onClick={() => openInvites()} />
            </Section>

            <Section title="VERIFICATION">
              <Row
                icon="📧"
                label="Email confirmation"
                sub={unconfirmed ? "Your account isn't verified yet" : null}
                subColor="#F87171"
                right={
                  !account ? null : unconfirmed ? (
                    <span aria-label="Not verified" style={alertBadge}>!</span>
                  ) : (
                    <span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>✓ Verified</span>
                  )
                }
                onClick={() => open("email")}
              />
              <Row icon="🛡️" label="Host verification" value={hostStatus} onClick={() => open("host")} />
            </Section>

            <Section title="NOTIFICATIONS">
              <Row
                icon="🔔"
                label="Alerts"
                sub="Phone alerts, linkups near you, meet-day reminders"
                onClick={onOpenAlerts}
              />
              <Row icon="🔊" label="Alert sound" sub="Make your car's exhaust your alert sound" onClick={() => open("alertSound")} />
            </Section>

            <Section title="ACTIVITY">
              <Row icon="🏁" label="Meet history" sub="Meets you went to and checked in at" onClick={() => open("meetHistory")} />
              <Row icon="🎁" label="Invite history" sub="Who joined with your link, who's pending" onClick={() => open("inviteHistory")} />
              <Row icon="🧾" label="Transaction log" sub="Points earned and spent, rewards claimed" onClick={() => open("transactions")} />
            </Section>

            <Section title="PRIVACY AND SAFETY">
              <Row
                icon="📍"
                label="Location"
                sub="Needed to check in at meets for points"
                right={<LocationPill status={locStatus} />}
                onClick={() => open("location")}
              />
              <Row icon="🔇" label="Restricted accounts" value={counts.restricted ? String(counts.restricted) : ""} onClick={() => open("restricted")} />
              <Row icon="🚫" label="Blocked accounts" value={counts.blocked ? String(counts.blocked) : ""} onClick={() => open("blocked")} />
              <Row
                icon="🏆"
                label="Show me on leaderboards"
                sub="Your username, photo and streak or check-in count"
                right={
                  onBoards === null ? null : (
                    <span role="switch" aria-checked={onBoards} style={{ fontSize: 13, fontWeight: 800, color: onBoards ? "#10B981" : "#777" }}>
                      {onBoards ? "ON" : "OFF"}
                    </span>
                  )
                }
                onClick={() => onBoards !== null && toggleBoards()}
              />
              <Row icon="🔐" label="Sign-in history" sub="Where you're signed in; sign out other devices" onClick={() => open("signIns")} />
            </Section>

            <Section title="HOSTING">
              <Row
                icon="🤝"
                label="Co-host invites"
                right={counts.cohosts ? <span style={countBadge}>{counts.cohosts}</span> : null}
                onClick={() => open("cohosts")}
              />
            </Section>

            {profile.isAdmin && (
              <Section title="ADMIN">
                <Row icon="📥" label="Inbox" sub="Contact messages and suggestions" onClick={() => open("inbox")} />
                <Row icon="🏁" label="Boosted businesses" sub="Edit the Boosted Studios page" onClick={() => open("boostedAdmin")} />
                <Row icon="🎮" label="TUNR Rush" sub="Game on/off, daily goal, points, boosts, traffic" onClick={() => open("rushAdmin")} />
                <Row icon="📊" label="Insights" onClick={() => open("insights")} />
                <Row icon="🚩" label="Community reports" onClick={() => open("reports")} />
                <Row icon="🧹" label="Moderation queue" onClick={() => open("moderation")} />
                <Row icon="📋" label="Listing requests" onClick={() => open("listings")} />
                <Row icon="✅" label="Host verification queue" onClick={() => open("verifyQueue")} />
                <Row icon="📨" label="Host invites" onClick={() => open("hostInvites")} />
                <Row icon="📈" label="Sign-up stats" onClick={() => open("signups")} />
                <Row icon="🎁" label="Rewards" sub="What points can buy" onClick={() => open("rewardsAdmin")} />
                {SHOP_OPEN && (
                  <Row icon="🎟️" label="Points cards" sub="Print scan-to-earn cards for orders and details" onClick={() => open("cards")} />
                )}
                <Row icon="🛍️" label="Purchases" sub={SHOP_OPEN ? "Record a sale, set rates" : "Points rates and membership bonus"} onClick={() => open("purchases")} />
                {SHOP_OPEN && <Row icon="🆘" label="Points help" sub="Missing-points reports" onClick={() => open("pointsHelp")} />}
                <Row icon="🧾" label="Reward claims" sub="Hand over or cancel" onClick={() => open("claims")} />
                <Row icon="📍" label="Check-ins" sub="Review, remove, adjust points" onClick={() => open("checkins")} />
              </Section>
            )}

            <Section title="ABOUT">
              <Row icon="📄" label="Terms of Service" onClick={onShowTerms} />
              <Row icon="🔒" label="Privacy Policy" onClick={onShowPrivacy} />
              <Row icon="🏁" label="Other Boosted businesses" sub="Boosted Photography, Boosted Detailing" onClick={() => open("boosted")} />
              <Row icon="💬" label="Contact us" sub="Questions, problems, partnerships" onClick={() => open("contact")} />
              <Row icon="💡" label="Suggestion box" sub="Ideas to make TUNR better" onClick={() => open("suggestions")} />
            </Section>
            <button
              onClick={() => open("boosted")}
              style={{ display: "block", width: "100%", background: "none", border: "none", textAlign: "center", fontSize: 12, color: "#808080", marginTop: 12, padding: "8px 0", letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}
            >
              TUNR by Boosted Studios →
            </button>

            <button
              className="action-btn"
              onClick={doSignOut}
              style={{
                width: "100%",
                marginTop: 22,
                padding: "14px 0",
                background: "#141414",
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                color: "#F0F0F0",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1.5,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              SIGN OUT
            </button>
            <div style={{ textAlign: "center", fontSize: 11.5, color: "#808080", marginTop: 6, marginBottom: 22, fontFamily: "'Barlow', sans-serif", overflowWrap: "break-word" }}>
              Signed in as {user.email}
            </div>

            <DeleteAccount onToast={onToast} />
          </>
        )}
      </div>
    </div>
  );
}

function SubPage({ page, user, profile, account, onToast, onCohostChange, onFollow }) {
  switch (page) {
    case "email":
      return <EmailPage user={user} account={account} onToast={onToast} />;
    case "password":
      return <SetPasswordForm onToast={onToast} />;
    case "points":
      return <RewardsPanel user={user} onToast={onToast} />;
    case "meetHistory":
      return <MeetHistory onOpenLink={onFollow} />;
    case "inviteHistory":
      return <InviteHistory onOpenLink={onFollow} />;
    case "transactions":
      return <TransactionLog user={user} />;
    case "signIns":
      return <SignInHistory user={user} onToast={onToast} />;
    case "alertSound":
      return <AlertSound onToast={onToast} />;
    case "location":
      return <LocationPage onToast={onToast} />;
    case "boosted":
      return <BoostedPage onOpenPerks={() => onFollow("tab:perks")} user={user} onToast={onToast} onNeedAccount={() => {}} />;
    case "boostedAdmin":
      return <BoostedAdmin onToast={onToast} />;
    case "rushAdmin":
      return <RushAdmin onToast={onToast} />;
    case "contact":
      return <FeedbackPage kind="contact" user={user} onToast={onToast} />;
    case "suggestions":
      return <FeedbackPage kind="suggestion" user={user} onToast={onToast} />;
    case "inbox":
      return <FeedbackInbox onToast={onToast} />;
    case "rewardsAdmin":
      return <RewardsAdmin onToast={onToast} />;
    case "claims":
      return <RedemptionsAdmin onToast={onToast} />;
    case "purchases":
      return <PurchasesAdmin onToast={onToast} />;
    case "cards":
      return <CardsAdmin onToast={onToast} />;
    case "pointsHelp":
      return <IssuesAdmin onToast={onToast} />;
    case "checkins":
      return <CheckinsAdmin onToast={onToast} />;
    case "host":
      return (
        <Body empty="Loading…">
          <HostVerification user={user} profile={profile} onToast={onToast} />
        </Body>
      );
    case "restricted":
      return <RestrictedAccounts user={user} onToast={onToast} showEmpty />;
    case "blocked":
      return <BlockedAccounts user={user} onToast={onToast} showEmpty />;
    case "cohosts":
      return (
        <Body empty="No co-host invites right now. When a host adds you as a co-host on their meet, the invite shows up here.">
          <CohostInvites user={user} onToast={onToast} onChanged={onCohostChange} />
        </Body>
      );
    case "insights":
      return (
        <Body empty="No insights to show: the admin stats came back empty for this account.">
          <Insights />
        </Body>
      );
    case "reports":
      return <CommunityReports onToast={onToast} onOpenLink={onFollow} />;
    case "moderation":
      return (
        <Body empty="Nothing waiting for moderation.">
          <ModerationQueue onToast={onToast} />
        </Body>
      );
    case "listings":
      return (
        <Body empty="No listing requests waiting.">
          <ListingRequestsQueue user={user} onToast={onToast} />
        </Body>
      );
    case "verifyQueue":
      return (
        <Body empty="No hosts waiting to be verified.">
          <VerificationQueue onToast={onToast} />
        </Body>
      );
    case "hostInvites":
      return <HostInvites onToast={onToast} />;
    case "signups":
      return (
        <Body empty="No sign-up numbers to show yet.">
          <SignupStats />
        </Body>
      );
    default:
      return null;
  }
}

// Several of the existing cards render nothing when there's nothing to show;
// on a page of their own that would be a blank screen, so say so instead.
function Body({ empty, children }) {
  return (
    <>
      <div className="tunr-settings-body">{children}</div>
      <div className="tunr-settings-empty" style={emptyStyle}>
        {empty}
      </div>
    </>
  );
}

function EmailPage({ user, account, onToast }) {
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      const res = await requestConfirmationEmail();
      onToast(res.confirmed ? "✅ Your email is already confirmed" : `✉️ Sent to ${res.email} — tap the link in it`);
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const unconfirmed = Boolean(account && account.confirmed === false);

  return (
    <div style={{ background: "#111", border: `1px solid ${unconfirmed ? "#5A3A0A" : "#2A2A2A"}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "#8A8A8A", letterSpacing: 1.6, fontWeight: 700 }}>YOUR EMAIL</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, overflowWrap: "break-word", fontFamily: "'Barlow', sans-serif" }}>
        {String(user.email || "").split("@")[0]}
        <wbr />@{String(user.email || "").split("@")[1] || ""}
      </div>
      <div style={{ marginTop: 10 }}>
        {account ? <StatusPill ok={!unconfirmed} /> : <span style={{ ...bodyText, marginTop: 0 }}>Checking…</span>}
      </div>

      {unconfirmed ? (
        <>
          <div style={bodyText}>
            Your account isn't verified yet. Tap the link we emailed you to unlock chat, posting and linkups.
            {account.deleteOn
              ? ` Unconfirmed accounts are removed on ${shortDate(account.deleteOn)}.`
              : " Unconfirmed accounts are removed after 7 days."}{" "}
            No email? Check your spam folder, or send a new link.
          </div>
          <button
            className="action-btn"
            disabled={busy}
            onClick={resend}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "13px 0",
              background: "#FF4500",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1.4,
              opacity: busy ? 0.6 : 1,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {busy ? "SENDING…" : "RESEND CONFIRMATION EMAIL"}
          </button>
          <div style={{ marginTop: 14, background: "#0F0F0F", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#8A8A8A", lineHeight: 1.55, fontFamily: "'Barlow', sans-serif" }}>
            {CLEANUP_WHY}
          </div>
        </>
      ) : account ? (
        <div style={bodyText}>Your email is confirmed, so chat, posting and linkups are all unlocked.</div>
      ) : null}
    </div>
  );
}

function StatusPill({ ok }) {
  return ok ? (
    <span style={{ ...pillBase, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.4)" }}>
      ✓ Confirmed
    </span>
  ) : (
    <span style={{ ...pillBase, color: "#F87171", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)" }}>
      ⚠️ Not confirmed
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, color: "#8A8A8A", letterSpacing: 2, fontWeight: 800, margin: "0 4px 7px" }}>{title}</div>
      <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// One tappable line: icon, label (and a smaller line under it), then a value,
// badge or chevron on the right. With href it's a link instead of a button.
function Row({ icon, label, sub, subColor = "#777", value, valueColor = "#777", right, onClick, href, chevron = true }) {
  const inner = (
    <>
      <span aria-hidden="true" style={{ width: 26, textAlign: "center", fontSize: 18, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "#EEE", fontFamily: "'Barlow', sans-serif" }}>{label}</span>
        {sub && (
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: subColor,
              marginTop: 1,
              fontFamily: "'Barlow', sans-serif",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </span>
        )}
      </span>
      {value && (
        <span
          style={{
            fontSize: 13,
            color: valueColor,
            fontFamily: "'Barlow', sans-serif",
            flexShrink: 0,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      )}
      {right}
      {chevron && (
        <span aria-hidden="true" style={{ color: "#444", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
          ›
        </span>
      )}
    </>
  );
  const style = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 54,
    padding: "10px 14px",
    background: "none",
    border: "none",
    borderTop: "1px solid #1C1C1C",
    marginTop: -1,
    textAlign: "left",
    color: "inherit",
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
  };
  return href ? (
    <a href={href} style={style}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

const pillBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
  flexShrink: 0,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const alertBadge = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#EF4444",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const countBadge = {
  minWidth: 22,
  height: 22,
  padding: "0 7px",
  borderRadius: 11,
  background: "#FF4500",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  flexShrink: 0,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const bodyText = {
  fontSize: 13,
  color: "#999",
  marginTop: 10,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

const emptyStyle = {
  background: "#111",
  border: "1px dashed #2A2A2A",
  borderRadius: 10,
  padding: "16px 18px",
  fontSize: 13,
  color: "#777",
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};
