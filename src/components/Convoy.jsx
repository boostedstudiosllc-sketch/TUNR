import { useEffect, useRef, useState } from "react";
import { loadConvoy, watchConvoy, sharePosition, stopSharing, leaveConvoy, endConvoy, inviteToConvoy, convoyLink, CONVOY_KEY } from "../lib/convoy.js";
import { convoyMembers, behindLine, shouldSend, fromCoords, boundsOf, radar } from "../lib/convoyMath.js";
import { formatMiles } from "../lib/geo.js";
import { loadMapbox } from "../lib/mapboxLoader.js";
import InviteSheetGame from "./InviteSheetGame.jsx";

// A convoy, live (115_convoys.sql): everyone in it on a map, moving. Each
// phone shares its position while this screen is open (or minimised) and
// sharing is on. Always dark, like the games: it's used in the car, often at
// night. Without a Mapbox key it shows a radar instead of a map.

const LEADER = "#FACC15";
const ME = "#3CABFD";
const OTHER = "#F0F0F0";
const SAFETY_KEY = "tunr.convoy.safety";

const btn = (bg, fg, extra = {}) => ({ padding: "11px 12px", borderRadius: 10, border: "none", background: bg, color: fg, fontSize: 14, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", ...extra });
const colorOf = (m) => (m.leader ? LEADER : m.me ? ME : OTHER);

export default function Convoy({ id, user, hidden = false, onMinimize, onClosed, onToast }) {
  const [state, setState] = useState(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [sharing, setSharing] = useState(false);
  const [myPos, setMyPos] = useState(null);
  const [safety, setSafety] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState([]);
  const watchRef = useRef(null);
  const lastSent = useRef(null);
  const wakeRef = useRef(null);

  // Load, then follow live changes (and poll in case the live link drops).
  useEffect(() => {
    let alive = true;
    let timer = null;
    const refresh = () =>
      loadConvoy(id)
        .then((s) => {
          if (!alive) return;
          if (!s) {
            setOver(true);
            try {
              localStorage.removeItem(CONVOY_KEY);
            } catch (e) {
              console.warn(`Couldn't forget the convoy on this phone. (${e.message})`);
            }
          } else setState(s);
          setError("");
        })
        .catch((e) => alive && setError(e.message));
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };
    refresh();
    const stop = watchConvoy(id, soon);
    const poll = setInterval(refresh, 8000);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      alive = false;
      clearTimeout(timer);
      stop();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id]);

  // Location: watch it while sharing, send it when it's worth sending.
  function begin() {
    if (!navigator.geolocation) {
      setError("This phone's browser can't share its location.");
      return;
    }
    setError("");
    setSharing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = fromCoords(pos.coords);
        if (!p) return;
        setMyPos(p);
        if (shouldSend(lastSent.current, p, Date.now())) {
          lastSent.current = { ...p, sentAt: Date.now() };
          sharePosition(id, p).catch((e) => setError(e.message));
        }
      },
      (e) => {
        setError(e.code === 1 ? "Location is off for TUNR. Allow it in your phone's settings (Location → TUNR or your browser), then try again." : `Couldn't get your location. (${e.message})`);
        if (e.code === 1) end(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
    // Keep the screen on while sharing (where the phone allows it).
    navigator.wakeLock
      ?.request("screen")
      .then((w) => (wakeRef.current = w))
      .catch((e) => console.warn(`Screen may sleep during the convoy. (${e.message})`));
  }
  function end(tellServer = true) {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    lastSent.current = null;
    setSharing(false);
    wakeRef.current?.release?.().catch((e) => console.warn(e.message));
    wakeRef.current = null;
    if (tellServer) stopSharing(id).catch((e) => setError(e.message));
  }
  useEffect(() => () => end(false), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSharing = () => {
    if (sharing) return end();
    let ok = false;
    try {
      ok = localStorage.getItem(SAFETY_KEY) === "1";
    } catch (e) {
      console.warn(e.message);
    }
    if (ok) begin();
    else setSafety(true);
  };

  const leave = async (asLeader) => {
    if (!window.confirm(asLeader ? "End the convoy for everyone? Everyone's location is wiped." : "Leave the convoy? Your location stops showing.")) return;
    try {
      end(false);
      await (asLeader ? endConvoy(id) : leaveConvoy(id));
      try {
        localStorage.removeItem(CONVOY_KEY);
      } catch (e) {
        console.warn(e.message);
      }
      onToast?.(asLeader ? "Convoy ended" : "You left the convoy");
      onClosed();
    } catch (e) {
      setError(e.message);
    }
  };

  const shareLink = async () => {
    const url = convoyLink(state.code);
    try {
      if (navigator.share) await navigator.share({ title: state.name, text: `Join my convoy on TUNR (code ${state.code}) and see the group on the map.`, url });
      else {
        await navigator.clipboard.writeText(url);
        onToast?.("Convoy link copied");
      }
    } catch (e) {
      if (e.name !== "AbortError") onToast?.(`Couldn't share the link. (${e.message})`);
    }
  };

  // Your own dot follows your phone straight away, not the server's copy.
  const mine = myPos && sharing ? { lat: myPos.lat, lng: myPos.lng, heading: myPos.heading, speed_mph: myPos.speedMph, at: new Date(now).toISOString() } : null;
  const shown = state && mine ? { ...state, members: state.members.map((m) => (m.user_id === user?.id ? { ...m, pos: mine } : m)) } : state;
  const members = convoyMembers(shown, user?.id, now);
  const meRow = members.find((m) => m.me);
  const amLeader = Boolean(meRow?.leader);
  const behind = behindLine(members);

  return (
    <div role="dialog" aria-label="Convoy" style={{ position: "fixed", inset: 0, zIndex: 470, background: "#0B0D10", color: "#F0F0F0", display: hidden ? "none" : "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top)) 12px 8px" }}>
        <button onClick={onMinimize} aria-label="Minimise the convoy" style={btn("rgba(255,255,255,0.1)", "#fff", { width: 42, height: 42, padding: 0, fontSize: 20 })}>
          ⌄
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🚗 {state?.name || "Convoy"}</div>
          <div style={{ fontSize: 12.5, color: "#8A94A3", fontFamily: "'Barlow', sans-serif" }}>
            {state ? `${members.length} in · ${members.filter((m) => m.live).length} live on the map` : over ? "Ended" : "Loading…"}
          </div>
        </div>
        {state && (
          <button onClick={shareLink} aria-label={`Convoy code ${state.code}. Share it`} style={btn("rgba(250,204,21,0.14)", LEADER, { fontFamily: "'Space Mono', monospace", letterSpacing: 2, fontSize: 15 })}>
            {state.code}
          </button>
        )}
      </div>

      {over ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>🏁</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>THIS CONVOY HAS ENDED</div>
          <div style={{ color: "#9AA4B2", fontFamily: "'Barlow', sans-serif" }}>Everyone's location has been wiped.</div>
          <button onClick={onClosed} style={btn("#0080F0", "#fff", { width: 200 })}>
            CLOSE
          </button>
        </div>
      ) : (
        <>
          <ConvoyMap members={members} meId={user?.id} />
          {error && (
            <div role="alert" style={{ margin: "8px 12px 0", padding: "8px 10px", borderRadius: 8, background: "rgba(248,113,113,0.12)", color: "#FCA5A5", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>
              {error}
            </div>
          )}
          {behind && (
            <div style={{ margin: "8px 12px 0", padding: "8px 10px", borderRadius: 8, background: "rgba(250,204,21,0.12)", color: LEADER, fontSize: 14, fontWeight: 800 }}>
              ⚠️ {behind}
            </div>
          )}

          <div style={{ padding: "10px 12px calc(12px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8, maxHeight: "42vh" }}>
            <button onClick={toggleSharing} disabled={!state} style={btn(sharing ? "rgba(16,185,129,0.16)" : "#0080F0", sharing ? "#34D399" : "#fff", { padding: "14px 0", fontSize: 17, border: sharing ? "1px solid #10B981" : "none" })}>
              {sharing ? "● SHARING MY LOCATION · TAP TO STOP" : "📍 SHARE MY LOCATION"}
            </button>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderBottom: "1px solid #1C2026", opacity: m.live ? 1 : 0.6 }}>
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: m.live ? colorOf(m) : "transparent", border: `2px solid ${colorOf(m)}`, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.leader && "👑 "}@{m.name}
                      {m.me && <span style={{ color: "#8A94A3", fontWeight: 700 }}> (you)</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#8A94A3", fontFamily: "'Barlow', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[m.car, m.live ? null : m.seen].filter(Boolean).join(" · ") || (m.live ? "On the map" : "")}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: m.behind ? LEADER : "#C9D1DC", whiteSpace: "nowrap" }}>
                    {m.live && m.pos?.speed_mph != null && <span style={{ display: "block" }}>{Math.round(m.pos.speed_mph)} mph</span>}
                    {!m.me && m.fromMe != null && <span style={{ display: "block", color: "#8A94A3" }}>{formatMiles(m.fromMe)} away</span>}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setInviting(true)} disabled={!state} style={btn("rgba(255,255,255,0.08)", "#fff", { flex: 1 })}>
                ➕ INVITE
              </button>
              <button onClick={() => leave(false)} style={btn("rgba(255,255,255,0.08)", "#C9D1DC", { flex: 1 })}>
                LEAVE
              </button>
              {amLeader && (
                <button onClick={() => leave(true)} style={btn("rgba(248,113,113,0.14)", "#F87171", { flex: 1 })}>
                  END CONVOY
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {safety && (
        <div role="dialog" aria-label="Before you drive" style={{ position: "fixed", inset: 0, zIndex: 490, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
          <div style={{ background: "#14171C", border: "1px solid #2A2F38", borderRadius: 16, padding: 18, maxWidth: 380 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>🛑 BEFORE YOU DRIVE</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#C9D1DC", fontFamily: "'Barlow', sans-serif", fontSize: 14.5, lineHeight: 1.5 }}>
              <li>Mount your phone, set it up before you move, and keep your hands off it. Let a passenger run the app.</li>
              <li>Drive at legal speeds. It's a convoy, not a race: nobody needs to keep up.</li>
              <li>Only people in this convoy see where you are. Stop sharing or leave any time and your location is wiped.</li>
              <li>Keep TUNR open on screen: phones stop sharing when the app is closed.</li>
            </ul>
            <button
              onClick={() => {
                try {
                  localStorage.setItem(SAFETY_KEY, "1");
                } catch (e) {
                  console.warn(e.message);
                }
                setSafety(false);
                begin();
              }}
              style={btn("#0080F0", "#fff", { width: "100%", marginTop: 14, padding: "13px 0", fontSize: 16 })}
            >
              GOT IT · SHARE MY LOCATION
            </button>
            <button onClick={() => setSafety(false)} style={btn("transparent", "#8A94A3", { width: "100%", marginTop: 6 })}>
              NOT NOW
            </button>
          </div>
        </div>
      )}

      {inviting && state && (
        <InviteSheetGame
          code={state.code}
          title={`SEND CONVOY ${state.code}`}
          what="this convoy"
          invited={invited}
          invite={(p) => inviteToConvoy(p.id, id)}
          onInvited={(p) => setInvited((list) => [...list, p])}
          onShareLink={shareLink}
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}

// The map (Mapbox) or, with no Mapbox key, a radar around you.
function ConvoyMap({ members, meId }) {
  const [gl, setGl] = useState(undefined); // undefined: loading, null: no map
  useEffect(() => {
    loadMapbox()
      .then(setGl)
      .catch((e) => {
        console.warn(e.message);
        setGl(null);
      });
  }, []);
  if (gl === undefined) return <div style={{ flex: 1, minHeight: 220 }} />;
  return gl ? <MapboxConvoy gl={gl} members={members} meId={meId} /> : <Radar members={members} />;
}

function MapboxConvoy({ gl, members }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const framed = useRef(false);
  const [follow, setFollow] = useState(false);

  useEffect(() => {
    map.current = new gl.Map({ container: box.current, style: "mapbox://styles/mapbox/dark-v11", center: [-84.39, 33.75], zoom: 11, attributionControl: false });
    const all = markers.current;
    return () => {
      all.forEach((m) => m.remove());
      all.clear();
      map.current?.remove();
      map.current = null;
    };
  }, [gl]);

  const withPos = members.filter((m) => m.pos);
  useEffect(() => {
    if (!map.current) return;
    const seen = new Set();
    for (const m of withPos) {
      seen.add(m.id);
      let mk = markers.current.get(m.id);
      if (!mk) {
        const el = document.createElement("div");
        mk = new gl.Marker({ element: el, rotationAlignment: "map" }).setLngLat([m.pos.lng, m.pos.lat]).addTo(map.current);
        markers.current.set(m.id, mk);
      }
      mk.getElement().innerHTML = carDot(m);
      mk.setLngLat([m.pos.lng, m.pos.lat]);
    }
    for (const [k, mk] of markers.current) if (!seen.has(k)) (mk.remove(), markers.current.delete(k));
    const me = withPos.find((m) => m.me);
    if (follow && me) map.current.easeTo({ center: [me.pos.lng, me.pos.lat], duration: 600 });
    else if (!framed.current && withPos.length) {
      framed.current = true;
      fit();
    }
  });

  function fit() {
    const b = boundsOf(withPos.map((m) => m.pos));
    if (b && map.current) map.current.fitBounds(b, { padding: 70, maxZoom: 15, duration: 700 });
  }

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 220 }}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", right: 10, top: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={() => (setFollow(false), fit())} style={btn("rgba(11,13,16,0.85)", "#fff", { fontSize: 12.5 })}>
          ⤢ EVERYONE
        </button>
        <button onClick={() => setFollow((f) => !f)} aria-pressed={follow} style={btn(follow ? "#0080F0" : "rgba(11,13,16,0.85)", "#fff", { fontSize: 12.5 })}>
          ◎ FOLLOW ME
        </button>
      </div>
    </div>
  );
}

// A car on the map: a dot in the member's colour with an arrow for their
// heading, and their name under it.
function carDot(m) {
  const c = colorOf(m);
  const arrow = m.live && m.pos.heading != null ? `<div style="position:absolute;left:50%;top:-9px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${c};transform:translateX(-50%) rotate(${m.pos.heading}deg);transform-origin:50% 22px"></div>` : "";
  const name = String(m.name).replace(/[<>&"]/g, "");
  return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;opacity:${m.live ? 1 : 0.5}">${arrow}<div style="width:26px;height:26px;border-radius:50%;background:${c};border:3px solid #0B0D10;box-shadow:0 0 0 2px ${c}66;display:flex;align-items:center;justify-content:center;color:#0B0D10;font:900 12px 'Barlow Condensed',sans-serif">${m.leader ? "👑" : name[0]?.toUpperCase() || "?"}</div><div style="margin-top:2px;padding:1px 6px;border-radius:6px;background:rgba(11,13,16,0.85);color:#fff;font:800 11px 'Barlow Condensed',sans-serif;white-space:nowrap">@${name}</div></div>`;
}

// No map key: everyone placed around you (or the leader) with distance rings.
function Radar({ members }) {
  const size = 300;
  const withPos = members.filter((m) => m.pos);
  const centre = (withPos.find((m) => m.me) || withPos.find((m) => m.leader) || withPos[0])?.pos || null;
  const { dots, miles } = radar(withPos.map((m) => ({ ...m.pos, m })), centre, size);
  return (
    <div style={{ flex: 1, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "min(100%, 46vh)", height: "auto" }} role="img" aria-label="Where everyone is">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="#0F1A14" stroke="#1F3A2A" />
        {[0.425, 0.85].map((f) => (
          <circle key={f} cx={size / 2} cy={size / 2} r={(size / 2) * f} fill="none" stroke="#24452F" strokeDasharray="4 5" />
        ))}
        <line x1={size / 2} y1={8} x2={size / 2} y2={size - 8} stroke="#1F3A2A" />
        <line x1={8} y1={size / 2} x2={size - 8} y2={size / 2} stroke="#1F3A2A" />
        <text x={size / 2} y={20} fill="#4ADE80" fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="Barlow Condensed">
          N
        </text>
        {centre && (
          <>
            <text x={size / 2 + (size / 2) * 0.425 + 3} y={size / 2 - 4} fill="#4ADE80" fontSize="11" fontFamily="Barlow Condensed">
              {miles / 2} mi
            </text>
            <text x={size / 2 + (size / 2) * 0.85 + 3} y={size / 2 - 4} fill="#4ADE80" fontSize="11" fontFamily="Barlow Condensed">
              {miles} mi
            </text>
          </>
        )}
        {dots.map(({ x, y, m }) => (
          <g key={m.id} opacity={m.live ? 1 : 0.45}>
            {m.live && m.pos.heading != null && (
              <polygon points={`${x},${y - 15} ${x - 5},${y - 7} ${x + 5},${y - 7}`} fill={colorOf(m)} transform={`rotate(${m.pos.heading} ${x} ${y})`} />
            )}
            <circle cx={x} cy={y} r="8" fill={colorOf(m)} stroke="#0B0D10" strokeWidth="2" />
            <text x={x} y={y + 21} fill="#fff" fontSize="11.5" fontWeight="800" textAnchor="middle" fontFamily="Barlow Condensed">
              @{m.name}
            </text>
          </g>
        ))}
        {!centre && (
          <text x={size / 2} y={size / 2 + 4} fill="#8A94A3" fontSize="14" textAnchor="middle" fontFamily="Barlow">
            Nobody's sharing yet
          </text>
        )}
      </svg>
    </div>
  );
}
