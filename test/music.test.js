import { test } from "node:test";
import assert from "node:assert/strict";
import { SONGS, SONG_ORDER, GAME_SONG, stepEvents, sectionOf, stepSeconds, INTRO_BARS, SECTION_BARS } from "../src/lib/gameMusic.js";

const eventsInBar = (song, bar) => Array.from({ length: 16 }, (_, i) => stepEvents(song, bar * 16 + i)).flat();

test("every song is complete and upbeat", () => {
  assert.deepEqual([...SONG_ORDER].sort(), Object.keys(SONGS).sort());
  for (const [id, s] of Object.entries(SONGS)) {
    assert.ok(s.bpm >= 115 && s.bpm <= 160, `${id} tempo ${s.bpm}`);
    for (const k of ["kick", "snare", "clap", "hat", "shaker", "stab"]) assert.equal(s[k].length, 16, `${id}.${k}`);
    assert.equal(s.bass.line.length, 16, `${id} bass`);
    for (const bar of s.lead.bars) assert.equal(bar.length, 16, `${id} lead`);
    assert.ok(s.kick.some(Boolean), `${id} has a beat`);
    assert.ok(stepSeconds(s) > 0.09 && stepSeconds(s) < 0.14);
  }
});

test("each game has its own track", () => {
  for (const [game, id] of Object.entries(GAME_SONG)) assert.ok(SONGS[id], game);
  assert.equal(GAME_SONG.drift, "eurobeat");
  assert.equal(GAME_SONG.drag, "phonk");
});

test("intro, then the tune (A), then the arpeggio (B), looping", () => {
  assert.equal(sectionOf(0), "intro");
  assert.equal(sectionOf(INTRO_BARS), "A");
  assert.equal(sectionOf(INTRO_BARS + SECTION_BARS), "B");
  assert.equal(sectionOf(INTRO_BARS + 2 * SECTION_BARS), "A");
  for (const s of Object.values(SONGS)) {
    const intro = eventsInBar(s, 0);
    assert.ok(intro.some((e) => e.inst === "kick") && intro.some((e) => e.inst === "bass"));
    assert.ok(!intro.some((e) => e.inst === "lead" || e.inst === "arp"));
    assert.ok(eventsInBar(s, INTRO_BARS).some((e) => e.inst === "lead"));
    assert.ok(eventsInBar(s, INTRO_BARS + SECTION_BARS).some((e) => e.inst === "arp"));
  }
});

test("notes stay in a sensible range, lengths are positive", () => {
  for (const s of Object.values(SONGS))
    for (let n = 0; n < 16 * 40; n++)
      for (const e of stepEvents(s, n)) {
        assert.ok(e.steps >= 1);
        for (const m of e.notes || (e.midi != null ? [e.midi] : [])) assert.ok(m >= 24 && m <= 96, `${s.name} ${e.inst} ${m}`);
      }
});

test("the arpeggio follows minor chords (no major third over a minor chord)", () => {
  const s = SONGS.nightdrive; // bar 0 of each 4 is A minor
  const bar = INTRO_BARS + SECTION_BARS + 2; // a B-section bar on Am (bar % 4 === 0)
  assert.equal(bar % 4, 0);
  const root = s.key + s.chords[0][0];
  for (const e of eventsInBar(s, bar).filter((x) => x.inst === "arp")) assert.notEqual((e.midi - root) % 12, 4);
});
