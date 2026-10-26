import { useEffect, useState } from "react";
import { loadClubs, createClub, CLUB_KINDS, kindLabel } from "../lib/community.js";
import { uploadEventPhoto } from "../lib/store.js";
import { compressImage } from "../lib/image.js";
import { useAccount } from "../lib/account.js";
import { loadMyInvites, openInvites } from "../lib/invites.js";
import { Logo } from "./CommunityBits.jsx";
import ClubView from "./ClubView.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton, Chip } from "./Sheet.jsx";

// Clubs: yours first, then everyone's, and starting one.
export default function ClubsTab({ user, events, open, onOpened, onNeedAccount, onToast, onOpenPerson, onOpenMeet }) {
  const [clubs, setClubs] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [clubId, setClubId] = useState(null);
  const [creating, setCreating] = useState(false);
  const account = useAccount();
  const unconfirmed = Boolean(user && account && !account.confirmed);

  function refresh() {
    return loadClubs()
      .then(setClubs)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    refresh();
  }, [user?.id]);

  useEffect(() => {
    if (open?.type === "club") {
      setClubId(open.id);
      onOpened();
    }
  }, [open]);

  const term = search.trim().toLowerCase();
  const matching = (clubs || []).filter((c) => !term || [c.name, c.city, c.description].some((v) => (v || "").toLowerCase().includes(term)));
  const mine = matching.filter((c) => c.my_role);
  const others = matching.filter((c) => !c.my_role);
  const club = clubId && (clubs || []).find((c) => c.id === clubId);

  // Starting a club unlocks with one invited friend; anyone who already
  // started one keeps the ability. The database enforces it too.
  async function startCreating() {
    if (!(clubs || []).some((c) => c.my_role === "owner")) {
      try {
        const inv = await loadMyInvites();
        if (inv && !inv.unlocked?.clubs) {
          openInvites("Invite 1 friend to start your own club. Joining clubs is always free.");
          return;
        }
      } catch (e) {
        console.warn(e.message);
      }
    }
    setCreating(true);
  }

  return (
    <div>
      <button
        onClick={() => (!user ? onNeedAccount() : unconfirmed ? onToast("Confirm your email first — tap the link we emailed you.") : startCreating())}
        style={{ ...bigButton, padding: "12px 0" }}
      >
        + START A CLUB
      </button>
      <input style={{ ...field, marginTop: 10 }} placeholder="🔍 Search clubs by name or city" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 10 }}>{error}</div>}

      {mine.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 16 }}>YOUR CLUBS</div>
          <List clubs={mine} onOpen={setClubId} />
        </>
      )}
      <div style={{ ...label, marginTop: 16 }}>{mine.length ? "MORE CLUBS" : "CLUBS"}</div>
      {clubs === null ? (
        <div style={muted}>Loading…</div>
      ) : others.length === 0 ? (
        <div style={{ ...muted, textAlign: "center", padding: "14px 0" }}>{term ? "No clubs match that." : "No clubs yet — start the first one for your crew."}</div>
      ) : (
        <List clubs={others} onOpen={setClubId} />
      )}

      {club && (
        <ClubView
          club={club}
          user={user}
          events={events}
          onClose={() => setClubId(null)}
          onToast={onToast}
          onNeedAccount={onNeedAccount}
          onOpenPerson={onOpenPerson}
          onOpenMeet={onOpenMeet}
          onChanged={refresh}
        />
      )}
      {creating && (
        <ClubForm
          user={user}
          onClose={() => setCreating(false)}
          onToast={onToast}
          onCreated={(id) => {
            setCreating(false);
            refresh().then(() => setClubId(id));
          }}
        />
      )}
    </div>
  );
}

function List({ clubs, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {clubs.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", background: "#111", border: "1px solid #222", borderRadius: 10, padding: "10px 12px", color: "#E6E6E6", cursor: "pointer" }}
        >
          <Logo url={c.logo_url} fallback={kindLabel(c.kind).split(" ")[0]} size={44} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>
              {c.name} {c.visibility === "private" && <span style={{ fontSize: 11 }}>🔒</span>}
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "#777", fontFamily: "'Barlow', sans-serif" }}>
              {kindLabel(c.kind)} · {c.members} {c.members === 1 ? "member" : "members"}
              {c.city ? ` · ${c.city}` : ""}
            </span>
          </span>
          {c.requests > 0 && <span style={{ fontSize: 10.5, color: "#0080F0", fontWeight: 800 }}>{c.requests} ASKING</span>}
          {c.my_role && !c.requests && (
            <span style={{ fontSize: 10, color: "#3CABFD", fontWeight: 800, letterSpacing: 0.8 }}>{c.my_role === "requested" ? "ASKED" : c.my_role.toUpperCase()}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ClubForm({ user, onClose, onToast, onCreated }) {
  const [draft, setDraft] = useState({ name: "", kind: "car_club", city: "Atlanta, GA", description: "", visibility: "public", logoUrl: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function logo(file) {
    if (!file) return;
    setBusy("logo");
    setError("");
    try {
      set({ logoUrl: await uploadEventPhoto(await compressImage(file, { maxDim: 600 }), user.id) });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    setError("");
    if (draft.name.trim().length < 3) return setError("Name your club (at least 3 characters).");
    setBusy("save");
    try {
      const id = await createClub(draft, user.id);
      onToast(`🏁 ${draft.name.trim()} is live — you're the owner`);
      onCreated(id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  return (
    <Sheet onClose={onClose} label="Start a club" zIndex={285}>
      <div style={sheetTitle}>START A CLUB</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <label style={{ cursor: "pointer" }}>
          <Logo url={draft.logoUrl} fallback={busy === "logo" ? "…" : "📷"} size={64} />
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => logo(e.target.files?.[0])} />
        </label>
        <div style={{ ...muted, fontSize: 12 }}>Tap to add a logo (optional).</div>
      </div>
      <div style={{ ...label, marginTop: 14 }}>NAME</div>
      <input style={field} maxLength={50} placeholder="e.g. GA Bimmer Club" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      <div style={{ ...label, marginTop: 14 }}>TYPE</div>
      <div style={{ display: "flex", gap: 6 }}>
        {CLUB_KINDS.map((k) => (
          <Chip key={k.id} active={draft.kind === k.id} onClick={() => set({ kind: k.id })}>
            {k.label}
          </Chip>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>CITY</div>
      <input style={field} maxLength={60} value={draft.city} onChange={(e) => set({ city: e.target.value })} />
      <div style={{ ...label, marginTop: 14 }}>ABOUT</div>
      <textarea style={{ ...field, minHeight: 70 }} maxLength={500} placeholder="What the club's about, what you drive, how often you meet." value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      <div style={{ ...label, marginTop: 14 }}>WHO CAN JOIN</div>
      <div style={{ display: "flex", gap: 6 }}>
        <Chip active={draft.visibility === "public"} onClick={() => set({ visibility: "public" })}>
          🌐 ANYONE
        </Chip>
        <Chip active={draft.visibility === "private"} onClick={() => set({ visibility: "private" })}>
          🔒 I APPROVE
        </Chip>
      </div>
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 10 }}>{error}</div>}
      <button disabled={Boolean(busy)} onClick={submit} style={{ ...bigButton, marginTop: 16 }}>
        {busy === "save" ? "CREATING…" : "CREATE CLUB"}
      </button>
    </Sheet>
  );
}
