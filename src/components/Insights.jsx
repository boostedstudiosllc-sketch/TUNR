import { useEffect, useMemo, useState } from "react";
import { loadAdminInsights } from "../lib/store.js";
import { loadLinkupStats } from "../lib/linkups.js";
import { toCsv } from "../lib/csv.js";
import GoingTicker from "./GoingTicker.jsx";

// Admin-only, top of the Profile tab: is TUNR growing, and which hosts are
// pulling people. The numbers come from views that return nothing to anyone
// but an admin, and RSVP history is kept permanently (rsvp_log), so the
// counts survive un-RSVPs, deleted accounts and deleted meets.

const ACCENT = "#FF4500";
const UP = "#10B981";
const DOWN = "#EF6A5A";

const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}K`;
  return v.toLocaleString("en-US");
};

const METRICS = [
  { id: "going", label: "Going", unit: "going" },
  { id: "views", label: "Views", unit: "views" },
  { id: "signups", label: "Sign-ups", unit: "sign-ups" },
  { id: "chat", label: "Chat", unit: "messages" },
];

const HOST_SORTS = [
  { id: "going_30d", label: "Going" },
  { id: "followers", label: "Followers" },
  { id: "views_30d", label: "Views" },
];

export default function Insights() {
  const [data, setData] = useState(undefined); // undefined = loading, null = unavailable
  const [metric, setMetric] = useState("going");
  const [hostSort, setHostSort] = useState("going_30d");
  const [allHosts, setAllHosts] = useState(false);
  const [error, setError] = useState("");
  const [linkups, setLinkups] = useState(null);

  useEffect(() => {
    loadAdminInsights()
      .then(setData)
      .catch((e) => {
        setError(e.message || String(e));
        setData(null);
      });
    loadLinkupStats()
      .then(setLinkups)
      .catch((e) => setError(e.message));
  }, []);

  const hosts = useMemo(() => {
    if (!data) return [];
    return [...data.hosts]
      .filter((h) => h.going_now || h.going_30d || h.followers || h.views_30d || h.upcoming)
      .sort((a, b) => b[hostSort] - a[hostSort] || b.going_all_time - a.going_all_time);
  }, [data, hostSort]);

  const meets = useMemo(() => {
    if (!data) return [];
    return [...data.meets]
      .filter((m) => m.going || m.maybe || m.views || m.chat)
      .sort((a, b) => b.going - a.going || b.maybe - a.maybe || b.views - a.views)
      .slice(0, 8);
  }, [data]);

  if (data === undefined) return <Card><Muted>Loading insights…</Muted></Card>;
  if (data === null) return error ? <Card><Muted>Insights didn't load: {error}</Muted></Card> : null;

  const o = data.overview;
  const daily = data.daily.slice(-30);
  const unit = METRICS.find((m) => m.id === metric).unit;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>📊 Insights</div>
        <div style={{ fontSize: 11, color: "#666", fontFamily: "'Barlow', sans-serif" }}>
          last 30 days · end users only
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Tile label="Accounts" value={o.accounts} sub={`+${compact(o.accounts_30d)} new`} now={o.accounts_30d} prev={o.accounts_prev_30d} />
        <Tile label="Active this week" value={o.active_7d} sub="opened the app" />
        <Tile label="Going RSVPs" value={o.going_30d} now={o.going_30d} prev={o.going_prev_30d} />
        <Tile label="Meet views" value={o.views_30d} now={o.views_30d} prev={o.views_prev_30d} />
        <Tile label="Chat messages" value={o.chat_30d} />
        <Tile label="Meets posted" value={o.meets_posted_30d} sub={`${compact(o.verified_hosts)} verified hosts`} />
      </div>

      {o.admin_going_30d + o.admin_views_30d + o.admin_chat_30d > 0 && (
        <Muted small>
          Not counted — admin activity (you): {compact(o.admin_going_30d)} going, {compact(o.admin_views_30d)}{" "}
          views, {compact(o.admin_chat_30d)} chat messages.
        </Muted>
      )}

      <div style={{ marginTop: 16 }}>
        <GoingTicker points={cumulative(data.daily)} label="GOING RSVPS · ALL MEETS" allWord="in 60 days" />
      </div>

      <div style={{ marginTop: 18 }}>
        <Chips options={METRICS} value={metric} onChange={setMetric} />
        <DailyBars days={daily} field={metric} unit={unit} />
      </div>

      <Section
        title="Hosts getting traction"
        right={<Chips options={HOST_SORTS} value={hostSort} onChange={setHostSort} small />}
      >
        {hosts.length === 0 ? (
          <Muted>No RSVPs, follows or views yet.</Muted>
        ) : (
          <>
            <Table
              head={["Host", "Going", "Fans", "Views", "Next"]}
              rows={(allHosts ? hosts : hosts.slice(0, 8)).map((h) => [
                <span key="h" style={{ fontWeight: 700, color: "#E6E6E6" }}>
                  @{h.host}
                  {h.verified && <span style={{ color: ACCENT }}> ✓</span>}
                </span>,
                <span key="g">
                  {compact(h.going_30d)} <Delta now={h.going_30d} prev={h.going_prev_30d} />
                </span>,
                <span key="f">
                  {compact(h.followers)}
                  {h.followers_30d > 0 && <span style={{ color: UP, fontSize: 10.5 }}> +{h.followers_30d}</span>}
                </span>,
                compact(h.views_30d),
                h.upcoming ? compact(h.upcoming) : "–",
              ])}
            />
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              {hosts.length > 8 && (
                <LinkButton onClick={() => setAllHosts((v) => !v)}>
                  {allHosts ? "Top 8 only" : `All ${hosts.length} hosts`}
                </LinkButton>
              )}
              <LinkButton onClick={() => downloadCsv("tunr-hosts.csv", data.hosts)}>Download hosts CSV</LinkButton>
            </div>
            <Muted small>
              Going = new "going" RSVPs in 30 days, with the change from the 30 before. Fans = followers. Next =
              upcoming meets.
            </Muted>
          </>
        )}
      </Section>

      {linkups && (
        <Section title="Linkups">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Tile label="Live or starting soon" value={linkups.live_now} sub="right now" />
            <Tile label="Posted" value={linkups.posted_7d} sub={`7 days · ${linkups.posted_30d} in 30`} />
            <Tile label="People joined" value={linkups.joins_30d} sub="30 days" />
            <Tile label="Biggest" value={linkups.biggest_30d} sub="people, 30 days" />
          </div>
        </Section>
      )}

      <Section title="Top meets now">
        {meets.length === 0 ? (
          <Muted>No RSVPs on upcoming meets yet.</Muted>
        ) : (
          <Table
            head={["Meet", "Going", "Maybe", "Chat", "Views"]}
            rows={meets.map((m) => [
              <span key="m">
                <span style={{ fontWeight: 700, color: "#E6E6E6" }}>{m.title}</span>
                <br />
                <span style={{ color: "#666", fontSize: 10.5 }}>
                  @{m.host}
                  {m.start_at ? ` · ${shortDate(m.start_at)}` : m.recurrence ? " · recurring" : ""}
                  {m.open_reports > 0 ? ` · 🚩${m.open_reports}` : ""}
                </span>
              </span>,
              compact(m.going),
              compact(m.maybe),
              compact(m.chat),
              compact(m.views),
            ])}
          />
        )}
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          <LinkButton onClick={() => downloadCsv("tunr-meets.csv", data.meets)}>Download meets CSV</LinkButton>
          <LinkButton onClick={() => downloadCsv("tunr-daily.csv", data.daily)}>Download daily CSV</LinkButton>
        </div>
      </Section>
    </Card>
  );
}

// ---------- pieces ----------

function Tile({ label, value, sub, now, prev }) {
  return (
    <div style={{ background: "#0C0C0C", border: "1px solid #1F1F1F", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#777", fontFamily: "'Barlow', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, color: "#F0F0F0", lineHeight: 1.1 }}>
        {compact(value)}
      </div>
      <div style={{ fontSize: 11, color: "#777", marginTop: 3, fontFamily: "'Barlow', sans-serif" }}>
        {now !== undefined && prev !== undefined ? (
          <>
            <Delta now={now} prev={prev} /> vs previous 30 days
          </>
        ) : (
          sub || " "
        )}
      </div>
    </div>
  );
}

// Signed change against the previous period; up is good for every metric here.
function Delta({ now, prev }) {
  const a = Number(now) || 0;
  const b = Number(prev) || 0;
  if (!a && !b) return <span style={{ color: "#555" }}>–</span>;
  if (!b) return <span style={{ color: UP, fontSize: 10.5, fontWeight: 700 }}>new</span>;
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return <span style={{ color: "#777", fontSize: 10.5 }}>±0%</span>;
  return (
    <span style={{ color: pct > 0 ? UP : DOWN, fontSize: 10.5, fontWeight: 700 }}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

// One series at a time, one bar per day; hover or tap a day for its number.
function DailyBars({ days, field, unit }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => Number(d[field]) || 0));
  const total = days.reduce((n, d) => n + (Number(d[field]) || 0), 0);
  const shown = hover !== null ? days[hover] : null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#999", minHeight: 18, fontFamily: "'Barlow', sans-serif" }}>
        {shown ? (
          <>
            <strong style={{ color: "#F0F0F0" }}>{compact(shown[field])}</strong> {unit} on {shortDate(shown.day, true)}
          </>
        ) : (
          <>
            <strong style={{ color: "#F0F0F0" }}>{compact(total)}</strong> {unit} in 30 days
          </>
        )}
      </div>
      <div
        role="img"
        aria-label={`${unit} per day, last 30 days`}
        onMouseLeave={() => setHover(null)}
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 84, marginTop: 6, borderBottom: "1px solid #2A2A2A" }}
      >
        {days.map((d, i) => {
          const v = Number(d[field]) || 0;
          return (
            <div
              key={d.day}
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
              title={`${shortDate(d.day, true)}: ${v} ${unit}`}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}
            >
              <div
                style={{
                  width: "100%",
                  height: v ? `${Math.max(4, (v / max) * 100)}%` : 0,
                  background: hover === null || hover === i ? ACCENT : "rgba(255,69,0,0.35)",
                  borderRadius: "4px 4px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginTop: 4 }}>
        <span>{days.length ? shortDate(days[0].day, true) : ""}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  color: "#666",
                  fontWeight: 600,
                  fontSize: 10.5,
                  letterSpacing: 0.4,
                  padding: "0 0 6px",
                  paddingLeft: i === 0 ? 0 : 8,
                  borderBottom: "1px solid #222",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? "left" : "right",
                    color: "#AAA",
                    padding: "7px 0",
                    paddingLeft: ci === 0 ? 0 : 8,
                    borderBottom: "1px solid #191919",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: ci === 0 ? "normal" : "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chips({ options, value, onChange, small }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          style={{
            padding: small ? "3px 9px" : "5px 11px",
            borderRadius: 14,
            fontSize: small ? 10.5 : 11.5,
            fontWeight: 700,
            cursor: "pointer",
            background: value === o.id ? "rgba(255,69,0,0.14)" : "#161616",
            color: value === o.id ? ACCENT : "#888",
            border: `1px solid ${value === o.id ? ACCENT : "#2A2A2A"}`,
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: 0.4,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Muted({ children, small }) {
  return (
    <div style={{ fontSize: small ? 10.5 : 12.5, color: "#666", marginTop: small ? 8 : 0, lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", padding: 0, color: "#888", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", fontFamily: "'Barlow', sans-serif" }}
    >
      {children}
    </button>
  );
}

function shortDate(value, dayOnly = false) {
  const d = dayOnly && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString("en-US", {
    timeZone: dayOnly ? "UTC" : "America/New_York",
    month: "short",
    day: "numeric",
  });
}

function downloadCsv(name, rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Running total of going RSVPs by day, as ticker points (end of each day).
function cumulative(daily) {
  let total = 0;
  return daily.map((d) => {
    total += Number(d.going) || 0;
    return { at: `${d.day}T23:59:00-05:00`, going: total };
  });
}
