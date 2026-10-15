// Reading a meet flyer with AI: the prompt, the output schema, and the
// clean-up of what comes back. Kept apart from the request handler so it can
// be tested without the network. (Vercel doesn't route files under api/_lib.)

export const VIBES = ["JDM", "Euro", "Exotic", "Domestic", "Truck"];

const nullableString = (description) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

export const FLYER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_meet",
    "title",
    "date",
    "weekday",
    "start_time",
    "end_time",
    "venue",
    "address",
    "city",
    "description",
    "vibe",
    "hosts",
    "check",
  ],
  properties: {
    is_meet: {
      type: "boolean",
      description: "True if this announces a car meet, cruise, show or similar event.",
    },
    title: nullableString("The event's name as the flyer gives it."),
    date: nullableString("YYYY-MM-DD of the (next) occurrence."),
    weekday: nullableString("The day of the week exactly as the flyer or caption states it, e.g. 'Saturday'; null if not stated."),
    start_time: nullableString("24-hour HH:MM."),
    end_time: nullableString("24-hour HH:MM."),
    venue: nullableString("The place's name, e.g. 'Home Depot' or 'Gas South Arena'."),
    address: nullableString("Street address as written, e.g. '1234 Peachtree St NE'."),
    city: nullableString("'City, ST', e.g. 'Duluth, GA'."),
    description: nullableString(
      "Two or three short sentences for the listing: what it is, who it's for, rules or costs the flyer states, and the end time or recurrence if any."
    ),
    vibe: {
      anyOf: [{ type: "string", enum: VIBES }, { type: "null" }],
      description: "Only if the flyer is clearly aimed at one scene; otherwise null.",
    },
    hosts: {
      type: "array",
      items: { type: "string" },
      description: "Instagram handles or crew names shown as hosts or organizers.",
    },
    check: {
      type: "array",
      items: { type: "string" },
      description:
        "Short notes for the host on anything guessed, unclear or missing, e.g. 'Year not on flyer — assumed 2026'.",
    },
  },
};

export const SYSTEM_PROMPT = `You read car meet flyers for TUNR, an app that lists car meets in Georgia, USA. The organizer has uploaded their flyer (and sometimes the Instagram caption that went with it) so the "post a meet" form can be filled in for them. They'll check the result before it goes live.

Report only what the flyer or caption says. Leave a field null rather than guess at a venue, address or time; a wrong address sends people to the wrong lot, while a blank one just gets filled in by the organizer. When you do have to infer something, such as the year or which date "this Saturday" means, fill it in and say so in "check".

Dates: the year is always the current year. A weekday with no date means the next one on or after the post date. For a recurring meet ("every Thursday"), give the next occurrence and mention the schedule in the description.

If the image isn't announcing an event (a car photo, a recap, a meme), set is_meet to false and leave the rest empty.`;

function easternToday(now) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function buildUserText({ caption, postedAt, now = new Date() }) {
  const posted = postedAt ? easternToday(new Date(postedAt)) : easternToday(now);
  const lines = [`Posted: ${posted} (Eastern time).`];
  if (caption && caption.trim()) {
    lines.push("", "Caption:", caption.trim());
  }
  return lines.join("\n");
}

const clip = (value, max) => {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};


const validTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;

// Whatever came back, the client gets the same shape with sane values.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// "Sat", "SATURDAY", "Saturdays" → 6; anything else → null.
function weekdayIndex(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.length < 3) return null;
  const i = WEEKDAYS.findIndex((d) => d.startsWith(v.slice(0, 3)));
  return i === -1 ? null : i;
}

export function normalizeFlyer(raw, now = new Date()) {
  const r = raw && typeof raw === "object" ? raw : {};
  const list = (value, max, len) =>
    (Array.isArray(value) ? value : [])
      .map((v) => clip(v, len))
      .filter(Boolean)
      .slice(0, max);
  const check = list(r.check, 6, 200);
  // Flyers rarely print the year, and the AI can guess the wrong one, so the
  // year is always the current one; only the month and day come from the
  // flyer.
  let date = null;
  const md = typeof r.date === "string" && /^\d{4}-(\d{2})-(\d{2})$/.exec(r.date);
  if (md) {
    const key = `${now.getUTCFullYear()}-${md[1]}-${md[2]}`;
    const d = new Date(`${key}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key) date = key;
  }

  // The flyer's own weekday is a check on the date it gave (or we inferred).
  const said = weekdayIndex(r.weekday);
  let dateConflict = false;
  if (date && said !== null) {
    const actual = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (actual !== said) {
      dateConflict = true;
      const pretty = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      check.unshift(
        `The flyer says ${WEEKDAYS[said][0].toUpperCase() + WEEKDAYS[said].slice(1)}, but the date read is ${pretty} — check which is right.`
      );
    }
  }

  return {
    isMeet: r.is_meet === true,
    title: clip(r.title, 80),
    date,
    dateConflict,
    startTime: validTime(r.start_time),
    endTime: validTime(r.end_time),
    venue: clip(r.venue, 100),
    address: clip(r.address, 140),
    city: clip(r.city, 60),
    description: clip(r.description, 600),
    vibe: VIBES.includes(r.vibe) ? r.vibe : null,
    hosts: list(r.hosts, 6, 40),
    check: check.slice(0, 6),
  };
}
