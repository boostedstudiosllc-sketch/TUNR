import { SONGS, SONG_ORDER, GAME_SONG, stepEvents, stepSeconds } from "./gameMusic.js";

// Game sound for every TUNR game, made live in the browser with Web Audio:
// no audio files, so there's nothing to license. Upbeat original music (the
// songs are in gameMusic.js; each game has its own, and "next track" moves
// through the rest), an engine that follows your speed, and the boost: turbo
// spool and whistle, exhaust pops and burbles, and a blow-off valve.

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
const SONG_KEY = "tunr.music.song."; // + game: the track picked for that game

export class RushAudio {
  // game: which game's track to play (GAME_SONG in gameMusic.js).
  constructor({ game = "rush" } = {}) {
    this.prefs = loadSoundPrefs();
    this.game = game;
    let saved = null;
    try {
      saved = localStorage.getItem(SONG_KEY + game);
    } catch (e) {
      console.warn("Couldn't read the music pick:", e.message);
    }
    this.songId = SONGS[saved] ? saved : GAME_SONG[game] || "nightdrive";
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
      this.setup(new Ctx());
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  // The mixer (music and effects buses into a compressor) on a context: the
  // phone's speakers, or an OfflineAudioContext to render a preview.
  setup(ctx) {
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

  // Closing the sound also switches off the engine and squeal, so a game
  // screen that stops them after this (on its way out) doesn't crash.
  dispose() {
    clearInterval(this.timer);
    this.timer = null;
    this.engineOn = false;
    this.squealOn = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }

  // ---------- music ----------

  get song() {
    return SONGS[this.songId];
  }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      const dt = stepSeconds(this.song);
      while (this.next < this.ctx.currentTime + 0.3) {
        this.playStep(this.step, this.next, dt);
        this.step += 1;
        this.next += dt;
      }
    }, 50);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Switches to the next song (from its intro), remembered for this game.
  // Returns its { name, style }.
  nextSong() {
    this.songId = SONG_ORDER[(SONG_ORDER.indexOf(this.songId) + 1) % SONG_ORDER.length];
    this.step = 0;
    try {
      localStorage.setItem(SONG_KEY + this.game, this.songId);
    } catch (e) {
      console.warn("Couldn't save the music pick:", e.message);
    }
    return { name: this.song.name, style: this.song.style };
  }

  playStep(n, t, dt) {
    for (const e of stepEvents(this.song, n)) {
      const dur = e.steps * dt;
      if (e.inst === "kick") this.kick(t);
      else if (e.inst === "snare") this.snare(t);
      else if (e.inst === "clap") this.clap(t);
      else if (e.inst === "hat") this.hat(t, 0.05, 0.12 * e.vel);
      else if (e.inst === "ohat") this.hat(t, 0.16, 0.1 * e.vel);
      else if (e.inst === "shaker") this.hat(t, 0.03, 0.05 * e.vel);
      else if (e.inst === "bass") this.bass(e.sound, hz(e.midi), t, dur);
      else if (e.inst === "lead") this.lead(e.sound, hz(e.midi), t, dur);
      else if (e.inst === "arp") this.pluck(hz(e.midi), t, dt * 0.9, 0.07);
      else if (e.inst === "stab") for (const m of e.notes) this.pluck(hz(m), t, dt * 1.6, 0.05, "sawtooth");
    }
  }

  kick(t) {
    this.thump(t, 150, 45, 0.28, 0.9, this.music);
  }

  snare(t) {
    this.noiseBurst({ t, dur: 0.16, type: "highpass", freq: 1800, level: 0.35, out: this.music });
    this.thump(t, 220, 160, 0.08, 0.25, this.music);
  }

  clap(t) {
    for (const d of [0, 0.012, 0.024]) this.noiseBurst({ t: t + d, dur: 0.09, type: "bandpass", freq: 1500, q: 1.5, level: 0.3, out: this.music });
  }

  hat(t, dur, level) {
    this.noiseBurst({ t, dur, type: "highpass", freq: 8000, level, attack: 0.001, out: this.music });
  }

  // saw / square: a filtered synth bass. 808: a deep sine with a slide down.
  bass(sound, f, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (sound === "808") {
      o.type = "sine";
      o.frequency.setValueAtTime(f * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.music);
    } else {
      o.type = sound === "square" ? "square" : "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp).connect(g).connect(this.music);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // The tune: two detuned saws or squares, or an 808-style cowbell (phonk).
  lead(sound, f, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (sound === "cowbell") {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * 2;
      bp.Q.value = 3;
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      bp.connect(g).connect(this.music);
      for (const mult of [2, 2.97]) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f * mult;
        o.connect(bp);
        o.start(t);
        o.stop(t + 0.32);
      }
      return;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = sound === "square" ? 3200 : 4200;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.setValueAtTime(0.09, t + Math.max(0.02, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
    lp.connect(g).connect(this.music);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = sound === "square" ? "square" : "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  // Short plucked synth note (arpeggios and chord stabs).
  pluck(f, t, dur, level, type = "square") {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
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

  noiseBurst({ t, dur, type = "bandpass", freq, endFreq = freq, q = 1, level = 0.5, attack = 0.003, out = this.sfx }) {
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
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  thump(t, from, to, dur, level, out = this.sfx) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
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

  // Tyre squeal while sliding (Drift King): filtered noise, louder with the slide.
  startSqueal() {
    if (!this.ctx || this.squealOn) return;
    this.squealOn = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.squealBp = this.ctx.createBiquadFilter();
    this.squealBp.type = "bandpass";
    this.squealBp.frequency.value = 1600;
    this.squealBp.Q.value = 7;
    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.value = 0;
    src.connect(this.squealBp).connect(this.squealGain).connect(this.sfx);
    src.start();
    this.squealSrc = src;
  }

  // amount: 0 (gripping) … 1 (full slide).
  squeal(amount) {
    if (!this.squealOn) return;
    const t = this.ctx.currentTime;
    this.squealGain.gain.setTargetAtTime(Math.max(0, amount) * 0.22, t, 0.05);
    this.squealBp.frequency.setTargetAtTime(1300 + amount * 900, t, 0.08);
  }

  stopSqueal() {
    if (!this.squealOn) return;
    this.squealOn = false;
    const t = this.ctx.currentTime;
    this.squealGain.gain.setTargetAtTime(0, t, 0.05);
    this.squealSrc.stop(t + 0.4);
  }

  // A short reversing beep (Park Up).
  beep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.setValueAtTime(0.05, t + 0.16);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
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
