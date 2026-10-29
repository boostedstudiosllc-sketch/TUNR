import { useEffect, useRef, useState } from "react";
import {
  POINTS,
  SHOP_OPEN,
  STREAK_MILESTONES,
  loadMyStreak,
  REDEEM_RULES,
  loadMyPoints,
  claimStarterPoints,
  loadPointHistory,
  loadRewards,
  redeemReward,
  redeemMessage,
  loadMyRedemptions,
  saveReward,
  loadPartnersForRewards,
  loadRedemptionQueue,
  decideRedemption,
  loadRecentCheckins,
  voidCheckin,
  adjustPoints,
  dollars,
  toCents,
  STORES,
  loadPointsSettings,
  redeemPointCard,
  cleanCardCode,
  CARD_PARAM,
  createPointCards,
  loadCardBatches,
  loadUnusedCards,
  voidCardBatch,
  reportPointsIssue,
  loadMyPointsIssues,
  loadPointsIssueQueue,
  resolvePointsIssue,
  savePointsSettings,
  loadPurchaseQueue,
  recordPurchase,
  findUserId,
  CLAIM_HINT,
  RECEIPT_BUSINESSES,
  submitReceipt,
  loadMyReceipts,
  receiptLink,
  decidePurchase,
} from "../lib/points.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";
import Leaderboard from "./Leaderboard.jsx";
import PrintPage from "./PrintPage.jsx";

const KIND_LABELS = { merch: "MERCH", discount: "DISCOUNT", experience: "EXPERIENCE", other: "REWARD" };

export function RewardsSheet({ user, initialCard = "", onClose, onToast }) {
  return (
    <Sheet onClose={onClose} label="Points and rewards" zIndex={296}>
      <div style={sheetTitle}>POINTS &amp; REWARDS</div>
      <RewardsPanel user={user} initialCard={initialCard} onToast={onToast} />
    </Sheet>
  );
}

// Your balance, how to earn, what you can get, what you've claimed, and the
// history behind the number.
export default function RewardsPanel({ user, initialCard = "", onToast }) {
  const [points, setPoints] = useState(null);
  const [starter, setStarter] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [claims, setClaims] = useState([]);
  const [history, setHistory] = useState([]);
  const [rates, setRates] = useState({ points_per_dollar: 1, member_bonus: 50, referral_points: 5, welcome_points: 1, receipt_points: 10 });
  const [streak, setStreak] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [p, r, c, h, rt, st] = await Promise.all([
        loadMyPoints(),
        loadRewards(),
        loadMyRedemptions(user.id),
        loadPointHistory(user.id),
        loadPointsSettings(),
        loadMyStreak(),
      ]);
      setStreak(st);
      setPoints(p);
      setRates(rt);
      setRewards(r.filter((x) => x.active));
      setClaims(c);
      setHistory(h);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  // Opening this is when one-time bonuses get checked and paid.
  useEffect(() => {
    let alive = true;
    claimStarterPoints()
      .then((s) => {
        if (!alive) return;
        setStarter(s);
        if (s.added > 0) onToast(`⭐ +${s.added} getting-started points. ${CLAIM_HINT}`);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && refresh());
    return () => {
      alive = false;
    };
  }, [user.id]);

  async function redeem(reward) {
    setBusy(true);
    try {
      const result = await redeemReward(reward.id);
      if (result.status === "ok") {
        onToast(`🎁 Claimed! Your code is ${result.claim_code}`);
        setConfirming(null);
        await refresh();
      } else {
        onToast(redeemMessage(result));
      }
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Scanned a card: it goes first, right under the balance.
  const cardSection = (
    <>
      <Title>GOT A POINTS CARD?</Title>
      <CardForm initialCode={initialCard} onAdded={refresh} onToast={onToast} />
    </>
  );

  const balance = Number(points?.balance || 0);
  const spent = Number(points?.spent_cents || 0);
  const pending = claims.filter((c) => c.status === "pending");

  return (
    <div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      <div style={{ ...card, background: "linear-gradient(135deg, #2A1F00, #141414)", borderColor: "#4A3A00", textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 900, color: "#FACC15", lineHeight: 1 }}>
          {points ? balance.toLocaleString() : "…"}
        </div>
        <div style={{ ...label, marginTop: 6, marginBottom: 0, color: "#A08A40" }}>POINTS</div>
        {points && !points.can_redeem && (
          <div style={{ ...muted, fontSize: 12.5, marginTop: 10 }}>
            Rewards unlock once your account is {REDEEM_RULES.accountDays} days old and you've made a Boosted
            purchase or checked in at {REDEEM_RULES.checkins} meets. You're at{" "}
            {Math.min(points.account_days, REDEEM_RULES.accountDays)}/{REDEEM_RULES.accountDays} days,{" "}
            {Math.min(points.checkins, REDEEM_RULES.checkins)}/{REDEEM_RULES.checkins} check-ins.
          </div>
        )}
      </div>

      {SHOP_OPEN && initialCard && cardSection}

      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ fontSize: 30 }}>{streak?.current ? "🔥" : "🧊"}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 900 }}>
            {streak ? `${streak.current}-WEEK STREAK` : "WEEKLY STREAK"}
          </span>
          <span style={{ display: "block", ...muted, fontSize: 12.5 }}>
            {!streak
              ? "Loading…"
              : streak.this_week
                ? `✓ This week counts.${streak.best ? ` Best: ${streak.best} weeks.` : ""}`
                : streak.current
                  ? "Check in at a meet by Sunday night to keep it going."
                  : "Check in at a meet this week to start one."}
          </span>
        </span>
        <button className="action-btn" onClick={() => setShowBoard(true)} style={{ ...quietButton, width: "auto", padding: "10px 12px" }}>
          🏆 BOARD
        </button>
      </div>
      {showBoard && (
        <Leaderboard
          onClose={() => setShowBoard(false)}
          onOpenPerson={(id) => {
            setShowBoard(false);
            window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: `person:${id}` } }));
          }}
        />
      )}

      <Title>GOT A BOOSTED RECEIPT?</Title>
      <ReceiptForm user={user} points={rates.receipt_points ?? 10} onToast={onToast} />

      <Title>HOW TO EARN</Title>
      <div style={card}>
        <EarnRow icon="🧾" text="Upload a receipt or invoice from any Boosted business (detailing, photography, merch)" pts={`+${rates.receipt_points ?? 10} each`} />
        {SHOP_OPEN ? (
          <EarnRow icon="🛍️" text="Boosted merch or a detail: scan the points card you get" pts={`+${rates.points_per_dollar} per $1`} />
        ) : (
          <EarnRow icon="🛍️" text="Boosted Studios shop: coming soon" pts="SOON" />
        )}
        {rates.member_bonus > 0 && (
          <EarnRow icon="💎" text="Become a TUNR member (one time)" pts={`+${rates.member_bonus}`} done={points?.earned > 0 && history.some((h) => h.label === "Membership bonus")} />
        )}
        <EarnRow icon="📍" text="Check in at any meet, at the meet" pts="+1" />
        <EarnRow icon="🏁" text="Check in again at the end: stayed the whole meet" pts="+1" />
        <EarnRow icon="⭐" text="Check in at a boosted meet, at the meet" pts="+5 to +10" />
        <EarnRow icon="🙋" text="RSVP “Going” to a boosted meet, then show up" pts={`+${POINTS.rsvpBonus}`} />
        <EarnRow icon="🎮" text="TUNR Rush (Perks tab): clear today's level (Easy, Medium or Hard)" pts="+1–3" />
        {rates.referral_points > 0 && (
          <EarnRow icon="🤝" text="Bring a friend (invite link or your car's QR): when they check in at their first meet" pts={`+${rates.referral_points}`} />
        )}
        {rates.welcome_points > 0 && (
          <EarnRow icon="👋" text="Your own first meet check-in, if a friend brought you" pts={`+${rates.welcome_points}`} />
        )}
        <EarnRow
          icon="🔥"
          text={`Weekly streak: ${STREAK_MILESTONES.map(([w, b]) => `${w} wks +${b}`).join(", ")}`}
          pts="BONUS"
        />
        <div style={{ ...label, marginTop: 12 }}>GETTING STARTED (ONE TIME)</div>
        <EarnRow icon="👤" text="Profile photo, username and bio" pts={`+${POINTS.profile}`} done={starter?.profile} />
        <EarnRow icon="🚗" text="Add your car to your garage" pts={`+${POINTS.car}`} done={starter?.car} />
        <EarnRow icon="🔔" text="Turn on alerts on your phone" pts={`+${POINTS.alerts}`} done={starter?.alerts} />
        {starter && !starter.confirmed && (
          <div style={{ ...muted, color: "#F87171", fontSize: 12.5, marginTop: 8 }}>
            Confirm your email to start earning points.
          </div>
        )}
        <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>
          Check in from the meet itself, during the meet: your phone's location shows you're
          there. One check-in per meet per day, 3 a day at most.
        </div>
      </div>

      {SHOP_OPEN && !initialCard && cardSection}

      {pending.length > 0 && (
        <>
          <Title>READY TO COLLECT</Title>
          {pending.map((c) => (
            <div key={c.id} style={{ ...card, borderColor: "#3A3000" }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{c.title}</div>
              {c.partnerName && <div style={{ ...muted, fontSize: 12 }}>from {c.partnerName}</div>}
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 5, color: "#FACC15", marginTop: 8 }}>{c.code}</div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
                {c.howToClaim || "Show this code to collect. We'll mark it collected once you have it."}
              </div>
            </div>
          ))}
        </>
      )}

      <Title>REWARDS</Title>
      {rewards.length === 0 ? (
        <div style={{ ...muted, ...card }}>No rewards yet. Keep checking in: they're coming.</div>
      ) : (
        rewards.map((r) => {
          const soldOut = r.stock !== null && r.stock <= 0;
          const needSpend = points?.all_access ? 0 : Math.max(0, Number(r.min_spend_cents || 0) - spent);
          const short = balance < r.cost;
          const blocked = soldOut || short || needSpend > 0 || !points?.can_redeem;
          return (
            <div key={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: "#A08A40", letterSpacing: 1.4, fontWeight: 800 }}>
                    {KIND_LABELS[r.kind] || "REWARD"}
                    {r.partnerName ? ` · ${r.partnerName.toUpperCase()}` : ""}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>{r.title}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#FACC15", whiteSpace: "nowrap" }}>⭐ {r.cost}</div>
              </div>
              {r.description && <div style={{ ...muted, marginTop: 6 }}>{r.description}</div>}
              {r.min_spend_cents > 0 && (
                <div style={{ ...muted, fontSize: 12, marginTop: 4, color: needSpend > 0 ? "#A08A40" : "#10B981" }}>
                  {needSpend > 0
                    ? `For Boosted buyers who've spent ${dollars(r.min_spend_cents)}+ (you: ${dollars(spent)})`
                    : `✓ You've spent enough to unlock this`}
                </div>
              )}
              {r.stock !== null && !soldOut && (
                <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>{r.stock} left</div>
              )}
              {confirming === r.id ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button disabled={busy} onClick={() => redeem(r)} style={{ ...bigButton, flex: 1 }}>
                    {busy ? "…" : `SPEND ${r.cost} POINTS`}
                  </button>
                  <button disabled={busy} onClick={() => setConfirming(null)} style={{ ...quietButton, flex: 1 }}>
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  disabled={blocked}
                  onClick={() => setConfirming(r.id)}
                  style={{
                    ...(blocked ? quietButton : bigButton),
                    marginTop: 10,
                    opacity: blocked ? 0.6 : 1,
                  }}
                >
                  {soldOut
                    ? "SOLD OUT"
                    : needSpend > 0
                      ? `SPEND ${dollars(needSpend)} MORE ON MERCH`
                      : !points?.can_redeem
                      ? "LOCKED FOR NOW"
                      : short
                        ? `${r.cost - balance} MORE POINTS`
                        : "REDEEM"}
                </button>
              )}
            </div>
          );
        })
      )}

      {claims.some((c) => c.status !== "pending") && (
        <>
          <Title>PAST REWARDS</Title>
          <div style={card}>
            {claims
              .filter((c) => c.status !== "pending")
              .map((c) => (
                <Line key={c.id} left={c.title} right={c.status === "fulfilled" ? "Collected" : "Cancelled, points back"} />
              ))}
          </div>
        </>
      )}

      <Title>HISTORY</Title>
      <div style={card}>
        {history.length === 0 ? (
          <div style={muted}>No points yet.</div>
        ) : (
          history.map((h) => (
            <Line
              key={h.id}
              left={h.label}
              sub={[h.detail, new Date(h.at).toLocaleDateString()].filter(Boolean).join(" · ")}
              right={(h.delta > 0 ? "+" : "") + h.delta}
              rightColor={h.delta > 0 ? "#10B981" : "#F87171"}
            />
          ))
        )}
      </div>

      {SHOP_OPEN && (
        <>
          <Title>MISSING POINTS?</Title>
          <IssueForm user={user} onToast={onToast} />
        </>
      )}

      <div style={{ ...muted, fontSize: 11.5, marginTop: 14 }}>
        Points have no cash value and can't be sold or transferred. Each points card works once. Rewards are guaranteed
        when you redeem: there's no drawing. TUNR can remove points earned by breaking the rules
        and can change or end the program. See the Terms, section 10.
      </div>
    </div>
  );
}

// ============ ADMIN PAGES ============

const EMPTY_REWARD = { title: "", description: "", kind: "merch", cost: "", minSpend: "", partnerId: "", howToClaim: "", stock: "", perPerson: 1, active: true };

export function RewardsAdmin({ onToast }) {
  const [rewards, setRewards] = useState([]);
  const [partners, setPartners] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(10);

  async function refresh() {
    try {
      const [r, p, rt] = await Promise.all([loadRewards(), loadPartnersForRewards(), loadPointsSettings()]);
      setRewards(r);
      setPartners(p);
      setRate(rt.points_per_dollar);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    if (!draft.title.trim()) return setError("Give the reward a name.");
    if (!(Number(draft.cost) >= 1)) return setError("Set how many points it costs (1 or more).");
    setBusy(true);
    setError("");
    try {
      await saveReward(draft);
      onToast(draft.id ? "Reward updated" : "Reward added");
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  if (draft) {
    return (
      <div>
        <Field name="NAME">
          <input style={field} maxLength={80} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Boosted Studios tee" />
        </Field>
        <Field name="DESCRIPTION">
          <textarea style={{ ...field, minHeight: 64 }} maxLength={400} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Black boxy tee, any size." />
        </Field>
        <Field name="TYPE">
          <select style={field} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="merch">Merch</option>
            <option value="discount">Discount at a shop</option>
            <option value="experience">Experience (ride-along, shoot…)</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field name="POINTS COST">
          <input style={field} inputMode="numeric" value={draft.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, "") })} placeholder="300" />
        </Field>
        <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
          Easy rule: <b style={{ color: "#DDD" }}>10 points for every $1</b> the item is worth. A $30 shirt = 300 points,
          a $20 hat = 200. That's about 7–8 months for a very active member.
          {Number(draft.cost) > 0 && ` ${Number(draft.cost)} points ≈ a ${dollars(Number(draft.cost) * 10)} item.`}
        </div>
        <Field name="MUST HAVE SPENT AT LEAST ($, OPTIONAL)">
          <input style={field} inputMode="decimal" value={draft.minSpend} onChange={(e) => set({ minSpend: e.target.value.replace(/[^\d.]/g, "") })} placeholder="100" />
        </Field>
        <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
          Only people whose Boosted purchases add up to this can redeem it, so meet points alone never get there.
        </div>
        <Field name="PARTNER SHOP (OPTIONAL)">
          <select style={field} value={draft.partnerId || ""} onChange={(e) => set({ partnerId: e.target.value })}>
            <option value="">Boosted Studios</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field name="HOW TO COLLECT">
          <input style={field} maxLength={300} value={draft.howToClaim} onChange={(e) => set({ howToClaim: e.target.value })} placeholder="Show the code at the next Boosted meet" />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field name="HOW MANY (BLANK = NO LIMIT)">
            <input style={field} inputMode="numeric" value={draft.stock ?? ""} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field name="MAX PER PERSON">
            <input style={field} inputMode="numeric" value={draft.perPerson} onChange={(e) => set({ perPerson: e.target.value.replace(/\D/g, "") || 1 })} />
          </Field>
        </div>
        <label style={{ ...muted, display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /> Show it in the app
        </label>
        {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button disabled={busy} onClick={save} style={{ ...bigButton, flex: 1 }}>{busy ? "SAVING…" : "SAVE"}</button>
          <button disabled={busy} onClick={() => (setDraft(null), setError(""))} style={{ ...quietButton, flex: 1 }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={muted}>
        Rewards people can trade points for. Every reward is guaranteed, never a drawing. To take
        one down, untick “Show it in the app” (rewards someone has claimed can't be deleted).
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
      <button onClick={() => setDraft({ ...EMPTY_REWARD })} style={{ ...bigButton, marginTop: 12 }}>+ ADD A REWARD</button>
      {rewards.map((r) => (
        <button
          key={r.id}
          onClick={() =>
            setDraft({
              id: r.id,
              title: r.title,
              description: r.description || "",
              kind: r.kind,
              cost: String(r.cost),
              minSpend: r.min_spend_cents ? String(r.min_spend_cents / 100) : "",
              partnerId: r.partner_id || "",
              howToClaim: r.how_to_claim || "",
              stock: r.stock == null ? "" : String(r.stock),
              perPerson: r.per_person,
              active: r.active,
            })
          }
          style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", color: "#F0F0F0", opacity: r.active ? 1 : 0.5 }}
        >
          <Line
            left={r.title + (r.active ? "" : " (hidden)")}
            sub={[
              r.partnerName || "Boosted Studios",
              r.min_spend_cents ? `${dollars(r.min_spend_cents)}+ spent` : "",
              r.stock == null ? "no limit" : `${r.stock} left`,
            ]
              .filter(Boolean)
              .join(" · ")}
            right={`⭐ ${r.cost}`}
            rightColor="#FACC15"
          />
        </button>
      ))}
    </div>
  );
}

export function RedemptionsAdmin({ onToast }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  async function refresh(s = status) {
    try {
      setRows(await loadRedemptionQueue(s));
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh(status);
  }, [status]);

  async function decide(row, next) {
    try {
      await decideRedemption(row.id, next);
      onToast(next === "fulfilled" ? "Marked collected" : `Cancelled, ${row.cost} points returned`);
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          ["pending", "WAITING"],
          ["fulfilled", "COLLECTED"],
          ["cancelled", "CANCELLED"],
        ].map(([id, name]) => (
          <button key={id} onClick={() => setStatus(id)} style={{ ...quietButton, flex: 1, padding: "10px 0", ...(status === id ? { borderColor: "#0080F0", color: "#3CABFD" } : {}) }}>
            {name}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
      {rows && rows.length === 0 && <div style={{ ...muted, marginTop: 12 }}>Nothing here.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={card}>
          <Line left={r.reward_title} sub={`@${r.username || "deleted"} · ${new Date(r.created_at).toLocaleString()}`} right={`⭐ ${r.cost}`} rightColor="#FACC15" />
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 4, color: "#FACC15", marginTop: 6 }}>{r.claim_code}</div>
          {r.status === "pending" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => decide(r, "fulfilled")} style={{ ...bigButton, flex: 1, padding: "10px 0" }}>HANDED OVER</button>
              <button onClick={() => decide(r, "cancelled")} style={{ ...quietButton, flex: 1, padding: "10px 0" }}>CANCEL + REFUND</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CheckinsAdmin({ onToast }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [adjust, setAdjust] = useState({ username: "", delta: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setRows(await loadRecentCheckins());
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function remove(row) {
    try {
      await voidCheckin(row.id);
      onToast(`Removed @${row.username || "user"}'s check-in and its points`);
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  async function doAdjust() {
    const delta = Number(adjust.delta);
    if (!adjust.username.trim() || !delta || !adjust.note.trim()) {
      onToast("Fill in the username, the points (use - to take away) and a reason.");
      return;
    }
    setBusy(true);
    try {
      await adjustPoints(await findUserId(adjust.username), delta, adjust.note);
      onToast(`${delta > 0 ? "Gave" : "Took"} ${Math.abs(delta)} points ${delta > 0 ? "to" : "from"} @${adjust.username.replace(/^@/, "")}`);
      setAdjust({ username: "", delta: "", note: "" });
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={muted}>
        The latest check-ins. Look for the same people checking in far apart or right at the edge
        of the distance. Removing a check-in takes back its points.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      <Title>GIVE OR TAKE POINTS</Title>
      <div style={card}>
        <input style={field} placeholder="@username" value={adjust.username} onChange={(e) => setAdjust((a) => ({ ...a, username: e.target.value }))} autoCapitalize="none" />
        <input style={{ ...field, marginTop: 8 }} placeholder="Points, e.g. 50 or -20" inputMode="numeric" value={adjust.delta} onChange={(e) => setAdjust((a) => ({ ...a, delta: e.target.value.replace(/[^\d-]/g, "") }))} />
        <input style={{ ...field, marginTop: 8 }} placeholder="Reason (they'll see it)" maxLength={200} value={adjust.note} onChange={(e) => setAdjust((a) => ({ ...a, note: e.target.value }))} />
        <button disabled={busy} onClick={doAdjust} style={{ ...bigButton, marginTop: 8 }}>{busy ? "…" : "SAVE"}</button>
      </div>

      <Title>RECENT CHECK-INS</Title>
      {rows && rows.length === 0 && <div style={muted}>No check-ins yet.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={{ ...card, opacity: r.voided ? 0.5 : 1 }}>
          <Line
            left={`@${r.username || "deleted"}`}
            sub={`${r.event_title} · ${new Date(r.created_at).toLocaleString()} · ${r.distance_m} m from the pin`}
            right={r.voided ? "Removed" : ""}
          />
          {!r.voided && (
            <button onClick={() => remove(r)} style={{ ...quietButton, marginTop: 8, padding: "8px 0" }}>REMOVE CHECK-IN</button>
          )}
        </div>
      ))}
    </div>
  );
}

// Scan the QR on a points card (it opens TUNR with the code filled in) or
// type the code. Points land at once.
// A receipt or invoice from any Boosted business: pick which, the number,
// the amount and a photo. TUNR checks it, then the points wait in the
// checklist to claim.
const RECEIPT_STATUS = { pending: ["Being checked", "#FACC15"], approved: ["Points added", "#10B981"], rejected: ["Not matched", "#F87171"] };
function ReceiptForm({ user, points, onToast }) {
  const [open, setOpen] = useState(false);
  const [business, setBusiness] = useState("detailing");
  const [orderRef, setOrderRef] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mine, setMine] = useState([]);
  const cents = toCents(amount);

  const refresh = () =>
    loadMyReceipts(user.id)
      .then(setMine)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [user.id]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await submitReceipt({ userId: user.id, business, orderRef, amountCents: cents, file });
      onToast("🧾 Receipt sent. We'll check it, then your points wait in your 📋 checklist.");
      setOrderRef("");
      setAmount("");
      setFile(null);
      setOpen(false);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const chip = (on) => ({ padding: "8px 12px", borderRadius: 999, border: `1px solid ${on ? "#0080F0" : "#2A2A2A"}`, background: on ? "rgba(0,128,240,0.15)" : "#161616", color: on ? "#7FC4FF" : "#BBB", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" });
  return (
    <div style={card}>
      {!open ? (
        <button className="action-btn" onClick={() => setOpen(true)} style={{ ...bigButton, background: "#FACC15", color: "#111" }}>
          🧾 UPLOAD A RECEIPT · ⭐ +{points}
        </button>
      ) : (
        <>
          <div style={label}>WHICH BOOSTED BUSINESS?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RECEIPT_BUSINESSES.map(([id, name]) => (
              <button key={id} aria-pressed={business === id} onClick={() => setBusiness(id)} style={chip(business === id)}>
                {name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input style={{ ...field, flex: 2 }} placeholder="Receipt / invoice #" maxLength={60} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
            <input style={{ ...field, flex: 1 }} placeholder="$ paid" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.$]/g, ""))} />
          </div>
          <label style={{ display: "block", marginTop: 10, padding: "14px 12px", borderRadius: 10, border: "1px dashed #3A4250", textAlign: "center", color: file ? "#86EFAC" : "#9AA4B2", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
            {file ? `📎 ${file.name}` : "📷 Add a photo of the receipt"}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
          </label>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>
            <b style={{ color: "#FACC15" }}>⭐ {points}</b> points once it's checked. One receipt a day.
          </div>
          {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
          <button className="action-btn" disabled={busy} onClick={send} style={{ ...bigButton, marginTop: 10 }}>
            {busy ? "SENDING…" : "SEND RECEIPT"}
          </button>
          <button onClick={() => setOpen(false)} style={{ ...quietButton, marginTop: 6, padding: "9px 0" }}>
            CANCEL
          </button>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 8 }}>Only you and the TUNR team see the photo. Each receipt counts once.</div>
        </>
      )}
      {mine.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {mine.map((r) => (
            <Line
              key={r.id}
              left={`${RECEIPT_BUSINESSES.find(([id]) => id === r.business)?.[1] || "Boosted"} · ${dollars(r.amount_cents)}`}
              sub={[r.order_ref, new Date(r.created_at).toLocaleDateString(), r.status === "rejected" && r.note].filter(Boolean).join(" · ")}
              right={r.status === "approved" ? `+${r.points}` : RECEIPT_STATUS[r.status]?.[0]}
              rightColor={RECEIPT_STATUS[r.status]?.[1]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardForm({ initialCode, onAdded, onToast }) {
  const [code, setCode] = useState(() => cleanCardCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoTried = useRef(false);
  const [added, setAdded] = useState(null);

  // Scanned: add it straight away, once.
  useEffect(() => {
    if (autoTried.current || cleanCardCode(initialCode).length !== 12) return;
    autoTried.current = true;
    add(cleanCardCode(initialCode));
  }, [initialCode]);

  async function add(value = code) {
    if (value.length !== 12) return setError("Points card codes are 12 letters and numbers.");
    setBusy(true);
    setError("");
    setAdded(null);
    try {
      const r = await redeemPointCard(value);
      setAdded(r);
      onToast(`⭐ +${r.points} points from your ${r.label} card. ${CLAIM_HINT}`);
      setCode("");
      onAdded();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, borderColor: initialCode ? "#4A3A00" : "#222" }}>
      <div style={{ ...muted, fontSize: 12.5 }}>
        Every Boosted order and detail comes with a points card. Scan its QR code with your phone
        camera, or type the code here.
      </div>
      <input
        style={{ ...field, marginTop: 10, textAlign: "center", letterSpacing: 3, fontSize: 17, fontWeight: 800 }}
        placeholder="XXXX-XXXX-XXXX"
        aria-label="Points card code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        value={code.replace(/(.{4})(?=.)/g, "$1-")}
        onChange={(e) => setCode(cleanCardCode(e.target.value))}
      />
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 6 }}>{error}</div>}
      {added && !error && (
        <div role="status" style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: "#10B981" }}>
          ✓ +{added.points} points added from your {added.label} card
        </div>
      )}
      <button disabled={busy} onClick={() => add()} style={{ ...bigButton, marginTop: 8, opacity: busy ? 0.6 : 1 }}>
        {busy ? "ADDING…" : "ADD MY POINTS"}
      </button>
    </div>
  );
}

// Make cards for a product or service, print them, track how many are used.
export function CardsAdmin({ onToast }) {
  const [batches, setBatches] = useState(null);
  const [rate, setRate] = useState(10);
  const [draft, setDraft] = useState({ label: "", price: "", points: "", count: "25", months: "12" });
  const [printing, setPrinting] = useState(null); // { html, count }
  const [pointsEdited, setPointsEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [b, rt] = await Promise.all([loadCardBatches(), loadPointsSettings()]);
      setBatches(b);
      setRate(rt.points_per_dollar);
      setError("");
    } catch (e) {
      setError(e.message);
      setBatches([]);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  // Points follow the price at the current rate until typed over.
  const autoPoints = (price) => {
    const cents = toCents(price);
    return cents ? String(Math.floor((cents / 100) * rate)) : "";
  };

  async function make() {
    const cents = toCents(draft.price);
    const points = Number(draft.points);
    const count = Number(draft.count);
    if (!draft.label.trim()) return setError("Say what the card is for, like “Boosted tee” or “Full detail”.");
    if (!(points >= 1)) return setError("Set how many points each card gives.");
    if (!(count >= 1 && count <= 500)) return setError("Make between 1 and 500 cards at a time.");
    setBusy(true);
    setError("");
    try {
      const months = Number(draft.months);
      const expiresAt = months > 0 ? new Date(Date.now() + months * 30.44 * 86400000).toISOString() : null;
      const codes = await createPointCards({ label: draft.label.trim(), points, valueCents: cents || 0, count, expiresAt });
      onToast(`Made ${codes.length} cards`);
      setPrinting(await cardsPage(codes.map((code) => ({ code, label: draft.label.trim(), points, expires_at: expiresAt }))));
      setDraft((d) => ({ ...d, price: "", points: "" }));
      setPointsEdited(false);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reprint(batch) {
    try {
      const cards = await loadUnusedCards(batch.batch_id);
      if (!cards.length) return onToast("Every card in that batch has been used or cancelled.");
      setPrinting(await cardsPage(cards));
    } catch (e) {
      onToast(e.message);
    }
  }

  async function cancel(batch) {
    if (!window.confirm(`Cancel the ${batch.made - batch.redeemed - batch.voided} unused “${batch.label}” cards? They'll stop working. Cards already used keep their points.`)) return;
    try {
      const n = await voidCardBatch(batch.batch_id);
      onToast(`Cancelled ${n} cards`);
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  return (
    <div>
      {printing && (
        <PrintPage
          title="TUNR points cards"
          tip={`${printing.count} cards. Print on card stock and cut along the dashed lines, or save as PDF.`}
          html={printing.html}
          css={CARDS_CSS}
          pageMargin="0.5in 0.75in"
          onBack={() => setPrinting(null)}
        />
      )}
      <div style={muted}>
        Print a card for each shirt bag, sale or detail. The buyer scans it and the points land at
        once; each card works one time. No orders to check.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      <Title>MAKE CARDS</Title>
      <div style={card}>
        <Field name="WHAT IT'S FOR">
          <input style={field} maxLength={60} placeholder="Boosted tee" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field name="PRICE ($)">
            <input
              style={field}
              inputMode="decimal"
              placeholder="35"
              value={draft.price}
              onChange={(e) => {
                const price = e.target.value.replace(/[^\d.]/g, "");
                set(pointsEdited ? { price } : { price, points: autoPoints(price) });
              }}
            />
          </Field>
          <Field name="POINTS EACH">
            <input
              style={field}
              inputMode="numeric"
              placeholder="350"
              value={draft.points}
              onChange={(e) => {
                setPointsEdited(true);
                set({ points: e.target.value.replace(/\D/g, "") });
              }}
            />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field name="HOW MANY">
            <input style={field} inputMode="numeric" value={draft.count} onChange={(e) => set({ count: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field name="EXPIRE AFTER (MONTHS, 0 = NEVER)">
            <input style={field} inputMode="numeric" value={draft.months} onChange={(e) => set({ months: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
          The price counts toward rewards' minimum spend. At {rate} points per $1 a ${draft.price || "35"} item
          gives {autoPoints(draft.price || "35") || 0} points.
        </div>
        <button disabled={busy} onClick={make} style={{ ...bigButton, marginTop: 10, opacity: busy ? 0.6 : 1 }}>
          {busy ? "MAKING…" : "MAKE + PRINT CARDS"}
        </button>
      </div>

      <Title>YOUR CARDS</Title>
      {batches && batches.length === 0 && <div style={muted}>No cards yet.</div>}
      {(batches || []).map((b) => {
        const unused = b.made - b.redeemed - b.voided;
        return (
          <div key={b.batch_id} style={card}>
            <Line
              left={b.label}
              sub={`${b.points} pts${b.value_cents ? ` · ${dollars(b.value_cents)}` : ""} · made ${new Date(b.created_at).toLocaleDateString()}${b.expires_at ? ` · expires ${new Date(b.expires_at).toLocaleDateString()}` : ""}`}
              right={`${b.redeemed}/${b.made} used`}
              rightColor="#10B981"
            />
            {unused > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => reprint(b)} style={{ ...quietButton, flex: 1, padding: "9px 0" }}>PRINT {unused} UNUSED</button>
                <button onClick={() => cancel(b)} style={{ ...quietButton, flex: 1, padding: "9px 0", color: "#F87171" }}>CANCEL UNUSED</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// A sheet of business-card-size cards (10 to a page), shown in the app to
// print or save as a PDF. The QR opens TUNR with the code filled in.
async function cardsPage(cards) {
  const { default: QRCode } = await import("qrcode");
  const origin = window.location.origin;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const items = await Promise.all(
    cards.map(async (c) => {
      const svg = await QRCode.toString(`${origin}/?${CARD_PARAM}=${c.code}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
      const pretty = c.code.replace(/(.{4})(?=.)/g, "$1-");
      const exp = c.expires_at ? `Use by ${new Date(c.expires_at).toLocaleDateString()}` : "";
      return `<div class="card"><div class="qr">${svg}</div><div class="txt"><div class="brand">BOOSTED STUDIOS</div><div class="pts">+${c.points} POINTS</div><div class="lbl">${esc(c.label)}</div><div class="how">Scan with your phone camera, or enter the code in TUNR: Perks → ⭐ Points</div><div class="code">${pretty}</div><div class="fine">One-time use. No cash value. ${exp}</div></div></div>`;
    })
  );
  return { html: `<div class="grid">${items.join("")}</div>`, count: cards.length };
}

const CARDS_CSS = `
  .print-page .grid { display: grid; grid-template-columns: repeat(2, 3.5in); gap: 0; justify-content: center; padding: 0.3in 0; }
  .print-page .card { width: 3.5in; height: 2in; box-sizing: border-box; border: 1px dashed #999; padding: 0.15in; display: flex; gap: 0.12in; align-items: center; break-inside: avoid; }
  .print-page .qr { width: 1.3in; height: 1.3in; flex-shrink: 0; }
  .print-page .qr svg { width: 100%; height: 100%; }
  .print-page .brand { font-size: 8pt; letter-spacing: 1.5px; font-weight: 700; color: #0080F0; }
  .print-page .pts { font-size: 17pt; font-weight: 900; line-height: 1.1; }
  .print-page .lbl { font-size: 9pt; font-weight: 700; }
  .print-page .how { font-size: 6.5pt; color: #444; margin-top: 3px; line-height: 1.25; }
  .print-page .code { font-family: "Courier New", monospace; font-size: 10.5pt; font-weight: 700; margin-top: 4px; letter-spacing: 0.5px; }
  .print-page .fine { font-size: 5.5pt; color: #777; margin-top: 2px; }
  @media screen and (max-width: 760px) { .print-page .grid { grid-template-columns: 3.5in; } }
  @media print { .print-page .grid { padding: 0; } }
`;

// Receipts people sent in: look at the photo, fix the amount if it's off,
// approve (points go to their checklist) or turn it down with a reason.
function ReceiptsToCheck({ onToast, onDone }) {
  const [rows, setRows] = useState(null);
  const [fix, setFix] = useState({});
  const [busy, setBusy] = useState("");
  const load = () =>
    loadPurchaseQueue("pending")
      .then((q) => setRows(q.filter((r) => r.receipt_path)))
      .catch((e) => (onToast(e.message), setRows([])));
  useEffect(() => {
    load();
  }, []);

  async function decide(r, approve) {
    const note = approve ? null : window.prompt("Why not? (they'll see this)", "We couldn't match this receipt to a Boosted sale.");
    if (!approve && note === null) return;
    setBusy(r.id);
    try {
      const cents = fix[r.id] ? toCents(fix[r.id]) : null;
      const pts = await decidePurchase(r.id, approve, cents || null, note);
      onToast(approve ? `Approved: +${pts} points to @${r.username}` : `Turned down @${r.username}'s receipt`);
      load();
      onDone();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  if (!rows || !rows.length) return null;
  return (
    <>
      <Title>RECEIPTS TO CHECK ({rows.length})</Title>
      <div style={card}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid #1E1E1E" }}>
            <Line left={`@${r.username} · ${RECEIPT_BUSINESSES.find(([id]) => id === r.business)?.[1] || r.business}`} sub={`${r.order_ref} · ${new Date(r.created_at).toLocaleString()}`} right={dollars(r.amount_cents)} rightColor="#FACC15" />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() =>
                  receiptLink(r.receipt_path)
                    .then((u) => window.open(u, "_blank", "noopener"))
                    .catch((e) => onToast(e.message))
                }
                style={{ ...quietButton, width: "auto", padding: "7px 10px", fontSize: 12.5 }}
              >
                🧾 VIEW
              </button>
              <input style={{ ...field, width: 90, padding: "7px 8px" }} placeholder="Fix $" inputMode="decimal" value={fix[r.id] || ""} onChange={(e) => setFix((f) => ({ ...f, [r.id]: e.target.value.replace(/[^\d.$]/g, "") }))} />
              <button disabled={busy === r.id} onClick={() => decide(r, true)} style={{ ...quietButton, width: "auto", padding: "7px 10px", fontSize: 12.5, color: "#10B981" }}>
                ✓ APPROVE
              </button>
              <button disabled={busy === r.id} onClick={() => decide(r, false)} style={{ ...quietButton, width: "auto", padding: "7px 10px", fontSize: 12.5, color: "#F87171" }}>
                ✕ NO
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Sales recorded by hand (in person, no card on you), what's come in, and
// the rates.
export function PurchasesAdmin({ onToast }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [sale, setSale] = useState({ username: "", store: "in_person", order: "", amount: "" });
  const [rates, setRates] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [q, rt] = await Promise.all([loadPurchaseQueue("approved"), loadPointsSettings()]);
      setRows(q);
      setRates((r) => r || rt);
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function record() {
    const cents = toCents(sale.amount);
    if (!sale.username.trim() || !sale.order.trim() || !cents) {
      onToast("Fill in the username, an order or receipt number, and the amount.");
      return;
    }
    setBusy(true);
    try {
      const pts = await recordPurchase(await findUserId(sale.username), sale.store, sale.order.trim(), cents);
      onToast(`Recorded: +${pts} points to @${sale.username.replace(/^@/, "")}`);
      setSale({ username: "", store: sale.store, order: "", amount: "" });
      refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRates() {
    setBusy(true);
    try {
      await savePointsSettings(rates);
      onToast("Points rates saved");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={muted}>
        Points cards add purchase points by themselves (Settings → Admin → Points cards). Use this
        only for a sale where you didn't hand over a card.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      <ReceiptsToCheck onToast={onToast} onDone={refresh} />

      <Title>RECORD A SALE</Title>
      <div style={card}>
        <input style={field} placeholder="@username" autoCapitalize="none" value={sale.username} onChange={(e) => setSale((s) => ({ ...s, username: e.target.value }))} />
        <select style={{ ...field, marginTop: 8 }} value={sale.store} onChange={(e) => setSale((s) => ({ ...s, store: e.target.value }))}>
          {STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input style={{ ...field, flex: 2 }} placeholder="Order / receipt #" maxLength={60} value={sale.order} onChange={(e) => setSale((s) => ({ ...s, order: e.target.value }))} />
          <input style={{ ...field, flex: 1 }} placeholder="$" inputMode="decimal" value={sale.amount} onChange={(e) => setSale((s) => ({ ...s, amount: e.target.value.replace(/[^\d.$]/g, "") }))} />
        </div>
        <button disabled={busy} onClick={record} style={{ ...bigButton, marginTop: 8 }}>{busy ? "…" : "RECORD + GIVE POINTS"}</button>
      </div>

      <Title>RATES</Title>
      {rates && (
        <div style={card}>
          <div style={{ display: "flex", gap: 10 }}>
            <Field name="POINTS PER $1">
              <input style={field} inputMode="numeric" value={rates.points_per_dollar} onChange={(e) => setRates((r) => ({ ...r, points_per_dollar: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field name="MEMBERSHIP BONUS">
              <input style={field} inputMode="numeric" value={rates.member_bonus} onChange={(e) => setRates((r) => ({ ...r, member_bonus: e.target.value.replace(/\D/g, "") }))} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Field name="POINTS PER RECEIPT">
              <input style={field} inputMode="numeric" maxLength={3} value={rates.receipt_points ?? 10} onChange={(e) => setRates((r) => ({ ...r, receipt_points: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field name=" ">
              <span />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Field name="INVITE POINTS">
              <input style={field} inputMode="numeric" maxLength={2} value={rates.referral_points ?? 1} onChange={(e) => setRates((r) => ({ ...r, referral_points: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field name="WELCOME POINTS">
              <input style={field} inputMode="numeric" maxLength={2} value={rates.welcome_points ?? 1} onChange={(e) => setRates((r) => ({ ...r, welcome_points: e.target.value.replace(/\D/g, "") }))} />
            </Field>
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
            Invite points go to the person who invited someone, and welcome points to the new member, when
            the new member checks in at their first meet (up to 10 invites paid a month; 0 turns either off).
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
            The rate fills in points when you make cards and record sales. Points already given stay.
          </div>
          <button disabled={busy} onClick={saveRates} style={{ ...quietButton, marginTop: 8 }}>SAVE RATES</button>
        </div>
      )}

      <Title>RECENT PURCHASE POINTS</Title>
      {rows && rows.length === 0 && <div style={muted}>None yet.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={card}>
          <Line
            left={r.store === "card" ? `Card ${r.order_ref.replace(/(.{4})(?=.)/g, "$1-")}` : r.order_ref}
            sub={`@${r.username || "deleted"} · ${r.store === "card" ? r.note || "Points card" : (STORES.find((s) => s.id === r.store) || {}).label || r.store} · ${new Date(r.created_at).toLocaleDateString()}`}
            right={`+${r.points ?? 0}`}
            rightColor="#10B981"
          />
        </div>
      ))}
    </div>
  );
}

// Didn't get points for something? Send the order number and the email it
// was bought with; we look it up and answer in the app.
function IssueForm({ user, onToast }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ store: "square", orderRef: "", purchaseEmail: user.email || "", item: "", message: "" });
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    loadMyPointsIssues(user.id)
      .then(setMine)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [user.id]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function send() {
    setBusy(true);
    setError("");
    try {
      await reportPointsIssue(draft);
      onToast("Report sent. We'll look up your order and get back to you here.");
      setOpen(false);
      setDraft((d) => ({ ...d, orderRef: "", item: "", message: "" }));
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      {!open ? (
        <>
          <div style={{ ...muted, fontSize: 12.5 }}>
            Bought something and didn't get your points? Lost the card, or it didn't work? Tell us and
            we'll sort it out.
          </div>
          <button onClick={() => setOpen(true)} style={{ ...quietButton, marginTop: 8 }}>REPORT A POINTS ISSUE</button>
        </>
      ) : (
        <>
          <Field name="WHERE YOU BOUGHT IT">
            <select style={field} value={draft.store} onChange={(e) => set({ store: e.target.value })}>
              {STORES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
              <option value="card">A points card didn't work</option>
            </select>
          </Field>
          <Field name={draft.store === "card" ? "THE CARD'S CODE" : "ORDER OR RECEIPT NUMBER"}>
            <input style={field} maxLength={60} value={draft.orderRef} onChange={(e) => set({ orderRef: e.target.value })} autoCapitalize="characters" />
          </Field>
          <Field name="EMAIL YOU USED TO BUY IT">
            <input style={field} type="email" maxLength={254} value={draft.purchaseEmail} onChange={(e) => set({ purchaseEmail: e.target.value })} autoCapitalize="none" />
          </Field>
          <Field name="WHAT YOU BOUGHT (OPTIONAL)">
            <input style={field} maxLength={80} placeholder="Boosted tee, full detail…" value={draft.item} onChange={(e) => set({ item: e.target.value })} />
          </Field>
          <Field name="ANYTHING ELSE (OPTIONAL)">
            <textarea style={{ ...field, minHeight: 60 }} maxLength={500} value={draft.message} onChange={(e) => set({ message: e.target.value })} />
          </Field>
          {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button disabled={busy} onClick={send} style={{ ...bigButton, flex: 1 }}>{busy ? "SENDING…" : "SEND"}</button>
            <button disabled={busy} onClick={() => (setOpen(false), setError(""))} style={{ ...quietButton, flex: 1 }}>CANCEL</button>
          </div>
        </>
      )}
      {!open && error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
      {mine.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {mine.map((i) => (
            <Line
              key={i.id}
              left={`Order ${i.order_ref}`}
              sub={i.reply || new Date(i.created_at).toLocaleDateString()}
              right={i.status === "resolved" ? `+${i.points_added ?? 0}` : i.status === "declined" ? "Answered" : "Looking into it"}
              rightColor={i.status === "resolved" ? "#10B981" : i.status === "declined" ? "#AAA" : "#A08A40"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Reports of missing points: look the order up (Square, Depop, your
// records) by its number and the buyer's email, then add or decline.
export function IssuesAdmin({ onToast }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [replies, setReplies] = useState({});
  const [error, setError] = useState("");

  async function refresh(st = status) {
    try {
      setRows(await loadPointsIssueQueue(st));
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh(status);
  }, [status]);

  async function answer(row, add) {
    const reply = (replies[row.id] || "").trim();
    let cents = null;
    if (add) {
      cents = toCents(amounts[row.id]);
      if (!cents) return onToast("Enter the order's amount from the shop, like 35 or 35.50.");
    } else if (!reply) {
      return onToast("Write a short reason first. They'll see it.");
    }
    try {
      const pts = await resolvePointsIssue(row.id, cents, reply);
      onToast(add ? `Added ${pts} points for @${row.username || "user"}` : "Answer sent");
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  return (
    <div>
      <div style={muted}>
        Find the order in Square or Depop by its number and the buyer's email. If it's real, enter
        the amount and add the points (the order is then recorded, so it can't be paid twice).
        If not, say why.
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {[
          ["open", "TO ANSWER"],
          ["resolved", "ADDED"],
          ["declined", "DECLINED"],
        ].map(([id, name]) => (
          <button key={id} onClick={() => setStatus(id)} style={{ ...quietButton, flex: 1, padding: "10px 0", ...(status === id ? { borderColor: "#0080F0", color: "#3CABFD" } : {}) }}>
            {name}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
      {rows && rows.length === 0 && <div style={{ ...muted, marginTop: 12 }}>Nothing here.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={card}>
          <Line
            left={`${r.order_ref}`}
            sub={`${r.store === "card" ? "Points card" : (STORES.find((s) => s.id === r.store) || {}).label || r.store} · ${new Date(r.created_at).toLocaleString()}`}
            right={r.points_added != null ? `+${r.points_added}` : ""}
            rightColor="#10B981"
          />
          <div style={{ ...muted, fontSize: 12.5 }}>
            Bought with: <b style={{ color: "#DDD" }}>{r.purchase_email}</b>
            <br />
            TUNR account: @{r.username || "no username"} ({r.account_email || "no email"})
            {r.item && (
              <>
                <br />
                Item: {r.item}
              </>
            )}
            {r.message && (
              <>
                <br />
                “{r.message}”
              </>
            )}
            {r.reply && (
              <>
                <br />
                Your answer: {r.reply}
              </>
            )}
          </div>
          {status === "open" && (
            <>
              <input
                style={{ ...field, marginTop: 8 }}
                placeholder="Message to them (optional when adding points)"
                maxLength={300}
                value={replies[r.id] || ""}
                onChange={(e) => setReplies((m) => ({ ...m, [r.id]: e.target.value }))}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  style={{ ...field, flex: 1 }}
                  placeholder="$ on the order"
                  inputMode="decimal"
                  value={amounts[r.id] || ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [r.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                />
                <button onClick={() => answer(r, true)} style={{ ...bigButton, flex: 1, padding: "10px 0" }}>ADD POINTS</button>
              </div>
              <button onClick={() => answer(r, false)} style={{ ...quietButton, marginTop: 8, padding: "10px 0" }}>DECLINE WITH MESSAGE</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ BITS ============

function Title({ children }) {
  return <div style={{ ...label, marginTop: 20, marginBottom: 8, color: "#8A8A8A" }}>{children}</div>;
}

function Field({ name, children }) {
  return (
    <div style={{ marginTop: 12, flex: 1 }}>
      <div style={label}>{name}</div>
      {children}
    </div>
  );
}

function EarnRow({ icon, text, pts, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span aria-hidden="true" style={{ width: 22, textAlign: "center" }}>{done ? "✅" : icon}</span>
      <span style={{ flex: 1, fontSize: 14, fontFamily: "'Barlow', sans-serif", color: done ? "#777" : "#DDD", textDecoration: done ? "line-through" : "none" }}>
        {text}
      </span>
      <span style={{ fontWeight: 900, color: done ? "#555" : "#FACC15" }}>{pts}</span>
    </div>
  );
}

function Line({ left, sub, right, rightColor = "#AAA" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{left}</div>
        {sub && <div style={{ ...muted, fontSize: 12 }}>{sub}</div>}
      </div>
      {right && <div style={{ fontWeight: 900, color: rightColor, whiteSpace: "nowrap" }}>{right}</div>}
    </div>
  );
}

const card = {
  marginTop: 10,
  background: "#121212",
  border: "1px solid #222",
  borderRadius: 12,
  padding: "12px 14px",
  boxSizing: "border-box",
};
