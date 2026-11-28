// A song with a recording also gets a Show Manager timeline: the recording and
// every section at its place, so QLC+ can play the song along with the track.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWorkspace, childElements, fixtureKey, generateSet, generateSong, getAttr, guessRig, matchProfiles, newSection, parseFixtureDef, parseWorkspace, sectionMs, serializeWorkspace, type FixtureDef, type Song } from "../src/core/index";
import { BAR_QXF, MOVER_QXF, PAR_QXF, WORKSPACE_QXW } from "./fixtures";

const setup = () => {
  const defs = new Map<string, FixtureDef>();
  for (const x of [PAR_QXF, BAR_QXF, MOVER_QXF]) {
    const d = parseFixtureDef(x);
    defs.set(fixtureKey(d.manufacturer, d.model), d);
  }
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs);
  return { ws, profiles, rig: guessRig(ws.fixtures, profiles) };
};

const song = (offsetMs: number): Song => ({
  id: "r",
  title: "With Track",
  bpm: 120,
  sections: [newSection("intro", 120), newSection("verse", 120), newSection("chorus", 120)],
  audio: { key: "k", name: "with-track.mp3", durationMs: 200_000, offsetMs },
});

const showOf = (xml: string) => {
  const ws = parseWorkspace(xml);
  const fns = childElements(ws.engine, "Function");
  const show = fns.find((f) => getAttr(f, "Type") === "Show")!;
  const tracks = childElements(show, "Track").map((t) => ({
    name: getAttr(t, "Name"),
    items: childElements(t, "ShowFunction").map((x) => ({ id: Number(getAttr(x, "ID")), start: Number(getAttr(x, "StartTime")), duration: Number(getAttr(x, "Duration")) })),
  }));
  const audio = fns.find((f) => getAttr(f, "Type") === "Audio")!;
  return { ws, show, tracks, audio };
};

test("a count-in to skip: the recording starts at once and the lights wait for the song", () => {
  const { ws, profiles, rig } = setup();
  const s = song(4000);
  const r = generateSong({ ws, profiles, rig, song: s });
  assert.equal(r.recording, "with-track.mp3");
  const xml = serializeWorkspace(ws);
  const { tracks, audio } = showOf(xml);
  assert.equal(tracks[0]!.items[0]!.start, 0);
  assert.equal(tracks[0]!.items[0]!.id, Number(getAttr(audio, "ID")));
  const lights = tracks[1]!.items;
  assert.deepEqual(lights.map((x) => x.id), r.sectionIds);
  assert.equal(lights[0]!.start, 4000);
  assert.equal(lights[1]!.start, 4000 + sectionMs(s.sections[0]!));
  assert.equal(lights[2]!.duration, Math.round(sectionMs(s.sections[2]!)));
  // QLC+ finds a bare file name next to the show file.
  assert.match(xml, /<Source>with-track\.mp3<\/Source>/);
  // A button plays it, and the file still passes the checks.
  assert.match(xml, new RegExp(`Caption="▶ With recording"[^]*?<Function ID="${r.showId}"`));
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
});

test("a sample played live first: the lights start at once and the recording comes in later", () => {
  const { ws, profiles, rig } = setup();
  generateSong({ ws, profiles, rig, song: song(-13000) });
  const { tracks } = showOf(serializeWorkspace(ws));
  assert.equal(tracks[0]!.items[0]!.start, 13000);
  assert.equal(tracks[1]!.items[0]!.start, 0);
});

test("no recording, or turned off: no timeline", () => {
  const { ws, profiles, rig } = setup();
  const { audio: _a, ...plain } = song(0);
  assert.equal(generateSong({ ws, profiles, rig, song: plain }).showId, undefined);
  assert.equal(generateSong({ ws, profiles, rig, song: song(0), withRecording: false }).showId, undefined);
  assert.doesNotMatch(serializeWorkspace(ws), /Type="Show"|Type="Audio"/);
});

test("the whole set: a play button on each song's page, and the recordings listed", () => {
  const { ws, profiles, rig } = setup();
  const other: Song = { ...song(0), id: "o", title: "No Track", audio: undefined };
  const r = generateSet({ ws, profiles, rig, songs: [song(0), other] });
  assert.deepEqual(r.recordings, ["with-track.mp3"]);
  const xml = serializeWorkspace(ws);
  assert.equal((xml.match(/▶ With recording/g) ?? []).length, 1);
  // Exporting again replaces the timeline instead of adding a second one.
  const again = parseWorkspace(xml);
  generateSet({ ws: again, profiles, rig, songs: [song(0), other] });
  assert.equal((serializeWorkspace(again).match(/Type="Show"/g) ?? []).length, 1);
});
