// TUNR Rush sound, made live in the browser with Web Audio: no audio files,
// so there's nothing to license. Laid-back "elevator" lounge music (an
// original bossa loop), an engine that follows your speed, and the boost:
// turbo spool and whistle, exhaust pops and burbles, and a blow-off valve
// when it runs out.

const PREFS_KEY = "tunr.rush.sound";

export function loadSoundPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    return { music: saved?.music !== false, sfx: saved?.sfx !== false };
  } catch (e) {
    console.warn("Couldn't read sound settings:", e.message);
    return { music: true, sfx: true };
  }
}

function saveSoundPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn("Couldn't save sound settings:", e.message);
  }
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Eight bars of lounge changes: chord tones for the keys and a bass root.
const CHORDS = [
  { root: 36, notes: [60, 64, 67, 71] }, // Cmaj7
  { root: 45, notes: [60, 64, 67, 69] }, // Am7
  { root: 38, notes: [60, 62, 65, 69] }, // Dm7
  { root: 43, notes: [59, 62, 65, 67] }, // G7
  { root: 41, notes: [60, 64, 65, 69] }, // Fmaj7
  { root: 40, notes: [59, 62, 64, 67] }, // Em7
  { root: 38, notes: [60, 62, 65, 69] }, // Dm7
  { root: 43, notes: [59, 62, 65, 67] }, // G7
];
// Vibraphone melody, per bar in eighth notes: an index into the chord's
// tones (an octave up), or null to rest.
const MELODY = [
  [3, null, null, 2, null, 1, null, null],
  [null, null, 2, null, 3, null, null, null],
  [3, null, 2, null, 1, null, 0, null],
  [null, null, null, 1, null, 2, 3, null],
  [3, null, null, 2, null, 3, null, null],
  [null, 2, null, 1, null, null, 0, null],
  [1, null, 2, null, 3, null, 2, null],
  [null, null, 1, null, null, null, null, null],
];
const COMP = [0, 3, 6]; // where the keys hit in each bar (bossa push)
const EIGHTH = 60 / 96 / 2; // 96 beats a minute

export class RushAudio {
  constructor() {
    this.prefs = loadSoundPrefs();
    this.ctx = null;
    this.timer = 0;
    this.step = 0;
    this.engineOn = false;
    this.onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    };
  }

  // Call from a tap: phones only allow sound to start from one.
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = this.prefs.music ? 0.2 : 0;
      this.music.connect(comp);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.prefs.sfx ? 0.55 : 0;
      this.sfx.connect(comp);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  setMusic(on) {
    this.prefs = { ...this.prefs, music: on };
    saveSoundPrefs(this.prefs);
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1);
  }

  setSfx(on) {
    this.prefs = { ...this.prefs, sfx: on };
    saveSoundPrefs(this.prefs);
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  dispose() {
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }

  // ---------- music ----------

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (this.next < this.ctx.currentTime + 0.3) {
        this.playStep(this.step, this.next);
        this.step += 1;
        this.next += EIGHTH;
      }
    }, 60);
  }

  playStep(n, t) {
    const pos = n % 8;
    const bar = Math.floor(n / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    // Bass: root on 1, a push before 3, the fifth on 3.
    if (pos === 0) this.bass(hz(chord.root), t, EIGHTH * 2.6);
    if (pos === 3) this.bass(hz(chord.root), t, EIGHTH * 0.8);
    if (pos === 4) this.bass(hz(chord.root + 7), t, EIGHTH * 2.6);
    // Keys.
    if (COMP.includes(pos)) for (const m of chord.notes) this.keys(hz(m), t, EIGHTH * 1.6);
    // Vibes.
    const mel = MELODY[bar][pos];
    if (mel !== null) this.vibes(hz(chord.notes[mel] + 12), t);
    // Shaker on every eighth, a touch louder off the beat.
    this.tick(t, pos % 2 ? 0.05 : 0.025);
  }

  bass(f, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // A soft electric piano: a sine with a quieter octave on top.
  keys(f, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.02, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.music);
    for (const [mult, level] of [
      [1, 1],
      [2, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      const lvl = ctx.createGain();
      lvl.gain.value = level;
      o.connect(lvl).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // Vibraphone: a sine with a slow tremolo and a long ring.
  vibes(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    const trem = ctx.createOscillator();
    trem.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.05;
    trem.connect(depth).connect(g.gain);
    o.connect(g).connect(this.music);
    o.start(t);
    trem.start(t);
    o.stop(t + 1.5);
    trem.stop(t + 1.5);
  }

  tick(t, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5, 0.06);
  }

  // ---------- engine ----------

  startEngine() {
    if (!this.ctx || this.engineOn) return;
    const ctx = this.ctx;
    this.engineOn = true;
    this.eng = ctx.createOscillator();
    this.eng.type = "sawtooth";
    this.eng2 = ctx.createOscillator();
    this.eng2.type = "square";
    this.engLp = ctx.createBiquadFilter();
    this.engLp.type = "lowpass";
    this.engLp.frequency.value = 300;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    this.eng.connect(this.engLp);
    this.eng2.connect(g2).connect(this.engLp);
    this.engLp.connect(this.engGain).connect(this.sfx);
    // Turbo whistle, only heard while boosting.
    this.whistle = ctx.createOscillator();
    this.whistle.frequency.value = 3200;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain).connect(this.sfx);
    const t = ctx.currentTime;
    for (const o of [this.eng, this.eng2, this.whistle]) o.start(t);
    this.engGain.gain.setTargetAtTime(0.045, t, 0.3);
  }

  // Called every frame with the car's speed (m/s).
  engine(speed, boosting) {
    if (!this.engineOn) return;
    const t = this.ctx.currentTime;
    const f = 34 + speed * 0.62;
    this.eng.frequency.setTargetAtTime(f, t, 0.08);
    this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engLp.frequency.setTargetAtTime(boosting ? 1400 : 260 + speed * 4, t, 0.1);
    this.engGain.gain.setTargetAtTime(boosting ? 0.11 : 0.045, t, 0.1);
    this.whistle.frequency.setTargetAtTime(boosting ? 3600 + Math.random() * 120 : 2400, t, 0.15);
    this.whistleGain.gain.setTargetAtTime(boosting ? 0.035 : 0, t, boosting ? 0.25 : 0.05);
  }

  stopEngine() {
    if (!this.engineOn) return;
    this.engineOn = false;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.15);
    this.whistleGain.gain.setTargetAtTime(0, t, 0.05);
    for (const o of [this.eng, this.eng2, this.whistle]) o.stop(t + 0.8);
  }

  // ---------- effects ----------

  noiseBurst({ t, dur, type = "bandpass", freq, endFreq = freq, q = 1, level = 0.5, attack = 0.003 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  thump(t, from, to, dur, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Grabbing the Boosted badge: the turbo spools up with a whoosh and a
  // crackle of pops.
  boost() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(4200, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1.2);
    this.noiseBurst({ t, dur: 0.9, freq: 600, endFreq: 5000, q: 0.8, level: 0.35, attack: 0.4 });
    this.thump(t, 120, 45, 0.35, 0.5);
    for (let i = 0; i < 4; i++) this.pop(t + 0.12 + i * 0.07);
  }

  // One exhaust pop or burble; a few come in a crackle.
  pop(at) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const crackles = at === undefined ? 1 + Math.floor(Math.random() * 3) : 1;
    for (let i = 0; i < crackles; i++) {
      const s = t + i * (0.035 + Math.random() * 0.03);
      this.noiseBurst({ t: s, dur: 0.06 + Math.random() * 0.06, type: "lowpass", freq: 1800, endFreq: 300, level: 0.55 + Math.random() * 0.3 });
      this.thump(s, 90 + Math.random() * 40, 40, 0.09, 0.45);
    }
  }

  // Boost runs out: the blow-off valve's "pssshh" with a flutter.
  boostEnd() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 22;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    flutter.connect(depth).connect(g.gain);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, 0, 0.6);
    flutter.start(t);
    flutter.stop(t + 0.6);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst({ t, dur: 0.4, type: "lowpass", freq: 2500, endFreq: 200, level: 0.8 });
    this.thump(t, 80, 30, 0.4, 0.8);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [988, 1319].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.08 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
      o.connect(g).connect(this.sfx);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.35);
    });
  }
}
