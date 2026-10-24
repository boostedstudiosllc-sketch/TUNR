// Contact us and the suggestion box. Rules live in 051_feedback.sql.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { deviceLabel } from "./activity.js";

export const TOPICS = {
  contact: [
    { id: "account", label: "My account" },
    { id: "meet", label: "A meet or listing" },
    { id: "points", label: "Points or rewards" },
    { id: "bug", label: "Something's broken" },
    { id: "safety", label: "Safety concern" },
    { id: "business", label: "Business, partners, press" },
    { id: "other", label: "Something else" },
  ],
  suggestion: [
    { id: "feature", label: "A new feature" },
    { id: "improvement", label: "Make something better" },
    { id: "event_idea", label: "A meet or event idea" },
    { id: "other", label: "Something else" },
  ],
};

export const topicLabel = (kind, id) => (TOPICS[kind] || []).find((t) => t.id === id)?.label || id;

const SEND_COPY = {
  not_signed_in: "Sign in to send a message.",
  bad_kind: "Pick a topic.",
  too_short: "Add a little more detail (at least 5 characters).",
  bad_email: "That reply email doesn't look right, like name@gmail.com. Or leave it empty.",
  rate_limited: "That's 5 messages today, the limit. Try again tomorrow, or email us.",
};

export async function sendFeedback({ kind, topic, message, replyEmail }) {
  if (!supabase) throw new Error("Sending messages needs an account.");
  const { data, error } = await supabase.rpc("send_feedback", {
    p_kind: kind,
    p_topic: topic,
    p_message: message,
    p_reply_email: replyEmail || null,
    p_device: deviceLabel(),
  });
  if (error) throw new Error(withReason("Couldn't send your message.", error));
  if (data?.status !== "ok") throw new Error(SEND_COPY[data?.status] || `Couldn't send your message. (${data?.status})`);
}

export async function loadMyFeedback(userId, kind) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("feedback")
    .select("id, kind, topic, message, status, reply, created_at, answered_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(withReason("Couldn't load your messages.", error));
  return data || [];
}

export async function loadFeedbackInbox(status = "new", kind = null) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("feedback_inbox", { p_status: status, p_kind: kind });
  if (error) throw new Error(withReason("Couldn't load the inbox.", error));
  return data || [];
}

// An empty reply closes it without answering.
export async function answerFeedback(id, reply) {
  if (!supabase) return;
  const { error } = await supabase.rpc("answer_feedback", { p_id: id, p_reply: reply });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send your reply."));
}
