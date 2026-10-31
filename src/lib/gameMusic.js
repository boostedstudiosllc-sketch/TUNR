// The games' music: original upbeat tracks written as patterns and played
// live by RushAudio (rushAudio.js) with Web Audio synths, so there are no
// audio files and nothing to license. Pure data plus stepEvents(), which
// says what plays on each sixteenth note; tested in test/music.test.js.
//
// A song loops: a 2-bar intro (drums and bass), then A (8 bars with the
// lead tune) and B (8 bars with an arpeggio and chord stabs instead), A, B…
// Notes are semitones above the song's key note (MIDI). "." is a rest.

const pat = (s) => s.replace(/\s/g, "").split("").map((c) => c !== ".");
const line = (s) => s.trim().split(/\s+/).map((t) => (t === "." ? null : Number(t)));

export const SONGS = {
  // TUNR Rush: synthwave night drive.
  nightdrive: {
    name: "Night Drive",
    style: "Synthwave",
    bpm: 118,
    key: 45, // A
    chords: [[0, "m"], [-4, "M"], [3, "M"], [-2, "M"]], // Am F C G
    kick: pat("x...x...x...x..."),
    snare: pat("....x.......x..."),
    clap: pat("................"),
    hat: pat("..x...x...x...x."),
    shaker: pat("xxxxxxxxxxxxxxxx"),
    bass: { sound: "saw", line: line("0 . 0 . 0 . 12 . 0 . 0 . 0 . 12 0") },
    lead: {
      sound: "saw",
      bars: [
        line("12 . . 15 . . 14 . 12 . . 10 . . 7 ."),
        line("8 . . 12 . . 10 . 8 . . 7 . . . ."),
        line("7 . . 10 . . 12 . 15 . . 14 . . 12 ."),
        line("14 . . 12 . . 10 . 7 . . . 10 . . ."),
      ],
    },
    arp: [0, 7, 12, 7, 15, 12, 7, 12],
    stab: pat("................"),
  },

  // Drift King: eurobeat, fast and bright.
  eurobeat: {
    name: "Touge Rush",
    style: "Eurobeat",
    bpm: 152,
    key: 52, // E
    chords: [[-4, "M"], [-2, "M"], [0, "m"], [3, "M"]], // C D Em G
    kick: pat("x...x...x...x..."),
    snare: pat("....x.......x..."),
    clap: pat("....x.......x..."),
    hat: pat("..x...x...x...x."),
    shaker: pat(".x.x.x.x.x.x.x.x"),
    bass: { sound: "saw", line: line("0 . 12 . 0 . 12 . 0 . 12 . 0 . 12 .") },
    lead: {
      sound: "square",
      bars: [
        line("12 . 15 . 17 . 15 . 12 . 10 . 12 . . ."),
        line("14 . 17 . 19 . 17 . 14 . 12 . 14 . . ."),
        line("15 . 19 . 22 . 19 . 24 . 22 . 19 . 17 ."),
        line("19 . . . 17 . . . 15 . . . 14 . . ."),
      ],
    },
    arp: [0, 4, 7, 12, 7, 4],
    stab: pat("..x...x...x...x."),
  },

  // Drag Race: drift phonk, cowbell riff and a heavy 808.
  phonk: {
    name: "Redline",
    style: "Phonk",
    bpm: 135,
    key: 49, // C#
    chords: [[0, "m"], [0, "m"], [-4, "M"], [-5, "M"]], // C#m C#m A G#
    kick: pat("x.........x....."),
    snare: pat("........x......."),
    clap: pat("........x......."),
    hat: pat("x.x.x.x.x.x.xxxx"),
    shaker: pat("................"),
    bass: { sound: "808", line: line("0 . . . . . . . . . 0 . . . 12 .") },
    lead: {
      sound: "cowbell",
      bars: [
        line("12 . 12 15 . 12 . 19 . 17 . 15 . 12 . 10"),
        line("12 . 12 15 . 12 . 19 . 22 . 19 . 17 . 15"),
        line("8 . 8 12 . 8 . 15 . 13 . 12 . 8 . 7"),
        line("7 . 7 11 . 7 . 14 . 12 . 11 . 7 . 11"),
      ],
    },
    arp: [0, 7, 12, 15],
    stab: pat("................"),
  },

  // Turbo Ball: electro house for the stadium.
  turbo: {
    name: "Turbo Stadium",
    style: "Electro house",
    bpm: 126,
    key: 41, // F
    chords: [[0, "m"], [3, "M"], [-2, "M"], [-4, "M"]], // Fm Ab Eb Db
    kick: pat("x...x...x...x..."),
    snare: pat("................"),
    clap: pat("....x.......x..."),
    hat: pat("..x...x...x...x."),
    shaker: pat("xxxxxxxxxxxxxxxx"),
    bass: { sound: "square", line: line(". . 0 . . . 0 . . . 0 . . . 0 12") },
    lead: {
      sound: "saw",
      bars: [
        line("12 . . 12 . . 15 . . 12 . . 10 . 7 ."),
        line("12 . . 12 . . 15 . . 17 . . 15 . 12 ."),
        line("10 . . 10 . . 14 . . 10 . . 8 . 7 ."),
        line("8 . . 8 . . 12 . . 15 . . 17 . 19 ."),
      ],
    },
    arp: [0, 12, 7, 12, 3, 12, 7, 12],
    stab: pat("..x...x...x...x."),
  },

  // Boosted Karts, Car Stack, Egg Haul: bouncy funk-pop.
  cruise: {
    name: "Sunday Cruise",
    style: "Funk pop",
    bpm: 124,
    key: 50, // D
    chords: [[0, "M"], [-3, "m"], [5, "M"], [7, "M"]], // D Bm G A
    kick: pat("x.....x...x....."),
    snare: pat("....x.......x..."),
    clap: pat("....x.......x..x"),
    hat: pat("x.x.x.x.x.x.x.x."),
    shaker: pat("................"),
    bass: { sound: "square", line: line("0 . . 0 . . 12 . 0 . . 7 . 12 . 10") },
    lead: {
      sound: "square",
      bars: [
        line("16 . 14 . 12 . 14 . 16 . . . 19 . 16 ."),
        line("14 . 12 . 11 . 9 . 11 . . . 14 . . ."),
        line("12 . 11 . 9 . 7 . 9 . 11 . 12 . 14 ."),
        line("16 . . . 14 . . . 11 . . . 9 . . ."),
      ],
    },
    arp: [0, 4, 7, 11, 12, 11, 7, 4],
    stab: pat("..x...x...x...x."),
  },
};

export const SONG_ORDER = ["nightdrive", "eurobeat", "phonk", "turbo", "cruise"];

// Each game's own track.
export const GAME_SONG = {
  rush: "nightdrive",
  drift: "eurobeat",
  drag: "phonk",
  ball: "turbo",
  karts: "cruise",
  stack: "cruise",
  egg: "cruise",
  park: "cruise",
  guess: "turbo",
};

export const INTRO_BARS = 2;
export const SECTION_BARS = 8;

const TRIADS = { M: [0, 4, 7], m: [0, 3, 7] };

// Bends an arpeggio's third and seventh to the chord (major or minor).
function fitChord(semis, quality) {
  const pc = ((semis % 12) + 12) % 12;
  const shift = quality === "m" ? { 4: -1, 11: -1 } : { 3: 1, 10: 1 };
  return semis + (shift[pc] || 0);
}

// Seconds per sixteenth note.
export const stepSeconds = (song) => 60 / song.bpm / 4;

// "intro" | "A" | "B" for a bar of the song.
export function sectionOf(bar) {
  if (bar < INTRO_BARS) return "intro";
  return Math.floor((bar - INTRO_BARS) / SECTION_BARS) % 2 === 0 ? "A" : "B";
}

// Length (in steps) of a note starting at `i` in a 16-step line: until the
// next note, at most `max`.
function noteLength(arr, i, max = 4) {
  let n = 1;
  while (n < max && i + n < arr.length && arr[i + n] === null) n++;
  return n;
}

// What plays on sixteenth `n` of the song: [{ inst, midi?, notes?, steps, vel }].
// inst: kick, snare, clap, hat, ohat, shaker, bass, lead, arp, stab.
export function stepEvents(song, n) {
  const pos = n % 16;
  const bar = Math.floor(n / 16);
  const section = sectionOf(bar);
  const [rootOff, quality] = song.chords[bar % song.chords.length];
  const root = song.key + rootOff;
  const out = [];

  if (song.kick[pos]) out.push({ inst: "kick", steps: 1, vel: 1 });
  if (section !== "intro") {
    if (song.snare[pos]) out.push({ inst: "snare", steps: 1, vel: 1 });
    if (song.clap[pos]) out.push({ inst: "clap", steps: 1, vel: 0.8 });
  }
  if (song.hat[pos]) out.push({ inst: section === "B" ? "ohat" : "hat", steps: 1, vel: 0.7 });
  if (song.shaker[pos]) out.push({ inst: "shaker", steps: 1, vel: pos % 2 ? 0.5 : 0.3 });

  const b = song.bass.line[pos];
  if (b !== null) out.push({ inst: "bass", sound: song.bass.sound, midi: root - 12 + b, steps: noteLength(song.bass.line, pos, song.bass.sound === "808" ? 10 : 2), vel: 1 });

  if (section === "A") {
    const tune = song.lead.bars[bar % song.lead.bars.length];
    const m = tune[pos];
    if (m !== null) out.push({ inst: "lead", sound: song.lead.sound, midi: song.key + 12 + m, steps: noteLength(tune, pos), vel: 1 });
  }
  if (section === "B") {
    out.push({ inst: "arp", midi: root + 12 + fitChord(song.arp[n % song.arp.length], quality), steps: 1, vel: 0.8 });
    if (song.stab[pos]) out.push({ inst: "stab", notes: TRIADS[quality].map((t) => root + 12 + t), steps: 1, vel: 0.8 });
  }
  return out;
}
