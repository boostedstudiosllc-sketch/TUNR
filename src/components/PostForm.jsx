import { useState } from "react";
import { POST_TAGS, createPost } from "../lib/community.js";
import { uploadEventPhoto } from "../lib/store.js";
import { compressImage } from "../lib/image.js";
import { currentPosition } from "../lib/alerts.js";
import { geocodeLocation, reverseGeocode } from "../lib/geocode.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// A new post in a forum. Photo-spot posts can carry a map pin.
export default function PostForm({ forum, forums = [], user, onClose, onPosted, onToast }) {
  const [forumId, setForumId] = useState(forum?.id || "");
  const [tag, setTag] = useState("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState([]);
  const [place, setPlace] = useState("");
  const [pin, setPin] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function addPhotos(files) {
    setError("");
    const room = 4 - photos.length;
    const list = [...files].slice(0, room);
    if (!list.length) return;
    setBusy("photo");
    try {
      const urls = [];
      for (const f of list) urls.push(await uploadEventPhoto(await compressImage(f), user.id));
      setPhotos((p) => [...p, ...urls].slice(0, 4));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function hereNow() {
    setBusy("gps");
    setError("");
    try {
      const pos = await currentPosition();
      const where = await reverseGeocode(pos.lat, pos.lng, { token: MAPBOX_TOKEN });
      setPin(pos);
      if (!place) setPlace(where.placeName || where.area || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    setError("");
    if (!forumId) return setError("Pick a forum to post in.");
    if (title.trim().length < 3) return setError("Give it a title (at least 3 characters).");
    setBusy("post");
    try {
      let spot = pin;
      if (tag === "spot" && !spot && place.trim()) {
        if (!MAPBOX_TOKEN) throw new Error("Looking up a typed spot isn't set up (VITE_MAPBOX_TOKEN is missing). Tap “I'm here” instead.");
        const found = await geocodeLocation(place, "", { token: MAPBOX_TOKEN });
        if (found.status === "none") throw new Error(`Couldn't find “${place.trim()}” on the map. Add the street or city, or tap “I'm here”.`);
        spot = { lat: found.lat, lng: found.lng };
      }
      const id = await createPost({ forumId, tag, title, body, photoUrls: photos, place, lat: spot?.lat, lng: spot?.lng }, user.id);
      onToast("Posted");
      onPosted(id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  return (
    <Sheet onClose={onClose} label="New post" zIndex={285}>
      <div style={sheetTitle}>NEW POST</div>
      {forum ? (
        <div style={{ ...muted, marginTop: 2 }}>
          in {forum.icon} {forum.name}
        </div>
      ) : (
        <>
          <div style={{ ...label, marginTop: 14 }}>FORUM</div>
          <select style={field} value={forumId} onChange={(e) => setForumId(e.target.value)}>
            <option value="">Choose a forum…</option>
            {forums.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon} {f.name}
              </option>
            ))}
          </select>
        </>
      )}

      <div style={{ ...label, marginTop: 14 }}>WHAT KIND</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {POST_TAGS.map((t) => (
          <span key={t.id} style={{ flex: "0 0 auto" }}>
            <Chip active={tag === t.id} onClick={() => setTag(t.id)}>
              {t.label}
            </Chip>
          </span>
        ))}
      </div>

      <div style={{ ...label, marginTop: 14 }}>TITLE</div>
      <input
        style={field}
        maxLength={140}
        placeholder={tag === "question" ? "e.g. 2019 540i coolant leak — where's it from?" : tag === "spot" ? "e.g. Jackson St Bridge at sunset" : "Title"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div style={{ ...label, marginTop: 14 }}>DETAILS</div>
      <textarea
        style={{ ...field, minHeight: 110, resize: "vertical" }}
        maxLength={10000}
        placeholder={tag === "question" ? "Year, make, model, what it's doing, what you've tried." : tag === "spot" ? "Best time to go, parking, security, anything to know." : "Say more…"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {tag === "spot" && (
        <>
          <div style={{ ...label, marginTop: 14 }}>WHERE IS IT</div>
          <input
            style={field}
            maxLength={120}
            placeholder="Spot name or address"
            value={place}
            onChange={(e) => {
              setPlace(e.target.value);
              setPin(null);
            }}
          />
          <button disabled={busy === "gps"} onClick={hereNow} style={{ ...quietButton, marginTop: 8, padding: "10px 0" }}>
            {busy === "gps" ? "FINDING YOU…" : pin ? "📍 PINNED WHERE YOU ARE" : "📍 I'M HERE"}
          </button>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>Shows on the map's Photo spots layer. Public places only — no one's home.</div>
        </>
      )}

      <div style={{ ...label, marginTop: 14 }}>PHOTOS ({photos.length}/4)</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {photos.map((u) => (
          <div key={u} style={{ position: "relative" }}>
            <img src={u} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8 }} />
            <button
              onClick={() => setPhotos((p) => p.filter((x) => x !== u))}
              aria-label="Remove photo"
              style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "var(--n-000000)", color: "var(--n-ffffff)", border: "1px solid var(--n-444444)", cursor: "pointer", fontSize: 11 }}
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < 4 && (
          <label style={{ width: 70, height: 70, borderRadius: 8, border: "1px dashed var(--n-444444)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--n-888888)", fontSize: busy === "photo" ? 11 : 24, cursor: "pointer" }}>
            {busy === "photo" ? "…" : "+"}
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => addPhotos(e.target.files)} />
          </label>
        )}
      </div>

      {error && <div style={{ ...muted, color: "var(--a-ef4444)", marginTop: 12 }}>{error}</div>}
      <button disabled={busy === "post" || busy === "photo"} onClick={submit} style={{ ...bigButton, marginTop: 16 }}>
        {busy === "post" ? "POSTING…" : "POST"}
      </button>
      <div style={{ ...muted, fontSize: 11, textAlign: "center", marginTop: 6 }}>
        No selling, no street racing, no one's private info. Breaking the rules gets posts removed.
      </div>
    </Sheet>
  );
}
