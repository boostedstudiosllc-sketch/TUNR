import { useEffect, useState } from "react";
import {
  fileListingRequest,
  loadListingRequests,
  resolveListingRequest,
  moderateEvent,
  createHostInvite,
  hostInviteUrl,
  track,
} from "../lib/store.js";
import { CONTACT_EMAIL } from "../lib/contact.js";
import { claimHandle } from "../lib/claims.js";

const KINDS = [
  { id: "remove", label: "Take it down", ask: "Anything we should know? (optional)" },
  { id: "correct", label: "Fix the details", ask: "What's wrong, and what should it say?" },
  { id: "claim", label: "It's mine — let me run it", ask: "Which Instagram runs this meet? e.g. @yourcrew" },
];

// On listings TUNR posted rather than an organizer (event.imported). The
// organizer may not have an account, so no sign-in is needed — just a way
// to reply.
export default function ListingRequest({ event }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const chosen = KINDS.find((k) => k.id === kind);
  const contactOk = contact.trim().length >= 3;
  const detailsOk = kind !== "correct" || details.trim().length > 0;
  const canSubmit = Boolean(kind) && contactOk && detailsOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await fileListingRequest({ eventId: event.id, kind, name, contact, details });
      track("listing_request", { eventId: event.id, kind });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ ...note, marginTop: 14 }}>
        ✓ Got it. We'll look at it within 24 hours and reply at {contact.trim()}.
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={linkButton}>
        Is this your meet? Remove, fix or claim this listing
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>Is this your meet?</div>
      <div style={{ ...note, marginTop: 4 }}>
        We listed it from a public flyer. Tell us what you'd like — no account needed.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            style={{
              padding: "7px 12px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              background: kind === k.id ? "#0080F0" : "var(--n-1a1a1a)",
              color: kind === k.id ? "#fff" : "#999",
              border: `1px solid ${kind === k.id ? "#0080F0" : "var(--n-2a2a2a)"}`,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      {chosen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Your email or @instagram, so we can reply"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={120}
            style={field}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name or crew (optional)"
            maxLength={80}
            style={field}
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={chosen.ask}
            rows={2}
            maxLength={1000}
            style={{ ...field, resize: "none" }}
          />
        </div>
      )}

      {error && <div style={{ ...note, color: "var(--a-ef4444)", marginTop: 6 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setOpen(false)} style={{ ...button, flex: 0.4 }}>
          CANCEL
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...button,
            flex: 1,
            background: canSubmit ? "#0080F0" : "var(--n-1e1e1e)",
            color: canSubmit ? "#fff" : "#555",
            border: "none",
          }}
        >
          {busy ? "SENDING…" : "SEND"}
        </button>
      </div>
      <div style={{ ...note, marginTop: 8 }}>Or email {CONTACT_EMAIL}.</div>
    </div>
  );
}

const KIND_LABEL = { remove: "🗑 Take down", correct: "✏️ Fix details", claim: "🙋 Claim" };


// Admin-only, in the Profile tab. A take-down request is one tap; a claim
// becomes a host invite DM, the same as any other host.
export function ListingRequestsQueue({ user, onToast }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await loadListingRequests();
    // Requests that arrived during a flood go last.
    setRows([...rows.filter((r) => !r.throttled), ...rows.filter((r) => r.throttled)]);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function act(row, fn) {
    setBusyId(row.id);
    try {
      await fn();
      await refresh();
    } catch (e) {
      onToast(e.message || "Couldn't do that.");
    } finally {
      setBusyId(null);
    }
  }

  function takeDown(row) {
    return act(row, async () => {
      await moderateEvent(row.event_id, true);
      await resolveListingRequest(row.id, "done", user.id);
      track("listing_taken_down", { eventId: row.event_id });
      onToast(`"${row.event_title}" taken down — reply to ${row.contact}`);
    });
  }

  // The invite carries the listing: when they redeem it, the listing becomes
  // theirs and this request closes itself. Until then it stays open.
  function sendInvite(row, handle) {
    return act(row, async () => {
      const token = await createHostInvite(handle, row.event_id, row.id);
      const url = hostInviteUrl(token);
      try {
        await navigator.clipboard.writeText(url);
        onToast(`Invite for @${handle} copied — DM it from @tunr.app. The listing is theirs once they open it.`);
      } catch {
        window.prompt("Copy this invite link:", url);
      }
    });
  }

  if (!rows.length) return null;

  return (
    <div style={{ ...panel, marginTop: 0, marginBottom: 12, border: "1px solid #F59E0B" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#F59E0B" }}>
        Listing requests · {rows.length}
      </div>
      <div style={{ ...note, marginTop: 6 }}>
        Organizers asking about meets we listed. Take-downs should happen the same day.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {rows.map((row) => {
          const handle = claimHandle(row);
          return (
            <div key={row.id} style={{ background: "var(--n-0f0f0f)", border: "1px solid var(--n-242424)", borderRadius: 8, padding: "11px 12px" }}>
              <div style={{ fontSize: 12, color: "#F59E0B", fontWeight: 800, letterSpacing: 0.5 }}>
                {KIND_LABEL[row.kind] || row.kind}
                {row.event_hidden && <span style={{ color: "var(--n-777777)" }}> · already hidden</span>}
                {!row.event_imported && <span style={{ color: "var(--n-777777)" }}> · organizer-posted — handle as a report</span>}
                {row.throttled && <span style={{ color: "var(--n-777777)" }}> · arrived during a flood</span>}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 3 }}>{row.event_title}</div>
              <div style={{ fontSize: 11.5, color: "var(--n-777777)", marginTop: 2 }}>
                @{row.event_host} · {row.event_city}
              </div>
              <div style={{ ...note, color: "var(--n-bbbbbb)", marginTop: 6 }}>
                {row.requester_name ? `${row.requester_name} · ` : ""}
                {row.contact}
                {row.details ? ` — “${row.details}”` : ""}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {row.kind === "remove" && !row.event_hidden && row.event_imported && (
                  <button disabled={busyId === row.id} onClick={() => takeDown(row)} style={{ ...button, flex: 1, color: "var(--a-ef4444)", border: "1px solid #EF4444" }}>
                    TAKE DOWN
                  </button>
                )}
                {handle && row.event_imported && (
                  <button disabled={busyId === row.id} onClick={() => sendInvite(row, handle)} style={{ ...button, flex: 1, color: "#10B981", border: "1px solid #10B981" }}>
                    COPY INVITE FOR @{handle}
                  </button>
                )}
                <button
                  disabled={busyId === row.id}
                  onClick={() => act(row, () => resolveListingRequest(row.id, "done", user.id))}
                  style={{ ...button, flex: 1 }}
                >
                  DONE
                </button>
                <button
                  disabled={busyId === row.id}
                  onClick={() => act(row, () => resolveListingRequest(row.id, "dismissed", user.id))}
                  style={{ ...button, flex: 1, color: "var(--n-555555)" }}
                >
                  DISMISS
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const panel = {
  marginTop: 18,
  background: "var(--n-111111)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 10,
  padding: "14px 16px",
};

const note = {
  fontSize: 12,
  color: "var(--n-777777)",
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

const field = {
  width: "100%",
  background: "var(--n-161616)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 8,
  padding: "9px 11px",
  color: "var(--n-f0f0f0)",
  fontSize: 13,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const button = {
  padding: "9px 0",
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 8,
  color: "var(--n-888888)",
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: 0.6,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};

const linkButton = {
  display: "block",
  marginTop: 12,
  background: "none",
  border: "none",
  color: "var(--n-666666)",
  fontSize: 11.5,
  letterSpacing: 0.3,
  cursor: "pointer",
  textDecoration: "underline",
  fontFamily: "'Barlow', sans-serif",
};
