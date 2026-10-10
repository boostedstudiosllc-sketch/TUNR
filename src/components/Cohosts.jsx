import { useEffect, useState } from "react";
import {
  inviteCohost,
  loadEventCohosts,
  removeCohost,
  loadMyCohostInvites,
  respondCohostInvite,
  track,
} from "../lib/store.js";

const INVITE_RESULT = {
  invited: "Invite sent — it shows up on their Profile tab.",
  no_such_user: "No TUNR account has that username.",
  self: "That's you — you already run this meet.",
  reserved: "That name belongs to a verified host's account — ask them for their current username.",
  already: "They're already on this meet.",
  limit: "A meet can have up to five co-hosts.",
  not_owner: "Only the person who posted the meet can invite co-hosts.",
  not_found: "That meet is gone.",
};

// Inside EditMeet. The owner invites and removes; a co-host sees the list
// and can step down. Co-hosts can edit details but can't manage this list.
export function CohostsSection({ event, user, onToast, onChanged, onSteppedDown }) {
  const [rows, setRows] = useState([]);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = Boolean(event.submittedByUser);

  async function refresh() {
    setRows(await loadEventCohosts(event.id));
  }

  useEffect(() => {
    refresh();
  }, [event.id]);

  async function invite() {
    const name = username.trim().replace(/^@/, "").toLowerCase();
    if (!name || busy) return;
    setBusy(true);
    try {
      const result = await inviteCohost(event.id, name);
      onToast(INVITE_RESULT[result] || "Couldn't send that invite.");
      if (result === "invited") {
        track("cohost_invited", { eventId: event.id });
        setUsername("");
        await refresh();
      }
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    try {
      await removeCohost(row.id);
      if (row.user_id === user?.id) {
        onToast("You've stepped down as co-host");
        // Their edit rights are gone: close the editor and reload the meet.
        onSteppedDown && onSteppedDown();
        return;
      }
      await refresh();
      if (row.status === "accepted") onChanged && onChanged();
    } catch (e) {
      onToast(e.message);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={sectionLabel}>CO-HOSTS</div>
      <div style={hint}>
        {isOwner
          ? "Crews running this meet with you. Co-hosts can edit the details and approve requests; only you can delete the meet or change who's on this list."
          : "You're a co-host: you can edit the details and approve requests."}
      </div>

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {rows.map((row) => (
            <div key={row.id} style={rowStyle}>
              <span style={{ flex: 1, color: "#DDD" }}>
                @{row.host}
                {row.status === "invited" && <span style={{ color: "#777" }}> · invite pending</span>}
              </span>
              {(isOwner || row.user_id === user?.id) && (
                <button onClick={() => remove(row)} style={smallButton}>
                  {row.user_id === user?.id ? "STEP DOWN" : "REMOVE"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") invite();
            }}
            placeholder="@their_username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={inputStyle}
          />
          <button
            className="action-btn"
            onClick={invite}
            disabled={busy || !username.trim()}
            style={{
              ...smallButton,
              padding: "0 14px",
              background: username.trim() ? "#FF4500" : "transparent",
              color: username.trim() ? "#fff" : "#555",
              border: `1px solid ${username.trim() ? "#FF4500" : "#2A2A2A"}`,
            }}
          >
            {busy ? "…" : "INVITE"}
          </button>
        </div>
      )}
    </div>
  );
}

// Profile tab: invites waiting on this account.
export function CohostInvites({ user, onToast, onChanged }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setRows(await loadMyCohostInvites(user.id));
  }

  useEffect(() => {
    refresh();
  }, [user.id]);

  async function answer(row, accept) {
    setBusyId(row.id);
    try {
      const result = await respondCohostInvite(row.id, accept);
      if (result === "accepted") {
        track("cohost_accepted", { eventId: row.event_id });
        onToast(`You're co-hosting ${row.event?.title || "the meet"}`);
        onChanged && onChanged();
      } else if (result === "reserved") {
        onToast("That invite can't be accepted under your current username.");
      } else if (result === "declined") {
        onToast("Invite declined");
      } else {
        onToast("That invite is gone.");
      }
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!rows.length) return null;

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Co-host invites · {rows.length}</div>
      <div style={hint}>Accept and the meet shows on your host page, and you can edit it and approve requests.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ ...rowStyle, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{row.event?.title || "A meet"}</div>
              {row.event && (
                <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                  @{row.event.host} · {row.event.city}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => answer(row, true)}
                style={{ ...smallButton, flex: 1, color: "#10B981", border: "1px solid #10B981" }}
              >
                ACCEPT
              </button>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => answer(row, false)}
                style={{ ...smallButton, flex: 1 }}
              >
                DECLINE
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card = {
  background: "#111",
  border: "1px solid #FF4500",
  borderRadius: 10,
  padding: "16px 18px",
  marginBottom: 12,
};

const sectionLabel = {
  fontSize: 10.5,
  color: "#666",
  letterSpacing: 1.4,
  fontWeight: 700,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const hint = {
  fontSize: 12.5,
  color: "#777",
  marginTop: 6,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "#0F0F0F",
  border: "1px solid #242424",
  borderRadius: 8,
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "'Barlow', sans-serif",
};

const smallButton = {
  padding: "7px 10px",
  background: "transparent",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#888",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};

const inputStyle = {
  flex: 1,
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#F0F0F0",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};
