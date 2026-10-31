import { useEffect, useRef, useState } from "react";
import { loadCarPhotos, addCarPhotos, setCarCover, setCarPhotoCaption, removeCarPhoto, MAX_CAR_PHOTOS } from "../lib/carPhotos.js";

// A car's photo gallery (PHOTOS tab in the 3D garage): a grid that opens a
// full-screen viewer. The owner adds photos, captions them, picks the cover
// and removes them; everyone else just looks. Rules in carPhotos.js.

export default function CarPhotos({ car, editable = false, onChanged }) {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // index in the viewer
  const fileRef = useRef(null);

  const refresh = () =>
    loadCarPhotos(car.id)
      .then((p) => (setPhotos(p), setError("")))
      .catch((e) => (setPhotos([]), setError(e.message)));
  useEffect(() => {
    setPhotos(null);
    setOpen(null);
    refresh();
  }, [car.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      await addCarPhotos(car, files, car.owner_id, photos?.length || 0);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const list = photos || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Barlow Condensed', sans-serif" }}>
      {error && <div role="alert" style={{ fontSize: 13, color: "#FCA5A5", fontFamily: "'Barlow', sans-serif" }}>{error}</div>}
      {photos === null && <div style={{ fontSize: 13, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif" }}>Loading photos…</div>}
      {photos && !list.length && !editable && <div style={{ fontSize: 13, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif" }}>No photos of this car yet.</div>}

      {list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, borderRadius: 12, overflow: "hidden" }}>
          {list.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)} aria-label={p.caption || `Photo ${i + 1}`} style={{ position: "relative", padding: 0, border: "none", aspectRatio: "1", background: "#161616", cursor: "pointer", gridColumn: i === 0 ? "span 2" : undefined, gridRow: i === 0 ? "span 2" : undefined }}>
              <img src={p.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {car.photo_url === p.url && <span style={{ position: "absolute", top: 6, left: 6, fontSize: 10, fontWeight: 900, letterSpacing: 1, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,0.6)", color: "#FACC15" }}>COVER</span>}
            </button>
          ))}
        </div>
      )}

      {editable && (
        <>
          <button
            className="action-btn"
            disabled={busy || list.length >= MAX_CAR_PHOTOS}
            onClick={() => fileRef.current?.click()}
            style={{ padding: "12px 0", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)", color: "#7FC4FF", fontSize: 15, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "UPLOADING…" : list.length >= MAX_CAR_PHOTOS ? `${MAX_CAR_PHOTOS} PHOTOS: THE MOST` : "📷 ADD PHOTOS"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <div style={{ fontSize: 12, color: "#7D8796", fontFamily: "'Barlow', sans-serif" }}>
            Up to {MAX_CAR_PHOTOS} photos. Anyone who opens this car sees them; tap one to caption it or make it the cover.
          </div>
        </>
      )}

      {open !== null && list[open] && (
        <Viewer
          photos={list}
          index={open}
          cover={car.photo_url}
          editable={editable}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onCover={(p) => act(() => setCarCover(car.id, p.url))}
          onCaption={(p, text) => act(() => setCarPhotoCaption(p.id, text))}
          onRemove={(p) => {
            setOpen(null);
            act(() => removeCarPhoto(p, car, list));
          }}
        />
      )}
    </div>
  );
}

// Full screen: swipe or tap the arrows to move between photos.
function Viewer({ photos, index, cover, editable, onIndex, onClose, onCover, onCaption, onRemove }) {
  const p = photos[index];
  const [caption, setCaption] = useState(p.caption || "");
  const startX = useRef(null);
  useEffect(() => setCaption(p.caption || ""), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      if (e.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);

  const arrow = (dir) => ({
    position: "absolute",
    top: "50%",
    [dir < 0 ? "left" : "right"]: 8,
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.5)",
    color: "#fff",
    fontSize: 20,
    cursor: "pointer",
  });

  return (
    <div role="dialog" aria-label="Car photo" style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.96)", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "calc(10px + env(safe-area-inset-top)) 12px 8px", color: "#F0F0F0" }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 900, letterSpacing: 1.5 }}>
          {index + 1} / {photos.length}
        </span>
        <button onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 18, cursor: "pointer" }}>
          ✕
        </button>
      </div>
      <div
        style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "pan-y" }}
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current == null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx < -50) onIndex(Math.min(photos.length - 1, index + 1));
          if (dx > 50) onIndex(Math.max(0, index - 1));
        }}
      >
        <img src={p.url} alt={p.caption || ""} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", userSelect: "none" }} draggable={false} />
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} aria-label="Previous photo" style={arrow(-1)}>
            ‹
          </button>
        )}
        {index < photos.length - 1 && (
          <button onClick={() => onIndex(index + 1)} aria-label="Next photo" style={arrow(1)}>
            ›
          </button>
        )}
      </div>
      <div style={{ padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", color: "#F0F0F0" }}>
        {editable ? (
          <>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => caption !== (p.caption || "") && onCaption(p, caption)}
              maxLength={140}
              placeholder="Add a caption (where, when, what's new)"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#F0F0F0", fontSize: 14, fontFamily: "'Barlow', sans-serif", userSelect: "text" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button disabled={cover === p.url} onClick={() => onCover(p)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: cover === p.url ? "rgba(250,204,21,0.15)" : "#FACC15", color: cover === p.url ? "#FACC15" : "#111", fontSize: 14, fontWeight: 900, letterSpacing: 0.8, cursor: "pointer", fontFamily: "inherit" }}>
                {cover === p.url ? "★ COVER PHOTO" : "MAKE COVER"}
              </button>
              <button onClick={() => window.confirm("Remove this photo?") && onRemove(p)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(248,113,113,0.5)", background: "none", color: "#F87171", fontSize: 14, fontWeight: 900, letterSpacing: 0.8, cursor: "pointer", fontFamily: "inherit" }}>
                REMOVE
              </button>
            </div>
          </>
        ) : (
          p.caption && <div style={{ fontSize: 15, fontFamily: "'Barlow', sans-serif", textAlign: "center" }}>{p.caption}</div>
        )}
      </div>
    </div>
  );
}
