import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  checkWorkspace,
  fixtureKey,
  generateSong,
  guessRig,
  matchProfiles,
  MOVEMENTS,
  newSection,
  newSong,
  normalizeSection,
  sectionsFromTemplate,
  parseFixtureDef,
  PATTERNS,
  parseWorkspace,
  parseXml,
  serializeWorkspace,
  serializeXml,
  type FixtureDef,
  type Section,
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

test("fixture profiles find dimmer, color, pan/tilt and shutters", () => {
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

test("patterns, color changes, custom colors and effects all export cleanly", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const sections = PATTERNS.map((p, i) => ({
    ...newSection("chorus", 120),
    name: p.label,
    pattern: p.id,
    colors: i % 2 ? ["#12ab34", "magenta", "amber"] : [],
    colorChange: (i % 3 === 0 ? "bar" : "hold") as Section["colorChange"],
    colorFade: i % 2 === 0,
    movement: MOVEMENTS[i % MOVEMENTS.length]!.id,
    moverSpread: (["together", "chase", "offset"] as const)[i % 3]!,
    effects: { rain: i % 2 === 0, sparkle: i % 3 === 0, blinder: i % 4 === 0, beatPulse: i % 5 === 0, strobe: i % 6 === 0, lightning: i === 1 },
  }));
  const s: Song = { id: "p", title: "Pattern test", bpm: 120, sections };
  generateSong({ ws, profiles, rig, song: s });
  const xml = serializeWorkspace(ws);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
  for (const p of PATTERNS) if (p.algorithm) assert.ok(xml.includes(`>${p.algorithm}</Algorithm>`), p.algorithm);
  assert.match(xml, /Color changes/);
  assert.match(xml, /<PropagationMode>Serial<\/PropagationMode>/);
  // The custom hex color reached a scene (0x12ab34 on a pixel bar head: 18,171,52).
  assert.match(xml, /,18,\d+,171,\d+,52/);
});

test("sections saved by older versions are filled in", () => {
  const old = { id: "x", type: "verse", name: "Verse", bpm: 100, bars: 8, beatsPerBar: 4, mood: "moody", energy: 2, colors: [], movement: "mood", focus: "all", effects: {}, transition: "fade", autoAdvance: false } as unknown as Section;
  const n = normalizeSection(old);
  assert.equal(n.pattern, "mood");
  assert.equal(n.colorChange, "mood");
  assert.equal(n.moverSpread, "together");
  assert.equal(n.bpm, 100);
});

test("new songs start empty, and templates number repeated sections", () => {
  assert.equal(newSong("x", 100).sections.length, 0);
  const s = sectionsFromTemplate("bridge", 100);
  assert.deepEqual(s.map((x) => x.name), ["Intro", "Verse 1", "Chorus 1", "Verse 2", "Chorus 2", "Bridge", "Chorus 3", "Outro"]);
  assert.ok(s.every((x) => x.bpm === 100));
  assert.equal(sectionsFromTemplate("nope", 100).length, 0);
});

test("effects go on the lights chosen for them", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s1 = { ...newSection("verse", 120), name: "Default", effects: { rain: true, blinder: true } };
  const s2 = { ...newSection("verse", 120), name: "Pars only", effects: { rain: true, blinder: true }, effectTargets: { rain: [2, 3], blinder: [2] } };
  generateSong({ ws, profiles, rig, song: { id: "t", title: "Targets", bpm: 120, sections: [s1, s2] } });
  const xml = serializeWorkspace(ws);
  const reread = parseWorkspace(xml);
  assert.deepEqual(checkWorkspace(reread, profiles), []);
  // Default rain uses the backdrop group; the second section gets a group of the two pars.
  assert.ok(reread.groups.some((g) => g.name === "Lightsmith Backdrop"));
  assert.ok(reread.groups.some((g) => g.name === "Lightsmith: RGBW Par 2 + RGBW Par 3"));
  // The second blinder only touches fixture 2.
  const blinders = xml.split('Name="Blinder flash"').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("</Function>")));
  assert.equal(blinders.length, 2);
  assert.ok(blinders.some((c) => c.includes('<FixtureVal ID="2">') && !c.includes('<FixtureVal ID="0">')));

  // Re-exporting without the pars-only rain removes its group again.
  generateSong({ ws: reread, profiles, rig, song: { id: "t", title: "Targets", bpm: 120, sections: [s1] } });
  assert.ok(!parseWorkspace(serializeWorkspace(reread)).groups.some((g) => g.name.startsWith("Lightsmith: ")));
});

test("extra palette colors are spread across the lights", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("verse", 120), colors: ["red", "blue", "#00ff00"], pattern: "solid", colorChange: "hold" as const };
  generateSong({ ws, profiles, rig, song: { id: "c", title: "Colors", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  // The third color (green, 0,255,0) reaches at least one scene.
  assert.match(xml, /,0,\d+,255,\d+,0[,<]/);
});
