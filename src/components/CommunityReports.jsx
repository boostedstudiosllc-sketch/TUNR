import { useEffect, useState } from "react";
import { loadCommunityReports, resolveCommunityReport, ago } from "../lib/community.js";

const TYPE = { post: "📝 Post", comment: "💬 Comment", forum: "🗂 Forum", club: "🏁 Club", profile: "👤 Profile" };

// Admins: reported forum posts, comments, forums and clubs. Remove hides it;
// dismiss clears the report.
export default function CommunityReports({ onToast, onOpenLink }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    loadCommunityReports()
      .then(setRows)
      .catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  async function resolve(r, action) {
    try {
      await resolveCommunityReport(r.target_type, r.target_id, action);
      onToast(action === "remove" ? "Removed" : "Dismissed");
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  // One row per reported thing, newest report first.
  const seen = new Set();
  const items = (rows || []).filter((r) => {
    const k = `${r.target_type}:${r.target_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 10, padding: "14px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>Community reports {items.length > 0 && <span style={{ color: "#FF4500" }}>({items.length})</span>}</div>
      {error && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>{error}</div>}
      {rows && items.length === 0 && <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontFamily: "'Barlow', sans-serif" }}>Nothing reported in forums or clubs.</div>}
      {items.map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid #1E1E1E", marginTop: 10, paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: "#888" }}>
            {TYPE[r.target_type]} · {r.reports} {r.reports === 1 ? "report" : "reports"} · {ago(r.created_at)} · by @{r.reporter}
          </div>
          <button onClick={() => r.link && onOpenLink(r.link)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: "#E6E6E6", fontSize: 13.5, fontWeight: 700, marginTop: 3, cursor: "pointer" }}>
            {r.preview || "(already gone)"} ›
          </button>
          <div style={{ fontSize: 12, color: "#C9A46A", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>“{r.reason}”</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => resolve(r, "remove")} style={btn("#EF4444")}>REMOVE</button>
            <button onClick={() => resolve(r, "dismiss")} style={btn("#888")}>DISMISS</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const btn = (color) => ({
  flex: 1,
  padding: "8px 0",
  background: "#1A1A1A",
  border: `1px solid ${color}55`,
  borderRadius: 6,
  color,
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: 1,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
});
