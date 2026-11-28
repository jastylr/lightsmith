// The Song Builder's newer pieces: restyling a song's own parts, the "no arc"
// energy, and the moment markers on the song strip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCS, buildSong, colorById, momentMarks, newSection, planFromSong, planFromTemplate, type Section } from "../src/core";

test("restyling keeps the song's parts, lengths and tempo changes, and folds a final blackout into the ending moment", () => {
  const solo = { ...newSection("solo", 150), name: "Big Solo", bars: 12 };
  const song: Section[] = [{ ...newSection("intro", 120), bars: 4 }, newSection("verse", 120), solo, { ...newSection("blackout", 120), bars: 1 }];
  const { sections, endsInBlackout } = planFromSong(song, 120);
  assert.ok(endsInBlackout);
  assert.deepEqual(sections.map((s) => [s.type, s.name, s.bars, s.bpm]), [
    ["intro", song[0]!.name, 4, undefined],
    ["verse", song[1]!.name, song[1]!.bars, undefined],
    ["solo", "Big Solo", 12, 150],
  ]);
  const built = buildSong({ bpm: 120, beatsPerBar: 4, sections, vibe: "rock", arc: "punch", moments: ["ending"] }, { hasMovers: true });
  assert.equal(built.length, 4);
  assert.equal(built[2]!.bpm, 150);
  assert.equal(built[2]!.name, "Big Solo");
});

test("letting the sections decide gives each kind its usual energy", () => {
  const natural = ARCS.find((a) => a.id === "natural")!;
  const plan = planFromTemplate("short");
  assert.deepEqual(natural.energies(plan), plan.map((p) => newSection(p.type, 120).energy));
});

test("moment markers land on the parts each moment changed", () => {
  const built = buildSong({ bpm: 120, beatsPerBar: 4, sections: planFromTemplate("short"), vibe: "rock", arc: "punch", moments: ["ending", "cutChorus", "blinder", "strobePeak"] }, { hasMovers: false });
  const marks = momentMarks(built);
  const ids = (i: number) => marks[i]!.map((m) => m.id);
  assert.deepEqual(ids(built.length - 1), ["ending"]);
  const choruses = built.map((s, i) => (s.type === "chorus" ? i : -1)).filter((i) => i >= 0);
  assert.ok(choruses.every((i) => ids(i).includes("cutChorus")));
  assert.ok(ids(choruses[0]!).includes("blinder"));
  assert.equal(marks.flat().filter((m) => m.id === "strobePeak").length, 1);
});

test("the new arcs stay within 1 to 5 and shape the song as described", () => {
  const plan = planFromTemplate("bridge");
  for (const id of ["quietLoud", "twoPeaks"]) {
    const e = ARCS.find((a) => a.id === id)!.energies(plan);
    assert.equal(e.length, plan.length);
    assert.ok(e.every((v) => v >= 1 && v <= 5), id);
  }
  const ql = ARCS.find((a) => a.id === "quietLoud")!.energies(plan);
  plan.forEach((p, i) => p.type === "chorus" && assert.equal(ql[i], 5));
});

test("band colors: every look leans to the band's colors, whites stay white", () => {
  const sections = planFromTemplate("short");
  const built = buildSong({ bpm: 120, beatsPerBar: 4, sections, vibe: "rock", genre: "rock", arc: "punch", moments: ["blinder"], bandColors: ["violet", "cyan"] }, { hasMovers: true });
  for (const s of built.filter((x) => x.type !== "blackout")) {
    assert.ok(s.colors.length > 0);
    // Anything that isn't a band color is a white or near-white (low saturation).
    for (const c of s.colors.filter((x) => x !== "violet" && x !== "cyan")) {
      const [r, g, b] = colorById(c).rgb;
      assert.ok((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, r, g, b) < 0.3, `${s.name}: ${c}`);
    }
    assert.ok(s.colors.some((c) => c === "violet" || c === "cyan"), s.name);
  }
});

test("shuffling gives another take, the same for every section of a kind", () => {
  const sections = planFromTemplate("short");
  const plan = { bpm: 120, beatsPerBar: 4, sections, vibe: "rock", genre: "rock", arc: "punch", moments: [] };
  const a = buildSong(plan, { hasMovers: true });
  const b = buildSong({ ...plan, shuffle: 1 }, { hasMovers: true });
  assert.notDeepEqual(a.map((s) => [s.mood, s.colors, s.pattern]), b.map((s) => [s.mood, s.colors, s.pattern]));
  const choruses = b.filter((s) => s.type === "chorus");
  assert.ok(choruses.every((c) => JSON.stringify([c.colors, c.pattern]) === JSON.stringify([choruses[0]!.colors, choruses[0]!.pattern])));
  // The vibe route shuffles too.
  const v = buildSong({ ...plan, genre: undefined, shuffle: 2 }, { hasMovers: true });
  assert.notDeepEqual(v.map((s) => s.pattern), buildSong({ ...plan, genre: undefined }, { hasMovers: true }).map((s) => s.pattern));
});

test("the new moments change the parts they say", () => {
  const sections = planFromTemplate("solo");
  const built = buildSong({ bpm: 120, beatsPerBar: 4, sections, vibe: "rock", arc: "punch", moments: ["lightningIntro", "spotlightSolo", "buildLastChorus"] }, { hasMovers: true });
  assert.ok(built[0]!.type !== "intro" || built[0]!.effects.lightning);
  assert.ok(built.filter((s) => s.type === "solo").every((s) => s.focus === "C"));
  const last = built.map((s) => s.type).lastIndexOf("chorus");
  assert.equal(built[last - 1]!.colorChange, "beat");
  assert.ok(momentMarks(built)[last - 1]!.some((m) => m.id === "buildLastChorus"));
});
