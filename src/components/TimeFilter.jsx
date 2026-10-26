// When to look: a preset, or a custom date and time range (Atlanta time).
export const TIME_PRESETS = [
  { id: "any", label: "ANY TIME" },
  { id: "now", label: "ON NOW" },
  { id: "2h", label: "NEXT 2 HRS" },
  { id: "tonight", label: "TONIGHT" },
  { id: "tomorrow", label: "TOMORROW" },
  { id: "weekend", label: "WEEKEND" },
  { id: "custom", label: "PICK A TIME" },
];

export default function TimeFilter({ value, onChange }) {
  const { preset, custom } = value;
  const setCustom = (field) => (e) => onChange({ preset: "custom", custom: { ...custom, [field]: e.target.value } });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {TIME_PRESETS.map((p) => (
          <button
            key={p.id}
            className="filter-pill"
            onClick={() => onChange({ preset: p.id, custom })}
            aria-pressed={preset === p.id}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: preset === p.id ? "#0080F0" : "#161616",
              color: preset === p.id ? "#fff" : "#888",
              border: `1px solid ${preset === p.id ? "#0080F0" : "#2A2A2A"}`,
              fontFamily: "'Barlow Condensed', sans-serif",
              flexShrink: 0,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
          <input type="date" value={custom.date} onChange={setCustom("date")} aria-label="Date" style={{ ...field, flex: 1.25 }} />
          <input type="time" value={custom.from} onChange={setCustom("from")} aria-label="From" style={{ ...field, flex: 1 }} />
          <span style={{ color: "#555", fontSize: 12 }}>–</span>
          <input type="time" value={custom.to} onChange={setCustom("to")} aria-label="To" style={{ ...field, flex: 1 }} />
        </div>
      )}
    </div>
  );
}

const field = {
  minWidth: 0,
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "8px 4px",
  color: "#F0F0F0",
  fontSize: 12.5,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  colorScheme: "dark",
};
