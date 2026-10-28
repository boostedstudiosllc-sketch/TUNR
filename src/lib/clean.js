// Keeping chat clean: swear words and slurs become "***". The server does
// the same (086_clean_words.sql, same list) so nothing gets past it; this
// side does it first so the app can show a short warning.

// Keep in step with public.clean_words() in 086_clean_words.sql.
const BAD =
  /\b(?:(?:mother)?f+u+c+k+\w*|s+h+i+t+\w*|bullshit\w*|bitch\w*|ass(?:hole)?s?|asshole\w*|dumbass\w*|jackass\w*|dick(?:s|head\w*)?|cunt\w*|puss(?:y|ies)|cock(?:s|sucker\w*)?|bastards?|whores?|sluts?|fag(?:s|got\w*)?|nigg\w*|retard\w*|piss(?:ed|ing)?|twats?|wank\w*|pricks?)\b/gi;

export const LANGUAGE_WARNING = "⚠️ Watch the language: some words were swapped for ***.";

// { text, changed }
export function cleanText(text) {
  const out = String(text ?? "").replace(BAD, "***");
  return { text: out, changed: out !== String(text ?? "") };
}

// Trimmed, cleaned, or null if empty: for optional text fields.
export const cleanOrNull = (text) => cleanForSending(String(text ?? "").trim()) || null;

// Names (usernames, club and forum names) can't just be starred out:
// they're refused instead.
export function assertClean(text, what) {
  if (cleanText(text).changed) throw new Error(`Keep it clean: no swear words in ${what}.`);
}

// Clean a message about to be sent; if anything changed, the app shows the
// warning (App listens for tunr:notice).
export function cleanForSending(text) {
  const r = cleanText(text);
  if (r.changed && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tunr:notice", { detail: { message: LANGUAGE_WARNING } }));
  return r.text;
}
