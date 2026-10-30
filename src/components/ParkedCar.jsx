import { useEffect, useRef, useState } from "react";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";
import { compressImage } from "../lib/image.js";
import { FLOORS, OPEN_EVENT, floorName, parkedSummary, makeSpot, loadSpot, saveSpot, clearSpot, walkUrl, distanceText, savedAgo } from "../lib/parking.js";

// The 🅿️ in the header: save where you parked (map pin + floor, spot, photo,
// note) and find it again. Rules and storage are in src/lib/parking.js.

function here() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This phone doesn't share its location with web apps."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Location is off for TUNR" : `Couldn't find you (${e.message || "no signal"})`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Couldn't read that photo. (${r.error?.message || "unknown error"})`));
    r.readAsDataURL(file);
  });
}

export default function ParkedCar({ onToast }) {
  const [spot, setSpot] = useState(() => loadSpot());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meet, setMeet] = useState(null);

  useEffect(() => {
    const onOpen = (e) => {
      setMeet(e.detail?.meet || null);
      setEditing(!loadSpot() || Boolean(e.detail?.meet));
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const show = () => {
    setMeet(null);
    setEditing(!spot);
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={show}
        aria-label={spot ? `Where I parked: ${parkedSummary(spot)}` : "Save where I parked"}
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: spot ? "var(--n-001830)" : "var(--n-161616)",
          border: `1px solid ${spot ? "#0080F0" : "var(--n-2a2a2a)"}`,
          color: spot ? "var(--a-4da6ff)" : "var(--n-dddddd)",
          fontSize: 17,
          fontWeight: 900,
          fontFamily: "'Barlow Condensed', sans-serif",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        P
        {spot && (
          <span style={{ position: "absolute", top: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: "#0080F0", border: "2px solid var(--n-0a0a0a)" }} />
        )}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Where I parked" portal>
          {editing ? (
            <ParkForm
              start={spot && !meet ? spot : null}
              meet={meet || (spot && !meet ? spot.meet : null)}
              onCancel={spot ? () => setEditing(false) : () => setOpen(false)}
              onSaved={(s, droppedPhoto) => {
                setSpot(s);
                setEditing(false);
                onToast?.(droppedPhoto ? `🅿️ Saved: ${parkedSummary(s)}. The photo didn't fit on this phone.` : `🅿️ Saved: ${parkedSummary(s)}`);
              }}
            />
          ) : (
            <FindCar
              spot={spot}
              onUpdate={() => setEditing(true)}
              onLeft={() => {
                clearSpot();
                setSpot(null);
                setOpen(false);
                onToast?.("🅿️ Cleared. Drive safe!");
              }}
            />
          )}
        </Sheet>
      )}
    </>
  );
}

function ParkForm({ start, meet, onCancel, onSaved }) {
  const [pos, setPos] = useState(start?.lat != null ? { lat: start.lat, lng: start.lng, accuracy: start.accuracy } : null);
  const [locError, setLocError] = useState("");
  const [finding, setFinding] = useState(false);
  const [floor, setFloor] = useState(start?.floor || "");
  const [other, setOther] = useState(start?.floor && !FLOORS.includes(start.floor) ? start.floor : "");
  const [space, setSpace] = useState(start?.space || "");
  const [note, setNote] = useState(start?.note || "");
  const [photo, setPhoto] = useState(start?.photo || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const locate = () => {
    setFinding(true);
    setLocError("");
    here()
      .then(setPos)
      .catch((e) => setLocError(e.message))
      .finally(() => setFinding(false));
  };
  // A new spot pins where you are now; updating keeps the old pin unless asked.
  useEffect(() => {
    if (!start) locate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPhoto = async (file) => {
    if (!file) return;
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Pick a photo.");
      setPhoto(await readAsDataUrl(await compressImage(file, { maxDim: 900, quality: 0.7 })));
    } catch (e) {
      setError(e.message);
    }
  };

  const save = () => {
    setError("");
    setBusy(true);
    try {
      const s = makeSpot({ ...pos, floor: floor === "other" ? other : floor, space, note, photo, meet });
      const { spot, droppedPhoto } = saveSpot(s);
      onSaved(spot, droppedPhoto);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={sheetTitle}>🅿️ WHERE I PARKED</div>
      <div style={{ ...muted, marginTop: 4 }}>{meet?.title ? `At ${meet.title}. ` : ""}Saved on this phone only.</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "var(--n-111111)", border: "1px solid var(--n-222222)" }}>
        <div style={{ flex: 1, fontSize: 13, color: pos ? "#10B981" : "var(--n-aaaaaa)", fontWeight: 700 }}>
          {finding ? "📍 Finding you…" : pos ? `📍 Pinned on the map${pos.accuracy ? ` (within ${Math.round(pos.accuracy)} m)` : ""}` : `📍 ${locError || "No map pin"}. The floor and spot still save.`}
        </div>
        <button type="button" onClick={locate} disabled={finding} style={{ ...quietButton, width: "auto", padding: "7px 10px", fontSize: 11.5 }}>
          {pos ? "RE-PIN" : "PIN HERE"}
        </button>
      </div>

      <div style={{ ...label, marginTop: 16 }}>FLOOR</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {[...FLOORS, "other"].map((f) => {
          const on = floor === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setFloor(on ? "" : f)}
              style={{
                padding: "10px 0",
                borderRadius: 8,
                fontSize: f.length > 2 ? 11 : 14,
                fontWeight: 900,
                fontFamily: "'Barlow Condensed', sans-serif",
                cursor: "pointer",
                background: on ? "#0080F0" : "var(--n-161616)",
                color: on ? "#fff" : "var(--n-cccccc)",
                border: `1px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`,
              }}
            >
              {f === "other" ? "OTHER" : f.toUpperCase()}
            </button>
          );
        })}
      </div>
      {floor === "other" && (
        <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={20} placeholder="e.g. P2, Level 4B, Purple" style={{ ...field, marginTop: 8 }} autoFocus />
      )}

      <div style={{ ...label, marginTop: 14 }}>SPOT OR SECTION</div>
      <input value={space} onChange={(e) => setSpace(e.target.value)} maxLength={40} placeholder="e.g. C14, Blue zone, Row 7" style={field} />

      <div style={{ ...label, marginTop: 14 }}>PHOTO OF THE SIGN OR PILLAR</div>
      {photo ? (
        <div style={{ position: "relative" }}>
          <img src={photo} alt="Where you parked" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, display: "block" }} />
          <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "var(--n-ffffff)", fontSize: 14, cursor: "pointer" }}>
            ✕
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} style={{ ...quietButton, padding: "12px 0" }}>
          📷 TAKE A PHOTO
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
          pickPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div style={{ ...label, marginTop: 14 }}>NOTE</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. by the elevators, left of the ramp" style={field} />

      {error && <div style={{ marginTop: 12, fontSize: 13, color: "var(--a-f87171)", fontWeight: 700 }}>{error}</div>}

      <button className="action-btn" onClick={save} disabled={busy || finding} style={{ ...bigButton, marginTop: 18, opacity: busy || finding ? 0.6 : 1 }}>
        {finding ? "FINDING YOU…" : "SAVE WHERE I PARKED"}
      </button>
      <button onClick={onCancel} style={{ ...quietButton, marginTop: 8 }}>
        CANCEL
      </button>
    </div>
  );
}

function FindCar({ spot, onUpdate, onLeft }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (spot?.lat == null) return;
    here()
      .then(setMe)
      .catch((e) => console.warn("Couldn't find you for the distance:", e.message));
  }, [spot]);
  if (!spot) return null;
  const walk = walkUrl(spot);
  const away = distanceText(spot, me);
  const big = floorName(spot.floor);

  return (
    <div>
      <div style={sheetTitle}>🅿️ YOUR CAR</div>
      <div style={{ ...muted, marginTop: 2 }}>
        Saved {savedAgo(spot.savedAt)}
        {spot.meet?.title ? ` at ${spot.meet.title}` : ""}
      </div>

      <div style={{ marginTop: 14, padding: "18px 16px", borderRadius: 14, background: "linear-gradient(135deg, var(--n-001830), var(--n-0a0a0a))", border: "1px solid #003A75", textAlign: "center" }}>
        {big ? (
          <>
            <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 800, color: "var(--a-4da6ff)" }}>FLOOR</div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.05, fontFamily: "'Barlow Condensed', sans-serif", color: "var(--n-ffffff)" }}>{big.toUpperCase()}</div>
          </>
        ) : (
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--n-aaaaaa)" }}>No floor saved</div>
        )}
        {spot.space && <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif", color: "var(--n-dddddd)" }}>SPOT {spot.space.toUpperCase()}</div>}
        {spot.note && <div style={{ ...muted, marginTop: 6, color: "var(--n-bbbbbb)" }}>“{spot.note}”</div>}
        {away && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#10B981" }}>📍 {away}</div>}
      </div>

      {spot.photo && <img src={spot.photo} alt="Where you parked" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, marginTop: 12, display: "block" }} />}

      {walk ? (
        <a href={walk} target="_blank" rel="noreferrer" style={{ ...bigButton, marginTop: 14, display: "block", textAlign: "center", textDecoration: "none", background: "#10B981" }}>
          🚶 WALK BACK TO MY CAR
        </a>
      ) : (
        <div style={{ ...muted, marginTop: 12, fontSize: 12 }}>No map pin for this one (location was off), so no walking directions.</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={onUpdate} style={quietButton}>
          ✏️ UPDATE
        </button>
        <button onClick={onLeft} style={quietButton}>
          ✓ GOT MY CAR
        </button>
      </div>
      <div style={{ ...muted, fontSize: 11.5, marginTop: 10 }}>Saved on this phone only. TUNR doesn't see it.</div>
    </div>
  );
}
