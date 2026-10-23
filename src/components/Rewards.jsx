import { useEffect, useState } from "react";
import {
  POINTS,
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
  submitPurchase,
  loadMyPurchases,
  savePointsSettings,
  loadPurchaseQueue,
  decidePurchase,
  recordPurchase,
  findUserId,
} from "../lib/points.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const KIND_LABELS = { merch: "MERCH", discount: "DISCOUNT", experience: "EXPERIENCE", other: "REWARD" };

export function RewardsSheet({ user, onClose, onToast }) {
  return (
    <Sheet onClose={onClose} label="Points and rewards" zIndex={296}>
      <div style={sheetTitle}>POINTS &amp; REWARDS</div>
      <RewardsPanel user={user} onToast={onToast} />
    </Sheet>
  );
}

// Your balance, how to earn, what you can get, what you've claimed, and the
// history behind the number.
export default function RewardsPanel({ user, onToast }) {
  const [points, setPoints] = useState(null);
  const [starter, setStarter] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [claims, setClaims] = useState([]);
  const [history, setHistory] = useState([]);
  const [rates, setRates] = useState({ points_per_dollar: 10, member_bonus: 500 });
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [p, r, c, h, rt, pu] = await Promise.all([
        loadMyPoints(),
        loadRewards(),
        loadMyRedemptions(user.id),
        loadPointHistory(user.id),
        loadPointsSettings(),
        loadMyPurchases(user.id),
      ]);
      setPoints(p);
      setRates(rt);
      setPurchases(pu);
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
        if (s.added > 0) onToast(`⭐ +${s.added} getting-started points`);
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

      <Title>HOW TO EARN</Title>
      <div style={card}>
        <EarnRow icon="🛍️" text="Buy Boosted Studios merch" pts={`+${rates.points_per_dollar} per $1`} />
        {rates.member_bonus > 0 && (
          <EarnRow icon="💎" text="Become a TUNR member (one time)" pts={`+${rates.member_bonus}`} done={points?.earned > 0 && history.some((h) => h.label === "Membership bonus")} />
        )}
        <EarnRow icon="📍" text="Check in at a ⭐ points meet" pts={`+${POINTS.checkin}`} />
        <EarnRow icon="🙋" text="RSVP “Going” before it starts, then show up" pts={`+${POINTS.rsvpBonus}`} />
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
          Check-in needs the code shown at the meet and your location, during the meet. One check-in
          per meet per day, 3 a day at most.
        </div>
      </div>

      <Title>ADD A BOOSTED PURCHASE</Title>
      <PurchaseForm rate={rates.points_per_dollar} purchases={purchases} onAdded={refresh} onToast={onToast} />

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
          const needSpend = Math.max(0, Number(r.min_spend_cents || 0) - spent);
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

      <div style={{ ...muted, fontSize: 11.5, marginTop: 14 }}>
        Points have no cash value and can't be sold or transferred. Purchase points are added
        once we match your order with the shop's records. Rewards are guaranteed
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
          <input style={field} inputMode="numeric" value={draft.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, "") })} placeholder="3000" />
        </Field>
        {Number(draft.cost) > 0 && rate > 0 && (
          <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
            At {rate} points per $1, that's about {dollars(Math.round((Number(draft.cost) / rate) * 100))} spent on merch.
          </div>
        )}
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
          <button key={id} onClick={() => setStatus(id)} style={{ ...quietButton, flex: 1, padding: "10px 0", ...(status === id ? { borderColor: "#FF4500", color: "#FF7A00" } : {}) }}>
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

// A buyer adds an order from their receipt; it counts once we match it.
function PurchaseForm({ rate, purchases, onAdded, onToast }) {
  const [store, setStore] = useState("square");
  const [order, setOrder] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    const cents = toCents(amount);
    if (!cents) return setError("Enter what you paid, like 35 or 35.50.");
    setBusy(true);
    setError("");
    try {
      await submitPurchase(store, order.trim(), cents);
      onToast("Purchase added. Points land once we match it with the shop.");
      setOrder("");
      setAmount("");
      onAdded();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ ...muted, fontSize: 12.5 }}>
        Bought Boosted merch? Add the order from your receipt and get {rate} points for every $1 once
        we match it. Bought in person at a meet? Ask us to add it for you.
      </div>
      <select style={{ ...field, marginTop: 10 }} aria-label="Where you bought it" value={store} onChange={(e) => setStore(e.target.value)}>
        {STORES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input style={{ ...field, flex: 2 }} placeholder="Order / receipt #" aria-label="Order number" maxLength={60} value={order} onChange={(e) => setOrder(e.target.value)} autoCapitalize="characters" />
        <input style={{ ...field, flex: 1 }} placeholder="$ paid" aria-label="Amount paid" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.$]/g, ""))} />
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 6 }}>{error}</div>}
      <button disabled={busy} onClick={add} style={{ ...quietButton, marginTop: 8 }}>{busy ? "ADDING…" : "ADD PURCHASE"}</button>
      {purchases.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {purchases.map((p) => (
            <Line
              key={p.id}
              left={`${p.order_ref} · ${dollars(p.amount_cents)}`}
              sub={p.status === "rejected" && p.note ? p.note : new Date(p.created_at).toLocaleDateString()}
              right={p.status === "approved" ? `+${p.points}` : p.status === "rejected" ? "Not matched" : "Checking…"}
              rightColor={p.status === "approved" ? "#10B981" : p.status === "rejected" ? "#F87171" : "#A08A40"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Match buyers' orders against Square/Depop, record in-person sales, and set
// the rates.
export function PurchasesAdmin({ onToast }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState("");
  const [sale, setSale] = useState({ username: "", store: "in_person", order: "", amount: "" });
  const [rates, setRates] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh(st = status) {
    try {
      const [q, rt] = await Promise.all([loadPurchaseQueue(st), loadPointsSettings()]);
      setRows(q);
      setRates((r) => r || rt);
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh(status);
  }, [status]);

  async function decide(row, approve) {
    let note = null;
    if (!approve) {
      note = window.prompt("Why didn't it match? They'll see this.", "We couldn't find that order number.");
      if (note === null) return;
    }
    const edited = amounts[row.id];
    const cents = edited !== undefined ? toCents(edited) : null;
    if (approve && edited !== undefined && !cents) return onToast("Fix the amount first, like 35 or 35.50.");
    try {
      const pts = await decidePurchase(row.id, approve, cents, note);
      onToast(approve ? `Approved: +${pts} points to @${row.username || "user"}` : "Marked not matched");
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

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
      if (status === "approved") refresh();
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
        Buyers add their order number and amount. Find the order in Square or Depop, fix the amount
        if it's off, then approve. Each order number counts once.
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {[
          ["pending", "TO CHECK"],
          ["approved", "APPROVED"],
          ["rejected", "NOT MATCHED"],
        ].map(([id, name]) => (
          <button key={id} onClick={() => setStatus(id)} style={{ ...quietButton, flex: 1, padding: "10px 0", ...(status === id ? { borderColor: "#FF4500", color: "#FF7A00" } : {}) }}>
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
            sub={`@${r.username || "deleted"} · ${(STORES.find((s) => s.id === r.store) || {}).label || r.store} · ${new Date(r.created_at).toLocaleString()}`}
            right={r.points != null ? `+${r.points}` : dollars(r.amount_cents)}
            rightColor={r.points != null ? "#10B981" : "#F0F0F0"}
          />
          {r.note && <div style={{ ...muted, fontSize: 12 }}>{r.note}</div>}
          {status === "pending" && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <span style={{ ...muted, fontSize: 12 }}>Amount on the order:</span>
                <input
                  style={{ ...field, flex: 1, padding: "8px 10px" }}
                  inputMode="decimal"
                  aria-label="Amount on the order"
                  value={amounts[r.id] ?? (r.amount_cents / 100).toFixed(2)}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => decide(r, true)} style={{ ...bigButton, flex: 1, padding: "10px 0" }}>APPROVE</button>
                <button onClick={() => decide(r, false)} style={{ ...quietButton, flex: 1, padding: "10px 0" }}>NOT MATCHED</button>
              </div>
            </>
          )}
        </div>
      ))}

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
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
            New rates apply to purchases approved from now on. Points already given stay.
          </div>
          <button disabled={busy} onClick={saveRates} style={{ ...quietButton, marginTop: 8 }}>SAVE RATES</button>
        </div>
      )}
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
