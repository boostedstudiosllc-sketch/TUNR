import { useEffect, useRef, useState } from "react";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "../lib/contact.js";
import { LINKUP_RULES } from "../lib/linkupRules.js";

// Shown at the top. Change it whenever TOS_VERSION in lib/store.js changes.
const TERMS_UPDATED = "November 2026";

const body = { fontFamily: "'Barlow', sans-serif", fontSize: 13, color: "var(--n-aaaaaa)", lineHeight: 1.7 };
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
  color: "var(--a-ef4444)",
  lineHeight: 1.6,
};

// onDecline (for a signed-in account that hasn't agreed): a way out that
// signs them out instead.
export default function TermsOfService({ onAccept, onClose, onDecline = null, readOnly = false }) {
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
        background: "var(--n-0a0a0a)",
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "var(--n-f0f0f0)",
      }}
    >
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--n-1a1a1a)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              TUN<span style={{ color: "#0080F0" }}>R</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Terms of Service</div>
            <div style={{ fontSize: 12, color: "var(--n-555555)", marginTop: 2, fontFamily: "'Barlow', sans-serif" }}>
              {readOnly ? `Last updated ${TERMS_UPDATED}` : "Please read before continuing"}
            </div>
          </div>
          {readOnly && (
            <button
              className="close-btn"
              onClick={onClose}
              style={{
                background: "var(--n-1a1a1a)",
                border: "1px solid var(--n-2a2a2a)",
                color: "var(--n-ffffff)",
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
          In Parts, members buy and sell to each other: TUNR isn't part of those sales and doesn't
          guarantee that any part fits or is as described (section 14).
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
            Sections 21, 23 and 24 (disputes between members, release, limit of liability and indemnity) apply to linkups exactly
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

        <div style={heading}>13. GAMES &amp; YOUR 3D GARAGE</div>
        <div style={body}>
          The games in the TUNR Arcade are free to play. Only TUNR Rush earns points, as described
          in section 10; the other games are just for fun and have no prizes. Don't cheat or tamper
          with a game, its scores or leaderboards: we can remove scores and points that don't come
          from fair play. Drift King's tracks are based on the layouts of real circuits, under
          names we made up; TUNR isn't connected with Formula 1, any racing series, or any circuit.
          <br />
          <br />
          Your 3D garage and the games draw the cars in your garage with TUNR's own simple shapes,
          styled after the make you picked. Car brand names are used only to describe the cars our
          members own. TUNR isn't connected with, sponsored or endorsed by any car maker.
        </div>

        <div style={heading}>14. PARTS MARKETPLACE</div>
        <div style={body}>
          <b>TUNR isn't part of the sale.</b> Parts lets members list car parts and message each other. We aren't the buyer, seller, agent or broker; we don't own, inspect, store, ship or hold payment for any item, and we aren't a party to any sale. Whatever you agree with another member (price, payment, shipping or pickup, returns, refunds, warranties) is between the two of you. Unless the seller promises otherwise in writing, items are sold as is.
          <br />
          <br />
          <b>Fitment is an estimate, not a promise.</b> What a part fits (make, model, years, trim or chassis code, "only fits cars with", part number) is entered by the seller. The fit check (✅ FITS YOUR CAR, ⚠️ CHECK FIT, ❌ WON'T FIT), "Parts for my car" alerts, the "Fits which car?" filter and VIN decoding are automatic estimates made from what the seller entered, what your garage says and public data, and they can be wrong or incomplete. They don't promise that a part fits, works, is legal for your car, or is what the listing says. Before you buy or install anything, confirm it yourself: the part number, your VIN, the maker's or a dealer's parts catalog, or a qualified mechanic. TUNR isn't responsible for a part that doesn't fit or work, is damaged, fake, stolen or not as described, or for the cost of returning, fitting or removing it.
          <br />
          <br />
          <b>Sellers.</b> Only list what you own or are allowed to sell, describe it honestly (condition, fitment, defects, whether it's genuine), follow the law (including consumer protection and taxes), and do what you agree to. Not allowed: stolen goods or parts from stolen vehicles; parts with VIN or serial numbers removed or altered; devices that defeat emissions controls or parts advertised as street legal when they aren't; airbags and recalled safety parts; fakes or replicas sold as genuine; and anything else that's illegal to sell. We can remove any listing and suspend any seller.
          <br />
          <br />
          <b>Stay safe.</b> We don't check members' identity. Meet in a busy public place in daylight, bring someone, inspect the item before you pay, and don't pay strangers by wire transfer, gift card or anything you can't get back. Never share passwords or codes. Report fraud or theft to the police and to us.
          <br />
          <br />
          <b>When a deal goes wrong,</b> sort it out with the other member. We may look at reports and remove listings or accounts, but we don't have to step in, refund anyone, or decide who's right.
          <br />
          <br />
          <b>Working on your car.</b> Parts and modifications can void a warranty, affect insurance, emissions, inspections or whether a car is street legal, and can be dangerous if fitted wrong. You do it at your own risk; use a qualified mechanic.
        </div>

        <div style={heading}>15. MERCH SHOP</div>
        <div style={body}>
          The price, sizes, any TUNR+ discount and shipping are shown before you pay. Card payments are taken on our payment processor's (Stripe's) checkout page. Colors on screen can look a little different in person, so check the size and description before you order. If an item sells out after you've paid, we refund you.
          <br />
          <br />
          We ship to the address you give us, in the US. Delivery times are estimates, not promises. Once the carrier marks a package delivered, it's yours; if it's lost after that, contact the carrier, and we'll help where we can.
          <br />
          <br />
          If an item arrives damaged, defective or wrong, email us within 30 days of delivery with a photo and we'll replace it or refund you. Otherwise sales are final, unless we say otherwise at checkout or the law gives you more.
        </div>

        <div style={heading}>16. PROMOTED MEETS &amp; OTHER PAID FEATURES</div>
        <div style={body}>
          Promoting a meet buys placement for a time: a spot at the top of Discover, and with Spotlight a banner slide and one alert to members nearby. It doesn't guarantee views, RSVPs, attendance or any result. The price and what you get are shown before you pay through Stripe. If the meet is removed, hidden or over before the promotion starts, you get a refund; once a promotion is live it isn't refundable, except where the law requires. We can turn down or stop a promotion for a meet that breaks these terms, without a refund. Promoted meets are labeled "Promoted"; promotion isn't an endorsement by us.
        </div>

        <div style={heading}>17. MAPS, DIRECTIONS, LOCATION &amp; DRIVING</div>
        <div style={body}>
          <b>Never use TUNR while driving.</b> Directions, convoys, check-ins and alerts are for passengers or when you're parked. A convoy is not a navigation or safety system: don't speed, race, follow too closely or drive unsafely to keep up with anyone.
          <br />
          <br />
          Directions open Google Maps or Waze, and maps come from Mapbox. Addresses, map pins, distances, routes and weather come from hosts and other services and can be wrong. Check where you're going and obey traffic laws and signs.
          <br />
          <br />
          Your location is used only when you choose: checking in, convoys, "Who's down?" and distances. In a convoy, its members see where you are while you share. Think about who you share it with.
          <br />
          <br />
          Photo spots are suggested by members. We don't check that a spot is legal, safe, public or open. Get permission where you need it, respect "no trespassing" and property rules, and don't block traffic. "Where I parked" is a convenience kept on your phone, not a guarantee.
        </div>

        <div style={heading}>18. AI FEATURES</div>
        <div style={body}>
          Some features use AI from Google (Gemini): reading flyers when you post a meet, listing meets found on Instagram, and TUNR Help. AI can be wrong, so check what it fills in before you post. TUNR Help answers questions about using the app from our help guide; it can't see your account, can't make promises or exceptions for us, and isn't legal, mechanical, financial or safety advice. Don't type passwords, payment details or other private information into it. Your questions are sent to Google to be answered; we don't keep them.
        </div>

        <div style={heading}>19. SCRATCH CARDS &amp; TUNR TUESDAYS</div>
        <div style={body}>
          Scratch cards let you spend points for a chance to win points. Everyone gets one free card a week, with no points or purchase needed. Prizes are points only, never cash or goods, and points can't be bought on their own, sold or cashed out. TUNR Tuesdays is a free weekly pick; a right pick earns points. You must be 18 or older. Where these are not allowed by law, they're void. We can change cards, odds, prizes and picks, or end them, at any time, and can remove points won by cheating.
        </div>

        <div style={heading}>20. OTHER COMPANIES' SERVICES</div>
        <div style={body}>
          TUNR uses and links to services run by other companies, including Stripe (payments), Google (maps and AI), Waze, Mapbox (maps), Instagram, the US government's NHTSA vehicle database (VIN decoding) and the businesses behind perks. They have their own terms and privacy policies. We aren't responsible for them, their content, or whether they're available.
        </div>

        <div style={heading}>21. DISPUTES BETWEEN MEMBERS</div>
        <div style={body}>
          What happens between you and other members (at meets, linkups and convoys, in sales, chats, clubs, photo shoots or anything else) is between you and them. To the fullest extent the law allows, you release {LEGAL_ENTITY}, its owners, employees and agents from all claims, demands and damages of every kind, known or unknown, that come from those dealings, and you give up any law that would otherwise limit this release to claims you knew about when you agreed.
        </div>

        <div style={heading}>22. THE APP IS PROVIDED "AS IS"</div>
        <div style={body}>
          TUNR is provided "as is" and "as available". To the extent the law allows, we make no
          promise that it will be accurate, uninterrupted, or error-free, or that any event,
          listing, host, or offer is what it claims to be, and we disclaim all implied warranties,
          including merchantability, fitness for a particular purpose, and non-infringement.
          <br />
          <br />
          Things TUNR works out for you are estimates and can be wrong: fit checks, part details,
          VIN decoding, flyer readings, AI answers, directions, distances, weather, "going" counts
          and points shown before they're paid. Don't rely on them for anything important without
          checking.
        </div>

        <div style={heading}>23. RELEASE &amp; LIMIT OF LIABILITY</div>
        <div style={body}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL_ENTITY.toUpperCase()}, ITS OWNERS,
          EMPLOYEES AND AGENTS ARE NOT LIABLE FOR ANY INJURY, DEATH, PROPERTY DAMAGE, OR OTHER HARM
          ARISING FROM YOUR USE OF THIS APP OR ATTENDANCE AT ANY LISTED EVENT OR LINKUP. YOU ATTEND
          ANY EVENT OR LINKUP AT YOUR SOLE RISK.
          <br />
          <br />
          TO THE SAME EXTENT, WE ARE NOT LIABLE FOR: ANYTHING BOUGHT, SOLD OR TRADED BETWEEN
          MEMBERS, INCLUDING PARTS THAT DON'T FIT, DON'T WORK OR AREN'T AS DESCRIBED, AND ANY
          DAMAGE OR INJURY FROM INSTALLING THEM; WHAT OTHER MEMBERS, HOSTS OR SELLERS DO OR SAY;
          ROUTES, CONVOYS, PHOTO SPOTS OR DRIVING; ESTIMATES AND AI ANSWERS; OTHER COMPANIES'
          SERVICES; OR LOST DATA, POINTS OR CONTENT.
          <br />
          <br />
          TO THE SAME EXTENT, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR
          CONSEQUENTIAL DAMAGES, AND OUR TOTAL LIABILITY FOR ANY CLAIM ABOUT TUNR IS LIMITED TO THE
          GREATER OF $50 OR WHAT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM.
        </div>

        <div style={heading}>24. INDEMNITY</div>
        <div style={body}>
          If someone brings a claim against us because of a meet you hosted, a linkup you posted or
          went to, content you posted, an item you listed, sold or bought, a spot you shared, or
          your breach of these terms or the law, you agree to cover our reasonable costs of dealing
          with it, including legal fees.
        </div>

        <div style={heading}>25. REPORTING</div>
        <div style={body}>
          If you witness illegal activity at a TUNR-listed meet, report it to local law enforcement
          immediately. TUNR will cooperate fully with law enforcement investigations.
          <br />
          <br />
          Inside the app, use Report on any meet to flag a listing, and block on any comment to stop
          hearing from an account. Reported content is reviewed within 24 hours and removed if it
          breaks these terms.
        </div>

        <div style={heading}>26. CHANGES TO THESE TERMS</div>
        <div style={body}>
          If we change these terms in a way that matters, we'll ask you to agree to the new version
          in the app before you carry on. If you don't agree, you can stop using TUNR and delete your
          account.
        </div>

        <div style={heading}>27. GOVERNING LAW &amp; DISPUTES</div>
        <div style={body}>
          These terms are governed by the laws of the State of Georgia, USA. Any dispute about TUNR
          will be handled in the state or federal courts located in Georgia, and you and we agree to
          those courts' jurisdiction — except that either of us may bring a claim in small claims
          court where it qualifies. If any part of these terms can't be enforced, the rest still
          applies.
          <br />
          <br />
          Before bringing a claim, email us what it's about and give us 30 days to try to sort it
          out. To the extent the law allows, a claim about TUNR must be brought within one year of
          when it arose, and only on your own behalf, not as part of a class or group claim.
        </div>

        <div style={heading}>28. GENERAL</div>
        <div style={body}>
          These terms (with the linkup rules and the Privacy Policy) are the whole agreement
          between you and us about TUNR. If we don't enforce a part of them straight away, we can
          still enforce it later. You can't transfer this agreement; we can, for example if TUNR is
          sold. We aren't responsible for delays or outages caused by things outside our control,
          such as outages at other companies, the weather or the law. Nothing in these terms takes
          away rights the law gives you that can't be signed away.
        </div>

        <div style={heading}>29. CONTACT</div>
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
            borderTop: "1px solid var(--n-1a1a1a)",
            flexShrink: 0,
            background: "var(--n-0a0a0a)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: 11.5,
              color: scrolledToEnd ? "var(--n-555555)" : "var(--n-888888)",
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
              background: scrolledToEnd ? "#0080F0" : "var(--n-1e1e1e)",
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
          {onDecline && (
            <button
              type="button"
              onClick={onDecline}
              style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "var(--n-777777)", fontSize: 12, cursor: "pointer", fontFamily: "'Barlow', sans-serif", textDecoration: "underline" }}
            >
              Don't agree? Sign out and browse as a guest
            </button>
          )}
        </div>
      )}
    </div>
  );
}
