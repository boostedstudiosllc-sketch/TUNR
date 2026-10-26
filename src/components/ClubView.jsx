import { useEffect, useRef, useState } from "react";
import {
  kindLabel,
  joinClub,
  leaveClub,
  setClubOnProfile,
  manageClubMember,
  loadClubPeople,
  loadClubMeets,
  loadClubMessages,
  sendClubMessage,
  deleteClubMessage,
  subscribeToClub,
  updateClub,
  deleteClub,
} from "../lib/community.js";
import { useAccount } from "../lib/account.js";
import { displayDate } from "../lib/dates.js";
import { Logo, ReportSheet, Author } from "./CommunityBits.jsx";
import { ConfirmToChat } from "./ConfirmEmail.jsx";
import Sheet, { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const ROLE = { owner: "OWNER", admin: "ADMIN" };

// A club: who's in it, join or leave, requests for the people running it,
// the meets members are going to, and the club chat.
export default function ClubView({ club, user, events = [], onClose, onToast, onNeedAccount, onOpenPerson, onOpenMeet, onChanged }) {
  const [people, setPeople] = useState([]);
  const [meets, setMeets] = useState([]);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const role = club.my_role;
  const inClub = role === "owner" || role === "admin" || role === "member";
  const runs = role === "owner" || role === "admin";
  const me = people.find((p) => user && p.user_id === user.id);

  function refresh() {
    loadClubPeople(club.id)
      .then(setPeople)
      .catch((e) => setError(e.message));
    if (inClub) {
      loadClubMeets(club.id)
        .then(setMeets)
        .catch((e) => setError(e.message));
      loadClubMessages(club.id)
        .then(setMessages)
        .catch((e) => setError(e.message));
    }
  }

  useEffect(() => {
    refresh();
    if (inClub) return subscribeToClub(club.id, refresh);
  }, [club.id, role]);

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

  const members = people.filter((p) => p.status === "member");
  const requests = people.filter((p) => p.status === "requested");
  const upcoming = meets
    .map((m) => ({ ...m, event: events.find((e) => e.id === m.event_id) }))
    .filter((m) => m.event);

  return (
    <Sheet onClose={onClose} label={club.name} zIndex={265}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Logo url={club.logo_url} fallback={kindLabel(club.kind).split(" ")[0]} size={60} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>{club.name}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
            {kindLabel(club.kind)} · {club.visibility === "private" ? "🔒 Private" : "🌐 Public"}
            {club.city ? ` · ${club.city}` : ""}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>{club.members} {club.members === 1 ? "member" : "members"}</div>
        </div>
      </div>
      {editing ? (
        <ClubEdit club={club} onDone={() => (setEditing(false), onChanged())} onToast={onToast} />
      ) : (
        club.description && <div style={{ ...muted, marginTop: 10, whiteSpace: "pre-wrap" }}>{club.description}</div>
      )}
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{error}</div>}

      {/* Join / leave */}
      <div style={{ marginTop: 14 }}>
        {!role && (
          <button
            disabled={busy}
            onClick={() => (user ? act(() => joinClub(club.id, user.id), club.visibility === "private" ? "Request sent — you'll get an alert when they answer" : `Welcome to ${club.name}`) : onNeedAccount())}
            style={bigButton}
          >
            {club.visibility === "private" ? "🔒 ASK TO JOIN" : "+ JOIN CLUB"}
          </button>
        )}
        {role === "requested" && (
          <button disabled={busy} onClick={() => act(() => leaveClub(club.id, user.id), "Request cancelled")} style={quietButton}>
            REQUESTED · CANCEL
          </button>
        )}
        {inClub && me && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 13, color: "#CCC" }}>
            <input
              type="checkbox"
              checked={me.show_on_profile !== false}
              onChange={(e) => act(() => setClubOnProfile(club.id, user.id, e.target.checked), e.target.checked ? "Shows on your profile" : "Hidden from your profile")}
              style={{ accentColor: "#0080F0", width: 16, height: 16 }}
            />
            Show this club on my profile
          </label>
        )}
      </div>

      {/* Requests, for the people running it */}
      {runs && requests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={label}>WANT TO JOIN ({requests.length})</div>
          {requests.map((p) => (
            <Row key={p.user_id} p={p} onOpen={() => onOpenPerson(p.user_id)}>
              <button disabled={busy} onClick={() => act(() => manageClubMember(club.id, p.user_id, "accept"), `@${p.username} is in`)} style={small("#0080F0", "#fff")}>
                ACCEPT
              </button>
              <button disabled={busy} onClick={() => act(() => manageClubMember(club.id, p.user_id, "remove"), "Declined")} style={small("#1A1A1A", "#999")}>
                DECLINE
              </button>
            </Row>
          ))}
        </div>
      )}

      {/* Meets members are going to */}
      {inClub && upcoming.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={label}>WHERE THE CLUB'S GOING</div>
          {upcoming.slice(0, 6).map((m) => (
            <button
              key={m.event_id}
              onClick={() => onOpenMeet(m.event)}
              style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", textAlign: "left", background: "#111", border: "1px solid #222", borderRadius: 8, padding: "9px 11px", color: "#E6E6E6", cursor: "pointer", marginBottom: 6 }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.event.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#777" }}>{displayDate(m.event)} · {m.event.city}</span>
              </span>
              <span style={{ fontSize: 12, color: "#3CABFD", fontWeight: 800, whiteSpace: "nowrap" }}>{m.members_going} going</span>
            </button>
          ))}
        </div>
      )}

      {/* Members */}
      {(club.visibility === "public" || inClub) && (
        <div style={{ marginTop: 16 }}>
          <div style={label}>MEMBERS ({members.length})</div>
          {members.map((p) => (
            <Row key={p.user_id} p={p} onOpen={() => onOpenPerson(p.user_id)}>
              {ROLE[p.role] && <span style={{ fontSize: 10, color: "#3CABFD", fontWeight: 800, letterSpacing: 1 }}>{ROLE[p.role]}</span>}
              {runs && p.role !== "owner" && p.user_id !== user?.id && (role === "owner" || p.role === "member") && (
                <>
                  {role === "owner" && (
                    <button disabled={busy} onClick={() => act(() => manageClubMember(club.id, p.user_id, p.role === "admin" ? "make_member" : "make_admin"), p.role === "admin" ? "Now a member" : `@${p.username} is an admin`)} style={small("#1A1A1A", "#999")}>
                      {p.role === "admin" ? "UN-ADMIN" : "MAKE ADMIN"}
                    </button>
                  )}
                  <button disabled={busy} onClick={() => act(() => manageClubMember(club.id, p.user_id, "remove"), `Removed @${p.username}`)} style={small("#1A1A1A", "#999")}>
                    REMOVE
                  </button>
                </>
              )}
            </Row>
          ))}
        </div>
      )}
      {club.visibility === "private" && !inClub && (
        <div style={{ ...muted, marginTop: 14 }}>🔒 Members and the club chat are only visible to people in the club.</div>
      )}

      {inClub && <ClubChat club={club} user={user} messages={messages} runs={runs} onSent={refresh} onToast={onToast} onOpenPerson={onOpenPerson} />}

      {/* Leave / manage */}
      <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
        {runs && (
          <button onClick={() => setEditing((v) => !v)} style={linkBtn}>
            🛠 edit club
          </button>
        )}
        {inClub && role !== "owner" && (
          <button disabled={busy} onClick={() => act(() => leaveClub(club.id, user.id), `You left ${club.name}`)} style={linkBtn}>
            leave club
          </button>
        )}
        {role === "owner" &&
          (confirmDelete ? (
            <button
              disabled={busy}
              onClick={() =>
                deleteClub(club.id)
                  .then(() => {
                    onToast("Club deleted");
                    onChanged();
                    onClose();
                  })
                  .catch((e) => onToast(e.message))
              }
              style={{ ...linkBtn, color: "#EF4444" }}
            >
              tap again to delete the club for everyone
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={linkBtn}>
              delete club
            </button>
          ))}
        {user && role !== "owner" && (
          <button onClick={() => setReport(true)} style={linkBtn}>
            🚩 report
          </button>
        )}
      </div>
      {report && <ReportSheet type="club" id={club.id} onClose={() => setReport(false)} onToast={onToast} />}
    </Sheet>
  );
}

function ClubEdit({ club, onDone, onToast }) {
  const [description, setDescription] = useState(club.description || "");
  const [city, setCity] = useState(club.city || "");
  const [visibility, setVisibility] = useState(club.visibility);
  return (
    <div style={{ marginTop: 10, background: "#121212", border: "1px solid #222", borderRadius: 10, padding: 12 }}>
      <div style={label}>CITY</div>
      <input style={field} maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
      <div style={{ ...label, marginTop: 10 }}>ABOUT</div>
      <textarea style={{ ...field, minHeight: 70 }} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13, color: "#CCC" }}>
        <input type="checkbox" checked={visibility === "private"} onChange={(e) => setVisibility(e.target.checked ? "private" : "public")} style={{ accentColor: "#0080F0" }} />
        Private — approve who joins
      </label>
      <button
        onClick={() =>
          updateClub(club.id, { description: description.trim() || null, city: city.trim() || null, visibility })
            .then(() => {
              onToast("Club updated");
              onDone();
            })
            .catch((e) => onToast(e.message))
        }
        style={{ ...quietButton, marginTop: 10, padding: "10px 0" }}
      >
        SAVE
      </button>
    </div>
  );
}

function ClubChat({ club, user, messages, runs, onSent, onToast, onOpenPerson }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const account = useAccount();
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendClubMessage(club.id, text, user.id);
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
      <div style={label}>CLUB CHAT</div>
      <div style={{ background: "#121212", border: "1px solid #222", borderRadius: 10, padding: 10, maxHeight: 300, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div style={{ ...muted, fontSize: 12.5 }}>Only members see this. Plan a cruise, share a shoot, say hi.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Author name={m.username} photographer={m.photographer} photographerVerified={m.photographer_verified} onOpen={() => onOpenPerson(m.user_id)} />
                {ROLE[m.role] && <span style={{ fontSize: 9.5, color: "#3CABFD", fontWeight: 800 }}>{ROLE[m.role]}</span>}
                <span style={{ fontSize: 10.5, color: "#555" }}>{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                {(m.user_id === user.id || runs) && (
                  <button
                    onClick={() =>
                      deleteClubMessage(m.id)
                        .then(onSent)
                        .catch((e) => onToast(e.message))
                    }
                    style={{ ...linkBtn, fontSize: 10.5, color: "#555" }}
                  >
                    delete
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: "#E6E6E6", lineHeight: 1.45, overflowWrap: "anywhere", fontFamily: "'Barlow', sans-serif" }}>{m.body}</div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      {account && !account.confirmed ? (
        <ConfirmToChat />
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input style={{ ...field, flex: 1 }} placeholder="Message the club" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button disabled={sending || !text.trim()} onClick={send} style={{ ...bigButton, width: 70, padding: 0 }}>
            SEND
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ p, onOpen, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #1A1A1A" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Author name={p.username} photographer={p.photographer} photographerVerified={p.photographer_verified} onOpen={onOpen} />
      </span>
      {children}
    </div>
  );
}

const linkBtn = { background: "none", border: "none", padding: 0, color: "#777", fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
const small = (bg, color) => ({
  padding: "6px 9px",
  background: bg,
  color,
  border: bg === "#1A1A1A" ? "1px solid #2A2A2A" : "none",
  borderRadius: 6,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: 0.6,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
});
