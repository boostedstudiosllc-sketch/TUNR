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

// Detailing requests come from their own form, not the topic picker.
const OTHER_TOPICS = { detailing: "Boosted Detailing request" };

export const topicLabel = (kind, id) => (TOPICS[kind] || []).find((t) => t.id === id)?.label || OTHER_TOPICS[id] || id;

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

// Boosted Detailing requests (061_detailing_requests_and_shirt.sql).
// Boosted Detailing's tiers (prices before the 10% TUNR discount; SUVs and
// trucks a little more). The names are what the request sends.
export const DETAIL_TIERS = [
  {
    id: "Express Detail",
    name: "EXPRESS",
    price: 75,
    time: "About 1–1.5 hours",
    blurb: "A quick interior and exterior refresh.",
    includes: ["Foam hand wash and dry", "Wheels, tires and tire shine", "Windows inside and out", "Full interior vacuum (seats, carpets, mats)", "Dash, console and door panels wiped down"],
  },
  {
    id: "Deep Clean",
    name: "DEEP CLEAN",
    price: 125,
    time: "About 3 hours",
    blurb: "Interior and exterior, deep cleaned.",
    popular: true,
    includes: ["Everything in Express, plus:", "Carpets and mats shampooed", "Seats deep cleaned (fabric extraction, or leather cleaned and conditioned)", "Door jambs, vents and crevices detailed", "Iron decon wash and spray sealant (about 3 months of protection)", "Trim and plastics dressed"],
  },
  {
    id: "Showroom Detail",
    name: "SHOWROOM",
    price: 225,
    time: "About 5–6 hours",
    blurb: "Paint correction and protection. Show-ready.",
    includes: ["Everything in Deep Clean, plus:", "Clay bar decontamination", "One-step machine polish (takes out light swirls)", "Ceramic sealant (about 6–12 months of protection)", "Engine bay cleaned and dressed", "Headlight touch-up and odor treatment"],
  },
];
export const DETAIL_ADDONS = [
  ["Pet hair removal", 25],
  ["Engine bay", 30],
  ["Odor / ozone treatment", 35],
  ["Headlight restoration", 40],
];
export const DETAIL_SPONSORS = ["Chemical Guys", "Winter While Details", "Detail Guys"];
export const DETAIL_SERVICES = [...DETAIL_TIERS.map((t) => t.id), "Not sure yet"];

const DETAIL_COPY = {
  not_signed_in: "Sign in to send a request.",
  bad_service: "Pick what you need done.",
  need_car: "Add your car's year, make and model.",
  bad_phone: "That phone number doesn't look right, like (404) 555-0134. Or leave it empty.",
  bad_email: "That reply email doesn't look right, like name@gmail.com. Or leave it empty.",
  rate_limited: "That's 5 messages today, the limit. Try again tomorrow.",
};

export async function requestDetail({ service, car, when, area, phone, email, notes }) {
  if (!supabase) throw new Error("Sending a request needs an account.");
  const { data, error } = await supabase.rpc("request_detail", {
    p_service: service,
    p_car: car,
    p_when: when || null,
    p_area: area || null,
    p_phone: phone || null,
    p_reply_email: email || null,
    p_notes: notes || null,
    p_device: deviceLabel(),
  });
  if (error) throw new Error(withReason("Couldn't send your request.", error));
  if (data?.status !== "ok") throw new Error(DETAIL_COPY[data?.status] || `Couldn't send your request. (${data?.status})`);
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

export async function loadFeedbackInbox(status = "new", kind = null, topic = null) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("feedback_inbox", { p_status: status, p_kind: kind, p_topic: topic });
  if (error) throw new Error(withReason("Couldn't load the inbox.", error));
  return data || [];
}

// An empty reply closes it without answering.
export async function answerFeedback(id, reply) {
  if (!supabase) return;
  const { error } = await supabase.rpc("answer_feedback", { p_id: id, p_reply: reply });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send your reply."));
}
