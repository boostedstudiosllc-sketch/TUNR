import { useState } from "react";
import {
  signUpWithPassword,
  signInWithPassword,
  sendPasswordReset,
} from "../lib/store.js";

const input = {
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

const label = {
  fontSize: 10.5,
  color: "#666",
  letterSpacing: 1.4,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export default function AuthForm({ onDone }) {
  const [mode, setMode] = useState("signup"); // signup | login | reset
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  const usernameOk = cleanUsername.length >= 3;
  const emailOk = email.includes("@") && email.includes(".");
  const passwordOk = password.length >= 6;

  const canSubmit =
    mode === "signup"
      ? usernameOk && emailOk && passwordOk
      : mode === "login"
      ? emailOk && password.length > 0
      : emailOk;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const res = await signUpWithPassword(email.trim(), password, cleanUsername);
        if (res.needsConfirmation) {
          setNotice(
            `Account created. Confirm your email (${email.trim()}), then log in with your password — no more emails after that.`
          );
          setMode("login");
          setPassword("");
        } else if (onDone) onDone();
      } else if (mode === "login") {
        await signInWithPassword(email.trim(), password);
        if (onDone) onDone();
      } else {
        await sendPasswordReset(email.trim());
        setNotice("Password reset link sent. Check your email.");
        setMode("login");
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Mode switch */}
      {mode !== "reset" && (
        <div
          style={{
            display: "flex",
            gap: 6,
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: 10,
            padding: 4,
            marginBottom: 14,
          }}
        >
          {[
            ["signup", "SIGN UP"],
            ["login", "LOG IN"],
          ].map(([m, text]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError("");
                setNotice("");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                background: mode === m ? "#FF4500" : "transparent",
                color: mode === m ? "#fff" : "#777",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.2,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <div>
            <div style={label}>USERNAME</div>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#555",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                @
              </span>
              <input
                style={{ ...input, paddingLeft: 30 }}
                placeholder="your_handle"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            {username && !usernameOk && (
              <div style={{ fontSize: 11, color: "#777", marginTop: 5, fontFamily: "'Barlow', sans-serif" }}>
                At least 3 characters — letters, numbers, _ and . only.
              </div>
            )}
          </div>
        )}

        <div>
          <div style={label}>EMAIL</div>
          <input
            style={input}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode !== "reset" && (
          <div>
            <div style={label}>PASSWORD</div>
            <input
              style={input}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "at least 6 characters" : "your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: "#EF4444",
            fontFamily: "'Barlow', sans-serif",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          style={{
            marginTop: 10,
            background: "rgba(16,185,129,0.1)",
            border: "1px solid #10B981",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12.5,
            color: "#10B981",
            fontFamily: "'Barlow', sans-serif",
            lineHeight: 1.5,
          }}
        >
          {notice}
        </div>
      )}

      <button
        className="action-btn"
        onClick={submit}
        disabled={!canSubmit || busy}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "15px 0",
          background: canSubmit && !busy ? "#FF4500" : "#1E1E1E",
          color: canSubmit && !busy ? "#fff" : "#555",
          border: "none",
          borderRadius: 10,
          fontSize: 14.5,
          fontWeight: 900,
          letterSpacing: 1.6,
          fontFamily: "'Barlow Condensed', sans-serif",
          boxShadow: canSubmit && !busy ? "0 4px 20px rgba(255,69,0,0.35)" : "none",
        }}
      >
        {busy
          ? "…"
          : mode === "signup"
          ? "CREATE ACCOUNT"
          : mode === "login"
          ? "LOG IN"
          : "SEND RESET LINK"}
      </button>

      <div style={{ marginTop: 10, textAlign: "center" }}>
        {mode === "login" && (
          <button
            onClick={() => {
              setMode("reset");
              setError("");
              setNotice("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            ← Back to log in
          </button>
        )}
      </div>
    </div>
  );
}
