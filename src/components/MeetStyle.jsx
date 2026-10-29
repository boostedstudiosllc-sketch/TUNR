// Open meet or showcase meet: the picker hosts use when posting or editing,
// and the banner on a showcase meet's page.

export const MEET_STYLES = [
  { id: "open", icon: "🚗", label: "OPEN MEET", sub: "Every car welcome" },
  { id: "showcase", icon: "✨", label: "SHOWCASE", sub: "Nicer cars on display" },
];

export function MeetStylePicker({ style, note, onStyle, onNote, labelStyle, inputStyle }) {
  return (
    <div>
      <div style={labelStyle}>MEET STYLE</div>
      <div style={{ display: "flex", gap: 8 }}>
        {MEET_STYLES.map((m) => {
          const on = style === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => onStyle(m.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 8,
                background: on ? (m.id === "showcase" ? "rgba(250,204,21,0.08)" : "rgba(0, 128, 240,0.1)") : "var(--n-161616)",
                border: `1.5px solid ${on ? (m.id === "showcase" ? "#FACC15" : "#0080F0") : "var(--n-2a2a2a)"}`,
                color: on ? (m.id === "showcase" ? "#FACC15" : "var(--a-3cabfd)") : "var(--n-999999)",
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.8 }}>
                {m.icon} {m.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--n-777777)", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>{m.sub}</div>
            </button>
          );
        })}
      </div>
      {style === "showcase" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--n-999999)", lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>
            A curated lineup: modified, exotic, classic or show-quality cars. Spectators are always welcome;
            cars that don't qualify park in regular parking.
          </div>
          <input
            style={{ ...inputStyle, marginTop: 8 }}
            maxLength={200}
            placeholder="What qualifies? e.g. Built or exotic only, no daily drivers"
            aria-label="What qualifies for the showcase"
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

export function ShowcaseBanner({ note }) {
  return (
    <div
      style={{
        marginTop: 12,
        background: "linear-gradient(180deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02))",
        border: "1px solid var(--n-4a3a00)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.6, color: "#FACC15" }}>✨ SHOWCASE MEET</div>
      <div style={{ fontSize: 13, color: "var(--n-bbbbbb)", lineHeight: 1.55, marginTop: 4, fontFamily: "'Barlow', sans-serif" }}>
        A curated lineup of nicer cars. Spectators are welcome; if your car doesn't qualify, park in
        regular parking and come check them out.
      </div>
      {note && (
        <div style={{ fontSize: 13.5, color: "var(--n-f0f0f0)", marginTop: 8, fontFamily: "'Barlow', sans-serif" }}>
          <b style={{ color: "#FACC15" }}>What qualifies:</b> {note}
        </div>
      )}
    </div>
  );
}
