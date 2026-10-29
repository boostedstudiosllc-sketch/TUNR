import { useEffect, useState } from "react";
import { loadConnections, followPerson, removeFollower, track } from "../lib/store.js";

// Your followers and who you follow. Followers can be removed (they aren't
// told) or followed back; people you follow can be unfollowed.
export default function Connections({ user, initial = "followers", onClose, onToast, onOpenPerson, onChanged }) {
  const [tab, setTab] = useState(initial);
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function refresh(kind = tab) {
    setRows(await loadConnections(kind));
  }

  useEffect(() => {
    setRows(null);
    refresh(tab);
  }, [tab]);

  async function act(row, fn, message) {
    setBusyId(row.user_id);
    try {
      await fn();
      await refresh();
      onChanged && onChanged();
      onToast(message);
    } catch (e) {
      onToast(e.message || "Couldn't do that.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top)",
        bottom: 0,
        width: "100%",
        maxWidth: 430,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.88)",
        zIndex: 250,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "var(--n-0f0f0f)",
          borderRadius: "16px 16px 0 0",
          border: "1px solid var(--n-1e1e1e)",
          height: "75vh",
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 0.25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px 10px" }}>
          {[
            ["followers", "FOLLOWERS"],
            ["following", "FOLLOWING"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: 1.2,
                cursor: "pointer",
                background: tab === id ? "rgba(0, 128, 240,0.12)" : "var(--n-161616)",
                color: tab === id ? "#0080F0" : "var(--n-777777)",
                border: `1px solid ${tab === id ? "#0080F0" : "var(--n-2a2a2a)"}`,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "var(--n-1a1a1a)", border: "1px solid var(--n-2a2a2a)", color: "var(--n-ffffff)", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 24px" }}>
          {rows === null ? (
            <Muted>Loading…</Muted>
          ) : rows.length === 0 ? (
            <Muted>
              {tab === "followers"
                ? "No followers yet. People can follow you from your name in a meet chat."
                : "You're not following anyone yet. Tap a name in a meet chat to see their profile."}
            </Muted>
          ) : (
            rows.map((r) => (
              <div
                key={r.user_id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--n-1a1a1a)" }}
              >
                <button
                  onClick={() => onOpenPerson && onOpenPerson(r.user_id)}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg,#0080F0,#3CABFD)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {(r.username || "?")[0].toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--n-e6e6e6)" }}>@{r.username}</span>
                    {r.mutual && (
                      <span style={{ fontSize: 11, color: "var(--n-777777)", fontFamily: "'Barlow', sans-serif" }}>
                        {tab === "followers" ? "you follow each other" : "follows you"}
                      </span>
                    )}
                  </span>
                </button>
                {tab === "followers" ? (
                  <>
                    {!r.mutual && (
                      <SmallButton
                        primary
                        disabled={busyId === r.user_id}
                        onClick={() =>
                          act(r, () => followPerson(r.user_id, user.id, false), `Following @${r.username}`)
                        }
                      >
                        FOLLOW BACK
                      </SmallButton>
                    )}
                    <SmallButton
                      disabled={busyId === r.user_id}
                      onClick={() =>
                        act(
                          r,
                          async () => {
                            await removeFollower(r.user_id, user.id);
                            track("follower_removed", {});
                          },
                          `Removed @${r.username} from your followers`
                        )
                      }
                    >
                      REMOVE
                    </SmallButton>
                  </>
                ) : (
                  <SmallButton
                    disabled={busyId === r.user_id}
                    onClick={() => act(r, () => followPerson(r.user_id, user.id, true), `Unfollowed @${r.username}`)}
                  >
                    UNFOLLOW
                  </SmallButton>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SmallButton({ children, onClick, disabled, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 11px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.8,
        cursor: "pointer",
        flexShrink: 0,
        background: primary ? "#0080F0" : "transparent",
        color: primary ? "#fff" : "#999",
        border: primary ? "none" : "1px solid var(--n-333333)",
        fontFamily: "'Barlow Condensed', sans-serif",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Muted({ children }) {
  return (
    <div style={{ fontSize: 13, color: "var(--n-666666)", lineHeight: 1.6, padding: "18px 0", fontFamily: "'Barlow', sans-serif" }}>
      {children}
    </div>
  );
}
