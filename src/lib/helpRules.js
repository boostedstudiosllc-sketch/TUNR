// Help assistant wording, with no network (unit-tested in test/help.test.js).
import { errorReason } from "./errors.js";

const ERRORS = {
  not_configured: "TUNR Help isn't switched on yet. Email boostedstudiosllc@gmail.com and we'll answer.",
  too_long: "That's a long one. Keep a question under 500 characters.",
  bad_request: "Type a question first.",
  busy: "TUNR Help is busy right now. Try again in a few minutes, or use Settings → Contact us.",
};

export function helpError(code, body = {}) {
  if (code === "rate_limit") return `That's ${body.limit || "today's"} questions today, the daily limit. Try again tomorrow, or use Settings → Contact us.`;
  if (ERRORS[code]) return ERRORS[code];
  return `TUNR Help couldn't answer. (${errorReason(body.detail || code)})`;
}

export const HELP_NOTE = "Answers come from an AI and can be wrong. It can't see your account. For anything important, use Contact us.";
