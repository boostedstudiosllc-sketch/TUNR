// Confirm-later email, the server's half (see 041_email_confirmation.sql).
//
// The email itself is Supabase's magic-link email, sent through whatever
// email sender the Supabase project uses. Its template reads two values
// from the account: confirm_reminder (true for the day-3 reminder) and
// delete_on (the date shown in it), so they're set just before sending.
// Nothing is recorded as sent unless Supabase accepted it.

const DAY = 86400000;

// "2026-10-24" → "Saturday, October 24"
export function prettyDate(key) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// The removal date an email will promise: seven days after sign-up, or for
// the reminder at least three days from now. Never earlier than one already
// given.
export function plannedDeleteOn({ createdAt, stage, existing = null, now = new Date() }) {
  let ms = new Date(createdAt).getTime() + 7 * DAY;
  if (stage === "reminder") ms = Math.max(ms, now.getTime() + 3 * DAY);
  const key = dayKey(ms);
  return existing && existing > key ? existing : key;
}

export function createAccounts(service, { now = () => new Date() } = {}) {
  const { rest } = service;

  async function setTemplateValues(userId, values) {
    const user = await rest(`/auth/v1/admin/users/${userId}`);
    await rest(`/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ user_metadata: { ...(user?.user_metadata || {}), ...values } }),
    });
  }

  // Send one confirmation email. stage: "welcome", "reminder" or "resend".
  async function send({ userId, email, createdAt, stage, existingDeleteOn = null, reminderSent = false }) {
    const deleteOn = plannedDeleteOn({
      createdAt,
      stage: stage === "resend" ? (reminderSent ? "reminder" : "welcome") : stage,
      existing: existingDeleteOn,
      now: now(),
    });
    await setTemplateValues(userId, {
      confirm_reminder: stage === "reminder" || (stage === "resend" && reminderSent),
      delete_on: prettyDate(deleteOn),
    });
    await rest("/auth/v1/otp", {
      method: "POST",
      body: JSON.stringify({ email, create_user: false }),
    });
    const stored = await rest("/rest/v1/rpc/mark_confirmation_sent", {
      method: "POST",
      body: JSON.stringify({ p_user: userId, p_stage: stage, p_delete_on: deleteOn }),
    });
    return stored || deleteOn;
  }

  // The daily run: first emails that didn't go out, reminders, removals.
  async function runDaily() {
    const queue = (await rest("/rest/v1/rpc/confirmation_queue", { method: "POST", body: "{}" })) || [];
    const result = { welcome: 0, reminder: 0, deleted: 0, failed: [] };
    for (const row of queue) {
      try {
        if (row.stage === "delete") {
          await rest(`/auth/v1/admin/users/${row.user_id}`, { method: "DELETE" });
          result.deleted += 1;
        } else {
          await send({
            userId: row.user_id,
            email: row.email,
            createdAt: row.created_at,
            stage: row.stage,
            existingDeleteOn: row.delete_on,
          });
          result[row.stage] += 1;
        }
      } catch (e) {
        // Logged and retried tomorrow; one bad address doesn't stop the rest.
        result.failed.push(`${row.stage}: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    if (result.deleted) {
      await rest("/rest/v1/rpc/record_account_cleanup", {
        method: "POST",
        body: JSON.stringify({ p_deleted: result.deleted }),
      });
    }
    return result;
  }

  return { send, runDaily };
}
