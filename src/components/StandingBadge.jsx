import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
import { memberSince, standingLabel } from "../lib/standingText.js";
import StandingCard, { slipTag } from "./StandingCard.jsx";

// "Member since …" and the class tag ("PRO STOCK · Atlanta") on a profile
// (yours and other people's). Tap the tag for the full time slip, which you
// can share or save. Ranking rules: 113_member_standing.sql.

export async function loadStanding(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.rpc("profile_standing", { p_user: userId });
  if (error) throw new Error(withReason("Couldn't load the member ranking.", error));
  return data;
}

// Your own counts for your slip (114). Never anyone else's.
export async function loadMyActivity() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_activity");
  if (error) throw new Error(withReason("Couldn't load your activity.", error));
  return data;
}

export default function StandingBadge({ userId, username, isMe = false, onToast }) {
  const [st, setSt] = useState(null);
  const [activity, setActivity] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSt(null);
    loadStanding(userId)
      .then(setSt)
      .catch((e) => console.warn(e.message));
  }, [userId]);

  const openSlip = () => {
    setOpen(true);
    if (isMe && !activity) {
      loadMyActivity()
        .then(setActivity)
        .catch((e) => onToast?.(e.message));
    }
  };

  if (!st) return null;
  const label = standingLabel(st);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {st.member_since && <span style={{ fontSize: 12.5, color: "var(--n-888888)", fontFamily: "'Barlow', sans-serif" }}>{memberSince(st.member_since)}</span>}
        {label && (
          <button onClick={openSlip} aria-label={`Class ${label}. Open the time slip`} style={slipTag}>
            🏁 {label.toUpperCase()}
          </button>
        )}
      </div>
      {open && <StandingCard st={st} activity={activity} username={username} isMe={isMe} onClose={() => setOpen(false)} onToast={onToast} />}
    </>
  );
}
