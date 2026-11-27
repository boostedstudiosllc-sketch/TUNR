// The Help assistant, from the app (api/_routes/help.js). Messages stay on
// this screen; the server doesn't keep them.
import { supabase } from "./supabase.js";
import { errorReason } from "./errors.js";
import { helpError } from "./helpRules.js";

export async function askHelp(messages) {
  let token = null;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || null;
  }
  let res;
  try {
    res = await fetch("/api/help", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ messages: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })) }),
    });
  } catch (e) {
    throw new Error(`Couldn't reach TUNR Help. (${errorReason(e)})`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.answer) throw new Error(helpError(body.error || `http_${res.status}`, body));
  return { answer: body.answer, left: body.left };
}
