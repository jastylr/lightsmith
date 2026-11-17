import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  checkWorkspace,
  fixtureKey,
  generateSong,
  guessRig,
  matchProfiles,
  newSection,
  parseFixtureDef,
  parseWorkspace,
  parseXml,
  serializeWorkspace,
  serializeXml,
  type FixtureDef,
  type Song,
} from "../src/core/index";
import { BAR_QXF, MOVER_QXF, PAR_QXF, WORKSPACE_QXW } from "./fixtures";

const defs = () => {
  const m = new Map<string, FixtureDef>();
  for (const x of [PAR_QXF, BAR_QXF, MOVER_QXF]) {
    const d = parseFixtureDef(x);
    m.set(fixtureKey(d.manufacturer, d.model), d);
  }
  return m;
};

const song = (): Song => ({
  id: "t",
  title: "Test Song",
  bpm: 120,
  sections: [
    { ...newSection("intro", 120), effects: { rain: true, lightning: true, lightningDelaySec: 2 } },
    newSection("verse", 120),
    { ...newSection("chorus", 120), focus: "SR" },
    { ...newSection("solo", 140), movement: "figure8" },
  ],
});

test("xml round trip keeps content and escapes", () => {
  const doc = parseXml(WORKSPACE_QXW);
  const again = parseXml(serializeXml(doc));
  assert.equal(serializeXml(again), serializeXml(doc));
  assert.match(serializeXml(doc), /Test &amp; Co/);
  assert.equal(doc.doctype, "<!DOCTYPE Workspace>");
});

test("fixture profiles find dimmer, colour, pan/tilt and shutters", () => {
  const par = buildProfile(parseFixtureDef(PAR_QXF), "6ch");
  assert.equal(par.masterDimmer, 0);
  assert.deepEqual(par.heads, [{ red: 2, green: 3, blue: 4, white: 5 }]);
  assert.equal(par.shutters.length, 1);
  assert.equal(par.isMover, false);

  const bar = buildProfile(parseFixtureDef(BAR_QXF), "13ch");
  assert.equal(bar.heads.length, 4);
  assert.equal(bar.masterDimmer, 0);

  const mover = buildProfile(parseFixtureDef(MOVER_QXF), "8ch");
  assert.equal(mover.isMover, true);
  assert.deepEqual(mover.ptSpeed, { channel: 2, fastIsLow: true });
});

test("rig guess assigns roles", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles, missing } = matchProfiles(ws.fixtures, defs());
  assert.equal(missing.length, 0);
  const rig = guessRig(ws.fixtures, profiles);
  const role = (id: number) => rig.fixtures.find((f) => f.fixtureId === id)!.role;
  assert.equal(role(0), "backdrop");
  assert.equal(role(2), "side");
  assert.equal(role(4), "mover");
});

test("generate produces a clean, re-exportable workspace", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const summary = generateSong({ ws, profiles, rig, song: song() });
  assert.equal(summary.sections, 4);
  assert.ok(summary.functions > 10);

  const xml = serializeWorkspace(ws);
  const reread = parseWorkspace(xml);
  assert.deepEqual(checkWorkspace(reread, profiles), []);
  // The user's own function and button are untouched.
  assert.ok(reread.functions.some((f) => f.name === "My own scene" && f.id === 0));
  assert.match(xml, /Caption="Mine"/);
  // No generated scene writes the "No function" strobe value on the pars.
  assert.doesNotMatch(xml, /<FixtureVal ID="[23]">0,\d+,1,/);

  // Exporting again replaces the previous output instead of duplicating it.
  const before = reread.functions.length;
  const again = generateSong({ ws: reread, profiles, rig, song: song() });
  assert.equal(again.removedPrevious, summary.functions + 1);
  assert.equal(parseWorkspace(serializeWorkspace(reread)).functions.length, before);
});

test("missing definitions are reported, not guessed", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const only = new Map([...defs()].filter(([k]) => !k.includes("mover")));
  const { missing } = matchProfiles(ws.fixtures, only);
  assert.equal(missing.length, 2);
});
