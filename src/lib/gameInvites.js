import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { kickPush } from "./alerts.js";

// Inviting a TUNR friend into a game room from inside the app
// (107_game_invites.sql): they get an alert that opens the room.

const ERRORS = {
  not_signed_in: "Sign in to invite friends.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  self: "That's you.",
  not_found: "No TUNR account with that username.",
  blocked: "You can't invite this person.",
  already: "Already invited to this room.",
  rate_limit: "That's a lot of invites. Try again in a bit.",
};

export async function inviteToGame(userId, game, room) {
  if (!supabase) throw new Error("Invites need an internet connection to TUNR.");
  const { data, error } = await supabase.rpc("invite_to_game", { p_to: userId, p_game: game, p_room: room });
  if (error) throw new Error(withReason("Couldn't send the invite.", error));
  if (data?.status !== "ok") throw new Error(ERRORS[data?.status] || `Couldn't send the invite. (${data?.status || "no answer"})`);
  kickPush();
}

// People you follow and who follow you, mutual friends first: [{ id, name, mutual }].
export async function loadInviteFriends() {
  if (!supabase) return [];
  const lists = await Promise.all(
    ["following", "followers"].map(async (kind) => {
      const { data, error } = await supabase.rpc("my_connections", { p_kind: kind });
      if (error) throw new Error(withReason("Couldn't load your friends.", error));
      return data || [];
    })
  );
  const byId = new Map();
  for (const r of lists.flat()) if (r.username && !byId.has(r.user_id)) byId.set(r.user_id, { id: r.user_id, name: r.username, mutual: Boolean(r.mutual) });
  return [...byId.values()].sort((a, b) => b.mutual - a.mutual || a.name.localeCompare(b.name));
}

// @username → { id, name }
export async function findPlayer(username) {
  if (!supabase) throw new Error("Invites need an internet connection to TUNR.");
  const name = String(username || "").trim().replace(/^@/, "").toLowerCase();
  if (!name) throw new Error("Type a username.");
  const { data, error } = await supabase.from("profiles").select("id, username").eq("username", name).maybeSingle();
  if (error) throw new Error(withReason("Couldn't look up that username.", error));
  if (!data) throw new Error(`No TUNR account with the username @${name}.`);
  return { id: data.id, name: data.username };
}
