import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";

// Guess the Car (099): today's car for everyone, practice rounds, and the
// admin's photo list.

const GUESS_ERRORS = {
  not_signed_in: "Sign in to play today's car.",
  unconfirmed: "Confirm your email to play today's car.",
  no_car: "There's no car today yet.",
  already: "You've already guessed today's car.",
};

export async function loadTodaysCar() {
  if (!supabase) return { pool: 0 };
  const { data, error } = await supabase.rpc("car_guess_today");
  if (error) throw new Error(withReason("Couldn't load today's car.", error));
  return data || { pool: 0 };
}

// { correct, answer, credit, points }
export async function guessCar(choice, seconds) {
  if (!supabase) throw new Error("Guessing needs an account.");
  const { data, error } = await supabase.rpc("guess_car", { p_choice: choice, p_seconds: seconds });
  if (error) throw new Error(withReason("Couldn't send your guess.", error));
  if (data?.status !== "ok") throw new Error(GUESS_ERRORS[data?.status] || `Couldn't send your guess. (${data?.status || "no answer"})`);
  return data;
}

export async function loadPracticeCar(skip = []) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("car_guess_practice", { p_skip: skip });
  if (error) throw new Error(withReason("Couldn't load a practice car.", error));
  return data || null;
}

export async function loadMyGuesses() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_car_guesses");
  if (error) throw new Error(withReason("Couldn't load your Guess the Car record.", error));
  return data;
}

// ---------- admin ----------

export async function loadCarPuzzles() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("car_puzzles").select("id, photo_url, make, model, year, credit, source_url, active, created_at").order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load the Guess the Car photos.", error));
  return data || [];
}

export async function addCarPuzzle(row) {
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.from("car_puzzles").insert(row);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't add that car."));
}

export async function updateCarPuzzle(id, patch) {
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.from("car_puzzles").update(patch).eq("id", id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that car."));
}

export async function deleteCarPuzzle(id) {
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.from("car_puzzles").delete().eq("id", id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't remove that car."));
}
