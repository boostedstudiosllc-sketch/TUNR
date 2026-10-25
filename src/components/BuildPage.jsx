import { useEffect, useState } from "react";
import { loadBuildPage, recordCarScan } from "../lib/buildpage.js";
import { getPerson, followPerson } from "../lib/store.js";
import { Avatar } from "./EditProfile.jsx";
import Sheet, { muted, bigButton, quietButton } from "./Sheet.jsx";

// What a "Scan my build" sticker opens: the car, its build notes and its
// owner. Works for people without an account; they're invited to join.
export default function BuildPage({ vehicleId, user, onClose, onOpenPerson, onJoin, onToast }) {
  const [car, setCar] = useState(undefined); // undefined = loading, null = not available
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBuildPage(vehicleId)
      .then((c) => {
        if (!alive) return;
        setCar(c);
        if (c && !c.is_mine) recordCarScan(vehicleId);
      })
      .catch((e) => alive && (setError(e.message), setCar(null)));
    return () => {
      alive = false;
    };
  }, [vehicleId, user?.id]);

  useEffect(() => {
    if (!user || !car?.owner?.id || car.is_mine) return;
    getPerson(car.owner.id)
      .then((p) => setFollowing(Boolean(p?.i_follow)))
      .catch((e) => console.warn(e.message));
  }, [user?.id, car?.owner?.id]);

  async function toggleFollow() {
    if (!user) return onJoin();
    setBusy(true);
    try {
      await followPerson(car.owner.id, user.id, following);
      setFollowing(!following);
      onToast(following ? `Unfollowed @${car.owner.username}` : `Following @${car.owner.username}`);
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const name = car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : "";
  const owner = car?.owner;

  return (
    <Sheet onClose={onClose} label="Build page" zIndex={299}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#FF7A00" }}>🔳 SCAN MY BUILD</div>
      {car === undefined && <div style={{ ...muted, marginTop: 14 }}>Loading the build…</div>}
      {car === null && (
        <div style={{ ...muted, marginTop: 14 }}>
          {error || "This build page is private or the car was removed. Its owner can turn the page on from their garage in TUNR."}
        </div>
      )}
      {car && (
        <>
          {car.photo_url ? (
            <img
              src={car.photo_url}
              alt={name}
              style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, marginTop: 10, background: "#161616" }}
            />
          ) : (
            <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 12, marginTop: 10, background: "#161616", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
              🚗
            </div>
          )}
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.4, marginTop: 12, lineHeight: 1.1 }}>{name}</div>
          {car.build_notes ? (
            <div style={{ ...muted, color: "#DDD", marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{car.build_notes}</div>
          ) : (
            <div style={{ ...muted, marginTop: 8 }}>No build notes yet.</div>
          )}

          {owner?.username && (
            <button
              onClick={() => onOpenPerson(owner.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                marginTop: 16,
                padding: "12px",
                background: "#121212",
                border: "1px solid #222",
                borderRadius: 12,
                color: "#F0F0F0",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              <Avatar url={owner.avatar_url} name={owner.username} size={44} ring={Boolean(owner.profile_color)} ringColor={owner.profile_color || undefined} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 11, color: "#888", letterSpacing: 1.2, fontWeight: 800 }}>OWNER</span>
                <span style={{ display: "block", fontSize: 17, fontWeight: 900, color: owner.profile_color || undefined }}>@{owner.username}</span>
                <span style={{ display: "block", ...muted, fontSize: 12 }}>
                  {[owner.city, car.other_cars ? `${car.other_cars} more car${car.other_cars === 1 ? "" : "s"} in their garage` : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: "#666" }}>›</span>
            </button>
          )}

          {car.is_mine ? (
            <div style={{ ...muted, marginTop: 14, color: "#FACC15" }}>
              This is your car's public page{car.public_page ? "" : " (turned off, so only you can see it)"}. Scans
              by other people show up in your garage.
            </div>
          ) : user ? (
            <button className="action-btn" disabled={busy} onClick={toggleFollow} style={{ ...(following ? quietButton : bigButton), marginTop: 14 }}>
              {following ? "✓ FOLLOWING" : `FOLLOW @${(owner?.username || "").toUpperCase()}`}
            </button>
          ) : (
            <>
              <button className="action-btn" onClick={onJoin} style={{ ...bigButton, marginTop: 14 }}>
                JOIN TUNR FREE
              </button>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 8 }}>
                TUNR is the app for Georgia car meets: find meets, RSVP, check in for points, and follow builds like
                this one.
              </div>
            </>
          )}
          <button className="action-btn" onClick={onClose} style={{ ...quietButton, marginTop: 8 }}>
            SEE MEETS NEAR YOU
          </button>
        </>
      )}
    </Sheet>
  );
}
