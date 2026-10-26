import { useEffect, useRef } from "react";

const ITEM = 40; // px per row
const SHOWN = 5; // rows in view; the middle one is the pick

// A scroll wheel like the phone's own time picker: hour, minute, AM/PM.
// value: { hour: 1-12, minute: 0-55, ampm: "AM" | "PM" }. onChange gets only
// the part that moved ({ hour: 9 }), so two wheels spun at once don't undo
// each other.
export default function TimeWheel({ value, onChange, minuteStep = 5 }) {
  const hours = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => ({
    value: i * minuteStep,
    label: String(i * minuteStep).padStart(2, "0"),
  }));
  const halves = [
    { value: "AM", label: "AM" },
    { value: "PM", label: "PM" },
  ];
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 4, background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: "0 8px" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: ITEM * Math.floor(SHOWN / 2),
          height: ITEM,
          borderRadius: 8,
          background: "rgba(0, 128, 240,0.14)",
          border: "1px solid rgba(0, 128, 240,0.45)",
          pointerEvents: "none",
        }}
      />
      <Wheel label="Hour" items={hours} value={value.hour} onChange={(hour) => onChange({ hour })} />
      <div style={{ alignSelf: "center", color: "#3CABFD", fontSize: 22, fontWeight: 900, zIndex: 1 }}>:</div>
      <Wheel label="Minute" items={minutes} value={value.minute} onChange={(minute) => onChange({ minute })} />
      <Wheel label="AM or PM" items={halves} value={value.ampm} onChange={(ampm) => onChange({ ampm })} />
    </div>
  );
}

function Wheel({ label, items, value, onChange }) {
  const ref = useRef(null);
  const settle = useRef(null);
  const index = Math.max(0, items.findIndex((it) => it.value === value));

  // Follow the value when it changes from outside (or on first show).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM) !== index) el.scrollTop = index * ITEM;
  }, [index]);
  useEffect(() => () => clearTimeout(settle.current), []);

  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      onChange(items[i].value);
    }, 80);
  }

  function pick(i) {
    const next = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ top: next * ITEM, behavior: "smooth" });
    onChange(items[next].value);
  }

  const fade = "linear-gradient(to bottom, transparent, #000 35%, #000 65%, transparent)";
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") (e.preventDefault(), pick(index - 1));
        if (e.key === "ArrowDown") (e.preventDefault(), pick(index + 1));
      }}
      className="time-wheel"
      style={{
        width: 64,
        height: ITEM * SHOWN,
        overflowY: "auto",
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
        WebkitMaskImage: fade,
        maskImage: fade,
        outline: "none",
        zIndex: 1,
      }}
    >
      <div style={{ height: ITEM * Math.floor(SHOWN / 2) }} />
      {items.map((it, i) => (
        <div
          key={it.value}
          role="option"
          aria-selected={i === index}
          onClick={() => pick(i)}
          style={{
            height: ITEM,
            lineHeight: `${ITEM}px`,
            textAlign: "center",
            scrollSnapAlign: "center",
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: i === index ? 24 : 19,
            fontWeight: i === index ? 900 : 600,
            color: i === index ? "#FFFFFF" : "#777",
          }}
        >
          {it.label}
        </div>
      ))}
      <div style={{ height: ITEM * Math.floor(SHOWN / 2) }} />
    </div>
  );
}
