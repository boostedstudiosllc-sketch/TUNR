import { useEffect, useState } from "react";
import { loadHomeSlides, saveHomeSlide, removeHomeSlide, liveNow } from "../lib/homeSlides.js";
import { THEME_IDS, THEMES, safeLink } from "../lib/slides.js";
import { uploadEventPhoto } from "../lib/store.js";
import { compressImage } from "../lib/image.js";
import { muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";
import { Slide } from "./HomeSlides.jsx";

// Settings → Admin → Home banner: the slides at the top of Discover
// (119_home_slides.sql). Add one with a live preview, schedule it, reorder,
// pause or remove. The app adds its own slides too (your next meet, the
// hottest meet, TUNR Tuesdays, the Daily Pit Stop): see slides.js.

const DESTINATIONS = [
  ["tab:discover", "Discover"],
  ["tab:perks", "Perks, points & games"],
  ["play:rush", "TUNR Rush (game)"],
  ["play:drift", "Drift King (game)"],
  ["tab:community", "Community (linkups, convoys)"],
  ["open:photo-spots", "Photo spots"],
  ["open:pitstop", "Daily Pit Stop"],
  ["open:setup", "Setup & permissions"],
  ["meet", "A meet…"],
  ["https", "A web address…"],
];

const blank = { title: "", body: "", cta: "Check it out", link: "tab:discover", theme: "blue", image_url: null, starts_at: "", ends_at: "", sort: 50, active: true };
const toLocal = (iso) => (iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

function status(s) {
  if (!s.active) return ["PAUSED", "var(--n-888888)"];
  if (s.starts_at && Date.parse(s.starts_at) > Date.now()) return ["SCHEDULED", "#FACC15"];
  if (s.ends_at && Date.parse(s.ends_at) <= Date.now()) return ["ENDED", "var(--n-888888)"];
  return liveNow(s) ? ["LIVE", "#10B981"] : ["OFF", "var(--n-888888)"];
}

export default function HomeSlidesAdmin({ user, onToast }) {
  const [slides, setSlides] = useState(null);
  const [draft, setDraft] = useState(null); // the slide being added or edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    loadHomeSlides()
      .then((s) => (setSlides(s), setError("")))
      .catch((e) => (setSlides([]), setError(e.message)));
  useEffect(() => {
    refresh();
  }, []);

  const act = async (fn, done) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (done) onToast?.(done);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const move = (i, dir) => {
    const list = [...slides];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    act(() => Promise.all(list.map((s, k) => (s.sort === (k + 1) * 10 ? null : saveHomeSlide({ ...s, sort: (k + 1) * 10 })))));
  };

  if (draft) return <SlideForm draft={draft} setDraft={setDraft} user={user} busy={busy} error={error} onCancel={() => (setDraft(null), setError(""))} onSave={() => act(() => saveHomeSlide({ ...draft, starts_at: fromLocal(draft.starts_at), ends_at: fromLocal(draft.ends_at) }).then(() => setDraft(null)), "Slide saved")} />;

  return (
    <div>
      <div style={{ ...muted, marginBottom: 10 }}>The swipeable banner at the top of Discover. Your slides show in this order; the app adds its own (your next meet, the hottest meet this week, TUNR Tuesdays, the Daily Pit Stop).</div>
      <button onClick={() => setDraft({ ...blank, sort: ((slides?.length || 0) + 1) * 10 })} style={bigButton}>
        ＋ ADD A SLIDE
      </button>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      {slides === null && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}
      {slides?.map((s, i) => {
        const [word, color] = status(s);
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${THEMES[s.theme]?.[1] || "#0A4F9C"}, ${THEMES[s.theme]?.[2] || "#0080F0"})` }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: 1, color }}>
                {word}
                <span style={{ color: "var(--n-888888)", fontWeight: 600, letterSpacing: 0 }}> · {s.link}</span>
              </span>
            </span>
            <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up" style={{ ...quietButton, width: 32, padding: "6px 0" }}>
              ▲
            </button>
            <button disabled={busy || i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down" style={{ ...quietButton, width: 32, padding: "6px 0" }}>
              ▼
            </button>
            <button disabled={busy} onClick={() => setDraft({ ...s, starts_at: toLocal(s.starts_at), ends_at: toLocal(s.ends_at) })} style={{ ...quietButton, width: "auto", padding: "6px 10px", fontSize: 12.5 }}>
              EDIT
            </button>
            <button disabled={busy} onClick={() => act(() => saveHomeSlide({ ...s, active: !s.active }), s.active ? "Paused" : "Live again")} style={{ ...quietButton, width: "auto", padding: "6px 10px", fontSize: 12.5 }}>
              {s.active ? "PAUSE" : "RESUME"}
            </button>
            <button disabled={busy} onClick={() => window.confirm(`Remove “${s.title}”?`) && act(() => removeHomeSlide(s.id), "Removed")} aria-label={`Remove ${s.title}`} style={{ ...quietButton, width: 32, padding: "6px 0", color: "var(--a-f87171)" }}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SlideForm({ draft, setDraft, user, busy, error, onCancel, onSave }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dest = draft.link.startsWith("meet:") ? "meet" : draft.link.startsWith("https:") ? "https" : DESTINATIONS.some(([id]) => id === draft.link) ? draft.link : "https";
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState("");

  const pickDest = (id) => set({ link: id === "meet" ? "meet:" : id === "https" ? "https://" : id });
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUpErr("");
    try {
      set({ image_url: await uploadEventPhoto(await compressImage(file, { maxDim: 1200 }), user.id) });
    } catch (e) {
      setUpErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ ...label, marginTop: 0 }}>PREVIEW</div>
      <Slide s={{ ...draft, kicker: "NEW ON TUNR", image: draft.image_url, link: safeLink(draft.link) || "tab:discover", title: draft.title || "Your headline", body: draft.body }} onGo={() => {}} />

      <div style={{ ...label, marginTop: 14 }}>HEADLINE ({draft.title.length}/60)</div>
      <input style={field} maxLength={60} placeholder="Holiday toy drive meet" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
      <div style={{ ...label, marginTop: 12 }}>A LINE MORE ({(draft.body || "").length}/140)</div>
      <textarea style={{ ...field, minHeight: 64, resize: "vertical" }} maxLength={140} placeholder="Bring a new toy, get 20 points. Saturday at Lenox." value={draft.body || ""} onChange={(e) => set({ body: e.target.value })} />
      <div style={{ ...label, marginTop: 12 }}>BUTTON</div>
      <input style={field} maxLength={24} value={draft.cta} onChange={(e) => set({ cta: e.target.value })} />
      <div style={{ ...label, marginTop: 12 }}>BUTTON GOES TO</div>
      <select style={field} value={dest} onChange={(e) => pickDest(e.target.value)}>
        {DESTINATIONS.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {dest === "meet" && <input style={{ ...field, marginTop: 6 }} placeholder="The meet's id (from its share link)" value={draft.link.slice(5)} onChange={(e) => set({ link: `meet:${e.target.value.trim()}` })} />}
      {dest === "https" && <input style={{ ...field, marginTop: 6 }} placeholder="https://boostedstudios.com/…" value={draft.link} onChange={(e) => set({ link: e.target.value.trim() })} />}

      <div style={{ ...label, marginTop: 12 }}>COLOUR</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {THEME_IDS.map((t) => (
          <span key={t} style={{ flex: "0 0 auto" }}>
            <Chip active={draft.theme === t} onClick={() => set({ theme: t })}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, marginRight: 6, verticalAlign: -1, background: THEMES[t][2] }} />
              {t}
            </Chip>
          </span>
        ))}
      </div>

      <div style={{ ...label, marginTop: 12 }}>PICTURE (OPTIONAL)</div>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ ...quietButton, flex: 1, textAlign: "center", padding: "10px 0", cursor: "pointer" }}>
          {uploading ? "UPLOADING…" : draft.image_url ? "📷 CHANGE PICTURE" : "📷 ADD A PICTURE"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {draft.image_url && (
          <button onClick={() => set({ image_url: null })} style={{ ...quietButton, width: "auto", padding: "10px 12px" }}>
            REMOVE
          </button>
        )}
      </div>
      {upErr && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 6 }}>{upErr}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>SHOW FROM (OPTIONAL)</div>
          <input type="datetime-local" style={field} value={draft.starts_at || ""} onChange={(e) => set({ starts_at: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>UNTIL (OPTIONAL)</div>
          <input type="datetime-local" style={field} value={draft.ends_at || ""} onChange={(e) => set({ ends_at: e.target.value })} />
        </div>
      </div>

      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}
      <button disabled={busy || uploading} onClick={onSave} style={{ ...bigButton, marginTop: 14 }}>
        {busy ? "SAVING…" : draft.id ? "SAVE CHANGES" : "PUT IT LIVE"}
      </button>
      <button onClick={onCancel} style={{ ...quietButton, marginTop: 6 }}>
        CANCEL
      </button>
    </div>
  );
}
