import { useEffect, useState } from "react";
import {
  ensureProfile,
  loadProfile,
  saveProfile,
  isUsernameTaken,
  redeemHostInvite,
  clearHostInvite,
  loadMyVerification,
  requestVerification,
  track,
} from "../lib/store.js";
import AuthForm from "./AuthForm.jsx";
import Badge from "./Badge.jsx";
import TermsOfService from "./TermsOfService.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";

// The /hosts flow after the pitch: account → host name → verified.
//
// With a valid invite, verification is automatic: the link only ever went to
// that Instagram account's DMs, so opening it is the proof. Without one, the
// host tells us their Instagram and we answer with an invite DM.
export default function HostSetup({ user, token, invite, onStart }) {
  const invited = invite?.status === "valid";
  const suggested = (invite?.instagram_handle || "").replace(/[^a-z0-9_.]/g, "").slice(0, 24);

  const [profile, setProfile] = useState(null);
  const [result, setResult] = useState(null); // redeem result
  const [request, setRequest] = useState(undefined); // undefined = loading
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  async function refreshProfile() {
    const p = await loadProfile(user.id);
    setProfile(p);
    return p;
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    ensureProfile(user)
      .catch(() => {})
      .then(() => loadProfile(user.id))
      .then((p) => alive && setProfile(p));
    loadMyVerification(user.id).then((r) => alive && setRequest(r));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Spend the invite as soon as there's an account with a name to verify.
  useEffect(() => {
    if (!user || !profile?.username || !token || result) return;
    if (invite && invite.status !== "valid") {
      // Peeking already told us it's spent or stale; don't try.
      setResult(invite.status);
      clearHostInvite();
      return;
    }
    redeemHostInvite(token)
      .then(async (r) => {
        setResult(r);
        if (r === "verified" || r === "already_yours") {
          clearHostInvite();
          track("host_invite_redeemed", {});
          await refreshProfile();
          setRequest(await loadMyVerification(user.id));
        } else if (r === "used" || r === "expired" || r === "not_found") {
          clearHostInvite();
        }
      })
      .catch(() => setResult("error"));
  }, [user?.id, profile?.username, token, invite?.status]);

  let body;
  if (!user) {
    body = (
      <>
        <Heading
          title={invited ? `Set up @${invite.instagram_handle}` : "Create your host account"}
          sub={
            invited
              ? "Make your account and you're verified straight away. Your username is your host name — it's what shows on your meets."
              : "Your username is your host name — it's what shows on your meets. Use the name people know you by."
          }
        />
        <AuthForm initialUsername={suggested} />
        <Legal onTerms={() => setShowTerms(true)} onPrivacy={() => setShowPrivacy(true)} />
      </>
    );
  } else if (!profile || request === undefined) {
    body = <Muted>Setting up your account…</Muted>;
  } else if (!profile.username) {
    body = <PickName suggested={suggested} userId={user.id} onSaved={refreshProfile} />;
  } else if (request?.status === "approved") {
    body = <Verified profile={profile} onStart={onStart} />;
  } else if (token && !result) {
    body = <Muted>Verifying @{profile.username}…</Muted>;
  } else {
    body = (
      <>
        {result && <InviteProblem result={result} username={profile.username} />}
        <RequestAccess
          user={user}
          host={profile.username}
          request={request}
          onRequested={setRequest}
          onStart={onStart}
        />
      </>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#F0F0F0",
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: "'Barlow Condensed', sans-serif",
        padding: "36px 22px 40px",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
        TUN<span style={{ color: "#FF4500" }}>R</span>
      </div>
      <div style={{ fontSize: 10.5, color: "#555", letterSpacing: 2.5, marginTop: 3, marginBottom: 26 }}>
        FOR HOSTS
      </div>
      {body}
      {showTerms && <TermsOfService readOnly onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

function PickName({ suggested, userId, onSaved }) {
  const [name, setName] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clean = name.toLowerCase().replace(/[^a-z0-9_.]/g, "");

  async function save() {
    if (busy || clean.length < 3) return;
    setBusy(true);
    setError("");
    try {
      if (await isUsernameTaken(clean)) {
        setError("That name is taken — pick another.");
        return;
      }
      await saveProfile({ username: clean, city: "Atlanta, GA" }, userId);
      const p = await onSaved();
      if (!p?.username) setError("Couldn't save that name. Try another.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        title="Pick your host name"
        sub="It's what shows on your meets, and once you're verified nobody else can post under it. Use the name people know you by."
      />
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: 13, color: "#555", fontWeight: 700 }}>@</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="your_meet_name"
          style={{ ...inputStyle, paddingLeft: 30 }}
        />
      </div>
      {error && <div style={{ ...small, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      <PrimaryButton disabled={busy || clean.length < 3} onClick={save}>
        {busy ? "…" : "CONTINUE"}
      </PrimaryButton>
    </>
  );
}

function Verified({ profile, onStart }) {
  return (
    <div style={{ textAlign: "center" }}>
      {profile.foundingHost ? (
        <Badge kind="founding_host" size={60} />
      ) : (
        <div style={{ fontSize: 46, color: "#FF4500", lineHeight: 1 }}>✓</div>
      )}
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 14, lineHeight: 1.1 }}>
        You're verified
      </div>
      <div style={{ ...paragraph, marginTop: 8 }}>
        <strong style={{ color: "#FF7A00" }}>@{profile.username}</strong> is yours. Your meets carry
        the verified check and nobody else can post under that name.
        {profile.foundingHost &&
          " You're also a founding host — that badge on your name is one nobody can get after launch."}
      </div>
      <PrimaryButton onClick={() => onStart(true)}>POST YOUR FIRST MEET →</PrimaryButton>
      <SecondaryButton onClick={() => onStart(false)}>Open TUNR</SecondaryButton>
    </div>
  );
}

function InviteProblem({ result, username }) {
  const message = {
    used: "That invite link has already been used. If that wasn't you, tell us below and we'll send a fresh one.",
    expired: "That invite link has expired. Tell us your Instagram below and we'll send a fresh one.",
    not_found: "That invite link isn't valid. Tell us your Instagram below and we'll send a fresh one.",
    host_taken: `Another account is already verified as @${username}. If that name is yours, reply to our DM and we'll sort it out.`,
    error: "Something went wrong using your invite. Refresh to try again.",
  }[result];
  if (!message) return null;
  return (
    <div
      style={{
        ...small,
        color: "#FF8A65",
        background: "rgba(255,69,0,0.08)",
        border: "1px solid rgba(255,69,0,0.35)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 18,
      }}
    >
      {message}
    </div>
  );
}

// No invite: they tell us their Instagram, and an admin answers with an
// invite DM. Nothing goes in their bio.
function RequestAccess({ user, host, request, onRequested, onStart }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy || !handle.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await requestVerification(host, handle, user.id);
      track("verification_requested", { host, via: "hosts" });
      onRequested(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (request?.status === "pending") {
    return (
      <>
        <Heading
          title="You're on the list"
          sub={`We'll DM @${request.instagram_handle} on Instagram with a link. Open it and you're verified — nothing to put in your bio. Until then you can post meets as @${host} like normal.`}
        />
        <PrimaryButton onClick={() => onStart(true)}>POST YOUR FIRST MEET →</PrimaryButton>
        <SecondaryButton onClick={() => onStart(false)}>Open TUNR</SecondaryButton>
      </>
    );
  }

  return (
    <>
      <Heading
        title="Which Instagram runs your meets?"
        sub={`We'll DM that page a link to verify @${host}. Opening it is the proof the page is yours — nothing to put in your bio.`}
      />
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: 13, color: "#555", fontWeight: 700 }}>@</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="instagram_handle"
          style={{ ...inputStyle, paddingLeft: 30 }}
        />
      </div>
      {error && <div style={{ ...small, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      <PrimaryButton disabled={busy || !handle.trim()} onClick={submit}>
        {busy ? "…" : "REQUEST VERIFICATION"}
      </PrimaryButton>
      <SecondaryButton onClick={() => onStart(true)}>Skip — just post a meet</SecondaryButton>
    </>
  );
}

function Heading({ title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.2 }}>{title}</div>
      {sub && <div style={{ ...paragraph, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function Muted({ children }) {
  return <div style={{ ...paragraph, textAlign: "center", marginTop: 30 }}>{children}</div>;
}

function Legal({ onTerms, onPrivacy }) {
  return (
    <div style={{ ...small, color: "#555", textAlign: "center", marginTop: 14 }}>
      Free for hosts. By creating an account you agree to the{" "}
      <button style={linkButton} onClick={onTerms}>
        Terms
      </button>{" "}
      and{" "}
      <button style={linkButton} onClick={onPrivacy}>
        Privacy Policy
      </button>
      .
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled = false }) {
  return (
    <button
      className="action-btn"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        marginTop: 18,
        padding: "15px 0",
        background: disabled ? "#1E1E1E" : "#FF4500",
        color: disabled ? "#555" : "#fff",
        border: "none",
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: 2,
        fontFamily: "'Barlow Condensed', sans-serif",
        boxShadow: disabled ? "none" : "0 6px 26px rgba(255,69,0,0.4)",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...linkButton,
        display: "block",
        margin: "16px auto 0",
        fontSize: 13,
        color: "#888",
      }}
    >
      {children}
    </button>
  );
}

const paragraph = {
  fontSize: 14,
  color: "#AAA",
  lineHeight: 1.65,
  fontFamily: "'Barlow', sans-serif",
};

const small = {
  fontSize: 12.5,
  lineHeight: 1.6,
  fontFamily: "'Barlow', sans-serif",
};

const inputStyle = {
  width: "100%",
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 10,
  padding: "13px 15px",
  color: "#F0F0F0",
  fontSize: 15,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const linkButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#999",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: "inherit",
  fontFamily: "'Barlow', sans-serif",
};
