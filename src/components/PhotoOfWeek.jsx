import { useEffect, useState } from "react";
import Sheet, { sheetTitle, muted, quietButton } from "./Sheet.jsx";
import { loadPhotoOfWeek, loadPhotoBallot, votePhoto } from "../lib/photoWeek.js";

// Photo of the week, on Discover: last week's winning meet photo, and the
// vote for this week's.

const daysLeft = (iso) => {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
  return d <= 1 ? "Voting ends tonight" : `Voting ends in ${d} days`;
};

export default function PhotoOfWeek({ user, onToast, onNeedAccount }) {
  const [winner, setWinner] = useState(undefined);
  const [ballot, setBallot] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    loadPhotoOfWeek()
      .then(setWinner)
      .catch((e) => {
        console.warn(e.message);
        setWinner(null);
      });
    loadPhotoBallot()
      .then(setBallot)
      .catch((e) => console.warn(e.message));
  }, [user?.id]);

  const count = ballot?.photos?.length || 0;
  if (winner === undefined || (!winner && !count)) return null;
  return (
    <div style={{ padding: "0 20px 12px" }}>
      <button
        onClick={() => setOpen(true)}
        className="action-btn"
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 10, borderRadius: 14, border: "1px solid var(--n-3b2f0b)", background: "linear-gradient(135deg, rgba(234,179,8,0.14), rgba(13,13,13,0.4))", color: "var(--n-f0f0f0)", cursor: "pointer", textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {winner ? (
          <img src={winner.photo_url} alt={winner.caption || `Photo of the week by @${winner.username}`} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flexShrink: 0, border: "2px solid #EAB308" }} />
        ) : (
          <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 10, flexShrink: 0, background: "var(--n-1a1a1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
            📸
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#FACC15" }}>📸 PHOTO OF THE WEEK</span>
          {winner ? (
            <>
              <span style={{ display: "block", fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{winner.username}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--n-9aa4b2)", fontFamily: "'Barlow', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[winner.event_title, `${winner.votes} vote${winner.votes === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>Pick this week's best shot</span>
          )}
        </span>
        {count > 0 && <span style={{ padding: "6px 12px", borderRadius: 8, background: "#EAB308", color: "#111", fontSize: 13, fontWeight: 900, letterSpacing: 1, flexShrink: 0 }}>VOTE</span>}
      </button>
      {open && (
        <BallotSheet
          user={user}
          winner={winner}
          ballot={ballot}
          onBallot={setBallot}
          onToast={onToast}
          onNeedAccount={onNeedAccount}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function BallotSheet({ user, winner, ballot, onBallot, onToast, onNeedAccount, onClose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const photos = ballot?.photos || [];

  async function vote(photo) {
    if (!user) return onNeedAccount?.();
    if (photo.mine || busy || ballot.my_vote === photo.id) return;
    setBusy(photo.id);
    setError("");
    try {
      await votePhoto(photo.id);
      const prev = ballot.my_vote;
      // Move the vote here without waiting for a reload.
      onBallot({
        ...ballot,
        my_vote: photo.id,
        photos: photos.map((p) => ({ ...p, votes: p.votes + (p.id === photo.id ? 1 : 0) - (p.id === prev ? 1 : 0) })),
      });
      onToast?.(prev ? "Vote moved 📸" : "Voted 📸");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet onClose={onClose} label="Photo of the week" zIndex={340} portal>
      <div style={sheetTitle}>📸 PHOTO OF THE WEEK</div>
      {winner && (
        <figure style={{ margin: "10px 0 0" }}>
          <img src={winner.photo_url} alt={winner.caption || `Last week's winner by @${winner.username}`} style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12, border: "2px solid #EAB308" }} />
          <figcaption style={{ ...muted, marginTop: 6 }}>
            <b style={{ color: "#FACC15" }}>Last week's winner: @{winner.username}</b>
            {winner.event_title ? ` at ${winner.event_title}` : ""} · {winner.votes} vote{winner.votes === 1 ? "" : "s"}
            {winner.caption ? <span style={{ display: "block", color: "var(--n-bbbbbb)" }}>"{winner.caption}"</span> : null}
          </figcaption>
        </figure>
      )}
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "var(--n-8a94a3)", marginTop: 16 }}>THIS WEEK</div>
      <div style={{ ...muted, marginTop: 2 }}>
        {photos.length ? `Tap your favourite. One vote a week, and you can move it. ${ballot.ends_at ? daysLeft(ballot.ends_at) + "." : ""} The winner gets points.` : "No meet photos yet this week. Post some from a meet you went to."}
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 6 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        {photos.map((p) => {
          const picked = ballot.my_vote === p.id;
          return (
            <button
              key={p.id}
              onClick={() => vote(p)}
              aria-pressed={picked}
              aria-label={`${p.mine ? "Your photo" : `Vote for @${p.username}'s photo`}${p.event_title ? ` at ${p.event_title}` : ""}, ${p.votes} vote${p.votes === 1 ? "" : "s"}`}
              style={{ position: "relative", padding: 0, border: `2px solid ${picked ? "#EAB308" : "var(--n-262626)"}`, borderRadius: 12, overflow: "hidden", background: "var(--n-111111)", cursor: p.mine ? "default" : "pointer", aspectRatio: "1", opacity: busy && busy !== p.id ? 0.6 : 1 }}
            >
              <img src={p.photo_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", display: "flex", alignItems: "center", gap: 6, color: "var(--n-ffffff)", fontSize: 12, textAlign: "left", fontFamily: "'Barlow', sans-serif" }}>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.mine ? "Yours" : `@${p.username}`}</span>
                <span style={{ fontWeight: 900, color: picked ? "#FACC15" : "var(--n-ffffff)" }}>{picked ? "★" : "☆"} {p.votes}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={onClose} style={{ ...quietButton, marginTop: 14, padding: "11px 0" }}>
        DONE
      </button>
    </Sheet>
  );
}
