import { useEffect, useRef, useState } from "react";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "../lib/contact.js";
import { LINKUP_RULES } from "../lib/linkupRules.js";

// Shown at the top. Change it whenever TOS_VERSION in lib/store.js changes.
const TERMS_UPDATED = "October 2026";

const body = { fontFamily: "'Barlow', sans-serif", fontSize: 13, color: "#AAA", lineHeight: 1.7 };
const heading = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.5,
  color: "#0080F0",
  marginTop: 20,
  marginBottom: 6,
};
const warn = {
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 8,
  padding: "10px 14px",
  margin: "10px 0",
  fontFamily: "'Barlow', sans-serif",
  fontSize: 13,
  color: "#EF4444",
  lineHeight: 1.6,
};

export default function TermsOfService({ onAccept, onClose, readOnly = false }) {
  // The agree button is always on screen but stays disabled until the reader
  // has scrolled to the end: agreeing has to come after the text, not
  // instead of it.
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef(null);

  function checkEnd() {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 24) setScrolledToEnd(true);
  }

  // A screen tall enough to show everything has nothing to scroll.
  useEffect(() => {
    checkEnd();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        top: "env(safe-area-inset-top)",
        zIndex: 300,
        background: "#0A0A0A",
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "#F0F0F0",
      }}
    >
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #1A1A1A", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              TUN<span style={{ color: "#0080F0" }}>R</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Terms of Service</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>
              {readOnly ? `Last updated ${TERMS_UPDATED}` : "Please read before continuing"}
            </div>
          </div>
          {readOnly && (
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
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkEnd}
        style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}
      >
        <div style={body}>
          Welcome to TUNR. TUNR is operated by {LEGAL_ENTITY} ("we", "us"). These terms are an
          agreement between you and us. By creating an account or using the app you agree to them.
          <br />
          <br />
          <strong>You must be 18 or older to use TUNR.</strong> TUNR is built around attending car
          events in person, and these terms — including the release of liability below — are an
          agreement only an adult can make. If you're under 18, don't create an account. If we learn
          an account belongs to someone under 18 we'll remove it.
        </div>
        <div style={warn}>
          ⚠️ TUNR is a discovery platform only. We do not organize or endorse any listed event.
          Attending any event is at your own risk.
        </div>

        <div style={heading}>1. ILLEGAL ACTIVITY — ZERO TOLERANCE</div>
        <div style={body}>
          TUNR has a strict zero-tolerance policy for illegal activity. You agree not to use TUNR to
          organize, promote, or participate in:
        </div>
        <div style={warn}>
          🚫 Street racing, drag racing, or illegal racing on public roads
          <br />
          🚫 Reckless driving, burnouts, or stunt driving in public spaces
          <br />
          🚫 Takeovers, sideshows, or activities that block public roads
          <br />
          🚫 Threatening or harassing any person or group
          <br />
          🚫 Any activity that violates federal, state, or local law
        </div>
        <div style={body}>
          Any meet listing promoting illegal activity will be removed. Hosts found in violation will
          be permanently banned.
        </div>

        <div style={heading}>2. HOST RESPONSIBILITY</div>
        <div style={body}>
          If you post a meet you are the sole organizer and fully responsible for that event. TUNR
          accepts no liability for anything that occurs at a listed event. You must have permission
          to use the listed venue and will not encourage dangerous driving of any kind.
        </div>

        <div style={heading}>3. EVENT LISTINGS & ACCURACY</div>
        <div style={body}>
          Listings may be sourced from public event pages, community submissions, or hosts. Some
          are imported automatically from Instagram posts by TUNR's own account and by meet pages
          that have given us permission; the flyer and its details belong to the page that posted
          them. Details can change or be inaccurate — always confirm with the host before traveling.
          Listings marked "Community Sourced" have not been verified.
          <br />
          <br />
          If we listed your meet and you'd like it removed, corrected or handed over to you, use
          "Is this your meet?" on the listing or email us. We act on removal requests within 24
          hours.
        </div>

        <div style={heading}>4. YOUR ACCOUNT</div>
        <div style={body}>
          Use accurate information, keep your password to yourself, and don't create an account for
          someone else or pretend to be someone you're not. You're responsible for what happens on
          your account. You can delete it at any time from your profile.
          <br />
          <br />
          We can suspend or close an account that breaks these terms, puts other people at risk, or
          that we're required to close by law. Where it's practical and safe, we'll tell you why.
          <br />
          <br />
          <strong>Confirming your email.</strong> You must confirm the email address on your account
          by opening the link we send to it. Until you do, the account is limited: you can browse
          and RSVP, but not chat, post, or start or join linkups. We email the link when you sign up
          and send one reminder a few days later. <strong>An account whose email isn't confirmed
          within 7 days of sign-up is permanently deleted</strong>, along with anything saved to it,
          on the date stated in the reminder (never sooner than 7 days after sign-up, and never
          before both emails have been sent). We do this because an address that's never confirmed
          may have been mistyped or used without its owner's permission; deleting those accounts
          protects the real owner of the address, keeps the community made up of real members, and
          means we don't keep personal information we can't connect to the person it belongs to.
          You're welcome to sign up again at any time.
        </div>

        <div style={heading}>5. HOST NAMES, VERIFICATION &amp; BADGES</div>
        <div style={body}>
          A verified check (✓) means we confirmed the account controls the Instagram page linked to
          that host name. It does <strong>not</strong> mean we endorse the host, check their events,
          or vouch for anyone's safety. A verified host name is reserved for that account; we can
          take it back, or give it to its rightful owner, in cases of impersonation, a dispute over
          who runs a page, or a breach of these terms.
          <br />
          <br />
          Badges such as Day 1 and founding host are recognition only. They have no cash value,
          can't be sold or transferred, and can be removed from an account that breaks these terms.
          The photographer badge is self-declared: TUNR doesn't check anyone's work, rates or
          conduct, so any shoot you arrange with someone is between you and them.
        </div>

        <div style={heading}>6. USER CONDUCT</div>
        <div style={body}>
          You agree not to post hateful, threatening, sexually explicit, or defamatory content; not
          to spam, scrape, or interfere with the app; and not to get around anything that keeps
          content private or restricted. TUNR reserves the right to remove any content and restrict
          any user at any time.
          <br />
          <br />
          <strong>Forums and clubs.</strong> Forums and public clubs are open for anyone to read. Don't
          use them to buy or sell anything, organize street racing or stunts, share anyone's
          private information (including where someone lives), or post repair advice you know is
          unsafe. Advice in the forums comes from other members, not from TUNR: check it with a
          qualified mechanic before you rely on it, and you work on your car at your own risk. The
          person who starts a forum moderates it, and a club's owner and admins run their club; we
          can remove any forum, club, post or comment, and anyone can report one to us.
        </div>

        <div style={heading}>7. LINKUPS</div>
        <div style={body}>
          Linkups are get-togethers people post for later today or tomorrow. Before you post or
          join one, you agree to these rules:
          {LINKUP_RULES.map(([title, text]) => (
            <span key={title} style={{ display: "block", marginTop: 8 }}>
              <strong>{title}</strong> {text}
            </span>
          ))}
          <span style={{ display: "block", marginTop: 8 }}>
            Sections 15 and 16 (release, limit of liability and indemnity) apply to linkups exactly
            as they do to meets.
          </span>
        </div>

        <div style={heading}>8. YOUR CONTENT</div>
        <div style={body}>
          Anything you post — meet listings, comments, photos — stays yours. By posting it you give
          us permission to display, store, resize and share it inside TUNR and in links to TUNR, for
          as long as you keep it up. Delete the content or your account and that permission ends.
          <br />
          <br />
          You promise that what you upload is yours to upload: your own photo, or one you have the
          rights to. Don't post a flyer, photo or logo you don't have permission to use.
        </div>

        <div style={heading}>9. COPYRIGHT &amp; TAKEDOWN</div>
        <div style={body}>
          If something on TUNR infringes your copyright, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#0080F0" }}>
            {CONTACT_EMAIL}
          </a>{" "}
          with: what work was copied, where it appears in TUNR, your contact details, a statement
          that you believe in good faith the use isn't authorised, a statement that your notice is
          accurate and that you're the rights holder or authorised to act for them, and your
          signature. We remove infringing material promptly.
          <br />
          <br />
          If your content was removed and you believe that was a mistake, you can send a counter
          notice to the same address. Accounts that repeatedly infringe are terminated.
        </div>

        <div style={heading}>10. PERKS, POINTS &amp; REWARDS</div>
        <div style={body}>
          Discounts and offers in the Perks tab come from the businesses named on them, not from us.
          Each business sets its own terms, decides whether to honor an offer, and is responsible
          for its products and services. Offers can change, run out, or end at any time. Unless a
          perk says so, listing a business doesn't mean it endorses TUNR or that we endorse it.
          <br />
          <br />
          <strong>Points and rewards.</strong> You earn points for Boosted Studios purchases (by
          scanning the one-time points card that comes with your order or service, or for a sale
          we record for you), a one-time membership bonus, checking in at
          meets (one point at any meet with a map pin posted at least a day ahead; more at meets
          we boost; plus one for checking in again near a meet's end after arriving in its first
          hour; plus small bonuses for weekly check-in streaks), one to three points a day for clearing the
          level you pick in the TUNR Rush game (a game of skill, free to play; one level a day
          with a limited number of tries; our server replays each run from your moves and counts the
          distance it gets, so runs that couldn't be real don't count), referrals (when someone you
          invited, by link or your car's QR, checks in at their first meet; up to 10 a month), and one-time getting-started bonuses. Rewards are
          guaranteed when you redeem them: it's a loyalty program, never a drawing, raffle or
          lottery. Some rewards are only for buyers who have spent a minimum amount. A refunded or
          cancelled order loses its points, and each points card works once, for the account that
          adds it first. Points have no cash value and can't be sold,
          transferred or combined between accounts. Checking in needs your location at that moment; you must
          actually be there. Using points cards that aren't yours,
          using fake locations, checking in for someone who isn't
          there, extra accounts, or any other trick to earn points breaks
          these terms: we can remove those points, cancel rewards claimed with them, and suspend
          the account. Rewards from a business are provided by that business on its own terms.
          <br />
          <br />
          <strong>Spending points.</strong> Besides rewards, you can spend points on TUNR Rush
          scenery (looks only: it never changes a run's score or points) and, when we offer it, a
          mailed sticker. Spent points aren't given back, except when we cancel a sticker order
          paid with points. What you unlock is for your account only.
          We can change point values, rewards and the rules, or end the program, at any time;
          points never become something you own.
        </div>

        <div style={heading}>11. PAID MEMBERSHIP</div>
        <div style={body}>
          Finding meets is free. If you choose a paid membership, the price, what it includes, and
          how often you're billed are shown before you pay. Memberships renew automatically until
          you cancel; you can cancel at any time and keep your benefits until the end of the period
          you've paid for. Payments aren't refundable except where the law requires it or we say
          otherwise at the time. If the price changes, we'll tell you before it applies to your next
          renewal.
        </div>

        <div style={heading}>12. STICKER ORDERS</div>
        <div style={body}>
          You can order a printed copy of your car's QR sticker, mailed to an address in the US.
          The price, in dollars or points, is shown before you order. Card payments are taken on
          our payment processor's checkout page, and we make the sticker once the payment has
          come through. You can cancel an order until it's paid. Delivery times we show are
          estimates, not promises. Check your address: we mail to the one you give us. If a
          sticker arrives damaged or hasn't arrived 30 days after we mark it sent, email us and
          we'll send another one or refund you. Otherwise card payments aren't refundable, except
          where the law requires it.
        </div>

        <div style={heading}>13. GAMES</div>
        <div style={body}>
          The games in the TUNR Arcade are free to play. Only TUNR Rush earns points, as described
          in section 10; the other games are just for fun and have no prizes. Don't cheat or tamper
          with a game, its scores or leaderboards: we can remove scores and points that don't come
          from fair play. Drift King's tracks are based on the layouts of real circuits, under
          names we made up; TUNR isn't connected with Formula 1, any racing series, or any circuit.
        </div>

        <div style={heading}>14. THE APP IS PROVIDED "AS IS"</div>
        <div style={body}>
          TUNR is provided "as is" and "as available". To the extent the law allows, we make no
          promise that it will be accurate, uninterrupted, or error-free, or that any event,
          listing, host, or offer is what it claims to be, and we disclaim all implied warranties,
          including merchantability, fitness for a particular purpose, and non-infringement.
        </div>

        <div style={heading}>15. RELEASE &amp; LIMIT OF LIABILITY</div>
        <div style={body}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL_ENTITY.toUpperCase()}, ITS OWNERS,
          EMPLOYEES AND AGENTS ARE NOT LIABLE FOR ANY INJURY, DEATH, PROPERTY DAMAGE, OR OTHER HARM
          ARISING FROM YOUR USE OF THIS APP OR ATTENDANCE AT ANY LISTED EVENT OR LINKUP. YOU ATTEND
          ANY EVENT OR LINKUP AT YOUR SOLE RISK.
          <br />
          <br />
          TO THE SAME EXTENT, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR
          CONSEQUENTIAL DAMAGES, AND OUR TOTAL LIABILITY FOR ANY CLAIM ABOUT TUNR IS LIMITED TO THE
          GREATER OF $50 OR WHAT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM.
        </div>

        <div style={heading}>16. INDEMNITY</div>
        <div style={body}>
          If someone brings a claim against us because of a meet you hosted, a linkup you posted or
          went to, content you posted, or
          your breach of these terms or the law, you agree to cover our reasonable costs of dealing
          with it, including legal fees.
        </div>

        <div style={heading}>17. REPORTING</div>
        <div style={body}>
          If you witness illegal activity at a TUNR-listed meet, report it to local law enforcement
          immediately. TUNR will cooperate fully with law enforcement investigations.
          <br />
          <br />
          Inside the app, use Report on any meet to flag a listing, and block on any comment to stop
          hearing from an account. Reported content is reviewed within 24 hours and removed if it
          breaks these terms.
        </div>

        <div style={heading}>18. CHANGES TO THESE TERMS</div>
        <div style={body}>
          If we change these terms in a way that matters, we'll ask you to agree to the new version
          in the app before you carry on. If you don't agree, you can stop using TUNR and delete your
          account.
        </div>

        <div style={heading}>19. GOVERNING LAW</div>
        <div style={body}>
          These terms are governed by the laws of the State of Georgia, USA. Any dispute about TUNR
          will be handled in the state or federal courts located in Georgia, and you and we agree to
          those courts' jurisdiction — except that either of us may bring a claim in small claims
          court where it qualifies. If any part of these terms can't be enforced, the rest still
          applies.
        </div>

        <div style={heading}>20. CONTACT</div>
        <div style={body}>
          TUNR is operated by {LEGAL_ENTITY}. Questions, complaints, or anything that needs a
          human:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#0080F0" }}>
            {CONTACT_EMAIL}
          </a>
        </div>
        <div style={{ height: 40 }} />
      </div>

      {!readOnly && (
        <div
          style={{
            padding: "14px 20px 28px",
            borderTop: "1px solid #1A1A1A",
            flexShrink: 0,
            background: "#0A0A0A",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: 11.5,
              color: scrolledToEnd ? "#555" : "#888",
              fontFamily: "'Barlow', sans-serif",
              marginBottom: 10,
            }}
          >
            {scrolledToEnd
              ? "By tapping agree you confirm you are 18 or older"
              : "↓ Scroll to the end of the terms to agree"}
          </div>
          <button
            className="action-btn"
            onClick={() => scrolledToEnd && onAccept()}
            disabled={!scrolledToEnd}
            aria-disabled={!scrolledToEnd}
            style={{
              width: "100%",
              padding: "16px 0",
              background: scrolledToEnd ? "#0080F0" : "#1E1E1E",
              color: scrolledToEnd ? "#fff" : "#555",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: 2,
              cursor: scrolledToEnd ? "pointer" : "not-allowed",
              boxShadow: scrolledToEnd ? "0 4px 24px rgba(0, 128, 240,0.4)" : "none",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            I AGREE — LET'S GO 🔥
          </button>
        </div>
      )}
    </div>
  );
}
