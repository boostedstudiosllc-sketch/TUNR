// TUNR Wrapped: the year's numbers (my_wrapped, 098) turned into story
// slides. Slides with nothing to say are left out, so a quiet year is a
// short story rather than a row of zeros.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

// When to offer it on its own: December, and January for last year.
export function wrappedYearToOffer(now = new Date()) {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear();
  if (m === 0) return now.getFullYear() - 1;
  return null;
}

export function wrappedSlides(w) {
  if (!w) return [];
  const year = w.year;
  const name = w.username ? `@${w.username}` : "You";
  const slides = [{ id: "intro", bg: ["#0B1E3F", "#0080F0"], kicker: "TUNR WRAPPED", big: String(year), raw: true, lines: [`${name}, here's your year in cars.`] }];

  if (!w.checkins) {
    slides.push({ id: "empty", bg: ["#1F2937", "#4B5563"], kicker: "YOUR METER IS AT ZERO", big: "0", unit: "meets", lines: ["Check in at a meet and next year's Wrapped writes itself.", "Find one on Discover."] });
    if (w.car) slides.push(carSlide(w));
    return slides;
  }

  slides.push({
    id: "meets",
    bg: ["#3B0764", "#A855F7"],
    kicker: "YOU PULLED UP TO",
    big: fmt(w.meets),
    unit: w.meets === 1 ? "meet" : "meets",
    lines: [
      w.checkins > w.meets ? `${plural(w.checkins, "check-in")} in all.` : null,
      w.stayed ? `You stayed to the end ${plural(w.stayed, "time")}.` : null,
      w.top_percent && w.top_percent <= 50 ? `That's the top ${w.top_percent}% of TUNR.` : null,
    ].filter(Boolean),
  });

  if (w.top_meet) {
    slides.push({
      id: "fave",
      bg: ["#7C2D12", "#F97316"],
      kicker: "YOUR SPOT",
      big: w.top_meet.title,
      text: true,
      lines: [
        w.top_meet.times > 1 ? `You hit it ${plural(w.top_meet.times, "time")}.` : null,
        w.first_meet ? `It started with ${w.first_meet.title} in ${monthOf(w.first_meet.at)}.` : null,
      ].filter(Boolean),
    });
  }

  const scene = [w.top_vibe && `Your scene: ${w.top_vibe}.`, w.cities > 1 ? `Meets in ${w.cities} cities, mostly ${w.top_city}.` : w.top_city ? `Home turf: ${w.top_city}.` : null, w.busiest_month && `Busiest month: ${w.busiest_month}.`].filter(Boolean);
  if (scene.length) slides.push({ id: "scene", bg: ["#064E3B", "#10B981"], kicker: "YOUR SCENE", big: w.top_vibe || w.top_city || "Atlanta", text: true, lines: scene });

  if (w.best_streak > 1) slides.push({ id: "streak", bg: ["#7F1D1D", "#EF4444"], kicker: "LONGEST STREAK", big: fmt(w.best_streak), unit: "weeks in a row", lines: ["Not one weekend off."] });

  if (w.points_earned > 0)
    slides.push({
      id: "points",
      bg: ["#713F12", "#EAB308"],
      kicker: "POINTS EARNED",
      big: `⭐ ${fmt(w.points_earned)}`,
      lines: [w.points_spent ? `You cashed in ${fmt(w.points_spent)} on rewards.` : "Saving them up. Rewards are in Perks."],
    });

  const made = [
    w.hosted && `Hosted ${plural(w.hosted, "meet")}`,
    w.photos && `Posted ${plural(w.photos, "photo")}`,
    w.photo_wins && `Won Photo of the week ${plural(w.photo_wins, "time")}`,
    w.linkups && `Started ${plural(w.linkups, "linkup")}`,
    w.comments && `Left ${plural(w.comments, "comment")}`,
    w.clubs && `Joined ${plural(w.clubs, "club")}`,
  ].filter(Boolean);
  if (made.length) slides.push({ id: "made", bg: ["#164E63", "#06B6D4"], kicker: "YOU ADDED TO THE SCENE", big: made[0], text: true, lines: made.slice(1) });

  if (w.rush_runs > 0)
    slides.push({ id: "rush", bg: ["#111827", "#0080F0"], kicker: "TUNR RUSH", big: fmt(w.rush_runs), unit: w.rush_runs === 1 ? "run" : "runs", lines: [w.rush_best ? `Best score: ${fmt(w.rush_best)}.` : "Still chasing that first clear."] });

  if (w.car) slides.push(carSlide(w));

  slides.push({ id: "share", bg: ["#0B1E3F", "#0080F0"], kicker: `TUNR WRAPPED ${year}`, share: true, big: "That's a wrap", text: true, lines: [] });
  return slides;
}

function carSlide(w) {
  const c = w.car;
  return { id: "car", bg: ["#18181B", "#52525B"], kicker: "YOUR RIDE", big: [c.year, c.make, c.model].filter(Boolean).join(" "), text: true, car: c, lines: ["Built different. Thanks for bringing it out."] };
}

function monthOf(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "the year" : d.toLocaleString("en-US", { month: "long", timeZone: "America/New_York" });
}

// The share card's headline numbers.
export function shareStats(w) {
  return [
    [fmt(w.meets), w.meets === 1 ? "MEET" : "MEETS"],
    [fmt(w.best_streak), "WEEK STREAK"],
    [fmt(w.points_earned), "POINTS"],
    [fmt(w.photos), w.photos === 1 ? "PHOTO" : "PHOTOS"],
  ];
}
