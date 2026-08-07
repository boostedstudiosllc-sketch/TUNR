// Required before an App Store submission, and required by the stores'
// privacy labels. Kept plain and specific — a policy that describes something
// the app doesn't do is worse than none.

import { CONTACT_EMAIL } from "../lib/contact.js";

const body = { fontFamily: "'Barlow', sans-serif", fontSize: 13, color: "#AAA", lineHeight: 1.7 };
const heading = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.5,
  color: "#FF4500",
  marginTop: 20,
  marginBottom: 6,
};

export default function PrivacyPolicy({ onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "#0A0A0A",
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "#F0F0F0",
      }}
    >
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #1A1A1A", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.5 }}>PRIVACY POLICY</div>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, marginTop: 2 }}>
              LAST UPDATED AUGUST 2026
            </div>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              color: "#fff",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 40px" }}>
        <div style={heading}>WHAT WE COLLECT</div>
        <div style={body}>
          <strong>If you create an account:</strong> your email address, the username you pick, and
          the city on your profile.
          <br />
          <br />
          <strong>What you do in the app:</strong> the meets you RSVP to, meets you post, comments
          you write, hosts you follow, accounts you block, photos you upload, and any request to
          join a private meet or to be verified as a host.
          <br />
          <br />
          <strong>Location:</strong> only if you tap to show distances, and only while the app is
          open. Your coordinates are used in your browser to work out how far away meets are. They
          are not sent to us and not stored.
          <br />
          <br />
          <strong>Usage events:</strong> basic records of actions like opening the app, searching,
          RSVPing, and sharing, so we can tell which parts of the app are useful. These are linked
          to your account if you're signed in.
        </div>

        <div style={heading}>WHAT WE DON'T COLLECT</div>
        <div style={body}>
          No background or continuous location. No contacts, no photo library beyond the images you
          choose to upload. No advertising identifiers, and no third-party ad or tracking networks.
          We don't sell your data, and we don't share it for advertising.
        </div>

        <div style={heading}>WHAT'S PUBLIC</div>
        <div style={body}>
          Your username, the meets you post, and your comments are visible to everyone. Your email
          address is never shown to other users. Your RSVPs are counted in the totals shown on a
          meet, but who RSVP'd is not published. The address of a private meet is only visible to
          its host and to people who have been let in.
        </div>

        <div style={heading}>WHO ELSE HANDLES IT</div>
        <div style={body}>
          <strong>Supabase</strong> stores the database, accounts and uploaded photos.{" "}
          <strong>Vercel</strong> hosts and serves the app. <strong>Mapbox</strong> renders maps —
          when a map loads, Mapbox receives the coordinates of the area being displayed. Each is a
          processor acting on our behalf, and each has its own privacy policy.
        </div>

        <div style={heading}>HOW LONG WE KEEP IT</div>
        <div style={body}>
          Your account data is kept until you delete your account. Reports of a meet are kept after
          the meet is gone so repeated problems can be spotted. Usage events are kept in aggregate.
        </div>

        <div style={heading}>DELETING YOUR ACCOUNT</div>
        <div style={body}>
          Profile → Delete account. It's immediate and can't be undone. Your profile, RSVPs,
          comments, follows and any meets you posted are removed. If you were a verified host, the
          host name is released.
        </div>

        <div style={heading}>YOUR CHOICES</div>
        <div style={body}>
          You can edit your username and city at any time, delete your own comments, block other
          accounts, decline the location prompt (the app works without it), and delete your account.
          If you'd like a copy of your data or have a question about any of this, email us and we'll
          sort it out.
        </div>

        <div style={heading}>CHILDREN</div>
        <div style={body}>
          TUNR isn't intended for anyone under 13, and we don't knowingly collect data from
          children. If you believe a child has created an account, email us and we'll remove it.
        </div>

        <div style={heading}>CHANGES</div>
        <div style={body}>
          If this policy changes in a way that matters, we'll say so in the app rather than quietly
          updating the date at the top.
        </div>

        <div style={heading}>CONTACT</div>
        <div style={body}>
          Questions about your data, or anything in this policy:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#FF4500" }}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </div>
  );
}
