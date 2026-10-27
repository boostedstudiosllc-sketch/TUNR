import { useEffect, useRef, useState } from "react";
import {
  loadNotifications,
  markNotificationsRead,
  clearNotifications,
  subscribeToNotifications,
} from "../lib/alerts.js";
import Sheet, { sheetTitle, muted, quietButton } from "./Sheet.jsx";
import { playAlertSound } from "../lib/activity.js";

// The bell in the header: everything TUNR has told you, newest first.
// Tapping one opens what it's about.
export default function NotificationBell({ user, onOpenLink, onToast, onOpenSettings }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  // Unread alerts seen so far; null until the first load, so opening the
  // app doesn't play the sound for alerts that were already waiting.
  const seenUnread = useRef(null);

  function refresh() {
    loadNotifications()
      .then((rows) => {
        const unreadIds = rows.filter((n) => !n.read_at).map((n) => n.id);
        if (seenUnread.current && unreadIds.some((id) => !seenUnread.current.has(id))) playAlertSound();
        seenUnread.current = new Set(unreadIds);
        setItems(rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    seenUnread.current = null;
    if (!user) {
      setItems([]);
      return;
    }
    refresh();
    return subscribeToNotifications(user.id, refresh);
  }, [user?.id]);

  if (!user) return null;
  const unread = items.filter((n) => !n.read_at).length;

  function show() {
    setOpen(true);
    if (unread) {
      markNotificationsRead()
        .then(refresh)
        .catch((e) => onToast(e.message));
    }
  }

  return (
    <>
      <button
        onClick={show}
        aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "#161616",
          border: "1px solid #2A2A2A",
          color: "#DDD",
          fontSize: 17,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: 9,
              background: "#0080F0",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "17px",
              fontFamily: "'Barlow Condensed', sans-serif",
              boxSizing: "border-box",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} label="Alerts" zIndex={320} portal>
          <div style={sheetTitle}>ALERTS</div>
          {error && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{error}</div>}
          {items.length === 0 && !error ? (
            <div style={{ ...muted, marginTop: 10 }}>
              Nothing yet. Linkups near you, people joining yours, and meet-day reminders show up here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.link) return;
                    setOpen(false);
                    onOpenLink(n.link);
                  }}
                  style={{
                    textAlign: "left",
                    background: n.read_at ? "#121212" : "#001830",
                    border: `1px solid ${n.read_at ? "#1F1F1F" : "#003A75"}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#E6E6E6",
                    cursor: n.link ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{n.title}</span>
                    <span style={{ fontSize: 10.5, color: "#666", whiteSpace: "nowrap" }}>{ago(n.created_at)}</span>
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 12.5, color: "#999", marginTop: 3, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif" }}>
                      {n.body}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              style={{ ...quietButton, flex: 1 }}
            >
              ALERT SETTINGS
            </button>
            {items.length > 0 && (
              <button
                onClick={() =>
                  clearNotifications()
                    .then(refresh)
                    .catch((e) => onToast(e.message))
                }
                style={{ ...quietButton, flex: 1 }}
              >
                CLEAR ALL
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
