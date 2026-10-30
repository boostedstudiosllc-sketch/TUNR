// Rooms for playing a friend: codes and who hosts (no network here, so
// it's testable).

// A shared room link (?play=<game>&room=CODE) waiting for its game to open:
// "<game>:<CODE>".
export const JOIN_KEY = "tunr.play.join";

// The room code waiting for this game, if any (and forget it).
export function takeSharedRoom(game, storage = globalThis.sessionStorage) {
  const v = storage?.getItem(JOIN_KEY) || "";
  const [g, code] = v.split(":");
  if (g !== game || !code) return null;
  storage.removeItem(JOIN_KEY);
  return code;
}
export const sharedGame = (storage = globalThis.sessionStorage) => (storage?.getItem(JOIN_KEY) || "").split(":")[0] || null;

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
export const cleanCode = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);

// The host of a room is the player with the lower id, so both phones agree
// without talking about it.
export const hostOf = (peers) => [...peers].map((p) => p.id).sort()[0];

// A Quick match room, from both players' ids: the same on both phones, and
// longer than a 4-letter code so the two never mix.
export const quickRoomCode = (a, b) =>
  ("Q" + [a, b].sort().map((id) => String(id).replace(/[^a-z0-9]/gi, "").slice(0, 8)).join("")).toUpperCase();
