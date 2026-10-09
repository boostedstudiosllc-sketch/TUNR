import { useEffect, useState } from "react";
import {
  loadMyVerification,
  requestVerification,
  withdrawVerification,
  loadPendingVerifications,
  decideVerification,
  createHostInvite,
  loadHostInvites,
  hostInviteUrl,
  track,
} from "../lib/store.js";
import { INSTAGRAM_HANDLE } from "../lib/contact.js";

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

// Shown to every signed-in account. Hosts ask to be verified here, and an
// admin answers with an invite link DMed to the Instagram account they named.
// Only that account's inbox sees the link, which is the part a stranger can't
// fake — and nobody has to touch their bio.
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
      onToast("Request sent — we'll DM you on Instagram");
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
            Watch for a DM from @{INSTAGRAM_HANDLE} to <strong>@{request.instagram_handle}</strong>{" "}
            (check message requests if you don't follow us). Open the link while you're signed in
            here and you're verified.
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

  // Approving means DMing the Instagram account a one-time link; opening it
  // is what verifies them. Copies the whole message so it's one paste.
  async function sendInvite(row) {
    setBusyId(row.id);
    try {
      const token = await createHostInvite(row.instagram_handle);
      const message = inviteMessage(row.instagram_handle, token);
      await copyText(message);
      onToast(`Invite for @${row.instagram_handle} copied — paste it in their DMs`);
      window.open(instagramUrl(row.instagram_handle), "_blank", "noopener");
    } catch (e) {
      onToast(e.message || "Couldn't create that invite.");
    } finally {
      setBusyId(null);
    }
  }

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
        Invite copies a DM with their one-time link and opens their Instagram. They're verified
        when they open it — the request clears itself.
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
                href={instagramUrl(row.instagram_handle)}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#FF4500" }}
              >
                @{row.instagram_handle} ↗
              </a>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => sendInvite(row)}
                style={{ ...pillStyle("#10B981", "#10B981"), flex: 1 }}
              >
                INVITE
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

// Admin-only. Make an invite for any Instagram account — the main way hosts
// get on: you DM the pages you want, they tap the link, they're verified.
export function HostInvites({ onToast }) {
  const [handle, setHandle] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRows(await loadHostInvites());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (busy || !clean) return;
    setBusy(true);
    try {
      const token = await createHostInvite(clean);
      await copyText(inviteMessage(clean, token));
      onToast(`Invite for @${clean} copied — paste it in their DMs`);
      track("host_invite_created", {});
      setHandle("");
      await refresh();
    } catch (e) {
      onToast(e.message || "Couldn't create that invite.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAgain(row) {
    await copyText(inviteMessage(row.instagram_handle, row.token));
    onToast("Copied");
  }

  const now = new Date();

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Invite a host</div>
      <div style={bodyStyle}>
        Enter the Instagram account you're DMing. You get a one-time link (good for 14 days) to
        paste in the chat — whoever opens it from that inbox is verified as a host.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          style={inputStyle}
          placeholder="@instagram_handle"
          value={handle}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button
          className="action-btn"
          onClick={create}
          disabled={busy || !handle.trim()}
          style={{
            ...pillStyle(handle.trim() ? "#fff" : "#555", handle.trim() ? "#FF4500" : "#2A2A2A"),
            background: handle.trim() ? "#FF4500" : "transparent",
            flexShrink: 0,
          }}
        >
          {busy ? "…" : "COPY LINK"}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
          {rows.map((row) => {
            const expired = !row.used_at && new Date(row.expires_at) < now;
            return (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontFamily: "'Barlow', sans-serif",
                  color: "#BBB",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  @{row.instagram_handle}
                </span>
                {row.used_at ? (
                  <span style={{ color: "#10B981" }}>✓ joined as @{row.used_host}</span>
                ) : expired ? (
                  <span style={{ color: "#666" }}>expired</span>
                ) : (
                  <button onClick={() => copyAgain(row)} style={{ ...pillStyle("#888", "#2A2A2A"), padding: "4px 9px" }}>
                    COPY AGAIN
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function inviteMessage(handle, token) {
  return `Hey @${handle} — we're putting every car meet in Atlanta on one map at TUNR, and we'd love yours on it. This link sets you up as a verified host (it's just for your page, works once): ${hostInviteUrl(token)}`;
}

function instagramUrl(handle) {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Copy this:", text);
  }
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
