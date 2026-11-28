// The Song Builder's newer pieces: restyling a song's own parts, the "no arc"
// energy, and the moment markers on the song strip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCS, buildSong, momentMarks, newSection, planFromSong, planFromTemplate, type Section } from "../src/core";

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
