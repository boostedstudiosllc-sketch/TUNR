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
} from "../lib/points.js";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
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
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [p, r, c, h] = await Promise.all([
        loadMyPoints(),
        loadRewards(),
        loadMyRedemptions(user.id),
        loadPointHistory(user.id),
      ]);
      setPoints(p);
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
            Rewards unlock once your account is {REDEEM_RULES.accountDays} days old and you've checked in at{" "}
            {REDEEM_RULES.checkins} meets. You're at {Math.min(points.account_days, REDEEM_RULES.accountDays)}/
            {REDEEM_RULES.accountDays} days and {Math.min(points.checkins, REDEEM_RULES.checkins)}/{REDEEM_RULES.checkins} check-ins.
          </div>
        )}
      </div>

      <Title>HOW TO EARN</Title>
      <div style={card}>
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
          const short = balance < r.cost;
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
                  disabled={soldOut || short || !points?.can_redeem}
                  onClick={() => setConfirming(r.id)}
                  style={{
                    ...(soldOut || short || !points?.can_redeem ? quietButton : bigButton),
                    marginTop: 10,
                    opacity: soldOut || short || !points?.can_redeem ? 0.6 : 1,
                  }}
                >
                  {soldOut
                    ? "SOLD OUT"
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
        Points have no cash value and can't be bought, sold or transferred. Rewards are guaranteed
        when you redeem: there's no drawing. TUNR can remove points earned by breaking the rules
        and can change or end the program. See the Terms, section 10.
      </div>
    </div>
  );
}

// ============ ADMIN PAGES ============

const EMPTY_REWARD = { title: "", description: "", kind: "merch", cost: "", partnerId: "", howToClaim: "", stock: "", perPerson: 1, active: true };

export function RewardsAdmin({ onToast }) {
  const [rewards, setRewards] = useState([]);
  const [partners, setPartners] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [r, p] = await Promise.all([loadRewards(), loadPartnersForRewards()]);
      setRewards(r);
      setPartners(p);
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
            sub={[r.partnerName || "Boosted Studios", r.stock == null ? "no limit" : `${r.stock} left`].join(" · ")}
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
      const { data, error: e } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", adjust.username.trim().replace(/^@/, "").toLowerCase())
        .maybeSingle();
      if (e) throw new Error(withReason("Couldn't look up that username.", e));
      if (!data) throw new Error(`No account with the username @${adjust.username.replace(/^@/, "")}.`);
      await adjustPoints(data.id, delta, adjust.note);
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
