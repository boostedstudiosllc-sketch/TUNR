import { useEffect, useState } from "react";
import {
  loadMyVerification,
  requestVerification,
  withdrawVerification,
  loadPendingVerifications,
  decideVerification,
  track,
} from "../lib/store.js";

const inputStyle = {
  background: "#0F0F0F",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "11px 13px",
  color: "#F0F0F0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const bodyStyle = {
  fontSize: 12.5,
  color: "#777",
  marginTop: 6,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

// Shown to every signed-in account. Hosts ask to be verified here; the code
// they get has to appear on the Instagram account they claim to run, which is
// the part a stranger can't fake.
export default function HostVerification({ user, profile, onToast }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  const host = profile.username || "";

  useEffect(() => {
    let cancelled = false;
    loadMyVerification(user?.id || null).then((r) => {
      if (cancelled) return;
      setRequest(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const created = await requestVerification(host, handle, user.id);
      setRequest(created);
      track("verification_requested", { host });
      onToast("Request sent — put the code on your Instagram");
    } catch (e) {
      onToast(e.message || "Couldn't send that request.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    await withdrawVerification(request.id);
    setRequest(null);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(request.code);
      onToast("Code copied");
    } catch {
      onToast(`Code: ${request.code}`);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 800 }}>
        {request?.status === "approved" ? "✓ Verified host" : "Get verified"}
      </div>

      {request?.status === "approved" && (
        <div style={bodyStyle}>
          @{request.host} is yours. Your meets carry the verified check, and nobody else can post
          under that name.
        </div>
      )}

      {request?.status === "pending" && (
        <>
          <div style={bodyStyle}>
            Put this code in the bio or a story on <strong>@{request.instagram_handle}</strong>, then
            leave it up until you're approved. That's how we know the account is yours.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div
              style={{
                flex: 1,
                background: "#0C0C0C",
                border: "1px dashed #FF4500",
                borderRadius: 8,
                padding: "11px 0",
                textAlign: "center",
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: 3,
                color: "#FF4500",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {request.code}
            </div>
            <button className="action-btn" onClick={copyCode} style={pillStyle("#888", "#2A2A2A")}>
              COPY
            </button>
          </div>
          <button
            className="action-btn"
            onClick={withdraw}
            style={{ ...pillStyle("#555", "#242424"), width: "100%", marginTop: 8 }}
          >
            CANCEL REQUEST
          </button>
        </>
      )}

      {request?.status === "rejected" && (
        <>
          <div style={bodyStyle}>
            That request wasn't approved
            {request.note ? `: ${request.note.replace(/[.!?]?$/, ".")}` : "."} You can try again.
          </div>
          <button
            className="action-btn"
            onClick={withdraw}
            style={{ ...pillStyle("#888", "#2A2A2A"), width: "100%", marginTop: 10 }}
          >
            START OVER
          </button>
        </>
      )}

      {!request && (
        <>
          <div style={bodyStyle}>
            Run a meet? Verification puts a check on your listings and reserves your host name so
            nobody can post as you.
          </div>
          {!host ? (
            <div style={{ ...bodyStyle, color: "#FF6B4A" }}>
              Set a username on your profile first — that's the name you'll be verified under.
            </div>
          ) : (
            <>
              <div style={{ ...bodyStyle, color: "#999" }}>
                Verifying as <strong style={{ color: "#FF4500" }}>@{host}</strong>
              </div>
              <input
                style={{ ...inputStyle, marginTop: 10 }}
                placeholder="Instagram account that runs it"
                value={handle}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setHandle(e.target.value)}
              />
              <button
                className="action-btn"
                onClick={submit}
                disabled={busy || !handle.trim()}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "12px 0",
                  background: handle.trim() ? "#FF4500" : "#1A1A1A",
                  color: handle.trim() ? "#fff" : "#555",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {busy ? "SENDING…" : "REQUEST VERIFICATION"}
              </button>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// Only renders for admins — row-level security returns an empty list to
// everyone else, so this is convenience rather than the actual gate.
export function VerificationQueue({ onToast }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setRows(await loadPendingVerifications());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function decide(row, approve) {
    setBusyId(row.id);
    try {
      const result = await decideVerification(row.id, approve);
      if (result === "approved") onToast(`@${row.host} verified`);
      else if (result === "rejected") onToast("Request rejected");
      else if (result === "host_taken") onToast("Another account already holds that host name.");
      else if (result === "not_admin") onToast("You're not an admin.");
      else onToast("That request is gone.");
      await refresh();
    } catch (e) {
      onToast(e.message || "Couldn't record that decision.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <Card accent>
      <div style={{ fontSize: 15, fontWeight: 800 }}>
        Verification queue · {rows.length}
      </div>
      <div style={bodyStyle}>
        Open the Instagram account and check the code is in the bio or a story before approving.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              background: "#0F0F0F",
              border: "1px solid #242424",
              borderRadius: 8,
              padding: "11px 12px",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800 }}>@{row.host}</div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
              claims{" "}
              <a
                href={`https://www.instagram.com/${encodeURIComponent(row.instagram_handle)}/`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#FF4500" }}
              >
                @{row.instagram_handle} ↗
              </a>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 2,
                color: "#FF4500",
                marginTop: 6,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {row.code}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => decide(row, true)}
                style={{ ...pillStyle("#10B981", "#10B981"), flex: 1 }}
              >
                APPROVE
              </button>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => decide(row, false)}
                style={{ ...pillStyle("#666", "#333"), flex: 1 }}
              >
                REJECT
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function pillStyle(color, border) {
  return {
    padding: "9px 14px",
    background: "transparent",
    border: `1px solid ${border}`,
    borderRadius: 8,
    color,
    fontSize: 11.5,
    fontWeight: 800,
    letterSpacing: 1.2,
    fontFamily: "'Barlow Condensed', sans-serif",
  };
}

function Card({ children, accent = false }) {
  return (
    <div
      style={{
        background: "#111",
        border: `1px solid ${accent ? "#FF4500" : "#2A2A2A"}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
