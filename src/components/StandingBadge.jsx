import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
import { memberSince, standingLabel } from "../lib/standingText.js";
import StandingCard from "./StandingCard.jsx";

// "Member since …" and the "Top X% · Atlanta" badge on a profile (yours and
// other people's). Tap the badge for the full-screen card, which you can
// share (Instagram, messages) or save. Ranking rules: 113_member_standing.sql.

export async function loadStanding(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.rpc("profile_standing", { p_user: userId });
  if (error) throw new Error(withReason("Couldn't load the member ranking.", error));
  return data;
}

export default function StandingBadge({ userId, username, isMe = false, onToast }) {
  const [st, setSt] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSt(null);
    loadStanding(userId)
      .then(setSt)
      .catch((e) => console.warn(e.message));
  }, [userId]);

  if (!st) return null;
  const label = standingLabel(st);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {st.member_since && <span style={{ fontSize: 12.5, color: "var(--n-888888)", fontFamily: "'Barlow', sans-serif" }}>{memberSince(st.member_since)}</span>}
        {label && (
          <button
            onClick={() => setOpen(true)}
            aria-label={`${label}. Open the card`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #0080F0, #1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 900, letterSpacing: 0.6, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            🏁 {label}
          </button>
        )}
      </div>
      {open && <StandingCard st={st} username={username} isMe={isMe} onClose={() => setOpen(false)} onToast={onToast} />}
    </>
  );
}
