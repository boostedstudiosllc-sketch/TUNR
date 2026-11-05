// The Daily Pit Stop's week row (PitStop.jsx), pure so it's tested in
// test/pitStop.test.js. The points and streak rules are in
// 117_daily_pit_stop.sql.

// Seven dots for this run of seven: which are done, which is today, and the
// bonus on the 7th. streak = days in a row so far (today included if done).
export function weekDots(streak, todayDone) {
  const s = Math.max(0, streak | 0);
  // The day number today is (or will be, once claimed).
  const today = todayDone ? s : s + 1;
  const start = Math.floor((today - 1) / 7) * 7; // days before this run of 7
  return Array.from({ length: 7 }, (_, i) => {
    const day = start + i + 1;
    return { day, done: day < today || (todayDone && day === today), today: day === today, bonus: day % 7 === 0 };
  });
}

// "3 more days to the bonus", "Bonus today!", or "".
export function bonusLine(streak, todayDone, bonus) {
  if (!bonus) return "";
  const today = todayDone ? streak : streak + 1;
  const left = (7 - (today % 7)) % 7;
  if (left === 0) return todayDone ? `Bonus earned: +${bonus} today` : `Bonus today: +${bonus} on top`;
  return `${left} more day${left === 1 ? "" : "s"} to the +${bonus} bonus`;
}
