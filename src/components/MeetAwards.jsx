import { useEffect, useState } from "react";
import { loadAwards, loadPresets, enterAwards, voteAward, closeAwards, saveAwards, loadMeetAwardRows } from "../lib/awards.js";
import { phaseLine, standings, winnersOf, carLabel } from "../lib/awardRules.js";
import { currentPosition } from "../lib/alerts.js";
import { loadVehicles } from "../lib/store.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const GOLD = "#FACC15";

// Fan-voted awards on a meet page (127_meet_awards.sql). Hosts set them up;
// at the meet, people tap I'M HERE (with the car they brought) and vote.
export default function MeetAwardsCard({ event, user, canEdit, onNeedAccount, onToast }) {
  const [view, setView] = useState(null);
  const [open, setOpen] = useState(null); // "vote" | "setup"
  const [error, setError] = useState("");
  const refresh = () =>
    loadAwards(event.id)
      .then(setView)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [event.id, user?.id]);

  if (!view || (view.phase === "none" && !canEdit)) return error && canEdit ? <div style={{ ...muted, color: "var(--a-f87171)" }}>{error}</div> : null;
  const has = view.phase !== "none";
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, border: `1px solid ${has ? GOLD : "var(--n-2a2a2a)"}`, background: has ? "rgba(250,204,21,0.07)" : "transparent" }}>
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 1.2, color: has ? GOLD : "var(--n-dddddd)" }}>🏆 FAN AWARDS{has ? ` · ${view.awards.length}` : ""}</div>
      <div style={{ ...muted, marginTop: 2 }}>{has ? phaseLine(view) : "Let the crowd vote: Best Build, Best Interior, your own awards…"}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {has && (
          <button onClick={() => setOpen("vote")} style={{ ...bigButton, marginTop: 0, flex: 2, background: GOLD, color: "var(--n-111111)" }}>
            {view.phase === "closed" ? "SEE THE WINNERS" : view.phase === "open" ? "VOTE" : "SEE THE AWARDS"}
          </button>
        )}
        {canEdit && view.phase !== "closed" && (
          <button onClick={() => setOpen("setup")} style={{ ...quietButton, marginTop: 0, flex: 1 }}>
            {has ? "EDIT" : "SET UP AWARDS"}
          </button>
        )}
      </div>
      {open === "vote" && <AwardsSheet event={event} user={user} view={view} onChange={refresh} onClose={() => setOpen(null)} onNeedAccount={onNeedAccount} onToast={onToast} />}
      {open === "setup" && <AwardsSetup event={event} onClose={() => (setOpen(null), refresh())} onToast={onToast} />}
    </div>
  );
}

function AwardsSheet({ event, user, view, onChange, onClose, onNeedAccount, onToast }) {
  const [cars, setCars] = useState([]);
  const [pick, setPick] = useState(view.my_vehicle || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.id) loadVehicles(user.id).then(setCars);
  }, [user?.id]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const here = async () => {
    if (!user) return onNeedAccount?.();
    run(async () => {
      let pos = null;
      if (!view.entered) pos = await currentPosition();
      await enterAwards(event.id, pos, pick || null);
      onToast?.(pick ? "You're in, and your car's in the running" : "You're in. Vote away!");
    });
  };

  const mine = new Set(cars.map((c) => c.id));
  const open = view.phase === "open";
  const showCounts = Boolean(view.awards[0]?.tally);

  return (
    <Sheet onClose={onClose} label="Fan awards" zIndex={300}>
      <div style={{ ...sheetTitle, color: GOLD }}>🏆 FAN AWARDS</div>
      <div style={{ ...muted, marginTop: 2 }}>{phaseLine(view)}</div>

      {open && view.can_join !== false && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "var(--n-131313)", border: "1px solid var(--n-222222)" }}>
          <div style={label}>{view.entered ? "YOUR CAR IN THE RUNNING" : "AT THE MEET? ENTER YOUR CAR (OPTIONAL)"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill active={!pick} onClick={() => setPick("")}>
              Just voting
            </Pill>
            {cars.map((c) => (
              <Pill key={c.id} active={pick === c.id} onClick={() => setPick(c.id)} color={GOLD}>
                {[c.year, c.make, c.model].filter(Boolean).join(" ")}
              </Pill>
            ))}
          </div>
          {user && !cars.length && <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>Add your car to your garage (Profile → Garage) to enter it.</div>}
          {(!view.entered || pick !== (view.my_vehicle || "")) && (
            <button disabled={busy} onClick={here} style={{ ...bigButton, marginTop: 10 }}>
              {busy ? "CHECKING…" : view.entered ? "SAVE" : "📍 I'M HERE"}
            </button>
          )}
          {!view.entered && <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>TUNR checks you're at the meet (location) once. Only people here can vote.</div>}
        </div>
      )}

      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}

      {open && view.entered && !view.cars.length && <div style={{ ...muted, marginTop: 12 }}>No cars entered yet. Tell people to tap I'M HERE and enter theirs.</div>}

      {view.awards.map((a) => {
        const rows = standings(a, view.cars);
        const won = winnersOf(a, view.cars);
        return (
          <div key={a.id} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {a.emoji} {a.name}
              {showCounts && <span style={{ ...muted, fontSize: 12.5, marginLeft: 6 }}>{a.votes} vote{a.votes === 1 ? "" : "s"}</span>}
            </div>
            {view.phase === "closed" && (
              <div style={{ ...muted, color: won.length ? GOLD : "var(--n-888888)", fontWeight: 800 }}>
                {won.length ? `🥇 ${won.map((c) => `${carLabel(c)} (@${c.username})`).join(" and ")}` : "No votes."}
              </div>
            )}
            {(open || showCounts) && rows.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginTop: 6 }}>
                {rows.map((c) => {
                  const chosen = a.my_vote === c.vehicle_id;
                  const own = mine.has(c.vehicle_id);
                  const can = open && view.entered && !own;
                  return (
                    <button
                      key={c.vehicle_id}
                      disabled={!can || busy}
                      aria-pressed={chosen}
                      aria-label={`Vote ${carLabel(c)} for ${a.name}`}
                      onClick={() => run(() => voteAward(a.id, c.vehicle_id))}
                      style={{ flex: "0 0 132px", textAlign: "left", padding: 0, borderRadius: 12, overflow: "hidden", border: `2px solid ${chosen || c.won ? GOLD : "var(--n-2a2a2a)"}`, background: "var(--n-131313)", color: "var(--n-f0f0f0)", cursor: can ? "pointer" : "default", opacity: own ? 0.6 : 1 }}
                    >
                      {c.photo_url ? (
                        <img src={c.photo_url} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div aria-hidden style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, background: "var(--n-1a1a1a)" }}>
                          🚗
                        </div>
                      )}
                      <span style={{ display: "block", padding: "6px 8px" }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{carLabel(c)}</span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--n-888888)" }}>
                          @{c.username}
                          {own ? " · you" : ""}
                          {showCounts ? ` · ${c.votes}` : ""}
                        </span>
                        {chosen && <span style={{ display: "block", fontSize: 11.5, fontWeight: 900, color: GOLD }}>✓ YOUR VOTE</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {view.host && open && (
        <button disabled={busy} onClick={() => window.confirm("Close voting now and announce the winners?") && run(() => closeAwards(event.id).then(() => onToast?.("🏆 Winners announced")))} style={{ ...quietButton, marginTop: 18 }}>
          CLOSE VOTING AND ANNOUNCE WINNERS
        </button>
      )}
      {view.host && <div style={{ ...muted, fontSize: 11.5, marginTop: 6 }}>Only hosts see the counts while voting is open. {view.voters} {view.voters === 1 ? "person" : "people"} checked in to vote.</div>}
    </Sheet>
  );
}

function AwardsSetup({ event, onClose, onToast }) {
  const [presets, setPresets] = useState([]);
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState({ emoji: "🏆", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([loadPresets(), loadMeetAwardRows(event.id)])
      .then(([p, r]) => (setPresets(p), setRows(r), setPicked(r.map((a) => ({ name: a.name, emoji: a.emoji, preset: a.preset })))))
      .catch((e) => (setRows([]), setError(e.message)));
  }, [event.id]);

  const on = (name) => picked.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const toggle = (p) => setPicked((all) => (on(p.name) ? all.filter((x) => x.name.toLowerCase() !== p.name.toLowerCase()) : [...all, { name: p.name, emoji: p.emoji, preset: p.id }]));
  const addCustom = () => {
    const name = custom.name.trim();
    if (name.length < 2) return setError("Give your award a name.");
    if (on(name)) return setError("That award's already on the list.");
    setPicked((all) => [...all, { name: name.slice(0, 40), emoji: custom.emoji || "🏆", preset: null }]);
    setCustom({ emoji: "🏆", name: "" });
    setError("");
  };
  const save = async () => {
    if (picked.length > 15) return setError("Up to 15 awards a meet.");
    setBusy(true);
    setError("");
    try {
      await saveAwards(event.id, rows || [], picked);
      onToast?.(picked.length ? `🏆 ${picked.length} award${picked.length === 1 ? "" : "s"} set` : "Awards turned off");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="Set up awards" zIndex={300}>
      <div style={{ ...sheetTitle, color: GOLD }}>🏆 SET UP FAN AWARDS</div>
      <div style={{ ...muted, marginTop: 2 }}>Pick the awards for {event.title}. At the meet, people tap I'M HERE, enter their car and vote. Voting opens 15 minutes before the start and closes an hour after the end (or when you close it); winners get an alert.</div>
      <div style={{ ...label, marginTop: 14 }}>PICK FROM THE LIST</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {presets.map((p) => (
          <Pill key={p.id} active={on(p.name)} onClick={() => toggle(p)} color={GOLD}>
            {p.emoji} {p.name}
          </Pill>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>OR ADD YOUR OWN</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...field, width: 56, textAlign: "center" }} value={custom.emoji} maxLength={4} onChange={(e) => setCustom((c) => ({ ...c, emoji: e.target.value }))} aria-label="Emoji" />
        <input style={{ ...field, flex: 1 }} placeholder="e.g. Best Rotary" value={custom.name} maxLength={40} onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))} aria-label="Award name" onKeyDown={(e) => e.key === "Enter" && addCustom()} />
        <button onClick={addCustom} style={{ ...quietButton, marginTop: 0, width: 70 }}>
          ADD
        </button>
      </div>
      {picked.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 14 }}>THIS MEET'S AWARDS ({picked.length})</div>
          {picked.map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>
                {p.emoji} {p.name}
              </span>
              <button onClick={() => toggle(p)} aria-label={`Remove ${p.name}`} style={{ background: "none", border: "none", color: "var(--a-f87171)", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                REMOVE
              </button>
            </div>
          ))}
        </>
      )}
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}
      <button disabled={busy || rows === null} onClick={save} style={{ ...bigButton, marginTop: 14, background: GOLD, color: "var(--n-111111)" }}>
        {busy ? "SAVING…" : "SAVE AWARDS"}
      </button>
      {rows?.length > 0 && <div style={{ ...muted, fontSize: 11.5, marginTop: 6 }}>Removing an award removes its votes.</div>}
    </Sheet>
  );
}

function Pill({ active, onClick, children, color = "#0080F0" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{ padding: "7px 11px", borderRadius: 999, border: `1.5px solid ${active ? color : "var(--n-2a2a2a)"}`, background: active ? `${color}22` : "transparent", color: active ? "var(--n-f0f0f0)" : "var(--n-aaaaaa)", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      {children}
    </button>
  );
}
