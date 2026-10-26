import { useEffect, useMemo, useState } from "react";
import { loadLinkups, hasAcceptedLinkupTerms, kindOf } from "../lib/linkups.js";
import { linkupStatus, sortLinkups } from "../lib/linkupTime.js";
import { loadAlertSettings } from "../lib/alerts.js";
import { haversineMiles, formatMiles } from "../lib/geo.js";
import { Badges } from "./Badge.jsx";
import LinkupForm from "./LinkupForm.jsx";
import LinkupDetail from "./LinkupDetail.jsx";
import LinkupTerms from "./LinkupTerms.jsx";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import { useAccount } from "../lib/account.js";

// Linkups: who's heading out today or tomorrow, and starting your own.
export default function LinkupTab({ user, position, openId, onOpened, onNeedAccount, onToast, onOpenPerson, onShowTerms, onOpenAlerts }) {
  const [linkups, setLinkups] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [openLinkup, setOpenLinkup] = useState(null);
  const [termsThen, setTermsThen] = useState(null);
  const [home, setHome] = useState(null);
  const account = useAccount();
  const unconfirmed = Boolean(account && !account.confirmed);

  function refresh() {
    if (!user) return Promise.resolve();
    return loadLinkups()
      .then((rows) => {
        setLinkups(rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    loadAlertSettings(user.id)
      .then((s) => s.lat != null && setHome({ lat: s.lat, lng: s.lng }))
      .catch((e) => console.warn(e.message));
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
    return () => clearInterval(timer);
  }, [user?.id]);

  // Opened from an alert.
  useEffect(() => {
    if (openId) {
      setOpenLinkup(openId);
      onOpened();
    }
  }, [openId]);

  const from = position || home;
  const milesTo = (l) => (from && l.lat != null ? haversineMiles(from.lat, from.lng, l.lat, l.lng) : null);
  const sorted = useMemo(() => sortLinkups(linkups || [], milesTo), [linkups, from?.lat, from?.lng]);
  const selected = openLinkup && (linkups || []).find((l) => l.id === openLinkup);

  // The rules come first, once: then whatever they were trying to do.
  async function requireTerms(then) {
    try {
      if (await hasAcceptedLinkupTerms(user.id)) return then();
      setTermsThen(() => then);
    } catch (e) {
      onToast(e.message);
    }
  }

  if (!user) {
    return (
      <div style={{ padding: "8px 20px" }}>
        <Header />
        <div style={{ ...muted, marginTop: 12 }}>
          Linkups are people heading out now, later today or tomorrow to shoot, cruise or hang — and looking for company.
          Sign in to see who's out and start your own.
        </div>
        <button onClick={onNeedAccount} style={{ ...bigButton, marginTop: 14 }}>
          SIGN IN TO SEE LINKUPS
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 20px", animation: "fadeIn 0.3s ease" }}>
      <Header />
      {unconfirmed ? (
        <div style={{ ...muted, marginTop: 12, background: "#1F1405", border: "1px solid #5A3A0A", borderRadius: 10, padding: "10px 12px", color: "#C9A46A" }}>
          ✉️ Confirm your email to start or join linkups and see where they are. It keeps exact meet-up spots between
          real, confirmed members.
        </div>
      ) : (
        <button onClick={() => requireTerms(() => setCreating(true))} style={{ ...bigButton, marginTop: 12 }}>
          ⚡ START A LINKUP
        </button>
      )}
      {!home && (
        <button onClick={onOpenAlerts} style={{ ...quietButton, marginTop: 8, padding: "10px 0", fontSize: 12 }}>
          🔔 GET ALERTED WHEN ONE STARTS NEAR YOU
        </button>
      )}

      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {linkups === null && !error ? (
          <div style={muted}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ background: "#121212", border: "1px dashed #2A2A2A", borderRadius: 12, padding: "22px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🌃</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>Nobody's out right now</div>
            <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
              Start one — everyone nearby with linkup alerts on gets a heads-up.
            </div>
          </div>
        ) : (
          sorted.map((l) => <LinkupCard key={l.id} linkup={l} miles={milesTo(l)} onOpen={() => setOpenLinkup(l.id)} />)
        )}
      </div>

      {creating && (
        <LinkupForm
          user={user}
          onClose={() => setCreating(false)}
          onToast={onToast}
          onPosted={(id) => {
            setCreating(false);
            // Open it once the list has it, rather than flashing "over".
            refresh().then(() => setOpenLinkup(id));
          }}
        />
      )}

      {selected && (
        <LinkupDetail
          linkup={selected}
          user={user}
          miles={milesTo(selected)}
          onClose={() => setOpenLinkup(null)}
          onChanged={refresh}
          onToast={onToast}
          onOpenPerson={onOpenPerson}
          requireTerms={requireTerms}
        />
      )}
      {openLinkup && linkups && !selected && (
        <MissingLinkup onClose={() => setOpenLinkup(null)} />
      )}

      {termsThen && (
        <LinkupTerms
          onClose={() => setTermsThen(null)}
          onShowTerms={onShowTerms}
          onAgreed={() => {
            const then = termsThen;
            setTermsThen(null);
            then();
          }}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.5 }}>⚡ LINKUP</div>
      <div style={{ fontSize: 12.5, color: "#777", fontFamily: "'Barlow', sans-serif" }}>
        Who's heading out today or tomorrow — shoot, cruise or hang.
      </div>
    </div>
  );
}

function LinkupCard({ linkup, miles, onOpen }) {
  const kind = kindOf(linkup.kind);
  const status = linkupStatus(linkup);
  const mine = linkup.myRole;
  return (
    <button
      onClick={onOpen}
      className="meet-card"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        background: "#111",
        border: `1px solid ${mine ? "#3A1E0E" : "#222"}`,
        borderLeft: `3px solid ${status.live ? "#10B981" : "#0080F0"}`,
        borderRadius: 10,
        padding: "12px 12px",
        color: "#E6E6E6",
        cursor: "pointer",
        opacity: status.over ? 0.55 : 1,
      }}
    >
      <div style={{ fontSize: 30, width: 38, textAlign: "center", flexShrink: 0 }}>{kind.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15.5, fontWeight: 800 }}>{kind.label}</span>
          <span style={{ fontSize: 13, color: "#3CABFD", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{linkup.username}
          </span>
          <Badges photographer={linkup.photographer} photographerVerified={linkup.photographerVerified} size={14} />
        </div>
        <div style={{ fontSize: 12, color: status.live ? "#10B981" : "#BBB", fontWeight: 700, marginTop: 2 }}>{status.text}</div>
        <div style={{ fontSize: 11.5, color: "#777", marginTop: 2, fontFamily: "'Barlow', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[linkup.locked ? `🔒 ${linkup.area || "Private"}` : linkup.place, miles != null && formatMiles(miles)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{linkup.headcount}</div>
        <div style={{ fontSize: 9, color: "#666", letterSpacing: 1.2 }}>IN</div>
        {mine && (
          <div style={{ fontSize: 9, color: "#0080F0", fontWeight: 800, letterSpacing: 0.8, marginTop: 3 }}>
            {mine === "host" ? (linkup.requests ? `${linkup.requests} ASKING` : "YOURS") : mine === "in" ? "YOU'RE IN" : "ASKED"}
          </div>
        )}
      </div>
    </button>
  );
}

function MissingLinkup({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#131313", border: "1px solid #2A2A2A", borderRadius: 12, padding: 20, maxWidth: 300, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>That linkup's over</div>
        <div style={{ ...muted, marginTop: 4 }}>It ended, was cancelled, or isn't available to you.</div>
        <button onClick={onClose} style={{ ...quietButton, marginTop: 12 }}>OK</button>
      </div>
    </div>
  );
}
