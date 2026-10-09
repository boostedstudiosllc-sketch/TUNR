import { useEffect, useState } from "react";
import {
  loadEvents,
  loadProfile,
  ensureProfile,
  dayOneOpen,
  rememberSignupSource,
  track,
} from "../lib/store.js";
import { isPast } from "../lib/dates.js";
import AuthForm from "./AuthForm.jsx";
import Badge from "./Badge.jsx";
import TermsOfService from "./TermsOfService.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";

// The link in the bio. Signing up here makes a real account, not a waitlist
// entry, so there's nothing to convert at launch. /join?ref=tiktok records
// which link brought them; a bare /join counts as "bio".
export default function JoinPage({ user, onEnter }) {
  const [count, setCount] = useState(null);
  const [open, setOpen] = useState(true);
  const [profile, setProfile] = useState(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    rememberSignupSource(ref || "bio");
    track("join_viewed", { ref: ref || "bio" });
    dayOneOpen().then(setOpen).catch(() => {});
    const now = new Date();
    loadEvents(null)
      .then((events) => setCount(events.filter((e) => !isPast(e, now)).length))
      .catch(() => {});
  }, []);

  // Once signed in, make sure the profile row exists (it's what carries the
  // badge) before reading it back.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let alive = true;
    ensureProfile(user)
      .catch(() => {})
      .then(() => loadProfile(user.id))
      .then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function share() {
    const url = `${window.location.origin}/join`;
    const text = "Every car meet in Atlanta on one map. Grab a Day 1 badge before launch:";
    track("join_shared", {});
    try {
      if (navigator.share) {
        await navigator.share({ title: "TUNR", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#F0F0F0",
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: "'Barlow Condensed', sans-serif",
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          padding: "40px 22px 28px",
          background: "linear-gradient(180deg, #1A0800 0%, #0A0A0A 100%)",
          borderBottom: "1px solid #1E1E1E",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
          TUN<span style={{ color: "#FF4500" }}>R</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#555", letterSpacing: 2.5, marginTop: 3 }}>
          ATLANTA, GA
        </div>

        <div
          style={{
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1.08,
            marginTop: 26,
            letterSpacing: -0.3,
          }}
        >
          Every car meet.
          <br />
          One map.
        </div>
        <div style={paragraph}>
          Find what's on tonight, see what's showing up, RSVP with your car. No more digging
          through stories that vanished yesterday.
          {count ? ` ${count} meets on the map right now.` : ""}
        </div>
      </div>

      <div style={{ padding: "24px 22px 0" }}>
        {user && profile ? (
          <Welcome profile={profile} onEnter={onEnter} onShare={share} copied={copied} />
        ) : (
          <>
            {open && (
              <div
                style={{
                  background: "#111",
                  border: "1px solid #FF7A00",
                  borderRadius: 12,
                  padding: "16px 18px",
                  marginBottom: 20,
                }}
              >
                <Badge kind="day_one" size={30} />
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 10, letterSpacing: 0.3 }}>
                  GET IN BEFORE LAUNCH
                </div>
                <div style={{ ...paragraph, marginTop: 6, fontSize: 13.5 }}>
                  Sign up now and your profile carries the Day 1 badge, numbered in the order
                  people joined — next to your name everywhere you comment. It stops being handed out at launch, and nobody can get
                  one after.
                </div>
              </div>
            )}

            {user ? (
              <div style={{ ...paragraph, textAlign: "center" }}>Setting up your account…</div>
            ) : (
              <AuthForm />
            )}

            <div
              style={{
                fontSize: 11.5,
                color: "#555",
                textAlign: "center",
                marginTop: 14,
                lineHeight: 1.6,
                fontFamily: "'Barlow', sans-serif",
              }}
            >
              Free, always. By creating an account you agree to the{" "}
              <button style={linkButton} onClick={() => setShowTerms(true)}>
                Terms
              </button>{" "}
              and{" "}
              <button style={linkButton} onClick={() => setShowPrivacy(true)}>
                Privacy Policy
              </button>
              .
            </div>

            <button
              onClick={onEnter}
              style={{
                ...linkButton,
                display: "block",
                margin: "22px auto 0",
                fontSize: 12.5,
                color: "#777",
              }}
            >
              Just looking? Browse meets →
            </button>
          </>
        )}
      </div>

      {showTerms && <TermsOfService readOnly onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

function Welcome({ profile, onEnter, onShare, copied }) {
  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease" }}>
      {profile.dayOne ? (
        <>
          <div style={{ fontSize: 11, color: "#FF7A00", letterSpacing: 2.5, fontWeight: 800 }}>
            YOU'RE IN
          </div>
          <div style={{ marginTop: 14 }}>
            <Badge kind="day_one" number={profile.dayOneNumber} size={56} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 14, lineHeight: 1.1 }}>
            {profile.dayOneNumber ? `Day 1 member #${profile.dayOneNumber}` : "You're Day 1"}
          </div>
          <div style={paragraph}>
            That badge is yours for good. Your account is ready — RSVP to meets and add your car
            whenever you like.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>You're in</div>
          <div style={paragraph}>Your account is ready — RSVP to meets and add your car.</div>
        </>
      )}

      <button
        className="action-btn"
        onClick={onEnter}
        style={{
          width: "100%",
          marginTop: 22,
          padding: "16px 0",
          background: "#FF4500",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 2,
          fontFamily: "'Barlow Condensed', sans-serif",
          boxShadow: "0 6px 26px rgba(255,69,0,0.4)",
        }}
      >
        FIND A MEET →
      </button>
      <button
        className="action-btn"
        onClick={onShare}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "14px 0",
          background: "#161616",
          color: "#DDD",
          border: "1px solid #2A2A2A",
          borderRadius: 10,
          fontSize: 13.5,
          fontWeight: 800,
          letterSpacing: 1.6,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {copied ? "LINK COPIED" : "SEND IT TO YOUR CREW"}
      </button>
    </div>
  );
}

const paragraph = {
  fontSize: 14,
  color: "#AAA",
  lineHeight: 1.7,
  marginTop: 14,
  fontFamily: "'Barlow', sans-serif",
};

const linkButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#999",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: "inherit",
  fontFamily: "'Barlow', sans-serif",
};
