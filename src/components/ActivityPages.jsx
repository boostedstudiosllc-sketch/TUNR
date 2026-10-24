import { useEffect, useRef, useState } from "react";
import { loadMeetHistory, loadSignIns, signOutOtherDevices, deviceLabel } from "../lib/activity.js";
import { loadMyInvites, openInvites } from "../lib/invites.js";
import { loadPointHistory, loadMyRedemptions } from "../lib/points.js";
import { loadAlertSound, saveAlertSound, playAlertSound, clipToDataUrl, SOUND_LIMITS } from "../lib/activity.js";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";

const day = (iso) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Past meets: the ones you checked in at, and one-offs you RSVP'd to.
export function MeetHistory({ onOpenLink }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadMeetHistory()
      .then(setRows)
      .catch((e) => (setError(e.message), setRows([])));
  }, []);

  return (
    <div>
      <div style={muted}>Meets you checked in at, and past meets you RSVP'd to.</div>
      {error && <Err>{error}</Err>}
      {rows && rows.length === 0 && !error && (
        <Empty>No past meets yet. RSVP to a meet, or check in at a ⭐ points meet, and it shows up here.</Empty>
      )}
      {(rows || []).map((r) => (
        <button key={`${r.event_id}-${r.day}`} onClick={() => onOpenLink(`meet:${r.event_id}`)} style={rowButton}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>{r.title}</span>
            <span style={{ display: "block", ...muted, fontSize: 12.5 }}>
              {day(r.day)}
              {r.city ? ` · ${r.city}` : ""}
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: r.checked_in ? "#10B981" : "#A0A0A0", whiteSpace: "nowrap" }}>
            {r.checked_in ? "✓ CHECKED IN" : r.rsvp === "going" ? "GOING" : r.rsvp === "interested" ? "MAYBE" : r.rsvp === "not_going" ? "NOT GOING" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

// Everyone who used your link: counted, or waiting on their email.
export function InviteHistory({ onOpenLink }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    loadMyInvites()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const friends = data?.friends || [];

  return (
    <div>
      <div style={muted}>
        Friends count once they confirm their email. {data ? `${data.confirmed} counted, ${data.pending} pending.` : ""}
      </div>
      {error && <Err>{error}</Err>}
      <button className="action-btn" onClick={() => openInvites()} style={{ ...bigButton, marginTop: 12 }}>
        🎁 INVITE MORE FRIENDS
      </button>
      {data && friends.length === 0 && <Empty>Nobody has joined with your link yet.</Empty>}
      {friends.map((f) => (
        <button key={f.id} onClick={() => onOpenLink(`person:${f.id}`)} style={rowButton}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>@{f.username || "new member"}</span>
            {f.joined && <span style={{ display: "block", ...muted, fontSize: 12.5 }}>Joined {day(f.joined)}</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: f.confirmed ? "#10B981" : "#FACC15", whiteSpace: "nowrap" }}>
            {f.confirmed ? "✓ JOINED" : "PENDING"}
          </span>
        </button>
      ))}
      {friends.some((f) => !f.confirmed) && (
        <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>
          Pending means they signed up but haven't tapped the link in their confirmation email yet.
        </div>
      )}
    </div>
  );
}

// Every point in and out, plus the rewards you've claimed.
export function TransactionLog({ user }) {
  const [rows, setRows] = useState(null);
  const [claims, setClaims] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([loadPointHistory(user.id), loadMyRedemptions(user.id)])
      .then(([h, c]) => (setRows(h), setClaims(c)))
      .catch((e) => (setError(e.message), setRows([])));
  }, [user.id]);

  return (
    <div>
      <div style={muted}>Every point you've earned or spent, newest first.</div>
      {error && <Err>{error}</Err>}
      {claims.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 16 }}>REWARDS CLAIMED</div>
          {claims.map((c) => (
            <div key={c.id} style={rowStatic}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>{c.title}</span>
                <span style={{ display: "block", ...muted, fontSize: 12.5 }}>
                  {when(c.at)} · code {c.code}
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: c.status === "fulfilled" ? "#10B981" : c.status === "cancelled" ? "#A0A0A0" : "#FACC15" }}>
                {c.status === "fulfilled" ? "COLLECTED" : c.status === "cancelled" ? "CANCELLED" : "READY"}
              </span>
            </div>
          ))}
        </>
      )}
      <div style={{ ...label, marginTop: 16 }}>POINTS</div>
      {rows && rows.length === 0 && !error && <Empty>No points yet.</Empty>}
      {(rows || []).map((h) => (
        <div key={h.id} style={rowStatic}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>{h.label}</span>
            <span style={{ display: "block", ...muted, fontSize: 12.5 }}>{[h.detail, when(h.at)].filter(Boolean).join(" · ")}</span>
          </span>
          <span style={{ fontWeight: 900, color: h.delta > 0 ? "#10B981" : "#F87171" }}>
            {h.delta > 0 ? "+" : ""}
            {h.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

// When and where the account was signed in, and a way out for everywhere
// else.
export function SignInHistory({ user, onToast }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const here = deviceLabel();
  useEffect(() => {
    loadSignIns(user.id)
      .then(setRows)
      .catch((e) => (setError(e.message), setRows([])));
  }, [user.id]);

  async function signOutOthers() {
    if (!window.confirm("Sign out of TUNR on every other phone and computer? This one stays signed in.")) return;
    setBusy(true);
    try {
      await signOutOtherDevices();
      onToast("Signed out everywhere else");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={muted}>
        Sign-ins to your account over the last 90 days. Don't recognise one? Sign out everywhere
        else, then change your password.
      </div>
      {error && <Err>{error}</Err>}
      <button className="action-btn" disabled={busy} onClick={signOutOthers} style={{ ...quietButton, marginTop: 12 }}>
        {busy ? "SIGNING OUT…" : "SIGN OUT EVERYWHERE ELSE"}
      </button>
      {rows && rows.length === 0 && !error && <Empty>No sign-ins recorded yet. They're logged from now on.</Empty>}
      {(rows || []).map((r, i) => (
        <div key={r.id} style={rowStatic}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>{r.device}</span>
            <span style={{ display: "block", ...muted, fontSize: 12.5 }}>
              {when(r.created_at)}
              {r.ip_hint ? ` · network ${r.ip_hint}` : ""}
            </span>
          </span>
          {i === 0 && r.device === here && <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981" }}>THIS DEVICE</span>}
        </div>
      ))}
    </div>
  );
}

// Your car (or anything) as the alert sound on this device.
export function AlertSound({ onToast }) {
  const [sound, setSound] = useState(() => loadAlertSound());
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef(null);
  const stopTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(stopTimer.current);
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
  }, []);

  async function keep(blob) {
    try {
      const url = await clipToDataUrl(blob);
      saveAlertSound(url);
      setSound(url);
      setError("");
      onToast("🔊 Alert sound saved on this device");
      playAlertSound(url);
    } catch (e) {
      setError(e.message);
    }
  }

  async function record() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record sound. Upload a clip instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        keep(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      rec.start();
      setRecording(true);
      stopTimer.current = setTimeout(() => rec.state === "recording" && rec.stop(), 4000);
    } catch (e) {
      setRecording(false);
      setError(
        e.name === "NotAllowedError"
          ? "Microphone is blocked for TUNR. Allow it in your browser or phone settings, or upload a clip."
          : `Couldn't record. (${e.message})`
      );
    }
  }

  function stop() {
    clearTimeout(stopTimer.current);
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
  }

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) keep(file);
  }

  function remove() {
    try {
      saveAlertSound("");
      setSound("");
      onToast("Back to no sound");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div style={muted}>
        Rev it: record 4 seconds of your exhaust (hold your phone near the tailpipe, safely, parked)
        or upload a clip up to {SOUND_LIMITS.seconds} seconds. It plays when an alert comes in while
        TUNR is open on this device.
      </div>
      <div style={{ ...muted, fontSize: 12, marginTop: 8, color: "#A08A40" }}>
        Heads up: when TUNR is closed, phones use their own alert sound for web apps. Custom sounds
        for those come with the App Store version.
      </div>
      {error && <Err>{error}</Err>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {recording ? (
          <button className="action-btn" onClick={stop} style={{ ...bigButton, flex: 1, background: "#B91C1C" }}>
            ⏺ RECORDING… TAP TO STOP
          </button>
        ) : (
          <button className="action-btn" onClick={record} style={{ ...bigButton, flex: 1 }}>
            🎙️ RECORD MY CAR
          </button>
        )}
        <label style={{ ...quietButton, flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
          UPLOAD CLIP
          <input type="file" accept="audio/*" onChange={pick} style={{ display: "none" }} />
        </label>
      </div>
      {sound && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="action-btn" onClick={() => playAlertSound(sound)} style={{ ...quietButton, flex: 1 }}>
            ▶ PLAY
          </button>
          <button className="action-btn" onClick={remove} style={{ ...quietButton, flex: 1, color: "#F87171" }}>
            REMOVE
          </button>
        </div>
      )}
      {!sound && <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>No sound set on this device.</div>}
    </div>
  );
}

function Err({ children }) {
  return (
    <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 10 }}>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ ...muted, marginTop: 14 }}>{children}</div>;
}

const rowStatic = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 2px",
  borderBottom: "1px solid #1A1A1A",
  color: "#F0F0F0",
  fontFamily: "'Barlow Condensed', sans-serif",
};

const rowButton = {
  ...rowStatic,
  width: "100%",
  background: "none",
  border: "none",
  borderBottom: "1px solid #1A1A1A",
  textAlign: "left",
  cursor: "pointer",
};
