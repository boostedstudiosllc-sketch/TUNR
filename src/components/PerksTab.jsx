import { useEffect, useState } from "react";
import { loadPerks, recordRedemption, loadProfile, track } from "../lib/store.js";
import { loadMyPoints, hasPendingCard, takePendingCard } from "../lib/points.js";
import { RewardsSheet } from "./Rewards.jsx";
import TunrRush from "./TunrRush.jsx";
import DetailingRequest from "./DetailingRequest.jsx";

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
  const [points, setPoints] = useState(null);
  const [showRewards, setShowRewards] = useState(false);
  const [scannedCard, setScannedCard] = useState("");
  const [playing, setPlaying] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Arrived by scanning a points card: open straight to it.
  useEffect(() => {
    if (!user || !hasPendingCard()) return;
    setScannedCard(takePendingCard());
    setShowRewards(true);
  }, [user?.id]);

  // Refreshed when the rewards sheet closes, after anything spent or earned.
  useEffect(() => {
    if (!user || showRewards) return;
    let alive = true;
    loadMyPoints()
      .then((p) => alive && setPoints(p))
      .catch((e) => console.warn(e.message));
    return () => {
      alive = false;
    };
  }, [user?.id, showRewards]);

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

  // Membership is pitched on the perks it actually adds; free ones come with
  // any account. Rows from before members_only existed count as members-only.
  const memberPerks = perks.filter((p) => p.members_only !== false).length;
  const freePerks = perks.length - memberPerks;

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
            : memberPerks === 0 && freePerks > 0
            ? "Discounts for everyone with a free TUNR account."
            : "Discounts at Atlanta shops. Some are free with an account; the rest are for members."}
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
        <PointsCard
          points={points}
          onOpen={() => (user ? setShowRewards(true) : onNeedAccount())}
        />
        <button
          className="action-btn"
          onClick={() => setPlaying(true)}
          style={{
            width: "100%",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            background: "linear-gradient(135deg, #2A0E00, #141414)",
            border: "1px solid #5A2200",
            borderRadius: 12,
            color: "#F0F0F0",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 28 }}>🎮</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>
              TUNR <span style={{ color: "#FF4500" }}>RUSH</span>
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "#C2724A", fontFamily: "'Barlow', sans-serif" }}>
              Drive your own car. Reach 3,000 m for +1 point a day.
            </span>
          </span>
          <span aria-hidden="true" style={{ fontSize: 20, color: "#C2724A" }}>›</span>
        </button>
        {playing && (
          <TunrRush
            user={user}
            onClose={() => setPlaying(false)}
            onToast={onToast}
            onNeedAccount={() => {
              setPlaying(false);
              onNeedAccount();
            }}
          />
        )}

        {showRewards && user && (
          <RewardsSheet
            user={user}
            initialCard={scannedCard}
            onClose={() => {
              setShowRewards(false);
              setScannedCard("");
            }}
            onToast={onToast}
          />
        )}

        {!isMember && memberPerks > 0 && <JoinCard count={memberPerks} onNeedAccount={onNeedAccount} user={user} />}

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
                onRequest={perk.partner_slug === "boosted-detailing" ? () => setRequesting(true) : null}
              />
            ))}
          </div>
        )}
        {requesting && (
          <DetailingRequest
            user={user}
            onClose={() => setRequesting(false)}
            onToast={onToast}
            onNeedAccount={() => {
              setRequesting(false);
              onNeedAccount();
            }}
          />
        )}
      </div>
    </div>
  );
}

// Points from showing up at meets, traded for merch and shop discounts.
function PointsCard({ points, onOpen }) {
  return (
    <button
      className="action-btn"
      onClick={onOpen}
      style={{
        width: "100%",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "linear-gradient(135deg, #2A1F00, #141414)",
        border: "1px solid #4A3A00",
        borderRadius: 12,
        color: "#F0F0F0",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 28 }}>⭐</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>
          {points ? `${Number(points.balance || 0).toLocaleString()} POINTS` : "POINTS & REWARDS"}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: "#A08A40", fontFamily: "'Barlow', sans-serif" }}>
          Check in at meets, trade points for merch and shop deals
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 20, color: "#A08A40" }}>›</span>
    </button>
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

export function PerkCard({ perk, revealed, onReveal, user, onNeedAccount, onRequest = null }) {
  const locked = !perk.unlocked;
  const free = perk.members_only === false;

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
          {free && (
            <div style={{ fontSize: 9.5, color: "#10B981", letterSpacing: 1.2, fontWeight: 800, textAlign: "right", marginTop: 2 }}>
              FREE
            </div>
          )}
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
        {locked && free ? (
          <button className="action-btn" onClick={onNeedAccount} style={unlockButton}>
            FREE WITH AN ACCOUNT — SIGN UP TO GET THE CODE
          </button>
        ) : locked ? (
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
        ) : onRequest ? (
          <>
            <button className="action-btn" onClick={onRequest} style={unlockButton}>
              🧽 REQUEST A DETAIL
            </button>
            <div style={{ fontSize: 11.5, color: "#777", marginTop: 6, fontFamily: "'Barlow', sans-serif" }}>
              Send a request in the app and we'll reply with a time and price. Your discount is included.
            </div>
          </>
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
