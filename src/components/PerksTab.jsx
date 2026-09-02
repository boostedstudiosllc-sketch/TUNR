import { useEffect, useState } from "react";
import { loadPerks, recordRedemption, loadProfile, track } from "../lib/store.js";

const CATEGORY_LABELS = {
  detailing: "DETAILING",
  parts: "PARTS",
  wheels_tires: "WHEELS & TIRES",
  tuning: "TUNING",
  wraps: "WRAPS & VINYL",
  insurance: "INSURANCE",
  track: "TRACK",
  other: "OTHER",
};

export const MEMBERSHIP_PRICE = "$3.99";

// Everyone sees every offer — seeing what you'd get is the whole argument for
// joining. The code and booking link come back null from the database for
// non-members, so this component never has to be trusted with the paywall.
export default function PerksTab({ user, onNeedAccount, onToast }) {
  const [perks, setPerks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [isMember, setIsMember] = useState(false);

  // Loaded here rather than lifted into App: only this tab needs it, and the
  // paywall itself is the database's `unlocked` flag, not this boolean.
  useEffect(() => {
    let alive = true;
    loadProfile(user?.id || null).then((p) => alive && setIsMember(Boolean(p?.isMember)));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    loadPerks()
      .then((rows) => alive && setPerks(rows))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user?.id, isMember]);

  async function reveal(perk) {
    if (!user) return onNeedAccount();
    if (!perk.unlocked) return;
    setRevealed((r) => ({ ...r, [perk.id]: true }));
    recordRedemption(perk.id, user.id);
    track("perk_revealed", { perkId: perk.id, partner: perk.partner_name });
    if (perk.redemption_type === "code" && perk.code) {
      try {
        await navigator.clipboard.writeText(perk.code);
        onToast(`${perk.code} copied`);
      } catch {
        // Showing it is enough; the clipboard is a convenience.
      }
    }
  }

  const totalSaving = perks.length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div
        style={{
          background: "linear-gradient(180deg, #1A0800 0%, #0A0A0A 100%)",
          padding: "20px 20px 22px",
          borderBottom: "1px solid #1E1E1E",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>PERKS</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4, fontFamily: "'Barlow', sans-serif" }}>
          {isMember
            ? "Your member discounts at Atlanta shops."
            : "Discounts at Atlanta shops for TUNR members."}
        </div>

        {isMember && (
          <div
            style={{
              marginTop: 14,
              display: "inline-block",
              padding: "5px 12px",
              borderRadius: 20,
              background: "rgba(255,69,0,0.14)",
              border: "1px solid #FF4500",
              color: "#FF4500",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
            }}
          >
            ★ TUNR MEMBER
          </div>
        )}
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
        {!isMember && totalSaving > 0 && <JoinCard count={totalSaving} onNeedAccount={onNeedAccount} user={user} />}

        {loading ? (
          <Empty title="Loading perks…" sub="" />
        ) : perks.length === 0 ? (
          <Empty
            title="No perks yet"
            sub="We're signing up Atlanta shops — detailers, parts, wheels, wraps. If you run one and want in, get in touch."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {perks.map((perk) => (
              <PerkCard
                key={perk.id}
                perk={perk}
                revealed={revealed[perk.id]}
                onReveal={() => reveal(perk)}
                user={user}
                onNeedAccount={onNeedAccount}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinCard({ count, user, onNeedAccount }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #FF4500",
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 0.4 }}>
        {count} {count === 1 ? "DISCOUNT" : "DISCOUNTS"}, {MEMBERSHIP_PRICE}/MONTH
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#999",
          marginTop: 8,
          lineHeight: 1.65,
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        Finding meets is free and always will be. Membership is for the perks — one detail
        discount usually covers the year.
      </div>
      <button
        className="action-btn"
        onClick={() => (user ? null : onNeedAccount())}
        disabled={Boolean(user)}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "13px 0",
          background: user ? "#1A1A1A" : "#FF4500",
          color: user ? "#666" : "#fff",
          border: user ? "1px solid #2A2A2A" : "none",
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 1.6,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        {user ? "MEMBERSHIP OPENS SOON" : "CREATE A FREE ACCOUNT FIRST"}
      </button>
      <div
        style={{
          fontSize: 11,
          color: "#555",
          marginTop: 8,
          textAlign: "center",
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        Not charging yet — we're signing up partners first.
      </div>
    </div>
  );
}

function PerkCard({ perk, revealed, onReveal, user, onNeedAccount }) {
  const locked = !perk.unlocked;

  return (
    <div
      style={{
        background: "#111",
        border: `1px solid ${locked ? "#1E1E1E" : "#2A2A2A"}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            flexShrink: 0,
            background: "#161616",
            border: "1px solid #242424",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            fontSize: 17,
          }}
        >
          {perk.partner_logo_url ? (
            <img
              src={perk.partner_logo_url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            "🔧"
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: 0.2 }}>
            {perk.partner_name}
          </div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.4, fontWeight: 700 }}>
            {CATEGORY_LABELS[perk.partner_category] || "OTHER"}
            {perk.partner_city && ` · ${perk.partner_city.toUpperCase()}`}
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            fontSize: 15,
            fontWeight: 900,
            color: "#FF4500",
            letterSpacing: 0.3,
          }}
        >
          {perk.discount_text}
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 11 }}>{perk.title}</div>
      {perk.description && (
        <div
          style={{
            fontSize: 12.5,
            color: "#999",
            marginTop: 4,
            lineHeight: 1.6,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {perk.description}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {locked ? (
          <button
            className="action-btn"
            onClick={() => (user ? null : onNeedAccount())}
            style={{
              width: "100%",
              padding: "10px 0",
              background: "#161616",
              border: "1px dashed #333",
              borderRadius: 8,
              color: "#666",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.2,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            🔒 MEMBERS ONLY
          </button>
        ) : revealed && perk.redemption_type === "code" ? (
          <div
            style={{
              padding: "11px 0",
              textAlign: "center",
              background: "#0C0C0C",
              border: "1px dashed #FF4500",
              borderRadius: 8,
              color: "#FF4500",
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: 4,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {perk.code}
          </div>
        ) : perk.redemption_type === "show_screen" ? (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(255,69,0,0.08)",
              border: "1px solid rgba(255,69,0,0.4)",
              borderRadius: 8,
              color: "#FF7A00",
              fontSize: 12.5,
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            Show your TUNR member badge in store.
          </div>
        ) : (
          <button className="action-btn" onClick={onReveal} style={unlockButton}>
            {perk.redemption_type === "link" ? "OPEN THE OFFER" : "SHOW MY CODE"}
          </button>
        )}
      </div>

      {!locked && revealed && perk.redemption_type === "link" && perk.url && (
        <a
          href={perk.url}
          target="_blank"
          rel="noreferrer"
          style={{ ...unlockButton, display: "block", textAlign: "center", textDecoration: "none", marginTop: 8 }}
        >
          GO TO OFFER ↗
        </a>
      )}

      {perk.terms && (
        <div
          style={{
            fontSize: 11,
            color: "#555",
            marginTop: 9,
            lineHeight: 1.5,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {perk.terms}
        </div>
      )}
    </div>
  );
}

const unlockButton = {
  width: "100%",
  padding: "10px 0",
  background: "rgba(255,69,0,0.12)",
  border: "1px solid #FF4500",
  borderRadius: 8,
  color: "#FF4500",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  fontFamily: "'Barlow Condensed', sans-serif",
};

function Empty({ title, sub }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #1E1E1E",
        borderRadius: 10,
        padding: 34,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 34, marginBottom: 10 }}>🎟</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#666" }}>{title}</div>
      {sub && (
        <div
          style={{
            fontSize: 13,
            color: "#555",
            marginTop: 7,
            lineHeight: 1.6,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
