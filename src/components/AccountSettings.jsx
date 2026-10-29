import { useEffect, useState } from "react";
import {
  loadBlockedAccounts,
  unblockUser,
  loadRestrictedAccounts,
  restrictUser,
  deleteMyAccount,
  track,
} from "../lib/store.js";

const bodyStyle = {
  fontSize: 12.5,
  color: "var(--n-777777)",
  marginTop: 6,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

const smallButton = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid var(--n-333333)",
  borderRadius: 6,
  color: "var(--n-888888)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  fontFamily: "'Barlow Condensed', sans-serif",
};

// Blocked accounts, restricted accounts and account deletion. They exist
// because an app with user-generated content and sign-up needs them; they're
// also just decent behaviour towards the person using it. Settings shows each
// on its own page; the default export still renders all three together.
export default function AccountSettings({ user, onToast }) {
  return (
    <>
      <RestrictedAccounts user={user} onToast={onToast} />
      <BlockedAccounts user={user} onToast={onToast} />
      <DeleteAccount onToast={onToast} />
    </>
  );
}

// showEmpty: render the card even with nobody on the list (Settings' own page).
export function RestrictedAccounts({ user, onToast, showEmpty = false }) {
  const [restricted, setRestricted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadRestrictedAccounts()
      .then((rows) => !cancelled && setRestricted(rows))
      .catch((e) => {
        if (cancelled) return;
        setRestricted([]);
        onToast(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function unrestrict(row) {
    try {
      await restrictUser(user.id, row.restricted_id, false);
      setRestricted((r) => r.filter((x) => x.restricted_id !== row.restricted_id));
      onToast(`Unrestricted @${row.username}`);
    } catch (e) {
      onToast(e.message);
    }
  }

  if (!restricted) return showEmpty ? <Card><div style={bodyStyle}>Loading…</div></Card> : null;
  if (restricted.length === 0 && !showEmpty) return null;

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 800 }}>
        Restricted accounts{restricted.length > 0 && ` · ${restricted.length}`}
      </div>
      <div style={bodyStyle}>
        On meets you host, their messages are seen only by them, you and your co-hosts.
      </div>
      {restricted.length === 0 ? (
        <div style={{ ...bodyStyle, color: "var(--n-999999)" }}>
          You haven't restricted anyone. To restrict someone, open their profile and tap ⋯.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {restricted.map((row) => (
            <div key={row.restricted_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>@{row.username}</div>
              <button className="action-btn" onClick={() => unrestrict(row)} style={smallButton}>
                UNRESTRICT
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BlockedAccounts({ user, onToast, showEmpty = false }) {
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadBlockedAccounts()
      .then((rows) => !cancelled && setBlocked(rows))
      .catch((e) => {
        if (cancelled) return;
        setBlocked([]);
        onToast(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function unblock(row) {
    try {
      await unblockUser(user.id, row.blocked_id);
      setBlocked((b) => b.filter((x) => x.blocked_id !== row.blocked_id));
      onToast(`Unblocked @${row.username}`);
    } catch (e) {
      onToast(e.message);
    }
  }

  if (!blocked) return showEmpty ? <Card><div style={bodyStyle}>Loading…</div></Card> : null;
  if (blocked.length === 0 && !showEmpty) return null;

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 800 }}>
        Blocked accounts{blocked.length > 0 && ` · ${blocked.length}`}
      </div>
      <div style={bodyStyle}>
        You won't see their messages, they can't message on your meets, and they can't follow you.
      </div>
      {blocked.length === 0 ? (
        <div style={{ ...bodyStyle, color: "var(--n-999999)" }}>
          You haven't blocked anyone. To block someone, open their profile and tap ⋯.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {blocked.map((row) => (
            <div key={row.blocked_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>@{row.username}</div>
              <button className="action-btn" onClick={() => unblock(row)} style={smallButton}>
                UNBLOCK
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Permanent, so it asks for DELETE to be typed first.
export function DeleteAccount({ onToast }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

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
    <Card danger>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--a-ef4444)" }}>Delete account</div>
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
          <div style={{ ...bodyStyle, color: "var(--a-ef4444)" }}>
            This is permanent. Type <strong>DELETE</strong> to confirm.
          </div>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: "100%",
              marginTop: 10,
              background: "var(--n-0f0f0f)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 8,
              padding: "11px 13px",
              color: "var(--n-f0f0f0)",
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
                background: "var(--n-1a1a1a)",
                border: "1px solid var(--n-2a2a2a)",
                borderRadius: 8,
                color: "var(--n-888888)",
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
  );
}

const dangerButton = {
  width: "100%",
  marginTop: 12,
  padding: "11px 0",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.5)",
  borderRadius: 8,
  color: "var(--a-ef4444)",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  fontFamily: "'Barlow Condensed', sans-serif",
};

function Card({ children, danger = false }) {
  return (
    <div
      style={{
        background: "var(--n-111111)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "var(--n-2a2a2a)"}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
