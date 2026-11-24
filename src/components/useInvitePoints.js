import { useEffect, useState } from "react";
import { loadPointsSettings } from "../lib/points.js";
import { failWith } from "../lib/toast.js";

// The invite and welcome points admins set (points_settings), for wording
// like "you get +1 point when they check in". null until loaded.
export default function useInvitePoints() {
  const [pts, setPts] = useState(null);
  useEffect(() => {
    loadPointsSettings()
      .then((r) => setPts({ invite: Number(r.referral_points ?? 5), welcome: Number(r.welcome_points ?? 1) }))
      .catch(failWith("Couldn't load the points settings."));
  }, []);
  return pts;
}

// "+1 point" / "+2 points"
export const plusPoints = (n) => `+${n} point${n === 1 ? "" : "s"}`;
