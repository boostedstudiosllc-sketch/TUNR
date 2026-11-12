// Convoy voice chat: who connects to whom, who's talking, and what to say
// when the microphone or network won't play along. Pure, so it's tested in
// test/voice.test.js. The calls themselves: voice.js.

// Phones connect to each other directly (a mesh), which is great for a
// handful of cars and too much for a phone beyond about eight.
export const MAX_VOICE = 8;

// One side of each pair makes the offer: the lower id, so both agree.
export const shouldOffer = (myId, peerId) => String(myId) < String(peerId);

// Everyone in the voice channel (presence states), first come first in,
// at most MAX_VOICE. → { peers: the others I connect to, full: I'm past the limit }
export function voicePeers(states, myId, max = MAX_VOICE) {
  const byId = new Map();
  for (const s of states || []) if (s?.id && (!byId.has(s.id) || s.joinedAt < byId.get(s.id).joinedAt)) byId.set(s.id, s);
  const inOrder = [...byId.values()].sort((a, b) => a.joinedAt - b.joinedAt || String(a.id).localeCompare(String(b.id)));
  const allowed = inOrder.slice(0, max);
  const full = !allowed.some((s) => s.id === myId) && byId.has(myId);
  return { peers: full ? [] : allowed.filter((s) => s.id !== myId), full, count: Math.min(inOrder.length, max) };
}

// Talking or not, from the loudness of the last moment (0–1), smoothed, with
// a gap between the on and off levels so the icon doesn't flicker.
export function talkingNow(prev, rms) {
  const level = Math.max(rms, (prev?.level || 0) * 0.8);
  const talking = prev?.talking ? level > 0.02 : level > 0.045;
  return { level, talking };
}

// What went wrong getting the microphone, said plainly.
export function micError(e) {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "The microphone is blocked for TUNR. Allow it in your phone's settings (Safari or Chrome → Microphone), then join again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found on this device.";
  if (name === "NotReadableError") return "Another app is using the microphone (a call?). Close it and join again.";
  return `Couldn't turn on the microphone. (${e?.message || name || "unknown"})`;
}
