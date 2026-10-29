import { useEffect, useState } from "react";
import {
  loadEvents,
  track,
  rememberSignupSource,
  rememberHostInvite,
  pendingHostInvite,
  peekHostInvite,
} from "../lib/store.js";
import { isPast } from "../lib/dates.js";
import HostSetup from "./HostSetup.jsx";

// The page you send a host. It IS the pitch — no separate waitlist.
// Reached at /hosts, and the only way out is into signup and verification.
//
// /hosts?invite=<token> is the link an admin DMs to a host's Instagram. The
// page greets them by handle, and signing up through it verifies them.
//
// Deliberately honest about what doesn't exist yet: hosts will notice missing
// notifications within a day, and finding out after signing up is worse than
// being told up front.
export default function HostPitch({ user, onStart }) {
  const [count, setCount] = useState(null);
  const [token] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl) rememberHostInvite(fromUrl);
    return fromUrl || pendingHostInvite();
  });
  const [invite, setInvite] = useState(null);
  // Someone coming back from Google sign-in, or opening their invite while
  // already signed in, goes straight to setup.
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    track("host_pitch_viewed", { invited: Boolean(token) });
    rememberSignupSource("hosts");
    const now = new Date();
    loadEvents(null)
      .then((events) => setCount(events.filter((e) => !isPast(e, now)).length))
      .catch(() => {});
    if (token) peekHostInvite(token).then(setInvite).catch(() => {});
  }, []);

  useEffect(() => {
    if (user && token) setSetup(true);
  }, [user?.id]);

  const invited = invite?.status === "valid";

  if (setup) {
    return <HostSetup user={user} token={token} invite={invite} onStart={onStart} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--n-0a0a0a)",
        color: "var(--n-f0f0f0)",
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: "'Barlow Condensed', sans-serif",
        paddingBottom: 96,
      }}
    >
      <div
        style={{
          padding: "40px 22px 30px",
          background: "linear-gradient(180deg, var(--n-1a0800) 0%, var(--n-0a0a0a) 100%)",
          borderBottom: "1px solid var(--n-1e1e1e)",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
          TUN<span style={{ color: "#0080F0" }}>R</span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--n-555555)", letterSpacing: 2.5, marginTop: 3 }}>
          FOR HOSTS · ATLANTA, GA
        </div>

        {invited && (
          <div
            style={{
              marginTop: 22,
              background: "rgba(0, 128, 240,0.1)",
              border: "1px solid #0080F0",
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 14,
              fontFamily: "'Barlow', sans-serif",
              color: "var(--n-dddddd)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--a-3cabfd)" }}>@{invite.instagram_handle}</strong>, you're
            invited. Sign up through this link and your page is verified on the spot.
          </div>
        )}

        <div
          style={{
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1.08,
            marginTop: 26,
            letterSpacing: -0.3,
          }}
        >
          Your meet shouldn't
          <br />
          disappear in 24 hours.
        </div>
        <div style={paragraph}>
          You post a flyer to your story. It's gone by tomorrow. Everyone who wasn't scrolling at
          the right moment never knew. TUNR is where your meet stays put — on a map, with a date,
          findable by anyone within driving distance.
        </div>
      </div>

      <div style={{ padding: "26px 22px 0" }}>
        <Section title="WHAT YOU GET">
          <Point icon="📍" title="People find you">
            Your meet shows on the map with a real distance from wherever someone is standing. Not
            buried in a feed.
          </Point>
          <Point icon="🏁" title="RSVPs that mean something">
            See how many are coming — and what they're bringing. Attendee lists show cars, make and
            model, so you know if it's ten Civics or ten GT3s.
          </Point>
          <Point icon="🔒" title="Private meets, properly private">
            Invite-only shop nights with a passcode or an approval list. The address stays hidden
            until someone's in — enforced by the database, not just the screen.
          </Point>
          <Point icon="✓" title="Your name, reserved">
            Get verified and nobody else can post under your name. No impersonation, no fake
            listings using your name. Verifying is a link @tunr.app DMs to your page — nothing to
            put in your bio.
          </Point>
        </Section>

        <Section title="WHAT IT COSTS">
          <div style={paragraph}>
            Nothing. Roughly thirty seconds per meet — title, address, time, drop your flyer in.
            <br />
            <br />
            <strong style={{ color: "var(--n-f0f0f0)" }}>Keep your Instagram. Keep your group.</strong> This
            isn't a replacement for either. Post here as well, because here people can actually find
            you.
          </div>
        </Section>

        <Section title="WHERE IT'S AT">
          <div style={paragraph}>
            {count === null ? "Meets" : `${count} meets`} are listed right now across Atlanta,
            Athens, Savannah, Augusta and Columbus — pulled from public listings and organiser
            pages. It's a real app, not a mockup.
            <br />
            <br />
            It's also early, so here's what isn't built yet:{" "}
            <strong style={{ color: "var(--a-3cabfd)" }}>notifications</strong>. Right now people have to
            open the app to see your meet. Push reminders are next, and they're the whole point —
            "meet in Kennesaw tonight, 4 miles away" landing on a phone.
            <br />
            <br />
            You'd be one of the first hosts on it. That means your feedback shapes what gets built,
            and you get a founding host mark on your profile that nobody can get later.
          </div>
        </Section>

        <Section title="THE RULES">
          <div style={paragraph}>
            Meets promoting street racing, takeovers, or anything illegal are removed, and the host
            is banned. Reports are reviewed within 24 hours. If you run a clean meet this will never
            affect you — it's here so the app stays somewhere venues are happy to host.
          </div>
        </Section>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          padding: "14px 22px 22px",
          background: "linear-gradient(180deg, transparent, var(--n-0a0a0a) 26%)",
        }}
      >
        <button
          className="action-btn"
          onClick={() => {
            track("host_pitch_cta", { invited });
            window.scrollTo(0, 0);
            setSetup(true);
          }}
          style={{
            width: "100%",
            padding: "16px 0",
            background: "#0080F0",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 2,
            fontFamily: "'Barlow Condensed', sans-serif",
            boxShadow: "0 6px 26px rgba(0, 128, 240,0.4)",
          }}
        >
          {invited ? "CLAIM YOUR HOST SPOT →" : "GET STARTED →"}
        </button>
        <div
          style={{
            fontSize: 11,
            color: "var(--n-555555)",
            textAlign: "center",
            marginTop: 9,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          Free · takes a minute · questions to boostedstudiosllc@gmail.com
        </div>
      </div>
    </div>
  );
}

const paragraph = {
  fontSize: 14,
  color: "var(--n-aaaaaa)",
  lineHeight: 1.7,
  marginTop: 14,
  fontFamily: "'Barlow', sans-serif",
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 11, color: "#0080F0", letterSpacing: 2.5, fontWeight: 800 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Point({ icon, title, children }) {
  return (
    <div style={{ display: "flex", gap: 13, marginTop: 18 }}>
      <div style={{ fontSize: 19, lineHeight: 1.3, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2 }}>{title}</div>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--n-999999)",
            lineHeight: 1.65,
            marginTop: 3,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
