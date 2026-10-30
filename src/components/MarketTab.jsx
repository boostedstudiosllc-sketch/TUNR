import { useEffect, useRef, useState } from "react";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";
import { Avatar } from "./EditProfile.jsx";
import { ReportSheet } from "./CommunityBits.jsx";
import { ago } from "../lib/community.js";
import {
  CATEGORIES,
  CATEGORY,
  CONDITIONS,
  CONDITION,
  MAX_PHOTOS,
  priceText,
  loadListings,
  loadListing,
  uploadListingPhoto,
  createListing,
  updateListing,
  deleteListing,
  startChat,
  loadChats,
  loadThread,
  loadMessages,
  sendMessage,
  markChatRead,
  watchThread,
} from "../lib/market.js";

// Parts for sale, like Facebook Marketplace: browse what people are selling
// off their cars, message the seller, and sort out the deal yourselves. TUNR
// only connects you; no money goes through the app.

const SAFETY = "Meet somewhere public and busy, check the part before you pay, and never send money for something you haven't seen. TUNR doesn't handle payments.";
const QUICK = ["Is this still available?", "What's your lowest price?", "Will it fit my car?", "Can you send more photos?"];

const statusTag = (s) => (s === "sold" ? ["SOLD", "#DC2626"] : s === "pending" ? ["PENDING", "#D97706"] : null);

// `open`: { type: "listing" | "listing-chat", id } from an alert or a link.
export default function MarketTab({ user, onNeedAccount, onToast, onOpenPerson, open = null, onOpened }) {
  const [listings, setListings] = useState(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(null);
  const [q, setQ] = useState("");
  const [showSold, setShowSold] = useState(false);
  const [mine, setMine] = useState(false);
  const [viewing, setViewing] = useState(null); // listing id
  const [selling, setSelling] = useState(null); // null | {} (new) | listing (edit)
  const [inbox, setInbox] = useState(false);
  const [chat, setChat] = useState(null); // { thread, draft }
  const [chats, setChats] = useState([]);
  const searchTimer = useRef(null);

  const load = () => {
    setError("");
    loadListings({ category, q, status: showSold ? "all" : "live", seller: mine ? user?.id : null })
      .then(setListings)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [category, q, showSold, mine, user?.id]);

  const refreshChats = () => {
    if (!user) return;
    loadChats()
      .then(setChats)
      .catch((e) => console.warn(e.message));
  };
  useEffect(refreshChats, [user?.id]);

  // Opened from an alert: the listing, or the chat.
  useEffect(() => {
    if (!open) return;
    if (open.type === "listing") setViewing(open.id);
    if (open.type === "listing-chat") setChat({ thread: open.id });
    onOpened?.();
  }, [open]);

  const unread = chats.filter((c) => c.unread).length;
  const needAccount = () => (user ? false : (onNeedAccount?.(), true));

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts, cars, sizes…" aria-label="Search parts" style={{ ...field, flex: 1, borderRadius: 20, padding: "10px 16px" }} />
        <button
          aria-label={`Messages${unread ? `, ${unread} new` : ""}`}
          onClick={() => !needAccount() && setInbox(true)}
          style={{ position: "relative", width: 44, height: 42, borderRadius: 12, border: "1px solid var(--n-2a2a2a)", background: "var(--n-161616)", color: "var(--n-f0f0f0)", fontSize: 18, cursor: "pointer", flexShrink: 0 }}
        >
          💬
          {unread > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, background: "#EF4444", color: "#fff", fontSize: 11, fontWeight: 900, lineHeight: "18px", padding: "0 4px", boxSizing: "border-box" }}>{unread}</span>}
        </button>
      </div>
      <button className="action-btn" onClick={() => !needAccount() && setSelling({})} style={{ ...bigButton, marginTop: 10, background: "#16A34A" }}>
        + SELL A PART
      </button>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "12px -20px 0", padding: "0 20px 4px" }}>
        <span style={{ flex: "0 0 auto" }}>
          <Chip active={!category} onClick={() => setCategory(null)}>
            ALL
          </Chip>
        </span>
        {CATEGORIES.map(([id, icon, name]) => (
          <span key={id} style={{ flex: "0 0 auto" }}>
            <Chip active={category === id} onClick={() => setCategory(category === id ? null : id)}>
              {icon} {name.toUpperCase()}
            </Chip>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 13, fontFamily: "'Barlow', sans-serif", color: "var(--n-9aa4b2)" }}>
        {user && (
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My listings
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} /> Show sold
        </label>
      </div>

      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}
      {!listings && !error && <div style={{ ...muted, marginTop: 16 }}>Loading parts…</div>}
      {listings?.length === 0 && (
        <div style={{ textAlign: "center", padding: "34px 12px" }}>
          <div style={{ fontSize: 34 }}>🛒</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6 }}>{mine ? "You haven't listed anything" : q || category ? "Nothing matches" : "No parts for sale yet"}</div>
          <div style={{ ...muted }}>{mine || !(q || category) ? "Got parts in the garage? Tap + SELL A PART." : "Try another search or category."}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        {(listings || []).map((l) => (
          <ListingCard key={l.id} listing={l} onOpen={() => setViewing(l.id)} />
        ))}
      </div>

      {viewing && (
        <ListingView
          id={viewing}
          user={user}
          onClose={() => setViewing(null)}
          onToast={onToast}
          onNeedAccount={onNeedAccount}
          onOpenPerson={onOpenPerson}
          onEdit={(l) => (setViewing(null), setSelling(l))}
          onChanged={load}
          onMessage={(thread, draft) => setChat({ thread, draft })}
        />
      )}
      {selling && (
        <SellForm
          user={user}
          listing={selling.id ? selling : null}
          onClose={() => setSelling(null)}
          onToast={onToast}
          onSaved={(id) => {
            setSelling(null);
            load();
            setViewing(id);
          }}
        />
      )}
      {inbox && (
        <Inbox
          chats={chats}
          onClose={() => setInbox(false)}
          onOpen={(c) => setChat({ thread: c.id })}
          onRefresh={refreshChats}
        />
      )}
      {chat && (
        <ChatView
          thread={chat.thread}
          draft={chat.draft}
          user={user}
          onClose={() => {
            setChat(null);
            refreshChats();
          }}
          onOpenListing={(id) => (setChat(null), setViewing(id))}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function ListingCard({ listing: l, onOpen }) {
  const tag = statusTag(l.status);
  return (
    <button
      onClick={onOpen}
      aria-label={`${l.title}, ${priceText(l.price_cents)}${tag ? `, ${tag[0].toLowerCase()}` : ""}`}
      style={{ padding: 0, border: "1px solid var(--n-232323)", borderRadius: 14, overflow: "hidden", background: "var(--n-131313)", color: "var(--n-f0f0f0)", textAlign: "left", cursor: "pointer", opacity: l.status === "sold" ? 0.6 : 1, fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      <span style={{ position: "relative", display: "block", aspectRatio: "1", background: "var(--n-1a1a1a)" }}>
        <img src={l.photos[0]} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {tag && <span style={{ position: "absolute", top: 8, left: 8, padding: "2px 8px", borderRadius: 6, background: tag[1], color: "var(--n-ffffff)", fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{tag[0]}</span>}
      </span>
      <span style={{ display: "block", padding: "8px 10px 10px" }}>
        <span style={{ display: "block", fontSize: 18, fontWeight: 900 }}>{priceText(l.price_cents)}</span>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--n-8a94a3)", fontFamily: "'Barlow', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[l.city, ago(l.created_at)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}

function ListingView({ id, user, onClose, onToast, onNeedAccount, onOpenPerson, onEdit, onChanged, onMessage }) {
  const [l, setL] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reload = () =>
    loadListing(id)
      .then(setL)
      .catch((e) => setError(e.message));
  useEffect(() => {
    reload();
  }, [id]);
  const isMine = l && user && l.seller_id === user.id;

  async function message(draft) {
    if (!user) return onNeedAccount?.();
    setBusy(true);
    setError("");
    try {
      const thread = await startChat(l.id);
      onClose();
      onMessage(thread, draft);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    setBusy(true);
    setError("");
    try {
      await updateListing(l.id, { status });
      onToast?.(status === "sold" ? "Marked sold 🎉" : status === "pending" ? "Marked pending" : "Back on sale");
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteListing(l.id);
      onToast?.("Listing deleted");
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const tag = l && statusTag(l.status);
  return (
    <Sheet onClose={onClose} label="Part for sale" zIndex={300}>
      {!l ? (
        <div style={{ ...muted, color: error ? "var(--a-f87171)" : undefined }}>{error || "Loading…"}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -4px" }}>
            {l.photos.map((u, k) => (
              <img key={u} src={u} alt={k === 0 ? l.title : ""} style={{ flex: "0 0 100%", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 12, scrollSnapAlign: "center" }} />
            ))}
          </div>
          {l.photos.length > 1 && <div style={{ ...muted, fontSize: 11.5, textAlign: "center", marginTop: 2 }}>{l.photos.length} photos · swipe</div>}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: 30, fontWeight: 900 }}>{priceText(l.price_cents)}</div>
            {tag && <span style={{ padding: "2px 8px", borderRadius: 6, background: tag[1], color: "var(--n-ffffff)", fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>{tag[0]}</span>}
          </div>
          <div style={{ ...sheetTitle, marginTop: 0 }}>{l.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {[`${CATEGORY[l.category]?.icon} ${CATEGORY[l.category]?.name}`, CONDITION[l.condition], l.fits && `Fits: ${l.fits}`, l.city && `📍 ${l.city}`].filter(Boolean).map((t) => (
              <span key={t} style={{ padding: "4px 10px", borderRadius: 14, background: "var(--n-1a1a1a)", border: "1px solid var(--n-2a2a2a)", fontSize: 13, fontWeight: 700 }}>
                {t}
              </span>
            ))}
          </div>
          {l.description && <div style={{ ...muted, color: "var(--n-dddddd)", whiteSpace: "pre-wrap", marginTop: 10, fontSize: 14 }}>{l.description}</div>}
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>Listed {ago(l.created_at)} ago</div>

          <button onClick={() => onOpenPerson?.(l.seller_id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid var(--n-232323)", background: "var(--n-141414)", color: "var(--n-f0f0f0)", cursor: "pointer", textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}>
            <Avatar url={l.seller_avatar} name={l.seller_name} size={40} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>@{l.seller_name}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--n-8a94a3)", fontFamily: "'Barlow', sans-serif" }}>
                {l.seller_joined ? `On TUNR since ${new Date(l.seller_joined).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "TUNR member"}
                {l.seller_sold ? ` · ${l.seller_sold} sold` : ""}
              </span>
            </span>
            <span style={{ color: "var(--n-555555)", fontSize: 20 }}>›</span>
          </button>

          {error && (
            <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
              {error}
            </div>
          )}

          {isMine ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                {l.status !== "sold" && (
                  <button disabled={busy} onClick={() => setStatus("sold")} style={{ ...bigButton, marginTop: 0, background: "#16A34A" }}>
                    ✓ MARK SOLD
                  </button>
                )}
                {l.status === "active" && (
                  <button disabled={busy} onClick={() => setStatus("pending")} style={{ ...quietButton, marginTop: 0 }}>
                    MARK PENDING
                  </button>
                )}
                {l.status !== "active" && l.status !== "removed" && (
                  <button disabled={busy} onClick={() => setStatus("active")} style={{ ...quietButton, marginTop: 0 }}>
                    BACK ON SALE
                  </button>
                )}
                <button disabled={busy} onClick={() => onEdit(l)} style={{ ...quietButton, marginTop: 0 }}>
                  ✏️ EDIT
                </button>
              </div>
              {l.status === "removed" && <div style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>TUNR took this listing down after a report. It's only visible to you.</div>}
              <button onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))} style={{ ...quietButton, marginTop: 8, color: "var(--a-f87171)" }}>
                {confirmDelete ? "TAP AGAIN TO DELETE" : "DELETE LISTING"}
              </button>
            </>
          ) : l.status === "sold" ? (
            <div style={{ ...muted, marginTop: 14, textAlign: "center" }}>This part has sold.</div>
          ) : (
            <>
              <div style={{ ...label, marginTop: 14 }}>MESSAGE THE SELLER</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {QUICK.map((m) => (
                  <button key={m} disabled={busy} onClick={() => message(m)} style={{ padding: "7px 12px", borderRadius: 16, border: "1px solid var(--n-2a2a2a)", background: "var(--n-161616)", color: "var(--n-dddddd)", fontSize: 13.5, cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}>
                    {m}
                  </button>
                ))}
              </div>
              <button className="action-btn" disabled={busy} onClick={() => message("")} style={{ ...bigButton, marginTop: 10 }}>
                {busy ? "…" : "💬 MESSAGE SELLER"}
              </button>
            </>
          )}
          <div style={{ ...muted, fontSize: 12, marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(250,204,21,0.08)", border: "1px solid var(--n-3b2f0b)" }}>🛡️ {SAFETY}</div>
          {!isMine && user && (
            <button onClick={() => setReporting(true)} style={{ background: "none", border: "none", color: "var(--n-888888)", fontSize: 12.5, marginTop: 8, cursor: "pointer", textDecoration: "underline" }}>
              Report this listing
            </button>
          )}
          {reporting && <ReportSheet type="listing" id={l.id} onClose={() => setReporting(false)} onToast={onToast} />}
        </>
      )}
    </Sheet>
  );
}

function SellForm({ user, listing = null, onClose, onSaved, onToast }) {
  const [d, setD] = useState(() =>
    listing
      ? { title: listing.title, description: listing.description, category: listing.category, condition: listing.condition, price: listing.price_cents == null ? "" : String(listing.price_cents / 100), fits: listing.fits || "", city: listing.city || "", photos: listing.photos }
      : { title: "", description: "", category: "wheels", condition: "used", price: "", fits: "", city: "", photos: [] }
  );
  const [free, setFree] = useState(listing?.price_cents === 0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));

  async function addPhotos(files) {
    const list = [...files].slice(0, MAX_PHOTOS - d.photos.length);
    if (!list.length) return;
    setBusy("photo");
    setError("");
    try {
      const urls = [];
      for (const f of list) urls.push(await uploadListingPhoto(f, user.id));
      setD((x) => ({ ...x, photos: [...x.photos, ...urls] }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setError("");
    try {
      const draft = { ...d, price: free ? "0" : d.price };
      const id = listing ? (await updateListing(listing.id, draft), listing.id) : await createListing(draft);
      onToast?.(listing ? "Listing updated" : "🛒 Listed! People can message you now.");
      onSaved(id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  return (
    <Sheet onClose={onClose} label={listing ? "Edit listing" : "Sell a part"} zIndex={300}>
      <div style={sheetTitle}>{listing ? "EDIT LISTING" : "SELL A PART"}</div>
      <div style={{ ...muted, marginTop: 2 }}>People message you here; you agree the price and meet up yourselves. TUNR doesn't take a cut or handle payments.</div>

      <div style={{ ...label, marginTop: 14 }}>
        PHOTOS ({d.photos.length}/{MAX_PHOTOS}) · THE FIRST ONE IS THE COVER
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {d.photos.map((u, k) => (
          <span key={u} style={{ position: "relative" }}>
            <img src={u} alt={`Photo ${k + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: k === 0 ? "2px solid #0080F0" : "1px solid var(--n-2a2a2a)" }} />
            <button aria-label={`Remove photo ${k + 1}`} onClick={() => setD((x) => ({ ...x, photos: x.photos.filter((p) => p !== u) }))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--n-000000)", color: "var(--n-ffffff)", fontSize: 12, cursor: "pointer" }}>
              ✕
            </button>
          </span>
        ))}
        {d.photos.length < MAX_PHOTOS && (
          <label style={{ width: 72, height: 72, borderRadius: 10, border: "1px dashed var(--n-444444)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--n-888888)", fontSize: busy === "photo" ? 12 : 26, cursor: "pointer" }}>
            {busy === "photo" ? "…" : "+"}
            <input type="file" accept="image/*" multiple aria-label="Add photos" style={{ display: "none" }} onChange={(e) => addPhotos(e.target.files)} />
          </label>
        )}
      </div>

      <div style={{ ...label, marginTop: 14 }}>WHAT IS IT?</div>
      <input style={field} maxLength={80} placeholder="Volk TE37 18x9.5 +38 (set of 4)" value={d.title} onChange={set("title")} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div style={label}>PRICE ($)</div>
          <input style={{ ...field, opacity: free ? 0.4 : 1 }} inputMode="decimal" disabled={free} placeholder="Blank = make an offer" value={free ? "" : d.price} onChange={(e) => setD((x) => ({ ...x, price: e.target.value.replace(/[^0-9.,$]/g, "") }))} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12, fontSize: 14, fontFamily: "'Barlow', sans-serif", color: "var(--n-cccccc)", cursor: "pointer" }}>
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Free
        </label>
      </div>
      <div style={{ ...label, marginTop: 12 }}>CATEGORY</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CATEGORIES.map(([id, icon, name]) => (
          <span key={id} style={{ flex: "0 0 auto" }}>
            <Chip active={d.category === id} onClick={() => setD((x) => ({ ...x, category: id }))}>
              {icon} {name.toUpperCase()}
            </Chip>
          </span>
        ))}
      </div>
      <div style={{ ...label, marginTop: 12 }}>CONDITION</div>
      <div style={{ display: "flex", gap: 6 }}>
        {CONDITIONS.map(([id, name]) => (
          <Chip key={id} active={d.condition === id} onClick={() => setD((x) => ({ ...x, condition: id }))}>
            {name.toUpperCase()}
          </Chip>
        ))}
      </div>
      <div style={{ ...label, marginTop: 12 }}>FITS (OPTIONAL)</div>
      <input style={field} maxLength={120} placeholder="2015–2021 WRX/STI, 5x114.3…" value={d.fits} onChange={set("fits")} />
      <div style={{ ...label, marginTop: 12 }}>WHERE (CITY OR AREA)</div>
      <input style={field} maxLength={60} placeholder="Marietta" value={d.city} onChange={set("city")} />
      <div style={{ ...label, marginTop: 12 }}>DETAILS</div>
      <textarea style={{ ...field, minHeight: 90 }} maxLength={1500} placeholder="Mileage, any damage, why you're selling, pickup or shipping…" value={d.description} onChange={set("description")} />
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      <button className="action-btn" disabled={Boolean(busy)} onClick={save} style={{ ...bigButton, marginTop: 14, background: "#16A34A" }}>
        {busy === "save" ? "SAVING…" : listing ? "SAVE CHANGES" : "POST LISTING"}
      </button>
      <div style={{ ...muted, fontSize: 11.5, marginTop: 8 }}>Only parts you own. No stolen parts, airbags, or anything illegal to sell. Reported listings are taken down.</div>
    </Sheet>
  );
}

function Inbox({ chats, onClose, onOpen, onRefresh }) {
  useEffect(onRefresh, []);
  const [tab, setTab] = useState("all");
  const list = chats.filter((c) => tab === "all" || (tab === "selling") === c.selling);
  return (
    <Sheet onClose={onClose} label="Marketplace messages" zIndex={300}>
      <div style={sheetTitle}>💬 MESSAGES</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {[
          ["all", "ALL"],
          ["buying", "BUYING"],
          ["selling", "SELLING"],
        ].map(([id, name]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {name}
          </Chip>
        ))}
      </div>
      {list.length === 0 && <div style={{ ...muted, marginTop: 14 }}>No messages yet. Message a seller from any listing, and chats show up here.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {list.map((c) => (
          <button key={c.id} onClick={() => onOpen(c)} style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, borderRadius: 12, border: `1px solid ${c.unread ? "#0080F0" : "var(--n-232323)"}`, background: "var(--n-141414)", color: "var(--n-f0f0f0)", cursor: "pointer", textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}>
            <img src={c.photo} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                @{c.other_name} · {c.title}
              </span>
              <span style={{ display: "block", fontSize: 13, color: c.unread ? "var(--n-f0f0f0)" : "var(--n-8a94a3)", fontWeight: c.unread ? 700 : 400, fontFamily: "'Barlow', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_body}</span>
            </span>
            <span style={{ fontSize: 11.5, color: "var(--n-8a94a3)", flexShrink: 0, textAlign: "right" }}>
              {ago(c.last_at)}
              <br />
              {c.selling ? "SELLING" : "BUYING"}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ChatView({ thread, draft = "", user, onClose, onOpenListing, onToast }) {
  const [info, setInfo] = useState(null);
  const [listing, setListing] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);

  useEffect(() => {
    let stop = () => {};
    let live = true;
    (async () => {
      try {
        const t = await loadThread(thread);
        if (!live) return;
        setInfo(t);
        loadListing(t.listing_id)
          .then((l) => live && setListing(l))
          .catch((e) => console.warn(e.message));
        setMessages(await loadMessages(thread));
        markChatRead(thread);
        stop = watchThread(thread, (m) => {
          setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list || []), m]));
          markChatRead(thread);
        });
      } catch (e) {
        setError(e.message);
      }
    })();
    return () => {
      live = false;
      stop();
    };
  }, [thread]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const m = await sendMessage(thread, text);
      setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list || []), m]));
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selling = info && user && info.seller_id === user.id;
  return (
    <Sheet onClose={onClose} label="Chat about a part" zIndex={320}>
      {listing && (
        <button onClick={() => onOpenListing(listing.id)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", padding: 8, borderRadius: 12, border: "1px solid var(--n-232323)", background: "var(--n-141414)", color: "var(--n-f0f0f0)", cursor: "pointer", textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}>
          <img src={listing.photos[0]} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover" }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.title}</span>
            <span style={{ display: "block", fontSize: 13, color: "var(--n-8a94a3)" }}>
              {priceText(listing.price_cents)} · {selling ? "you're selling" : `@${listing.seller_name}`}
              {statusTag(listing.status) ? ` · ${statusTag(listing.status)[0]}` : ""}
            </span>
          </span>
          <span style={{ color: "var(--n-555555)", fontSize: 20 }}>›</span>
        </button>
      )}
      <div style={{ minHeight: 220, maxHeight: "48vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, margin: "12px 0", padding: "0 2px" }}>
        {!messages && !error && <div style={{ ...muted }}>Loading…</div>}
        {messages?.length === 0 && <div style={{ ...muted, textAlign: "center", marginTop: 30 }}>Say hi. Ask anything about the part before you meet up.</div>}
        {(messages || []).map((m) => {
          const me = m.user_id === user?.id;
          return (
            <div key={m.id} style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <div style={{ padding: "8px 12px", borderRadius: 16, borderBottomRightRadius: me ? 4 : 16, borderBottomLeftRadius: me ? 16 : 4, background: me ? "#0080F0" : "var(--n-1f2430)", color: me ? "#fff" : "#F0F0F0", fontSize: 15, fontFamily: "'Barlow', sans-serif", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
              <div style={{ fontSize: 10.5, color: "var(--n-666666)", textAlign: me ? "right" : "left", marginTop: 2 }}>{ago(m.created_at)}</div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginBottom: 6 }}>
          {error}
        </div>
      )}
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message…" aria-label="Message" style={{ ...field, flex: 1, borderRadius: 20 }} />
        <button type="submit" disabled={busy || !text.trim()} style={{ ...bigButton, marginTop: 0, width: 80, opacity: text.trim() ? 1 : 0.5 }}>
          {busy ? "…" : "SEND"}
        </button>
      </form>
      <div style={{ ...muted, fontSize: 11.5, marginTop: 8 }}>🛡️ {SAFETY}</div>
    </Sheet>
  );
}
