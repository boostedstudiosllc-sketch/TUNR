import { useEffect, useMemo, useState } from "react";
import { loadSpots, setSpotSaved, spotsForum } from "../lib/photoSpots.js";
import { arrangeSpots, SORTS, VIBES, BEST_TIMES, vibeLabel, timeLabel, securityOf, directionsUrl } from "../lib/spotRules.js";
import { currentPosition } from "../lib/alerts.js";
import { hasAcceptedLinkupTerms } from "../lib/linkups.js";
import { muted, field, quietButton } from "./Sheet.jsx";
import PostForm from "./PostForm.jsx";
import LinkupForm from "./LinkupForm.jsx";
import LinkupTerms from "./LinkupTerms.jsx";
import SpotCover from "./SpotCover.jsx";

// Photo spots: places to shoot cars, from members (116_photo_spots.sql).
// Browse near you, top rated, new or saved; filter by the kind of shot or the
// time of day; save one; get directions; or start a photos linkup there.
// Each spot is a GA Photo Spots forum post, so votes and comments live there.

const go = (link) => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link } }));

const chip = (on) => ({
  flex: "0 0 auto",
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`,
  background: on ? "rgba(0,128,240,0.16)" : "var(--n-131313)",
  color: on ? "var(--a-7fc4ff)" : "var(--n-bbbbbb)",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.4,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
  whiteSpace: "nowrap",
});

// The facts line for a spot: kind of shot, best time, security. Also used on
// the spot's forum post (PostView.jsx).
export function SpotFacts({ spot }) {
  const sec = securityOf(spot.spot_security);
  const pills = [...(spot.spot_vibes || []).map(vibeLabel), spot.spot_best_time && timeLabel(spot.spot_best_time)].filter(Boolean);
  if (!pills.length && !sec) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
      {pills.map((p) => (
        <span key={p} style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "var(--n-1a1a1a)", color: "var(--n-cccccc)", fontFamily: "'Barlow', sans-serif" }}>
          {p}
        </span>
      ))}
      {sec && (
        <span title={sec.blurb} style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid var(--n-2a2a2a)", color: "var(--n-cccccc)", fontFamily: "'Barlow', sans-serif" }}>
          {sec.icon} {sec.name}: {sec.blurb.toLowerCase()}
        </span>
      )}
    </div>
  );
}

export default function PhotoSpots({ user, onClose, onNeedAccount, onToast, onShowTerms }) {
  const [spots, setSpots] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("top");
  const [vibe, setVibe] = useState(null);
  const [time, setTime] = useState(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(null);
  const [adding, setAdding] = useState(null); // the forum, while posting a spot
  const [shooting, setShooting] = useState(null); // the spot, while starting a linkup
  const [termsThen, setTermsThen] = useState(null);

  const refresh = () =>
    loadSpots()
      .then((s) => (setSpots(s), setError("")))
      .catch((e) => (setSpots((s) => s || []), setError(e.message)));
  useEffect(() => {
    refresh();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSort = async (id) => {
    setSort(id);
    if (id === "near" && !position) {
      try {
        setPosition(await currentPosition());
      } catch (e) {
        setError(`Couldn't find where you are, so these are sorted by rating. (${e.message})`);
      }
    }
    if (id === "saved" && !user) onNeedAccount?.();
  };

  const list = useMemo(() => arrangeSpots(spots, { sort, vibe, time, query, position }), [spots, sort, vibe, time, query, position]);

  const toggleSave = async (s) => {
    if (!user) return onNeedAccount?.();
    setSpots((all) => all.map((x) => (x.id === s.id ? { ...x, saved: !s.saved, saves: (x.saves || 0) + (s.saved ? -1 : 1) } : x)));
    try {
      await setSpotSaved(s.id, !s.saved);
    } catch (e) {
      onToast?.(e.message);
      refresh();
    }
  };

  const addSpot = async () => {
    if (!user) return onNeedAccount?.();
    try {
      const forum = await spotsForum();
      if (!forum) throw new Error("The photo spots forum isn't set up yet. Ask an admin to create “GA Photo Spots” in Community → Forums.");
      setAdding(forum);
    } catch (e) {
      onToast?.(e.message);
    }
  };

  const shootHere = async (s) => {
    if (!user) return onNeedAccount?.();
    try {
      if (await hasAcceptedLinkupTerms(user.id)) setShooting(s);
      else setTermsThen(() => () => setShooting(s));
    } catch (e) {
      onToast?.(e.message);
    }
  };

  return (
    <div role="dialog" aria-label="Photo spots" style={{ position: "fixed", inset: 0, zIndex: 262, background: "var(--n-0a0a0a)", color: "var(--n-f0f0f0)", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ padding: "calc(12px + env(safe-area-inset-top)) 16px 8px", borderBottom: "1px solid var(--n-1a1a1a)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} aria-label="Back" style={{ ...quietButton, width: 40, height: 40, padding: 0, fontSize: 20 }}>
            ‹
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>📸 PHOTO SPOTS</div>
            <div style={{ ...muted, fontSize: 12.5 }}>Where Georgia shoots cars{spots ? ` · ${spots.length} spots` : ""}</div>
          </div>
          <button onClick={addSpot} style={{ ...quietButton, width: "auto", padding: "9px 12px", fontSize: 13, color: "var(--a-7fc4ff)" }}>
            ＋ ADD A SPOT
          </button>
        </div>
        <input style={{ ...field, marginTop: 10 }} placeholder="Search spots: bridge, Midtown, rooftop…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search photo spots" />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 8, paddingBottom: 2 }}>
          {SORTS.map(([id, name]) => (
            <button key={id} onClick={() => pickSort(id)} aria-pressed={sort === id} style={chip(sort === id)}>
              {name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 6, paddingBottom: 2 }}>
          {VIBES.map(([id, icon, name]) => (
            <button key={id} onClick={() => setVibe((v) => (v === id ? null : id))} aria-pressed={vibe === id} style={chip(vibe === id)}>
              {icon} {name}
            </button>
          ))}
          {BEST_TIMES.map(([id, icon, name]) => (
            <button key={id} onClick={() => setTime((t) => (t === id ? null : id))} aria-pressed={time === id} style={chip(time === id)}>
              {icon} {name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px calc(20px + env(safe-area-inset-bottom))" }}>
        {error && (
          <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginBottom: 10 }}>
            {error}
          </div>
        )}
        {spots === null && <div style={muted}>Loading spots…</div>}
        {spots && !list.length && (
          <div style={{ textAlign: "center", padding: "40px 10px" }}>
            <div style={{ fontSize: 40 }}>📸</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{spots.length ? "NO SPOTS MATCH" : "NO SPOTS YET"}</div>
            <div style={{ ...muted, marginTop: 4 }}>{spots.length ? "Try another filter." : "Know a good place to shoot? Add the first one."}</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map((s) => (
            <SpotCard key={s.id} spot={s} onSave={() => toggleSave(s)} onShoot={() => shootHere(s)} onOpen={() => (onClose(), go(`post:${s.id}`))} />
          ))}
        </div>
      </div>

      {adding && (
        <PostForm
          forum={adding}
          user={user}
          initialTag="spot"
          onClose={() => setAdding(null)}
          onToast={onToast}
          onPosted={() => {
            setAdding(null);
            onToast?.("📸 Spot added. Thanks for putting people on!");
            refresh();
          }}
        />
      )}
      {shooting && (
        <LinkupForm
          user={user}
          initial={{ kind: "photos", place: shooting.title.slice(0, 120), lat: shooting.lat, lng: shooting.lng, note: `Shooting at ${shooting.title}. Found on TUNR Photo spots.`.slice(0, 280) }}
          onClose={() => setShooting(null)}
          onToast={onToast}
          onPosted={(id) => {
            setShooting(null);
            onClose();
            go(`linkup:${id}`);
          }}
        />
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

function SpotCard({ spot: s, onSave, onShoot, onOpen }) {
  const small = { ...quietButton, flex: 1, padding: "9px 0", fontSize: 13, marginTop: 0 };
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--n-1f1f1f)", background: "var(--n-111111)" }}>
      <SpotCover spot={s} onOpen={onOpen} />
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 800, color: "var(--n-aaaaaa)" }}>
          <span>▲ {s.score ?? 0}</span>
          <span>♡ {s.saves ?? 0} saved</span>
          <span>💬 {s.comments ?? 0}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, fontFamily: "'Barlow', sans-serif" }}>by @{s.username}</span>
        </div>
        <SpotFacts spot={s} />
        {s.body && <div style={{ fontSize: 13.5, color: "var(--n-bbbbbb)", fontFamily: "'Barlow', sans-serif", lineHeight: 1.45, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.body}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button onClick={onSave} aria-pressed={Boolean(s.saved)} style={{ ...small, color: s.saved ? "var(--a-f472b6)" : undefined }}>
            {s.saved ? "♥ SAVED" : "♡ SAVE"}
          </button>
          <a href={directionsUrl(s)} target="_blank" rel="noreferrer" style={{ ...small, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "#10B981" }}>
            🧭 GO
          </a>
          <button onClick={onShoot} style={{ ...small, color: "var(--a-7fc4ff)" }}>
            📸 SHOOT HERE
          </button>
        </div>
      </div>
    </div>
  );
}
