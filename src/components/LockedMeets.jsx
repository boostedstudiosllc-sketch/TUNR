import MeetCard from "./MeetCard.jsx";
import SignInForm from "./SignInForm.jsx";

// Blurred preview of the meets behind the sign-in wall, with the prompt
// overlaid on top.
export default function LockedMeets({ events, lockedCount, onError }) {
  return (
    <div style={{ position: "relative" }}>
      {/* Blurred, non-interactive teaser cards */}
      <div
        aria-hidden="true"
        style={{
          filter: "blur(7px)",
          opacity: 0.5,
          pointerEvents: "none",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: 420,
          overflow: "hidden",
        }}
      >
        {events.slice(0, 3).map((event) => (
          <MeetCard
            key={event.id}
            event={event}
            rsvp={null}
            onOpen={() => {}}
            onRsvp={() => {}}
          />
        ))}
      </div>

      {/* Fade into the page background at the bottom */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(10,10,10,0.35) 0%, #0A0A0A 82%)",
          pointerEvents: "none",
        }}
      />

      {/* Sign-in prompt */}
      <div
        style={{
          position: "absolute",
          top: 26,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: "0 4px",
        }}
      >
        <div
          style={{
            width: "100%",
            background: "rgba(17,17,17,0.97)",
            border: "1px solid #FF4500",
            borderRadius: 14,
            padding: "22px 20px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 8 }}>🔒</div>
          <div
            style={{
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: 0.4,
              fontFamily: "'Barlow Condensed', sans-serif",
              lineHeight: 1.15,
            }}
          >
            {lockedCount} MORE {lockedCount === 1 ? "MEET" : "MEETS"} NEAR YOU
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
            Sign in free to unlock every meet, RSVP, save the ones you want, and post your own.
          </div>
          <SignInForm onError={onError} />
        </div>
      </div>
    </div>
  );
}
