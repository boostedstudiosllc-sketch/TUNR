import { useEffect, useState } from "react";
import { saveProfile, uploadAvatar, removeAvatarFile } from "../lib/store.js";
import Sheet, { sheetTitle, muted, label, field, bigButton } from "./Sheet.jsx";

const BIO_MAX = 160;

// Lowercase letters, numbers, _ and . — what the database accepts.
const cleanUsername = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");

// A round profile photo, or the orange initial when there isn't one (or it
// won't load).
export function Avatar({ url, name, size = 64, ring = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const frame = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    boxSizing: "border-box",
    ...(ring ? { border: "3px solid #FF4500", boxShadow: "0 0 20px rgba(255,69,0,0.35)" } : {}),
  };
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        style={{ ...frame, objectFit: "cover", background: "#1A1A1A", display: "block" }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        ...frame,
        background: "linear-gradient(135deg, #FF4500, #FF7A00)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4),
        fontWeight: 900,
        color: "#fff",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {(name || "T")[0].toUpperCase()}
    </div>
  );
}

// Photo, username, city, bio and the photographer badge.
export default function EditProfile({ user, profile, onClose, onSaved, onToast, zIndex = 295 }) {
  const [draft, setDraft] = useState(() => ({
    username: profile.username || "",
    city: profile.city || "Atlanta, GA",
    bio: profile.bio || "",
    avatarUrl: profile.avatarUrl || "",
    isPhotographer: Boolean(profile.isPhotographer),
    photoPage: profile.photoPage || "",
  }));
  const [uploading, setUploading] = useState(false);
  // Photos uploaded in this sheet; any not kept are deleted from storage.
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadAvatar(file, user.id);
      setUploads((u) => [...u, url]);
      set({ avatarUrl: url });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (busy || uploading) return;
    const next = {
      username: cleanUsername(draft.username),
      city: draft.city.trim() || "Atlanta, GA",
      isPhotographer: Boolean(draft.isPhotographer),
      photoPage: draft.isPhotographer ? (draft.photoPage || "").trim().slice(0, 200) : "",
      avatarUrl: (draft.avatarUrl || "").trim(),
      bio: (draft.bio || "").trim().slice(0, BIO_MAX),
    };
    if ((next.bio.match(/\n/g) || []).length > 4) {
      setError("Keep your bio to 5 lines or fewer.");
      return;
    }
    if (next.username && (next.username.length < 3 || next.username.length > 24)) {
      setError("Usernames are 3 to 24 characters long.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveProfile(next, user?.id || null);
      onSaved(next);
      // The photo that was replaced or removed, and any tried and dropped.
      const stale = [...uploads, profile.avatarUrl].filter((u) => u && u !== next.avatarUrl);
      Promise.all(stale.map((u) => removeAvatarFile(u, user.id))).catch((e) => onToast(e.message));
      onClose();
    } catch (e) {
      setError(e.message || "Couldn't save your profile.");
      onToast(e.message || "Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }

  // Closing without saving: photos uploaded here aren't used, so delete them.
  function cancel() {
    if (uploads.length) Promise.all(uploads.map((u) => removeAvatarFile(u, user.id))).catch((e) => console.warn(e.message));
    onClose();
  }

  return (
    <Sheet onClose={cancel} label="Edit profile" zIndex={zIndex}>
      <div style={sheetTitle}>EDIT PROFILE</div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
        <Avatar url={draft.avatarUrl} name={draft.username} size={84} ring />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <label style={{ ...pill, color: "#FF7A00", borderColor: "#FF4500", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "UPLOADING…" : draft.avatarUrl ? "📷 CHANGE PHOTO" : "📷 ADD A PHOTO"}
            <input
              type="file"
              accept="image/*"
              onChange={pickPhoto}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
          {draft.avatarUrl && !uploading && (
            <button type="button" onClick={() => set({ avatarUrl: "" })} style={{ ...pill, color: "#999" }}>
              REMOVE PHOTO
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={label}>USERNAME</div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#666", fontSize: 14, fontFamily: "'Barlow', sans-serif" }}>
            @
          </span>
          <input
            style={{ ...field, paddingLeft: 28 }}
            placeholder="username"
            aria-label="Username"
            value={draft.username}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })}
          />
        </div>
        <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>3 to 24 characters: letters, numbers, _ and .</div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={label}>CITY</div>
        <input
          style={field}
          placeholder="City, State"
          aria-label="City"
          maxLength={60}
          value={draft.city}
          onChange={(e) => set({ city: e.target.value })}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={label}>BIO</div>
          <div style={{ fontSize: 11, color: draft.bio.length >= BIO_MAX ? "#FF7A00" : "#555", fontFamily: "'Barlow', sans-serif" }}>
            {draft.bio.length}/{BIO_MAX}
          </div>
        </div>
        <textarea
          style={{ ...field, minHeight: 78, resize: "vertical", lineHeight: 1.45 }}
          placeholder="What you drive, what you shoot, what you're building…"
          aria-label="Bio"
          maxLength={BIO_MAX}
          value={draft.bio}
          onChange={(e) => set({ bio: e.target.value.slice(0, BIO_MAX) })}
        />
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 16,
          fontSize: 14,
          color: "#DDD",
          cursor: "pointer",
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        <input
          type="checkbox"
          checked={draft.isPhotographer}
          onChange={(e) => set({ isPhotographer: e.target.checked })}
          style={{ accentColor: "#38BDF8", width: 18, height: 18 }}
        />
        📸 I'm a car photographer
      </label>
      {draft.isPhotographer && (
        <div style={{ marginTop: 10 }}>
          <div style={label}>PHOTO PAGE (OPTIONAL)</div>
          <input
            style={field}
            placeholder="@yourphotopage or website"
            aria-label="Photo page"
            maxLength={200}
            value={draft.photoPage}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => set({ photoPage: e.target.value })}
          />
        </div>
      )}

      {error && (
        <div role="alert" style={{ ...muted, color: "#FF6B4A", marginTop: 14 }}>
          {error}
        </div>
      )}

      <button
        className="action-btn"
        onClick={save}
        disabled={busy || uploading}
        style={{ ...bigButton, marginTop: 18, opacity: busy || uploading ? 0.6 : 1 }}
      >
        {busy ? "SAVING…" : "SAVE PROFILE"}
      </button>
    </Sheet>
  );
}

const pill = {
  display: "inline-block",
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
  textAlign: "center",
  whiteSpace: "nowrap",
};
