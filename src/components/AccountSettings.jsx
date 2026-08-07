import { useEffect, useState } from "react";
import { loadBlockedAccounts, unblockUser, deleteMyAccount, track } from "../lib/store.js";

const bodyStyle = {
  fontSize: 12.5,
  color: "#777",
  marginTop: 6,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

// Blocked accounts and account deletion. Both exist because an app with
// user-generated content and sign-up needs them; both are also just decent
// behaviour towards the person using it.
export default function AccountSettings({ user, onToast }) {
  const [blocked, setBlocked] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBlockedAccounts().then((rows) => !cancelled && setBlocked(rows));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function unblock(row) {
    await unblockUser(user.id, row.blocked_id);
    setBlocked((b) => b.filter((x) => x.blocked_id !== row.blocked_id));
    onToast(`Unblocked @${row.username}`);
  }

  async function destroy() {
    if (typed.trim().toUpperCase() !== "DELETE" || busy) return;
    setBusy(true);
    try {
      track("account_deleted", {});
      await deleteMyAccount();
      // signOut inside deleteMyAccount fires the auth listener, which resets
      // the app to signed-out on its own.
      onToast("Your account has been deleted");
    } catch (e) {
      onToast(e.message || "Couldn't delete the account.");
      setBusy(false);
    }
  }

  return (
    <>
      {blocked.length > 0 && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Blocked accounts · {blocked.length}</div>
          <div style={bodyStyle}>You won't see comments from these accounts.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {blocked.map((row) => (
              <div
                key={row.blocked_id}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>@{row.username}</div>
                <button
                  className="action-btn"
                  onClick={() => unblock(row)}
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    border: "1px solid #333",
                    borderRadius: 6,
                    color: "#888",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1,
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  UNBLOCK
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card danger>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#EF4444" }}>Delete account</div>
        {!confirming ? (
          <>
            <div style={bodyStyle}>
              Removes your profile, RSVPs, comments, follows and any meets you've posted. It can't
              be undone.
            </div>
            <button
              className="action-btn"
              onClick={() => setConfirming(true)}
              style={dangerButton}
            >
              DELETE MY ACCOUNT
            </button>
          </>
        ) : (
          <>
            <div style={{ ...bodyStyle, color: "#EF4444" }}>
              This is permanent. Type <strong>DELETE</strong> to confirm.
            </div>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: "100%",
                marginTop: 10,
                background: "#0F0F0F",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 8,
                padding: "11px 13px",
                color: "#F0F0F0",
                fontSize: 14,
                letterSpacing: 2,
                textAlign: "center",
                outline: "none",
                fontFamily: "'Barlow Condensed', sans-serif",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="action-btn"
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                }}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  borderRadius: 8,
                  color: "#888",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                CANCEL
              </button>
              <button
                className="action-btn"
                onClick={destroy}
                disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
                style={{
                  ...dangerButton,
                  marginTop: 0,
                  flex: 1,
                  opacity: typed.trim().toUpperCase() === "DELETE" ? 1 : 0.4,
                }}
              >
                {busy ? "DELETING…" : "DELETE FOREVER"}
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

const dangerButton = {
  width: "100%",
  marginTop: 12,
  padding: "11px 0",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.5)",
  borderRadius: 8,
  color: "#EF4444",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  fontFamily: "'Barlow Condensed', sans-serif",
};

function Card({ children, danger = false }) {
  return (
    <div
      style={{
        background: "#111",
        border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "#2A2A2A"}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
