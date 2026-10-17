import { useEffect, useRef, useState } from "react";
import {
  kindOf,
  joinLinkup,
  removeFromLinkup,
  acceptRequest,
  cancelLinkup,
  setLinkupGoingAs,
  loadLinkupPeople,
  loadLinkupMessages,
  sendLinkupMessage,
  deleteLinkupMessage,
  subscribeToLinkup,
  BIG_LINKUP,
} from "../lib/linkups.js";
import { linkupStatus } from "../lib/linkupTime.js";
import { GOING_AS } from "../lib/photographer.js";
import { CONTACT_EMAIL } from "../lib/contact.js";
import { formatMiles } from "../lib/geo.js";
import { Badges } from "./Badge.jsx";
import { useAccount } from "../lib/account.js";
import { ConfirmToChat } from "./ConfirmEmail.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";

const AS_TEXT = { car: "🚗", photographer: "📸", both: "🚗📸" };

export default function LinkupDetail({ linkup, user, miles, onClose, onChanged, onToast, onOpenPerson, requireTerms }) {
  const [people, setPeople] = useState([]);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [goingAs, setGoingAs] = useState("car");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [loadError, setLoadError] = useState("");
  const kind = kindOf(linkup.kind);
  const status = linkupStatus(linkup);
  const role = linkup.myRole;
  const inGroup = role === "host" || role === "in";

  function refresh() {
    loadLinkupPeople(linkup.id)
      .then((rows) => {
        setPeople(rows);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message));
    if (inGroup) {
      loadLinkupMessages(linkup.id)
        .then(setMessages)
        .catch((e) => setLoadError(e.message));
    }
  }

  useEffect(() => {
    refresh();
    return subscribeToLinkup(linkup.id, () => {
      refresh();
      onChanged();
    });
  }, [linkup.id, role]);

  const me = people.find((p) => user && p.user_id === user.id);
  useEffect(() => {
    if (me) setGoingAs(me.going_as);
  }, [me?.going_as]);

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      if (message) onToast(message);
      onChanged();
      refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const join = () =>
    requireTerms(() =>
      act(
        () => joinLinkup(linkup.id, user.id, goingAs),
        linkup.visibility === "private" ? `Asked @${linkup.username} — you'll get an alert when they answer` : "⚡ You're in"
      )
    );

  const directions =
    !linkup.locked && linkup.lat != null
      ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${linkup.lat},${linkup.lng}`
      : null;
  const inPeople = people.filter((p) => p.status === "in");
  const requests = people.filter((p) => p.status === "requested");
  const big = linkup.headcount >= BIG_LINKUP;

  return (
    <Sheet onClose={onClose} label="Linkup">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 40 }}>{kind.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <div style={sheetTitle}>{kind.label.toUpperCase()} LINKUP</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#FF7A00", fontWeight: 700 }}>
            <button
              onClick={() => onOpenPerson(linkup.userId)}
              style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}
            >
              @{linkup.username}
            </button>
            <Badges
              dayOne={linkup.dayOne}
              dayOneNumber={linkup.dayOneNumber}
              photographer={linkup.photographer}
              photographerVerified={linkup.photographerVerified}
              size={15}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <Tag color={status.live ? "#10B981" : status.over ? "#666" : "#FF7A00"}>{status.text.toUpperCase()}</Tag>
        <Tag color="#888">{linkup.visibility === "private" ? "🔒 PRIVATE" : "🌐 PUBLIC"}</Tag>
        <Tag color="#888">{linkup.headcount} IN</Tag>
        {miles != null && <Tag color="#888">{formatMiles(miles).toUpperCase()}</Tag>}
      </div>

      <div style={{ marginTop: 14, background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "12px 14px" }}>
        {linkup.locked ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800 }}>🔒 {linkup.area || "Spot hidden"}</div>
            <div style={{ ...muted, fontSize: 12.5 }}>
              {role === "requested"
                ? `You've asked to join. The exact spot shows here when @${linkup.username} accepts.`
                : `Private linkup: the exact spot unlocks when @${linkup.username} accepts you.`}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 800 }}>📍 {linkup.place}</div>
            {linkup.area && <div style={{ ...muted, fontSize: 12.5 }}>{linkup.area}</div>}
            {linkup.note && <div style={{ fontSize: 13.5, color: "#DDD", marginTop: 8, lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>{linkup.note}</div>}
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", textAlign: "center", marginTop: 10, padding: "10px 0", borderRadius: 8, background: "#0F1F0F", border: "1px solid #10B981", color: "#10B981", fontSize: 13, fontWeight: 800, letterSpacing: 1.2, textDecoration: "none", fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                🧭 DIRECTIONS
              </a>
            )}
          </>
        )}
      </div>

      {big && (
        <div style={{ marginTop: 10, background: "#1F1405", border: "1px solid #5A3A0A", borderRadius: 10, padding: "10px 12px", ...muted, fontSize: 12.5, color: "#E9C27A" }}>
          <b>{linkup.headcount} people in — that's a big group.</b> Big groups get noticed: public spots only, park spread
          out, respect property and the police, no racing or stunts.
        </div>
      )}

      {loadError && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{loadError}</div>}

      {/* Your answer */}
      {!status.over && role !== "host" && (
        <div style={{ marginTop: 14 }}>
          <div style={label}>{role ? "YOU'RE COMING AS" : "COMING AS"}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {GOING_AS.map((g) => (
              <Chip
                key={g.id}
                active={goingAs === g.id}
                onClick={() => {
                  setGoingAs(g.id);
                  if (role) act(() => setLinkupGoingAs(linkup.id, user.id, g.id));
                }}
              >
                {g.label}
              </Chip>
            ))}
          </div>
          {!role ? (
            <button disabled={busy} onClick={join} style={{ ...bigButton, marginTop: 10 }}>
              {linkup.visibility === "private" ? "🔒 ASK TO JOIN" : "⚡ I'M IN"}
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => act(() => removeFromLinkup(linkup.id, user.id), role === "requested" ? "Request cancelled" : "You left the linkup")}
              style={{ ...quietButton, marginTop: 10 }}
            >
              {role === "requested" ? "REQUESTED · CANCEL REQUEST" : "✓ YOU'RE IN · LEAVE"}
            </button>
          )}
        </div>
      )}

      {/* The host's side */}
      {role === "host" && requests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={label}>WANT TO JOIN ({requests.length})</div>
          {requests.map((p) => (
            <PersonRow key={p.user_id} person={p} onOpen={() => onOpenPerson(p.user_id)}>
              <button disabled={busy} onClick={() => act(() => acceptRequest(linkup.id, p.user_id), `@${p.username} is in`)} style={smallButton("#FF4500", "#fff")}>
                ACCEPT
              </button>
              <button disabled={busy} onClick={() => act(() => removeFromLinkup(linkup.id, p.user_id), "Declined")} style={smallButton("#1A1A1A", "#999")}>
                DECLINE
              </button>
            </PersonRow>
          ))}
        </div>
      )}

      {inPeople.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={label}>WHO'S IN ({inPeople.length})</div>
          {inPeople.map((p) => (
            <PersonRow key={p.user_id} person={p} onOpen={() => onOpenPerson(p.user_id)}>
              {role === "host" && !p.is_host && (
                <button disabled={busy} onClick={() => act(() => removeFromLinkup(linkup.id, p.user_id), `Removed @${p.username}`)} style={smallButton("#1A1A1A", "#999")}>
                  REMOVE
                </button>
              )}
            </PersonRow>
          ))}
        </div>
      )}

      {inGroup && <Chat linkup={linkup} user={user} messages={messages} onSent={refresh} onToast={onToast} onOpenPerson={onOpenPerson} closed={status.over && Date.now() - new Date(linkup.endsAt) > 6 * 3600000} />}

      {role === "host" && !status.over && (
        <button
          disabled={busy}
          onClick={() => (confirmCancel ? act(() => cancelLinkup(linkup.id), "Linkup cancelled — everyone in has been told") : setConfirmCancel(true))}
          style={{ ...quietButton, marginTop: 16, color: "#EF4444", borderColor: confirmCancel ? "#EF4444" : "#2A2A2A" }}
        >
          {confirmCancel ? "TAP AGAIN TO CANCEL THE LINKUP" : "CANCEL LINKUP"}
        </button>
      )}

      <div style={{ ...muted, fontSize: 11.5, marginTop: 16, textAlign: "center" }}>
        TUNR doesn't organize or supervise linkups. Meet in public, trust your gut, call 911 in an emergency.{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Linkup report ${linkup.id}`)}`}
          style={{ color: "#FF7A00", fontWeight: 700 }}
        >
          Report this linkup
        </a>
      </div>
    </Sheet>
  );
}

function Chat({ linkup, user, messages, onSent, onToast, onOpenPerson, closed }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const account = useAccount();

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendLinkupMessage(linkup.id, text, user.id);
      setText("");
      onSent();
    } catch (e) {
      onToast(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={label}>LINKUP CHAT</div>
      <div style={{ background: "#121212", border: "1px solid #222", borderRadius: 10, padding: 10, maxHeight: 280, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div style={{ ...muted, fontSize: 12.5 }}>Only people in this linkup see this. Say where you're parked, what you're driving, or that you're running late.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <button
                  onClick={() => onOpenPerson(m.user_id)}
                  style={{ background: "none", border: "none", padding: 0, color: m.user_id === linkup.userId ? "#FF7A00" : "#CCC", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
                >
                  @{m.username}
                </button>
                <Badges dayOne={m.day_one} dayOneNumber={m.day_one_number} photographer={m.photographer} photographerVerified={m.photographer_verified} size={13} />
                <span style={{ fontSize: 10.5, color: "#555" }}>
                  {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
                {m.user_id === user.id && (
                  <button
                    onClick={() =>
                      deleteLinkupMessage(m.id)
                        .then(onSent)
                        .catch((e) => onToast(e.message))
                    }
                    style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", padding: 0 }}
                  >
                    delete
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: "#E6E6E6", lineHeight: 1.45, fontFamily: "'Barlow', sans-serif", overflowWrap: "anywhere" }}>{m.body}</div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      {!closed && account && !account.confirmed && <ConfirmToChat />}
      {!closed && !(account && !account.confirmed) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            style={{ ...field, flex: 1 }}
            placeholder="Message the group"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button disabled={sending || !text.trim()} onClick={send} style={{ ...bigButton, width: 70, padding: 0 }}>
            SEND
          </button>
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, onOpen, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #1A1A1A" }}>
      <button
        onClick={onOpen}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, color: "#E6E6E6", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>@{person.username}</span>
        <Badges photographer={person.photographer} photographerVerified={person.photographer_verified} size={14} />
        <span style={{ fontSize: 13 }}>{AS_TEXT[person.going_as] || ""}</span>
        {person.is_host && <span style={{ fontSize: 10, color: "#FF7A00", fontWeight: 800, letterSpacing: 1 }}>HOST</span>}
      </button>
      {children}
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, color, border: `1px solid ${color}55`, borderRadius: 12, padding: "3px 8px", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {children}
    </span>
  );
}

const smallButton = (bg, color) => ({
  padding: "6px 10px",
  background: bg,
  color,
  border: bg === "#1A1A1A" ? "1px solid #2A2A2A" : "none",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.8,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
});
