import { useEffect, useState } from "react";
import { loadEvents, track } from "../lib/store.js";
import { isPast } from "../lib/dates.js";

// The page you send a host. It IS the pitch — no separate waitlist, no form.
// Reached at /hosts, and the only way out is into signup.
//
// Deliberately honest about what doesn't exist yet: hosts will notice missing
// notifications within a day, and finding out after signing up is worse than
// being told up front.
export default function HostPitch({ onStart }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    track("host_pitch_viewed", {});
    const now = new Date();
    loadEvents(null)
      .then((events) => setCount(events.filter((e) => !isPast(e, now)).length))
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#F0F0F0",
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: "'Barlow Condensed', sans-serif",
        paddingBottom: 96,
      }}
    >
      <div
        style={{
          padding: "40px 22px 30px",
          background: "linear-gradient(180deg, #1A0800 0%, #0A0A0A 100%)",
          borderBottom: "1px solid #1E1E1E",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
          TUN<span style={{ color: "#FF4500" }}>R</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#555", letterSpacing: 2.5, marginTop: 3 }}>
          FOR HOSTS · ATLANTA, GA
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
            Get verified and nobody else can post under your handle. No impersonation, no fake
            listings using your name.
          </Point>
        </Section>

        <Section title="WHAT IT COSTS">
          <div style={paragraph}>
            Nothing. Roughly thirty seconds per meet — title, address, time, drop your flyer in.
            <br />
            <br />
            <strong style={{ color: "#F0F0F0" }}>Keep your Instagram. Keep your group.</strong> This
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
            <strong style={{ color: "#FF7A00" }}>notifications</strong>. Right now people have to
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
          background: "linear-gradient(180deg, transparent, #0A0A0A 26%)",
        }}
      >
        <button
          className="action-btn"
          onClick={() => {
            track("host_pitch_cta", {});
            onStart();
          }}
          style={{
            width: "100%",
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
          POST YOUR FIRST MEET →
        </button>
        <div
          style={{
            fontSize: 11,
            color: "#555",
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
  color: "#AAA",
  lineHeight: 1.7,
  marginTop: 14,
  fontFamily: "'Barlow', sans-serif",
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 11, color: "#FF4500", letterSpacing: 2.5, fontWeight: 800 }}>
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
            color: "#999",
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
