import { useEffect, useState } from "react";
import {
  loadMeetPhotos,
  uploadMeetPhoto,
  addMeetPhoto,
  deleteMeetPhoto,
  track,
} from "../lib/store.js";
import { compressImage } from "../lib/image.js";

// Gives a meet an afterlife. Anyone who can see the meet can see the photos;
// anyone signed in can add one. Deleting is decided by row-level security —
// uploader, the meet's host, or an admin — so the button is shown to those
// three and the database is what actually enforces it.
export default function MeetPhotos({ eventId, user, isHost, onNeedAccount, onToast }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    setPhotos(await loadMeetPhotos(eventId));
    setLoaded(true);
  }

  useEffect(() => {
    let alive = true;
    loadMeetPhotos(eventId).then((rows) => {
      if (!alive) return;
      setPhotos(rows);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [eventId]);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!user) return onNeedAccount();
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const url = await uploadMeetPhoto(compressed, user.id);
      await addMeetPhoto(eventId, url, "", user.id);
      track("meet_photo_added", { eventId });
      await refresh();
      onToast("Photo added");
    } catch (err) {
      onToast(err.message || "Couldn't add that photo.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(photo) {
    await deleteMeetPhoto(photo.id);
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    setViewing(null);
    onToast("Photo removed");
  }

  if (!loaded) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 11, color: "#555", letterSpacing: 2 }}>
          PHOTOS {photos.length > 0 && `· ${photos.length}`}
        </div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1,
            color: "#FF4500",
            border: "1px solid #FF4500",
            background: "rgba(255,69,0,0.1)",
            borderRadius: 6,
            padding: "5px 11px",
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {uploading ? "UPLOADING…" : "+ ADD PHOTO"}
          <input
            type="file"
            accept="image/*"
            onChange={pick}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {photos.length === 0 ? (
        <div
          style={{
            fontSize: 12.5,
            color: "#555",
            fontFamily: "'Barlow', sans-serif",
            lineHeight: 1.6,
          }}
        >
          No photos yet. Add yours after the meet — it's what people come back for.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => setViewing(photo)}
              style={{
                position: "relative",
                paddingTop: "100%",
                borderRadius: 7,
                overflow: "hidden",
                background: "#161616",
                border: "1px solid #242424",
                cursor: "pointer",
              }}
            >
              <img
                src={photo.photo_url}
                alt={photo.caption || ""}
                loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div
          onClick={() => setViewing(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            background: "rgba(0,0,0,0.94)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <img
            src={viewing.photo_url}
            alt={viewing.caption || ""}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 10, display: "block" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ marginTop: 12, textAlign: "center", maxWidth: 380 }}
          >
            <div style={{ fontSize: 12.5, color: "#FF7A00", fontWeight: 700 }}>
              @{viewing.username}
            </div>
            {viewing.caption && (
              <div
                style={{
                  fontSize: 13,
                  color: "#CCC",
                  marginTop: 4,
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                {viewing.caption}
              </div>
            )}
            {user && (viewing.user_id === user.id || isHost) && (
              <button
                className="action-btn"
                onClick={() => remove(viewing)}
                style={{
                  marginTop: 12,
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid rgba(239,68,68,0.5)",
                  borderRadius: 7,
                  color: "#EF4444",
                  fontSize: 11.5,
                  fontWeight: 800,
                  letterSpacing: 1,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                REMOVE PHOTO
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
