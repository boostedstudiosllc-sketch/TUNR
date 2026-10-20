import { useEffect, useState } from "react";
import {
  pushSupport,
  deviceSubscribed,
  enablePush,
  disablePush,
  loadAlertSettings,
  saveAlertSettings,
  currentPosition,
  DEFAULT_ALERT_SETTINGS,
} from "../lib/alerts.js";
import Sheet, { sheetTitle, muted, label, bigButton, quietButton } from "./Sheet.jsx";

// Alert settings: phone alerts on this device, and what to be told about.
export default function AlertSettings({ user, onClose, onToast }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [support] = useState(pushSupport);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    loadAlertSettings(user.id)
      .then(setSettings)
      .catch((e) => {
        setLoadError(e.message);
        setSettings({ ...DEFAULT_ALERT_SETTINGS });
      });
    deviceSubscribed().then(setSubscribed);
  }, [user.id]);

  async function save(patch, message) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      setSettings(await saveAlertSettings(user.id, next));
      if (message) onToast(message);
    } catch (e) {
      setSettings(settings);
      onToast(e.message);
    }
  }

  async function toggleDevice() {
    setBusy("device");
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        onToast("Alerts are off on this device");
      } else {
        await enablePush();
        setSubscribed(true);
        // First time on: make sure there's a settings row to go with it.
        if (!settings?.updated_at) await saveAlertSettings(user.id, settings || DEFAULT_ALERT_SETTINGS).then(setSettings);
        onToast("🔔 Alerts are on for this device");
      }
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  async function useMyLocation() {
    setBusy("location");
    try {
      const pos = await currentPosition();
      await save({ lat: pos.lat, lng: pos.lng, linkups: true }, "📍 Linkup alerts are set to around here");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    // Above Settings (290), which opens it too.
    <Sheet onClose={onClose} label="Alert settings" zIndex={295}>
      <div style={sheetTitle}>ALERT SETTINGS</div>
      {loadError && <div style={{ ...muted, color: "#EF4444", marginTop: 6 }}>{loadError}</div>}

      <Section title="THIS DEVICE">
        {support === "ios_home_screen" ? (
          <IphoneSteps />
        ) : support === "unsupported" ? (
          <div style={muted}>This browser can't show alerts. Use Chrome, or Safari on an iPhone with TUNR added to the Home Screen. Your alerts still collect under the 🔔.</div>
        ) : support === "blocked" ? (
          <div style={muted}>
            Alerts are blocked for TUNR in this browser. Allow notifications for this site in your browser or phone
            settings, then come back here.
          </div>
        ) : (
          <>
            <div style={muted}>
              {subscribed
                ? "On. This phone or computer gets an alert when something happens."
                : "Off. Turn on to get an alert on this phone or computer, not just under the 🔔."}
            </div>
            <button
              disabled={busy === "device"}
              onClick={toggleDevice}
              style={{ ...(subscribed ? quietButton : bigButton), marginTop: 10 }}
            >
              {busy === "device" ? "…" : subscribed ? "TURN OFF ON THIS DEVICE" : "🔔 TURN ON ALERTS"}
            </button>
          </>
        )}
      </Section>

      {settings && (
        <>
          <Section title="LINKUPS NEAR YOU">
            <Toggle
              on={settings.linkups}
              onChange={(v) => save({ linkups: v })}
              title="Tell me when a linkup starts near me"
              sub="Someone heading out in the next 2 hours to shoot, cruise or hang."
            />
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={label}>WITHIN</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: "#FF7A00" }}>{settings.radius_miles} miles</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                aria-label="Linkup alert distance in miles"
                value={Math.min(100, Math.max(5, settings.radius_miles))}
                onChange={(e) => setSettings((s) => ({ ...s, radius_miles: Number(e.target.value) }))}
                onPointerUp={(e) => save({ radius_miles: Number(e.currentTarget.value) })}
                onKeyUp={(e) => save({ radius_miles: Number(e.currentTarget.value) })}
                style={{ width: "100%", accentColor: "#FF4500" }}
              />
            </div>
            <div style={{ ...muted, marginTop: 6 }}>
              {settings.lat != null
                ? "Measured from where you last set your location (rounded to about half a mile)."
                : "Set your location so TUNR knows what's near you."}
            </div>
            <button disabled={busy === "location"} onClick={useMyLocation} style={{ ...quietButton, marginTop: 8 }}>
              {busy === "location" ? "FINDING YOU…" : settings.lat != null ? "📍 UPDATE TO WHERE I AM NOW" : "📍 USE MY LOCATION"}
            </button>
          </Section>

          <Section title="ALSO TELL ME">
            <Toggle
              on={settings.activity}
              onChange={(v) => save({ activity: v })}
              title="Linkup activity"
              sub="People joining or asking to join yours, your requests being accepted, linkup chats, photographer confirmations."
            />
            <Toggle
              on={settings.reminders}
              onChange={(v) => save({ reminders: v })}
              title="Meet-day reminders"
              sub="The morning of a meet you said you're going to."
            />
          </Section>
        </>
      )}
    </Sheet>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18, background: "#121212", border: "1px solid #222", borderRadius: 12, padding: "14px 14px 16px" }}>
      <div style={label}>{title}</div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, title, sub }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", marginTop: 8 }}>
      <input
        type="checkbox"
        checked={Boolean(on)}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "#FF4500", width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
      />
      <span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{title}</span>
        <span style={{ display: "block", ...muted, fontSize: 12 }}>{sub}</span>
      </span>
    </label>
  );
}

// iPhones only allow web alerts from apps on the Home Screen.
export function IphoneSteps() {
  return (
    <div style={muted}>
      On iPhone, alerts work once TUNR is on your Home Screen:
      <ol style={{ margin: "8px 0 0", paddingLeft: 20, color: "#CCC" }}>
        <li>
          Tap the Share button <span aria-hidden="true">⬆️</span> at the bottom of Safari.
        </li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open TUNR from the new icon and turn alerts on here.</li>
      </ol>
    </div>
  );
}
