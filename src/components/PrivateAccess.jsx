import { useEffect, useState } from "react";
import {
  redeemPasscode,
  requestToJoin,
  loadJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  track,
} from "../lib/store.js";
import { isCompletePasscode, normalizePasscode, redeemMessage } from "../lib/passcode.js";

// Two faces of the same thing: the gate a locked-out visitor sees, and the
// host's panel for handing out access. Rendered from MeetDetail.
export default function PrivateAccess({ event, user, onNeedAccount, onToast, onJoined }) {
  if (event.locked) {
    return <AccessGate event={event} user={user} onNeedAccount={onNeedAccount} onToast={onToast} onJoined={onJoined} />;
  }
  if (event.visibility === "private" && event.submittedByUser) {
    return <HostPanel event={event} onToast={onToast} />;
  }
  return null;
}

function AccessGate({ event, user, onNeedAccount, onToast, onJoined }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(event.membershipStatus === "pending");

  const allowsPasscode = event.accessMode === "passcode" || event.accessMode === "both";
  const allowsRequest = event.accessMode === "request" || event.accessMode === "both";

  async function submitCode() {
    if (!user) return onNeedAccount();
    if (!isCompletePasscode(code) || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await redeemPasscode(event.id, code);
      const message = redeemMessage(status);
      if (message) {
        setError(message);
      } else {
        track("private_meet_unlocked", { eventId: event.id, via: "passcode" });
        onToast("✓ You're in");
        await onJoined();
      }
    } catch (e) {
      setError(e.message || "Couldn't check that code.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    if (!user) return onNeedAccount();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestToJoin(event.id, user.id);
      setRequested(true);
      track("private_meet_requested", { eventId: event.id });
      onToast("Request sent to the host");
    } catch (e) {
      setError(e.message || "Couldn't send that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div style={{ fontSize: 22, marginBottom: 4 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5 }}>PRIVATE MEET</div>
      <div style={bodyStyle}>
        The host keeps the address, map and details for people who are in.
        {allowsPasscode && allowsRequest
          ? " Enter their code, or ask to join."
          : allowsPasscode
            ? " Enter the code the host gave you."
            : " Ask the host to let you in."}
      </div>

      {allowsPasscode && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            value={code}
            onChange={(e) => {
              setCode(normalizePasscode(e.target.value));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
            placeholder="CODE"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: "#0C0C0C",
              border: "1px solid #2A2A2A",
              borderRadius: 8,
              padding: "12px 14px",
              color: "#F0F0F0",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 6,
              textAlign: "center",
              outline: "none",
              fontFamily: "'Barlow Condensed', sans-serif",
              boxSizing: "border-box",
            }}
          />
          <button
            className="action-btn"
            onClick={submitCode}
            disabled={busy || !isCompletePasscode(code)}
            style={{
              padding: "0 20px",
              background: isCompletePasscode(code) ? "#FF4500" : "#1A1A1A",
              color: isCompletePasscode(code) ? "#fff" : "#555",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1.5,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {busy ? "…" : "JOIN"}
          </button>
        </div>
      )}

      {allowsRequest && (
        <button
          className="action-btn"
          onClick={sendRequest}
          disabled={busy || requested}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "12px 0",
            background: requested ? "#141414" : "#1A1A1A",
            border: `1px solid ${requested ? "#2A2A2A" : "#FF4500"}`,
            borderRadius: 8,
            color: requested ? "#666" : "#FF4500",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1.5,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {requested ? "⏳ WAITING ON THE HOST" : "REQUEST TO JOIN"}
        </button>
      )}

      {error && (
        <div style={{ ...bodyStyle, color: "#FF6B4A", marginTop: 10 }}>{error}</div>
      )}
    </Panel>
  );
}

function HostPanel({ event, onToast }) {
  const [members, setMembers] = useState([]);
  const [busyUser, setBusyUser] = useState(null);

  const showsPasscode = event.accessMode !== "request";

  async function refresh() {
    setMembers(await loadJoinRequests(event.id));
  }

  useEffect(() => {
    refresh();
  }, [event.id]);

  const pending = members.filter((m) => m.status === "pending");
  const approved = members.filter((m) => m.status === "approved");

  async function decide(userId, approve) {
    setBusyUser(userId);
    try {
      if (approve) await approveJoinRequest(event.id, userId);
      else await denyJoinRequest(event.id, userId);
      await refresh();
      onToast(approve ? "Approved" : "Request removed");
    } catch (e) {
      onToast(e.message || "Couldn't update that request.");
    } finally {
      setBusyUser(null);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(event.passcode);
      onToast("Passcode copied");
    } catch {
      onToast(`Passcode: ${event.passcode}`);
    }
  }

  return (
    <Panel>
      <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>
        🔒 PRIVATE MEET · YOU'RE THE HOST
      </div>

      {showsPasscode && event.passcode && (
        <>
          <div style={{ ...bodyStyle, marginTop: 8 }}>
            Give this code to whoever you want in. They enter it here and the address unlocks.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                background: "#0C0C0C",
                border: "1px dashed #FF4500",
                borderRadius: 8,
                padding: "12px 0",
                textAlign: "center",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 8,
                color: "#FF4500",
              }}
            >
              {event.passcode}
            </div>
            <button
              className="action-btn"
              onClick={copyCode}
              style={{
                padding: "0 18px",
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
              COPY
            </button>
          </div>
        </>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>
        REQUESTS · {pending.length} WAITING · {approved.length} IN
      </div>

      {pending.length === 0 && approved.length === 0 && (
        <div style={{ ...bodyStyle, marginTop: 6 }}>Nobody's asked to join yet.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {pending.map((m) => (
          <div
            key={m.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0F0F0F",
              border: "1px solid #242424",
              borderRadius: 8,
              padding: "9px 11px",
            }}
          >
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>@{m.username}</div>
            <button
              className="action-btn"
              disabled={busyUser === m.user_id}
              onClick={() => decide(m.user_id, true)}
              style={pillStyle("#10B981")}
            >
              APPROVE
            </button>
            <button
              className="action-btn"
              disabled={busyUser === m.user_id}
              onClick={() => decide(m.user_id, false)}
              style={pillStyle("#444")}
            >
              DENY
            </button>
          </div>
        ))}
        {approved.map((m) => (
          <div
            key={m.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 11px",
            }}
          >
            <div style={{ flex: 1, fontSize: 13, color: "#777" }}>✓ @{m.username}</div>
            <button
              className="action-btn"
              disabled={busyUser === m.user_id}
              onClick={() => decide(m.user_id, false)}
              style={pillStyle("#444")}
            >
              REMOVE
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function pillStyle(color) {
  return {
    padding: "6px 11px",
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: 6,
    color,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    fontFamily: "'Barlow Condensed', sans-serif",
  };
}

const bodyStyle = {
  fontSize: 13,
  color: "#999",
  marginTop: 6,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

function Panel({ children }) {
  return (
    <div
      style={{
        background: "#131313",
        border: "1px solid #2A2A2A",
        borderRadius: 10,
        padding: "16px 16px",
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}
