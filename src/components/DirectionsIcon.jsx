// The directions sign maps apps use: a diamond with a turn arrow. Takes the
// text color around it.
export default function DirectionsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <path d="M12 1.6 22.4 12 12 22.4 1.6 12Z" fill="currentColor" />
      <path d="M8.4 16.2v-3.6a2 2 0 0 1 2-2h4.2" fill="none" stroke="#0A0A0A" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12.8 8 2.6 2.6-2.6 2.6" fill="none" stroke="#0A0A0A" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
