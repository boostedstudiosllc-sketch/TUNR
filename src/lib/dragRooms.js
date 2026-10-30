// Drag Race rooms: codes and who hosts (no network here, so it's testable).

// A room code from a shared link (?drag=CODE), waiting for Drag Race to open.
export const JOIN_KEY = "tunr.drag.join";

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
