// Several sets per project: a full show, a short support slot, each with its own songs and order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, newSong, normalizeProject, setlistsOf, setMs, setOrder, songMs, type Project, type Section } from "../src/core";

const section = (bars: number): Section => ({ ...({} as Section), id: `s${bars}`, name: "Verse", type: "verse", mood: "warm", energy: 3, colors: [], bars, bpm: 120, beatsPerBar: 4 }) as Section;
const song = (title: string, bars: number) => ({ ...newSong(title, 120), id: title, sections: [section(bars)] });
const songs = [song("A", 60), song("B", 90), song("C", 30)]; // 2:00, 3:00, 1:00 at 120 BPM

test("an older project's single set becomes the first named set", () => {
  const old = { version: 1, rig: { fixtures: [] }, songs, setlist: { order: ["C", "A"], skip: ["B"] } } as unknown as Project;
  const p = normalizeProject(old);
  assert.equal(p.setlist, undefined);
  assert.equal(p.setlists?.length, 1);
  assert.equal(p.setlists![0]!.name, "Full set");
  assert.deepEqual(setOrder(p).map((o) => [o.song.id, o.included]), [["C", true], ["A", true], ["B", false]]);
});

test("a project with no sets has one, with every song in it", () => {
  const p: Project = { version: 1, rig: { fixtures: [] }, songs };
  assert.equal(setlistsOf(p).sets.length, 1);
  assert.equal(setMs(p), 6 * 60_000);
});

test("each set keeps its own songs, and the current one is the one used", () => {
  const p: Project = {
    version: 1,
    rig: { fixtures: [] },
    songs,
    setlists: [
      { id: "full", name: "Full show", order: ["A", "B", "C"], skip: [] },
      { id: "short", name: "Support slot", order: ["C", "A"], skip: ["B"], minutes: 5 },
    ],
    currentSet: "short",
  };
  assert.equal(setlistsOf(p).current.name, "Support slot");
  assert.deepEqual(setOrder(p).filter((o) => o.included).map((o) => o.song.id), ["C", "A"]);
  assert.equal(setMs(p), 3 * 60_000);
  assert.equal(setMs(p, p.setlists![0]), 6 * 60_000);
  // A song made later joins every set, at the end.
  const later = { ...p, songs: [...songs, song("D", 2)] };
  assert.equal(setOrder(later).at(-1)!.song.id, "D");
  // A current set that's gone falls back to the first.
  assert.equal(normalizeProject({ ...p, currentSet: "gone" }).currentSet, undefined);
});

test("running times read the way people say them", () => {
  assert.equal(songMs(songs[0]!), 120_000);
  assert.equal(formatClock(197_000), "3:17");
  assert.equal(formatClock(59_400), "0:59");
  assert.equal(formatClock(3_725_000), "1:02:05");
});
