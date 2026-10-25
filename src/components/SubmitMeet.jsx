import { MeetStylePicker } from "./MeetStyle.jsx";
import { useState } from "react";
import { VIBES } from "../data/events.js";
import { compressImage } from "../lib/image.js";
import { uploadEventPhoto, readFlyer, track } from "../lib/store.js";
import { flyerToDraft } from "../lib/flyer.js";
import { flyerHash } from "../lib/phash.js";
import { geocodeLocation } from "../lib/geocode.js";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const inputStyle = {
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "13px 15px",
  color: "#F0F0F0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 11,
  color: "#888",
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export default function SubmitMeet({ onClose, onSubmit, user }) {
  const [step, setStep] = useState(1);
  const [flyerUrl, setFlyerUrl] = useState("");
  const [flyerFingerprint, setFlyerFingerprint] = useState(null);
  // The online check on the location: { status, lat, lng, checked: "location|city" }
  const [geo, setGeo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  // Starting from a flyer: idle | uploading | reading | done | notmeet | error
  const [reader, setReader] = useState({ status: "idle" });
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    location: "",
    city: "Atlanta, GA",
    vibe: "JDM",
    meetStyle: "open",
    showcaseNote: "",
    date: "",
    time: "",
    description: "",
    igLink: "",
    visibility: "public",
    accessMode: "both",
  });

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  // Stored with the meet, so the automatic import can recognise this flyer
  // when it turns up on another account and skip it as a duplicate.
  async function fingerprint(file) {
    setFlyerFingerprint(await flyerHash(file));
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setPhotoError("");
    try {
      const compressed = await compressImage(file);
      setFlyerUrl(await uploadEventPhoto(compressed, user.id));
      fingerprint(file);
    } catch (err) {
      setPhotoError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Upload the flyer, have it read, and fill in whatever it says. The flyer
  // stays attached to the meet either way.
  async function startFromFlyer(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReader({ status: "uploading" });
    let url;
    try {
      url = await uploadEventPhoto(await compressImage(file), user.id);
    } catch (err) {
      setReader({ status: "error", error: err.message || "Upload failed." });
      return;
    }
    setFlyerUrl(url);
    fingerprint(file);
    setReader({ status: "reading" });
    try {
      const found = await readFlyer(url, caption);
      if (!found.isMeet) {
        setReader({ status: "notmeet" });
        track("flyer_read", { result: "not_meet" });
        return;
      }
      const { filled } = flyerToDraft(found, {});
      setDraft((d) => flyerToDraft(found, d).draft);
      setReader({ status: "done", filled, check: found.check });
      track("flyer_read", { result: "filled", fields: filled.length });
    } catch (err) {
      setReader({ status: "error", error: err.message });
      track("flyer_read", { result: "error" });
    }
  }

  const fromFlyer = (field) => reader.status === "done" && reader.filled.includes(field);
  const label = (text, field) => (
    <div style={labelStyle}>
      {text}
      {fromFlyer(field) && <span style={{ color: "#10B981" }}> · FROM FLYER</span>}
    </div>
  );

  const canContinue =
    (step === 1 ? draft.title.trim().length >= 3 && draft.location.trim().length >= 3 : true) &&
    !checking;

  const placeKey = `${draft.location.trim()}|${draft.city.trim()}`;
  const geoWarning = geo && geo.checked === placeKey && geo.status === "none";

  // Look the place up before moving on, to pin it on the map. A place we
  // can't find gets a warning first; tapping Continue again goes ahead anyway.
  async function continueFromStep1() {
    if (!MAPBOX_TOKEN || (geo && geo.checked === placeKey)) {
      setStep(2);
      return;
    }
    setChecking(true);
    const result = await geocodeLocation(draft.location, draft.city, { token: MAPBOX_TOKEN });
    setChecking(false);
    setGeo({ ...result, checked: placeKey });
    track("location_checked", { status: result.status });
    if (result.status === "found" || result.status === "area") setStep(2);
  }

  function finish() {
    // Combine date + time into a local ISO string when both are provided
    let start = null;
    if (draft.date) {
      start = draft.time ? `${draft.date}T${draft.time}` : `${draft.date}T12:00`;
    }
    onSubmit({
      title: draft.title.trim(),
      location: draft.location.trim(),
      city: draft.city.trim() || "Atlanta, GA",
      vibe: draft.vibe,
      meetStyle: draft.meetStyle,
      showcaseNote: draft.showcaseNote,
      start,
      description: draft.description.trim(),
      igLink: draft.igLink.trim() || null,
      flyerUrl: flyerUrl || null,
      flyerHash: flyerUrl ? flyerFingerprint : null,
      ...(geo && geo.checked === placeKey && (geo.status === "found" || geo.status === "area")
        ? { lat: geo.lat, lng: geo.lng }
        : {}),
      visibility: draft.visibility,
      accessMode: draft.visibility === "private" ? draft.accessMode : "both",
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        width: "100%",
        maxWidth: 430,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.9)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#0F0F0F",
          borderRadius: "16px 16px 0 0",
          border: "1px solid #1E1E1E",
          padding: "24px 20px 48px",
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>POST A MEET</div>
            <div style={{ fontSize: 12, color: "#555", letterSpacing: 1 }}>STEP {step} OF 2</div>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              color: "#fff",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {[1, 2].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: s <= step ? "#FF4500" : "#1E1E1E",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {user && (
              <FlyerStart
                reader={reader}
                flyerUrl={flyerUrl}
                onPick={startFromFlyer}
                caption={caption}
                setCaption={setCaption}
                showCaption={showCaption}
                setShowCaption={setShowCaption}
              />
            )}

            <div>
              {label("MEET TITLE", "title")}
              <input
                style={inputStyle}
                placeholder="e.g. Midnight Grid Meet"
                value={draft.title}
                onChange={set("title")}
              />
            </div>
            <div>
              {label("LOCATION / ADDRESS", "location")}
              <input
                style={inputStyle}
                placeholder="e.g. Ponce City Market"
                value={draft.location}
                onChange={set("location")}
              />
            </div>
            <div>
              {label("CITY", "city")}
              <input style={inputStyle} value={draft.city} onChange={set("city")} />
              {geoWarning && (
                <div style={{ ...warn, marginTop: 8 }}>
                  We couldn't find that place on the map. Add a street address so people can get
                  there — or continue if it's announced later.
                </div>
              )}
            </div>
            <div>
              {label("VIBE", "vibe")}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {Object.keys(VIBES).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDraft((d) => ({ ...d, vibe: v }))}
                    style={{
                      flex: 1,
                      minWidth: 58,
                      padding: "9px 0",
                      borderRadius: 6,
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.8,
                      background: "#161616",
                      color: VIBES[v],
                      border: `1.5px solid ${draft.vibe === v ? VIBES[v] : "#2A2A2A"}`,
                      cursor: "pointer",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <MeetStylePicker
              style={draft.meetStyle}
              note={draft.showcaseNote}
              onStyle={(m) => setDraft((d) => ({ ...d, meetStyle: m }))}
              onNote={(n) => setDraft((d) => ({ ...d, showcaseNote: n }))}
              labelStyle={labelStyle}
              inputStyle={inputStyle}
            />
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={labelStyle}>WHO CAN SEE THE ADDRESS</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { id: "public", label: "PUBLIC", sub: "Anyone" },
                  { id: "private", label: "PRIVATE", sub: "Invite only" },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setDraft((d) => ({ ...d, visibility: v.id }))}
                    style={{
                      flex: 1,
                      padding: "11px 0",
                      borderRadius: 8,
                      background: draft.visibility === v.id ? "rgba(255,69,0,0.12)" : "#161616",
                      border: `1.5px solid ${draft.visibility === v.id ? "#FF4500" : "#2A2A2A"}`,
                      color: draft.visibility === v.id ? "#FF4500" : "#777",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>{v.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 0.5 }}>{v.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {draft.visibility === "private" && (
              <div
                style={{
                  background: "#131313",
                  border: "1px solid #242424",
                  borderRadius: 8,
                  padding: "13px 14px",
                }}
              >
                <div style={labelStyle}>HOW PEOPLE GET IN</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[
                    { id: "both", label: "Passcode or request", sub: "Share a code, and take requests too" },
                    { id: "passcode", label: "Passcode only", sub: "Only people you give the code to" },
                    { id: "request", label: "Requests only", sub: "You approve everyone by hand" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDraft((d) => ({ ...d, accessMode: m.id }))}
                      style={{
                        textAlign: "left",
                        padding: "9px 11px",
                        borderRadius: 6,
                        background: draft.accessMode === m.id ? "rgba(255,69,0,0.1)" : "#0F0F0F",
                        border: `1px solid ${draft.accessMode === m.id ? "#FF4500" : "#242424"}`,
                        color: draft.accessMode === m.id ? "#FF4500" : "#888",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6 }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#666", letterSpacing: 0.3 }}>{m.sub}</div>
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#555",
                    marginTop: 10,
                    lineHeight: 1.5,
                    fontFamily: "'Barlow', sans-serif",
                  }}
                >
                  Everyone still sees the title, vibe and date on Discover — the address, map and
                  description stay hidden until someone's in. Your passcode is generated after you
                  post; you'll find it on the meet.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                {label("DATE", "date")}
                <input type="date" style={inputStyle} value={draft.date} onChange={set("date")} />
              </div>
              <div style={{ flex: 1 }}>
                {label("START TIME", "time")}
                <input type="time" style={inputStyle} value={draft.time} onChange={set("time")} />
              </div>
            </div>
            <div>
              {label("DESCRIPTION, RULES, WHAT'S WELCOME", "description")}
              <textarea
                rows={4}
                style={{ ...inputStyle, resize: "none" }}
                placeholder="Describe the vibe. Note: meets promoting street racing, takeovers, or other illegal activity are removed."
                value={draft.description}
                onChange={set("description")}
              />
            </div>
            {user && (
              <div>
                <div style={labelStyle}>FLYER (OPTIONAL)</div>
                {flyerUrl ? (
                  <div style={{ position: "relative" }}>
                    <img
                      src={flyerUrl}
                      alt="Flyer"
                      style={{
                        width: "100%",
                        maxHeight: 260,
                        objectFit: "contain",
                        background: "#0A0A0A",
                        borderRadius: 8,
                        display: "block",
                        border: "1px solid #2A2A2A",
                      }}
                    />
                    <button
                      className="action-btn"
                      onClick={() => setFlyerUrl("")}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(0,0,0,0.75)",
                        border: "1px solid #444",
                        color: "#fff",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        fontSize: 14,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 76,
                      borderRadius: 8,
                      border: "1px dashed #2A2A2A",
                      background: "#131313",
                      color: "#777",
                      fontSize: 12.5,
                      fontWeight: 700,
                      letterSpacing: 1,
                      cursor: "pointer",
                    }}
                  >
                    {uploading ? "UPLOADING…" : "📄 ADD THE FLYER"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={pickPhoto}
                      disabled={uploading}
                      style={{ display: "none" }}
                    />
                  </label>
                )}
                {photoError && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#FF6B4A",
                      marginTop: 6,
                      fontFamily: "'Barlow', sans-serif",
                    }}
                  >
                    {photoError}
                  </div>
                )}
              </div>
            )}

            <div>
              <div style={labelStyle}>INSTAGRAM POST LINK (OPTIONAL)</div>
              <input
                style={inputStyle}
                placeholder="https://www.instagram.com/p/..."
                value={draft.igLink}
                onChange={set("igLink")}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#555",
                  marginTop: 6,
                  fontFamily: "'Barlow', sans-serif",
                  lineHeight: 1.5,
                }}
              >
                Link the original flyer post so the host gets credit. The flyer shows on the meet
                page, whole, so people can read it themselves.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button
              className="action-btn"
              onClick={() => setStep(1)}
              style={{
                flex: 0.4,
                padding: "14px 0",
                background: "#1A1A1A",
                border: "1px solid #2A2A2A",
                color: "#888",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              BACK
            </button>
          )}
          <button
            className="action-btn"
            disabled={!canContinue}
            onClick={() => {
              if (!canContinue) return;
              if (step === 1) continueFromStep1();
              else finish();
            }}
            style={{
              flex: 1,
              padding: "14px 0",
              background: canContinue ? "#FF4500" : "#1E1E1E",
              color: canContinue ? "#fff" : "#444",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 2,
              fontFamily: "'Barlow Condensed', sans-serif",
              boxShadow: canContinue ? "0 4px 20px rgba(255,69,0,0.35)" : "none",
            }}
          >
            {step === 2
              ? "🏁 POST MEET"
              : checking
              ? "CHECKING THE ADDRESS…"
              : geoWarning
              ? "CONTINUE ANYWAY →"
              : "CONTINUE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FlyerStart({ reader, flyerUrl, onPick, caption, setCaption, showCaption, setShowCaption }) {
  const busy = reader.status === "uploading" || reader.status === "reading";
  const picker = (text) => (
    <label
      className="action-btn"
      style={{
        display: "block",
        textAlign: "center",
        marginTop: 11,
        padding: "11px 0",
        borderRadius: 8,
        background: "rgba(255,69,0,0.12)",
        border: "1px solid #FF4500",
        color: "#FF4500",
        fontSize: 12.5,
        fontWeight: 800,
        letterSpacing: 1.2,
        cursor: "pointer",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {text}
      <input type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
    </label>
  );

  return (
    <div
      style={{
        background: "#131313",
        border: `1px solid ${reader.status === "done" ? "#10B981" : "rgba(255,69,0,0.45)"}`,
        borderRadius: 10,
        padding: "14px 15px",
      }}
    >
      {busy || reader.status === "done" || reader.status === "notmeet" ? (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {flyerUrl && (
            <img
              src={flyerUrl}
              alt="Your flyer"
              style={{
                width: 54,
                height: 68,
                objectFit: "cover",
                borderRadius: 6,
                border: "1px solid #2A2A2A",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {busy ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.4 }}>
                  {reader.status === "uploading" ? "UPLOADING YOUR FLYER…" : "READING YOUR FLYER…"}
                </div>
                <div style={note}>This takes a few seconds.</div>
              </>
            ) : reader.status === "done" ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.4, color: "#10B981" }}>
                  ✓ FILLED IN FROM YOUR FLYER
                </div>
                <div style={note}>
                  {reader.filled.length
                    ? "Check every field before you post — fields marked FROM FLYER came off it."
                    : "We couldn't pick out any details, so fill them in below."}
                </div>
                {reader.check?.length > 0 && (
                  <ul style={{ ...note, color: "#F59E0B", margin: "6px 0 0", paddingLeft: 16 }}>
                    {reader.check.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.4 }}>
                  THAT DOESN'T LOOK LIKE A MEET FLYER
                </div>
                <div style={note}>
                  Nothing was filled in. It's still attached as the flyer — remove it on the next
                  step if that's wrong.
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.4 }}>📄 START FROM YOUR FLYER</div>
          <div style={note}>
            Upload it and we'll fill this in for you. You check everything before it posts.
          </div>
          {reader.status === "error" && (
            <div style={{ ...note, color: "#FF6B4A" }}>{reader.error}</div>
          )}
          {showCaption ? (
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Paste the Instagram caption here, then upload the flyer"
              maxLength={2200}
              style={{ ...inputStyle, resize: "none", marginTop: 10, fontSize: 13 }}
            />
          ) : (
            <button
              onClick={() => setShowCaption(true)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                marginTop: 8,
                color: "#777",
                fontSize: 11.5,
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "'Barlow', sans-serif",
              }}
            >
              Address only in the caption? Paste it first
            </button>
          )}
        </>
      )}
      {!busy && picker(reader.status === "idle" || reader.status === "error" ? "UPLOAD FLYER" : "USE A DIFFERENT FLYER")}
    </div>
  );
}

const note = {
  fontSize: 12,
  color: "#888",
  lineHeight: 1.55,
  marginTop: 4,
  fontFamily: "'Barlow', sans-serif",
};

const warn = {
  fontSize: 12,
  color: "#F59E0B",
  lineHeight: 1.55,
  fontFamily: "'Barlow', sans-serif",
};
