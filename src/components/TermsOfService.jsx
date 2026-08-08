import { useState } from "react";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "../lib/contact.js";

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
const warn = {
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 8,
  padding: "10px 14px",
  margin: "10px 0",
  fontFamily: "'Barlow', sans-serif",
  fontSize: 13,
  color: "#EF4444",
  lineHeight: 1.6,
};

export default function TermsOfService({ onAccept, onClose, readOnly = false }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

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
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              TUN<span style={{ color: "#FF4500" }}>R</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Terms of Service</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>
              {readOnly ? "You accepted these terms" : "Please read before continuing"}
            </div>
          </div>
          {readOnly && (
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        onScroll={(e) => {
          const el = e.target;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setScrolledToEnd(true);
        }}
        style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}
      >
        <div style={body}>
          Welcome to TUNR. TUNR is operated by {LEGAL_ENTITY} ("we", "us"). By using this app you
          agree to the following terms.
          <br />
          <br />
          <strong>You must be 13 or older to use TUNR.</strong> If you're under 13, don't create an
          account. If we learn an account belongs to someone under 13 we'll remove it.
        </div>
        <div style={warn}>
          ⚠️ TUNR is a discovery platform only. We do not organize or endorse any listed event.
          Attending any event is at your own risk.
        </div>

        <div style={heading}>1. ILLEGAL ACTIVITY — ZERO TOLERANCE</div>
        <div style={body}>
          TUNR has a strict zero-tolerance policy for illegal activity. You agree not to use TUNR to
          organize, promote, or participate in:
        </div>
        <div style={warn}>
          🚫 Street racing, drag racing, or illegal racing on public roads
          <br />
          🚫 Reckless driving, burnouts, or stunt driving in public spaces
          <br />
          🚫 Takeovers, sideshows, or activities that block public roads
          <br />
          🚫 Threatening or harassing any person or group
          <br />
          🚫 Any activity that violates federal, state, or local law
        </div>
        <div style={body}>
          Any meet listing promoting illegal activity will be removed. Hosts found in violation will
          be permanently banned.
        </div>

        <div style={heading}>2. HOST RESPONSIBILITY</div>
        <div style={body}>
          If you post a meet you are the sole organizer and fully responsible for that event. TUNR
          accepts no liability for anything that occurs at a listed event. You must have permission
          to use the listed venue and will not encourage dangerous driving of any kind.
        </div>

        <div style={heading}>3. EVENT LISTINGS & ACCURACY</div>
        <div style={body}>
          Listings may be sourced from public event pages, community submissions, or hosts. Details
          can change or be inaccurate — always confirm with the host before traveling. Listings
          marked "Community Sourced" have not been verified.
        </div>

        <div style={heading}>4. USER CONDUCT</div>
        <div style={body}>
          You agree not to post hateful, threatening, sexually explicit, or defamatory content. TUNR
          reserves the right to remove any content and restrict any user at any time.
        </div>

        <div style={heading}>5. YOUR CONTENT</div>
        <div style={body}>
          Anything you post — meet listings, comments, photos — stays yours. By posting it you give
          us permission to display, store, resize and share it inside TUNR and in links to TUNR, for
          as long as you keep it up. Delete the content or your account and that permission ends.
          <br />
          <br />
          You promise that what you upload is yours to upload: your own photo, or one you have the
          rights to. Don't post a flyer, photo or logo you don't have permission to use.
        </div>

        <div style={heading}>6. COPYRIGHT &amp; TAKEDOWN</div>
        <div style={body}>
          If something on TUNR infringes your copyright, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#FF4500" }}>
            {CONTACT_EMAIL}
          </a>{" "}
          with: what work was copied, where it appears in TUNR, your contact details, a statement
          that you believe in good faith the use isn't authorised, a statement that your notice is
          accurate and that you're the rights holder or authorised to act for them, and your
          signature. We remove infringing material promptly.
          <br />
          <br />
          If your content was removed and you believe that was a mistake, you can send a counter
          notice to the same address. Accounts that repeatedly infringe are terminated.
        </div>

        <div style={heading}>7. RELEASE OF LIABILITY</div>
        <div style={body}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL_ENTITY.toUpperCase()}, ITS OWNERS,
          EMPLOYEES AND AGENTS ARE NOT LIABLE FOR ANY INJURY, DEATH, PROPERTY DAMAGE, OR OTHER HARM
          ARISING FROM YOUR USE OF THIS APP OR ATTENDANCE AT ANY LISTED EVENT. YOU ATTEND ANY EVENT
          AT YOUR SOLE RISK.
        </div>

        <div style={heading}>8. REPORTING</div>
        <div style={body}>
          If you witness illegal activity at a TUNR-listed meet, report it to local law enforcement
          immediately. TUNR will cooperate fully with law enforcement investigations.
          <br />
          <br />
          Inside the app, use Report on any meet to flag a listing, and block on any comment to stop
          hearing from an account. Reported content is reviewed within 24 hours and removed if it
          breaks these terms.
        </div>

        <div style={heading}>9. CONTACT</div>
        <div style={body}>
          TUNR is operated by {LEGAL_ENTITY}. Questions, complaints, or anything that needs a
          human:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#FF4500" }}>
            {CONTACT_EMAIL}
          </a>
        </div>
        <div style={{ height: 40 }} />
      </div>

      {!readOnly && (
        <div
          style={{
            padding: "16px 20px 32px",
            borderTop: "1px solid #1A1A1A",
            flexShrink: 0,
            background: "#0A0A0A",
          }}
        >
          {!scrolledToEnd && (
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                color: "#444",
                fontFamily: "'Barlow', sans-serif",
                marginBottom: 10,
              }}
            >
              ↑ Scroll to read all terms
            </div>
          )}
          <button
            className="action-btn"
            onClick={onAccept}
            style={{
              width: "100%",
              padding: "16px 0",
              background: "#FF4500",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: 2,
              boxShadow: "0 4px 24px rgba(255,69,0,0.4)",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            I AGREE — LET'S GO 🔥
          </button>
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#333",
              fontFamily: "'Barlow', sans-serif",
              marginTop: 10,
            }}
          >
            By tapping agree you confirm you are 16 or older
          </div>
        </div>
      )}
    </div>
  );
}
