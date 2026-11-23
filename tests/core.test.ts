import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  checkWorkspace,
  fixtureKey,
  focusLights,
  generateSong,
  generateSet,
  formatDuration,
  parseDuration,
  efxTravel,
  moverTiming,
  bundleProject,
  readProjectFile,
  projectFileName,
  qlcInputChannel,
  triggerLabel,
  textOf,
  type ShowControl,
  type Trigger,
  SET_FRAME,
  PATH_ROOT,
  getAttr,
  childElements,
  firstChild,
  type XmlElement,
  guessRig,
  moverShapeAt,
  DEFAULT_HOME,
  defaultHome,
  isDefaultHome,
  UPRIGHT_TILT,
  colorRateOf,
  ratePeriodMs,
  lookOf,
  applyLook,
  jobPalette,
  jobColorAt,
  colorSteps,
  moverCycleBeats,
  chasersIn,
  importChaser,
  quickStart,
  QUICK_STARTS,
  toMs,
  sequenceMs,
  strobeRange,
  strobeOffValue,
  openGobo,
  prismRange,
  aimOf,
  mirroredAim,
  barsForSeconds,
  fixtureSize,
  isBar,
  mountOf,
  defaultPosition,
  matchProfiles,
  MOVEMENTS,
  MOODS,
  lightLevels,
  sitsOut,
  FOCUS_DIM,
  patternTargets,
  effectTargets,
  UndoHistory,
  colorById,
  colorLayoutOf,
  newSection,
  newSong,
  normalizeSection,
  sectionsFromTemplate,
  sectionBeats,
  sectionMs,
  lengthLabel,
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
    { ...newSection("intro", 120), effects: { sparkle: true, lightning: true, lightningDelaySec: 2 } },
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
    effects: { sparkle: i % 3 === 0 || i % 2 === 0, blinder: i % 4 === 0, beatPulse: i % 5 === 0, strobe: i % 6 === 0, lightning: i === 1 },
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
  // A new section is a plain wash until a pattern is picked.
  assert.equal(newSection("intro", 100).pattern, "solid");
  const s = sectionsFromTemplate("bridge", 100);
  assert.deepEqual(s.map((x) => x.name), ["Intro", "Verse 1", "Chorus 1", "Verse 2", "Chorus 2", "Bridge", "Chorus 3", "Outro"]);
  assert.ok(s.every((x) => x.bpm === 100));
  assert.equal(sectionsFromTemplate("nope", 100).length, 0);
});

test("effects go on the lights chosen for them", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s1 = { ...newSection("verse", 120), name: "Default", effects: { sparkle: true, blinder: true } };
  const s2 = { ...newSection("verse", 120), name: "Pars only", effects: { sparkle: true, blinder: true }, effectTargets: { sparkle: [2, 3], blinder: [2] } };
  generateSong({ ws, profiles, rig, song: { id: "t", title: "Targets", bpm: 120, sections: [s1, s2] } });
  const xml = serializeWorkspace(ws);
  const reread = parseWorkspace(xml);
  assert.deepEqual(checkWorkspace(reread, profiles), []);
  // Default sparkle uses the backdrop group; the second section gets a group of the two pars.
  assert.ok(reread.groups.some((g) => g.name === "Lightsmith Backdrop"));
  assert.ok(reread.groups.some((g) => g.name === "Lightsmith: RGBW Par 2 + RGBW Par 3"));
  // The second blinder only touches fixture 2.
  const blinders = xml.split('Name="Blinder flash"').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("</Function>")));
  assert.equal(blinders.length, 2);
  assert.ok(blinders.some((c) => c.includes('<FixtureVal ID="2">') && !c.includes('<FixtureVal ID="0">')));

  // Re-exporting without the pars-only sparkle removes its group again.
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

test("colors can be assigned per kind of light, and patterns and focus adapt to the rig", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  // Movers all use the third color (green).
  const s1 = { ...newSection("verse", 120), name: "Layout", colors: ["red", "blue", "#00ff00"], colorChange: "hold" as const, movement: "static", colorLayout: { mover: 2 } };
  // Pattern on the pars instead of the backdrop.
  const s2 = { ...newSection("verse", 120), name: "Pattern on pars", pattern: "waves", patternTargets: [2, 3] };
  generateSong({ ws, profiles, rig, song: { id: "l", title: "Layout", bpm: 120, sections: [s1, s2] } });
  const xml = serializeWorkspace(ws);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
  const movers = xml.split('Name="Movers color"')[1]!.split("</Function>")[0]!;
  // Mover channels 5-7 are R,G,B: green on both movers.
  assert.equal((movers.match(/5,0,6,255,7,0/g) ?? []).length, 2);
  assert.ok(parseWorkspace(xml).groups.some((g) => g.name === "Lightsmith: RGBW Par 2 + RGBW Par 3"));

  // Focus falls back to moving heads when no side or front lights are on that side.
  const noSides = { fixtures: rig.fixtures.map((f) => (f.role === "side" ? { ...f, role: "ignore" as const } : f)) };
  const moverSide = noSides.fixtures.find((f) => f.role === "mover")!.side;
  assert.deepEqual(focusLights(noSides, moverSide), noSides.fixtures.filter((f) => f.role === "mover" && f.side === moverSide).map((f) => f.fixtureId));
});

test("the section buttons land where they can be seen, and stay where the user puts them", () => {
  // A page mostly filled by one big console frame, like many real shows.
  const big = WORKSPACE_QXW.replace(
    '<Button Caption="Mine" ID="1">',
    '<SoloFrame Caption="Console" ID="5"><WindowState Visible="True" X="15" Y="15" Width="1140" Height="843"/></SoloFrame><Button Caption="Mine" ID="1">',
  ).replace('X="15" Y="15" Width="93" Height="93"', 'X="1170" Y="15" Width="93" Height="93"');
  const ws = parseWorkspace(big);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const first = generateSong({ ws, profiles, rig, song: song() });
  assert.match(first.buttonsWhere, /inside the frame “Console”/);
  const xml = serializeWorkspace(ws);
  const frame = xml.slice(xml.indexOf('<SoloFrame Caption="Console"'));
  assert.ok(frame.indexOf(first.buttonsFrame) > 0 && frame.indexOf(first.buttonsFrame) < frame.indexOf("</SoloFrame>"));
  const y = (x: string) => Number(/Caption="[^"]*\(Lightsmith\)" ID="\d+">\s*<WindowState Visible="True" X="\d+" Y="(\d+)"/.exec(x)![1]);
  assert.ok(y(xml) + 136 <= 720, "frame is near the top of the page");

  // Move it in "QLC+", export again: it stays put.
  const moved = xml.replace(/(Caption="[^"]*\(Lightsmith\)" ID="\d+">\s*<WindowState Visible="True" X=")\d+(" Y=")\d+/, "$1300$2200");
  const ws2 = parseWorkspace(moved);
  generateSong({ ws: ws2, profiles, rig, song: song() });
  assert.equal(y(serializeWorkspace(ws2)), 200);

  // On a roomy page it goes in the top-left corner.
  const plain = parseWorkspace(WORKSPACE_QXW);
  const s3 = generateSong({ ws: plain, profiles, rig, song: song() });
  assert.match(s3.buttonsWhere, /^on the first Virtual Console page/);
});

test("old Rain effects become the Drizzle pattern, and matrix effects blend on top", () => {
  const old = normalizeSection({ ...newSection("verse", 120), pattern: "solid", effects: { rain: true } as never, effectTargets: { rain: [2, 3] } as never });
  assert.equal(old.pattern, "drizzle");
  assert.deepEqual(old.patternTargets, [2, 3]);
  assert.ok(!("rain" in old.effects));
  // A section that already had a pattern keeps it.
  const kept = normalizeSection({ ...newSection("verse", 120), pattern: "waves", effects: { rain: true } as never });
  assert.equal(kept.pattern, "waves");

  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("verse", 120), pattern: "drizzle", effects: { sparkle: true } };
  generateSong({ ws, profiles, rig, song: { id: "d", title: "Drizzle", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  assert.match(xml, /Type="RGBMatrix" Name="Sparkle"[^>]*BlendMode="Additive"/);
  assert.match(xml, /<Algorithm Type="Script">Noise<\/Algorithm>/);
  assert.doesNotMatch(xml, /Name="Pattern[^"]*"[^>]*BlendMode/);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
});

test("sections can end part-way through a bar", () => {
  const s = { ...newSection("verse", 120), bars: 16 + 2 / 4 };
  assert.equal(sectionBeats(s), 66);
  assert.equal(lengthLabel(s), "16 bars + 2 beats");
  assert.equal(lengthLabel({ bars: 1, beatsPerBar: 4 }), "1 bar");
  assert.equal(sectionMs(s), 33000);
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  generateSong({ ws, profiles, rig, song: { id: "p", title: "Part bar", bpm: 120, sections: [{ ...s, autoAdvance: true }] } });
  assert.deepEqual(checkWorkspace(parseWorkspace(serializeWorkspace(ws)), profiles), []);
});

test("blackout sections turn every light off, with a cut or a fade to black", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const verse = { ...newSection("verse", 120), transition: "fade" as const };
  const fadeOut = { ...newSection("blackout", 120), transition: "fade" as const, autoAdvance: true };
  const chorus = newSection("chorus", 120);
  const cut = newSection("blackout", 120);
  assert.equal(fadeOut.name, "Blackout");
  generateSong({ ws, profiles, rig, song: { id: "b", title: "Dark", bpm: 120, sections: [verse, fadeOut, chorus, cut] } });
  const xml = serializeWorkspace(ws);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
  // The blackout's look is just the blank spacer.
  const blackout = xml.slice(xml.indexOf('Name="2. Blackout"'));
  assert.match(blackout.slice(0, blackout.indexOf("</Function>")), /<Step Number="0">\d+<\/Step>/);
  // The verse fades out over one bar (2 s at 120 BPM) into the fade-to-black;
  // the chorus cuts straight to black.
  const verseScenes = xml.split('Path="Lightsmith/Dark/1. Verse"').slice(1);
  assert.ok(verseScenes.some((c) => /FadeOut="2000"/.test(c.slice(0, 200))));
  const chorusScenes = xml.split('Path="Lightsmith/Dark/3. Chorus"').slice(1);
  assert.ok(chorusScenes.every((c) => !/FadeOut="[1-9]/.test(c.slice(0, 200))));
});

test("eerie moods put their accent color on the moving heads", () => {
  for (const id of ["twilight", "mist", "dread", "ember"]) {
    const m = MOODS.find((x) => x.id === id)!;
    assert.ok(m, id);
    for (const c of m.colors) assert.notEqual(colorById(c).label, colorById("nope").label, `${id}: unknown color ${c}`);
  }
  const s = { ...newSection("verse", 120), mood: "twilight" };
  assert.deepEqual(colorLayoutOf(s), { backdrop: 0, side: 0, mover: 1, front: "white" });
  // The section's own choice still wins.
  assert.equal(colorLayoutOf({ ...s, colorLayout: { mover: "mix" } }).mover, "mix");
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  generateSong({ ws, profiles, rig, song: { id: "e", title: "Eerie", bpm: 90, sections: ["twilight", "mist", "dread", "ember"].map((mood) => ({ ...newSection("verse", 90), mood })) } });
  assert.deepEqual(checkWorkspace(parseWorkspace(serializeWorkspace(ws)), profiles), []);
});

test("undo history merges bursts, limits its length and supports redo", () => {
  const h = new UndoHistory<number>(3, 1000);
  h.record(0, 0); // 0 -> 1
  h.record(1, 500); // 1 -> 2, within the burst: merged
  h.record(2, 3000); // 2 -> 3, a new step
  assert.equal(h.steps, 2);
  assert.equal(h.undo(3), 2);
  assert.equal(h.undo(2), 0);
  assert.equal(h.undo(0), undefined);
  assert.equal(h.redo(0), 2);
  assert.equal(h.redo(2), 3);
  assert.equal(h.canRedo, false);
  // A new change clears redo.
  h.undo(3);
  h.record(2, 10000);
  assert.equal(h.canRedo, false);
  // Only the last 3 steps are kept.
  for (let i = 0; i < 10; i++) h.record(i, 20000 + i * 5000);
  assert.equal(h.steps, 3);
});

test("a gesture is one undo step however long it takes", () => {
  const h = new UndoHistory<number>(50, 1000);
  h.record(0, 0); // an ordinary change just before
  h.begin();
  for (let i = 1; i <= 6; i++) h.record(i, 100 + i * 5000); // a slow drag
  h.end();
  h.record(7, 40000);
  assert.equal(h.steps, 3);
  assert.equal(h.undo(8), 7);
  assert.equal(h.undo(7), 1); // back to the start of the drag in one step
  assert.equal(h.undo(1), 0);
});

test("brightness can be set per kind of light, and a warm-white backdrop makes the pattern warm white", () => {
  const base = { ...newSection("verse", 120), mood: "dark", energy: 2 };
  const auto = lightLevels(base);
  assert.ok(auto.backdrop.auto && auto.backdrop.level < 0.5);
  const own = lightLevels({ ...base, brightness: { backdrop: 1 } });
  assert.deepEqual(own.backdrop, { level: 1, auto: false });
  assert.equal(own.side.auto, true);

  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...base, pattern: "rainfall", brightness: { backdrop: 1 }, colorLayout: { backdrop: "white" as const } };
  generateSong({ ws, profiles, rig, song: { id: "w", title: "White rain", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
  // The pattern's color is warm white lightened for rain, not indigo.
  const pattern = xml.slice(xml.indexOf('Name="Pattern: falling rain"'));
  const color = Number(/<Color Index="0">(\d+)<\/Color>/.exec(pattern)![1]);
  const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  assert.ok(r > 200 && g > 200 && b > 150, `rain color ${r},${g},${b}`);
});

test("first-guess positions never stack lights of the same job on top of each other", () => {
  for (const n of [2, 3, 4, 6, 8]) {
    const xs = Array.from({ length: n }, (_, i) => defaultPosition("side", i < n / 2 ? "SL" : "SR", i, n)!.x);
    assert.equal(new Set(xs.map((x) => x.toFixed(3))).size, n, `${n} lights`);
    // Stage left first: x runs from the right of the plan to the left.
    assert.ok(xs.every((x, i) => i === 0 || x < xs[i - 1]!));
    assert.ok(xs.every((x) => x > 0.05 && x < 0.95));
  }
});

test("individual lights can have their own color, brightness or be off, and sit out the pattern", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  // Fixtures 0–1 are pixel bars (backdrop), 2–3 pars (side), 4–5 movers.
  const s = {
    ...newSection("verse", 120),
    mood: "dark",
    pattern: "waves",
    effects: { sparkle: true },
    lights: { "0": { color: "amber", level: 0.5 }, "2": { color: "#00ff00" }, "3": { off: true }, "4": { level: 1 } },
  };
  assert.equal(sitsOut(s, 0, "pattern"), true);
  assert.equal(sitsOut(s, 1, "pattern"), false);
  assert.equal(sitsOut({ lights: { "0": { color: "amber", keepPattern: true } } }, 0, "pattern"), false);
  assert.equal(sitsOut(s, 3, "effects"), true);
  // Bar 0 holds its own color, so the pattern runs on bar 1 only; sparkle still uses both bars.
  assert.deepEqual(patternTargets(s, rig), [1]);
  assert.deepEqual(effectTargets(s, "sparkle", rig).sort(), [0, 1]);

  generateSong({ ws, profiles, rig, song: { id: "i", title: "Own lights", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  assert.deepEqual(checkWorkspace(parseWorkspace(xml), profiles), []);
  const fixtureVals = (scene: string, id: number) => {
    const f = xml.slice(xml.indexOf(`Name="${scene}"`));
    const m = new RegExp(`<FixtureVal ID="${id}">([^<]*)</FixtureVal>`).exec(f.slice(0, f.indexOf("</Function>")));
    return new Map((m?.[1] ?? "").split(",").reduce<[number, number][]>((a, v, i, arr) => (i % 2 ? a : [...a, [Number(v), Number(arr[i + 1])]]), []));
  };
  // The par (fixture 2, 6ch: dimmer 0, strobe 1, R 2, G 3, B 4, W 5) is green; its partner (3) is dark.
  const par = fixtureVals("Side lights", 2);
  assert.equal(par.get(3), 255);
  assert.equal(par.get(2), 0);
  assert.equal(fixtureVals("Side lights", 3).get(0), 0);
});

test("Focus spotlights its lights even with their own settings, and dims the rest to half", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  // Pars 2 (stage left) and 3 (stage right). Par 2 has its own color, par 3 its own brightness.
  const sl = rig.fixtures.find((f) => f.fixtureId === 2)!.side;
  const s = { ...newSection("verse", 120), mood: "dark", focus: sl, lights: { "2": { color: "#00ff00" }, "3": { level: 0.8 } } };
  generateSong({ ws, profiles, rig, song: { id: "f", title: "Focus", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  const scene = xml.slice(xml.indexOf('Name="Side lights"'));
  const vals = (id: number) => {
    const m = new RegExp(`<FixtureVal ID="${id}">([^<]*)</FixtureVal>`).exec(scene.slice(0, scene.indexOf("</Function>")))!;
    const a = m[1]!.split(",").map(Number);
    return new Map(a.flatMap((v, i) => (i % 2 ? [] : [[v, a[i + 1]!] as [number, number]])));
  };
  // The spotlight: full dimmer, warm white (not its own green).
  const spot = vals(2);
  assert.equal(spot.get(0), 255);
  // On an RGBW par, warm white uses the white LED plus some red: not green.
  assert.ok(spot.get(5)! > 0 && spot.get(2)! > spot.get(3)!);
  // The other par: its own 80% halved.
  assert.equal(vals(3).get(0), Math.round(255 * 0.8 * FOCUS_DIM));
});

test("fixture heights come from QLC+'s 3D view, and high fixtures start as hung from a truss", () => {
  // A 3D layout: a 3 m tall stage; fixture 4 at 2.6 m, fixture 2 on the floor, fixture 0 with no item.
  const xml = WORKSPACE_QXW.replace(
    " </Engine>",
    `  <Monitor DisplayMode="1"><Grid Width="5" Height="3" Depth="3" Units="0"/><FxItem ID="2" XPos="100" YPos="10" ZPos="0"/><FxItem ID="4" XPos="200" YPos="2600" ZPos="0" XRot="180"/></Monitor>\n </Engine>`,
  );
  const ws = parseWorkspace(xml);
  const byId = new Map(ws.fixtures.map((f) => [f.id, f]));
  assert.ok(byId.get(4)!.height! > 0.8);
  assert.ok(byId.get(2)!.height! < 0.1);
  assert.equal(byId.get(0)!.height, undefined);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const mount = (id: number) => mountOf(rig.fixtures.find((f) => f.fixtureId === id)!);
  assert.equal(mount(4), "truss");
  assert.equal(mount(2), "floor");
  assert.equal(mount(0), "floor");
  // A light moved in Lightsmith keeps its place on the next guess...
  const changed = { ...rig, fixtures: rig.fixtures.map((f) => (f.fixtureId === 2 ? { ...f, height: 0.9, moved: true } : f)) };
  assert.equal(mount(2), "floor");
  assert.equal(mountOf(guessRig(ws.fixtures, profiles, changed).fixtures.find((f) => f.fixtureId === 2)!), "truss");
  // ...until the show file is loaded again, when QLC+ wins.
  const reloaded = { ...changed, fixtures: changed.fixtures.map(({ moved: _m, ...f }) => f) };
  assert.equal(mountOf(guessRig(ws.fixtures, profiles, reloaded).fixtures.find((f) => f.fixtureId === 2)!), "floor");
  // QLC+ 4's 2D monitor (no Depth) is ignored.
  const flat = parseWorkspace(WORKSPACE_QXW.replace(" </Engine>", `  <Monitor><Grid Width="5" Height="5" Units="0"/><FxItem ID="4" XPos="0" YPos="4900"/></Monitor>\n </Engine>`));
  assert.equal(flat.fixtures.find((f) => f.id === 4)!.height, undefined);
});

test("the stage layout comes from QLC+'s 3D view, and lights moved here are written back", () => {
  // A 5 m wide, 4 m deep stage. Fixture 1 near stage left at the back; fixture 3
  // stage right, in front of the stage; fixture 5 a bar stood on its end.
  const xml = WORKSPACE_QXW.replace(
    " </Engine>",
    `  <Monitor DisplayMode="1"><Grid Width="5" Height="3" Depth="4" Units="0"/><FxItem ID="1" XPos="4500" YPos="0" ZPos="400"/><FxItem ID="3" XPos="500" YPos="1500" ZPos="4400"/><FxItem ID="5" XPos="2500" YPos="0" ZPos="200" XRot="270" ZRot="270"/></Monitor>\n </Engine>`,
  );
  const ws = parseWorkspace(xml);
  assert.deepEqual(ws.stage, { width: 5, depth: 4, height: 3, feet: false });
  const place = (id: number) => ws.fixtures.find((f) => f.id === id)!.place!;
  assert.ok(Math.abs(place(1).x - 0.9) < 1e-9 && Math.abs(place(1).y - 0.1) < 1e-9);
  assert.ok(place(3).y > 1);
  assert.equal(place(5).upright, true);
  assert.equal(place(1).upright, false);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles, undefined, ws.stage);
  const rf = (id: number) => rig.fixtures.find((f) => f.fixtureId === id)!;
  // QLC+ places fixtures by their corner; Lightsmith keeps their middle.
  const size = fixtureSize(profiles.get(1));
  assert.ok(Math.abs(rf(1).pos!.x - (4500 + size.width / 2) / 5000) < 1e-9);
  assert.ok(Math.abs(rf(1).pos!.y - (400 + size.depth / 2) / 4000) < 1e-9);
  assert.equal(rf(1).side, "SL");
  assert.equal(rf(3).side, "SR");
  // The job doesn't follow the position: it's guessed from what the light can do.
  if (!profiles.get(3)!.isMover && !isBar(profiles.get(3))) assert.equal(rf(3).role, "front");
  // Move fixture 1 in Lightsmith; the export puts it there in QLC+'s 3D view too.
  const moved = { ...rig, fixtures: rig.fixtures.map((f) => (f.fixtureId === 1 ? { ...f, pos: { x: 0.5, y: 0.5 }, height: 0.5, moved: true } : f)) };
  generateSong({ ws, profiles, rig: moved, song: { id: "s", title: "Layout", bpm: 120, sections: [newSection("verse", 120)] } });
  const out = serializeWorkspace(ws);
  const mm = (v: number) => String(Math.round(v * 100) / 100);
  assert.ok(out.includes(`<FxItem ID="1" XPos="${mm(2500 - size.width / 2)}" YPos="${mm(1500 - size.height / 2)}" ZPos="${mm(2000 - size.depth / 2)}"/>`), "moved fixture written back by its corner");
  // Lights not moved here are left exactly as QLC+ had them.
  assert.match(out, /<FxItem ID="3" XPos="500" YPos="1500" ZPos="4400"\/>/);
});

test("a moving head turned to face the back comes from QLC+'s Invert pan, and goes back on export", () => {
  const { profiles: all } = matchProfiles(parseWorkspace(WORKSPACE_QXW).fixtures, defs());
  const moverId = [...all].find(([, p]) => p.isMover)![0];
  const xml = WORKSPACE_QXW.replace(
    " </Engine>",
    `  <Monitor DisplayMode="1"><Grid Width="5" Height="3" Depth="4" Units="0"/><FxItem ID="${moverId}" InvertedPan="True" XPos="4500" YPos="0" ZPos="2000" XRot="180" YRot="180"/></Monitor>\n </Engine>`,
  );
  const ws = parseWorkspace(xml);
  assert.equal(ws.fixtures.find((f) => f.id === moverId)!.place!.facesBack, true);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles, undefined, ws.stage);
  assert.equal(rig.fixtures.find((f) => f.fixtureId === moverId)!.facesBack, true);
  // Turn it to face the audience in Lightsmith: the export clears Invert pan.
  const turned = { ...rig, fixtures: rig.fixtures.map((f) => (f.fixtureId === moverId ? { ...f, facesBack: false, moved: true } : f)) };
  generateSong({ ws, profiles, rig: turned, song: { id: "s", title: "Facing", bpm: 120, sections: [newSection("verse", 120)] } });
  const item = serializeWorkspace(ws).split("\n").find((l) => l.includes(`<FxItem ID="${moverId}"`))!;
  assert.ok(!item.includes("InvertedPan"));
  assert.ok(item.includes('XRot="180"'));
});

test("fixture sizes come from the definition, and a mode's own size wins", () => {
  const def = parseFixtureDef(`<?xml version="1.0"?><FixtureDefinition><Manufacturer>M</Manufacturer><Model>Bar</Model><Type>LED Bar (Pixels)</Type>
<Channel Name="Red"><Group Byte="0">Intensity</Group><Colour>Red</Colour></Channel>
<Mode Name="A"><Channel Number="0">Red</Channel></Mode>
<Mode Name="B"><Channel Number="0">Red</Channel><Physical><Dimensions Width="500" Height="50" Depth="40"/></Physical></Mode>
<Physical><Dimensions Weight="0" Width="1000" Height="100" Depth="27"/></Physical></FixtureDefinition>`);
  assert.deepEqual(fixtureSize(buildProfile(def, "A")), { width: 1000, height: 100, depth: 27 });
  assert.deepEqual(fixtureSize(buildProfile(def, "B")), { width: 500, height: 50, depth: 40 });
  assert.deepEqual(fixtureSize(undefined), { width: 300, height: 300, depth: 300 });
});

test("a length in seconds becomes the nearest whole number of bars", () => {
  assert.equal(barsForSeconds(16, 120, 4), 8);
  // 30 s at 138 BPM is 17.25 bars.
  assert.equal(barsForSeconds(30, 138, 4), 17);
  assert.equal(barsForSeconds(0.2, 120, 4), 1);
  // And back: the bars it picks are within half a bar of the time asked for.
  const s = { bpm: 97, beatsPerBar: 3, bars: barsForSeconds(45, 97, 3) };
  assert.ok(Math.abs(sectionMs(s) / 1000 - 45) <= (60 / 97) * 3 / 2);
});

test("saved positions: sections point the heads there, and movements run around them", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const base = guessRig(ws.fixtures, profiles);
  const heads = base.fixtures.filter((f) => f.role === "mover");
  assert.ok(heads.length > 0);
  const id = heads[0]!.fixtureId;
  const rig = { ...base, positions: [{ id: "x", name: "X over the drums", aims: { [String(id)]: { pan: 40, tilt: 200 } } }] };
  // Positions survive the rig being guessed again.
  assert.equal(guessRig(ws.fixtures, profiles, rig).positions?.[0]?.name, "X over the drums");
  const pointed = { ...newSection("verse", 120), aim: "x" };
  assert.deepEqual(aimOf(pointed, rig, heads[0]!), { pan: 40, tilt: 200 });
  // No position (or a deleted one): the head's home.
  assert.deepEqual(aimOf({ aim: "gone" }, rig, heads[0]!), heads[0]!.home ?? { pan: 128, tilt: 128 });
  // A moving section's EFX is centred on the position.
  generateSong({ ws, profiles, rig, song: { id: "s", title: "Aim", bpm: 120, sections: [{ ...pointed, movement: "circle" }] } });
  const xml = serializeWorkspace(ws);
  assert.match(xml, /<Axis Name="X">\s*<Offset>40<\/Offset>/);
  assert.match(xml, /<Axis Name="Y">\s*<Offset>200<\/Offset>/);
});

test("matching a head: opposite facings share values, the same facing mirrors the pan", () => {
  assert.deepEqual(mirroredAim({ pan: 60, tilt: 90 }, false, true), { pan: 60, tilt: 90 });
  assert.deepEqual(mirroredAim({ pan: 60, tilt: 90 }, false, false), { pan: 195, tilt: 90 });
});

test("beam channels: zoom, strobe, gobo and prism are found, with safe values", () => {
  const def = parseFixtureDef(`<?xml version="1.0"?><FixtureDefinition><Manufacturer>M</Manufacturer><Model>Spot</Model><Type>Moving Head</Type>
<Channel Name="Pan" Preset="PositionPan"/><Channel Name="Tilt" Preset="PositionTilt"/>
<Channel Name="Dimmer" Preset="IntensityMasterDimmer"/><Channel Name="Red" Preset="IntensityRed"/>
<Channel Name="Zoom" Preset="BeamFocusNearFar"/>
<Channel Name="Strobe"><Group Byte="0">Shutter</Group><Capability Min="0" Max="9">No function</Capability><Capability Min="10" Max="255">Strobe slow to fast</Capability></Channel>
<Channel Name="Gobo"><Group Byte="0">Gobo</Group><Capability Min="0" Max="9">Open</Capability><Capability Min="10" Max="19">Gobo 1</Capability><Capability Min="20" Max="29">Gobo 2</Capability></Channel>
<Channel Name="Gobo rotation"><Group Byte="0">Gobo</Group><Capability Min="0" Max="127">Stop</Capability><Capability Min="128" Max="255">Rotate</Capability></Channel>
<Channel Name="Prism"><Group Byte="0">Prism</Group><Capability Min="0" Max="127">No prism</Capability><Capability Min="128" Max="255">3-facet prism</Capability></Channel>
<Mode Name="M"><Channel Number="0">Pan</Channel><Channel Number="1">Tilt</Channel><Channel Number="2">Dimmer</Channel><Channel Number="3">Red</Channel><Channel Number="4">Zoom</Channel><Channel Number="5">Strobe</Channel><Channel Number="6">Gobo</Channel><Channel Number="7">Gobo rotation</Channel><Channel Number="8">Prism</Channel></Mode>
</FixtureDefinition>`);
  const p = buildProfile(def, "M");
  assert.equal(p.zoom?.channel, 4);
  assert.equal(p.gobo?.channel, 6, "the gobo wheel, not its rotation");
  assert.equal(p.prism?.channel, 8);
  assert.deepEqual(strobeRange(p), { channel: 5, min: 10, max: 255, fastFirst: false });
  // A head whose strobe channel has no "open" value stops strobing at "No function".
  assert.equal(strobeOffValue(p, 5), 0);
  assert.equal(openGobo(p.gobo!.capabilities)?.name, "Open");
  assert.equal(prismRange(p.prism!.capabilities, true)?.min, 128);
  assert.equal(prismRange(p.prism!.capabilities, false)?.min, 0);
});

test("sequences: a chaser imports as editable steps, and exports with the same timing", () => {
  const base = parseWorkspace(WORKSPACE_QXW);
  const { profiles: all } = matchProfiles(base.fixtures, defs());
  const [fid, p] = [...all].find(([, pr]) => !pr.isMover && pr.heads.length > 0 && pr.heads[0]!.red !== undefined)!;
  const h = p.heads[0]!;
  const vals = [p.masterDimmer, h.red, h.green, h.blue].filter((c) => c !== undefined).flatMap((c) => [c, 255]).join(",");
  const xml = WORKSPACE_QXW.replace(
    " </Engine>",
    `  <Function ID="900" Type="Scene" Name="Wait"><Speed FadeIn="0" FadeOut="0" Duration="0"/></Function>
  <Function ID="901" Type="Scene" Name="Flash"><Speed FadeIn="0" FadeOut="0" Duration="0"/><FixtureVal ID="${fid}">${vals}</FixtureVal></Function>
  <Function ID="902" Type="Chaser" Name="Storm" Path="My songs"><Speed FadeIn="0" FadeOut="0" Duration="0"/><Direction>Forward</Direction><RunOrder>SingleShot</RunOrder><SpeedModes FadeIn="PerStep" FadeOut="PerStep" Duration="PerStep"/>
   <Step Number="0" FadeIn="0" Hold="5000" FadeOut="0">900</Step><Step Number="1" FadeIn="40" Hold="100" FadeOut="0">901</Step><Step Number="2" FadeIn="0" Hold="50" FadeOut="0">900</Step></Function>
 </Engine>`,
  );
  const ws = parseWorkspace(xml);
  assert.ok(chasersIn(ws).some((c) => c.name === "Storm"));
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const { sequence, delay, notes } = importChaser(ws, 902, profiles);
  assert.equal(delay, 5, "the opening wait becomes the section's delay");
  assert.deepEqual(notes, []);
  assert.equal(sequence.steps.length, 2);
  assert.deepEqual(sequence.steps[0]!.lights, [fid]);
  assert.equal(sequence.steps[0]!.color, undefined, "full red, green and blue reads as white");
  assert.deepEqual([sequence.steps[0]!.fadeIn, sequence.steps[0]!.hold], [40, 100]);
  assert.equal(sequence.steps[1]!.lights.length, 0, "an empty scene is a pause");
  const rig = guessRig(ws.fixtures, profiles);
  const sec = { ...newSection("intro", 120), sequences: [{ id: sequence.id, delay }] };
  generateSong({ ws, profiles, rig, song: { id: "s", title: "Seq", bpm: 120, sections: [sec] }, sequences: [sequence] });
  const chaser = serializeWorkspace(ws).match(/<Function ID="\d+" Type="Chaser" Name="Sequence: Storm"[\s\S]*?<\/Function>/)?.[0] ?? "";
  assert.match(chaser, /<Step Number="0" FadeIn="0" Hold="5000" FadeOut="0">/);
  assert.match(chaser, /<Step Number="1" FadeIn="40" Hold="100" FadeOut="0">/);
  assert.match(chaser, /<RunOrder>SingleShot<\/RunOrder>/);
});

test("sequences: quick starts, beats at the section's tempo, and a delayed loop", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  for (const q of QUICK_STARTS) assert.ok(quickStart(q.id, rig, profiles).steps.length > 0, q.id);
  const chase = quickStart("chase", rig, profiles);
  assert.equal(chase.units, "beats");
  assert.equal(toMs(1, "beats", 120), 500);
  assert.equal(sequenceMs(chase, 120), chase.steps.length * 500);
  const sec = { ...newSection("verse", 120), sequences: [{ id: chase.id, delay: 2 }] };
  generateSong({ ws, profiles, rig, song: { id: "s", title: "Chase", bpm: 120, sections: [sec] }, sequences: [chase] });
  const xml = serializeWorkspace(ws);
  // The loop waits in an outer one-shot chaser, so the delay doesn't repeat.
  assert.match(xml, /Name="Sequence: Chase across \(after 2s\)"[\s\S]*?<Step Number="0" FadeIn="0" Hold="2000"/);
  assert.match(xml, /Name="Sequence: Chase across"[^>]*>[\s\S]*?<RunOrder>Loop<\/RunOrder>[\s\S]*?Hold="500"/);
});

test("a backdrop set to one color runs its pattern in that color too", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("intro", 120), mood: "dark", colors: ["indigo", "white"], colorLayout: { backdrop: 1 }, pattern: "drizzle" };
  generateSong({ ws, profiles, rig, song: { id: "s", title: "White rain", bpm: 120, sections: [s] } });
  const matrix = serializeWorkspace(ws).match(/Type="RGBMatrix" Name="[^"]*Pattern[^"]*"[\s\S]*?<\/Function>/)?.[0] ?? "";
  const colors = [...matrix.matchAll(/<Color Index="\d+">(\d+)<\/Color>/g)].map((m) => Number(m[1]) & 0xffffff);
  assert.deepEqual(colors, [0xffffff], "white rain, not the next color in the palette");
});

test("moving heads jump to their position at full speed, without the section's fade", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("intro", 120), movement: "static", transition: "build" as const };
  generateSong({ ws, profiles, rig, song: { id: "p", title: "Aim", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  const pos = xml.match(/<Function ID="\d+" Type="Scene" Name="[^"]*Movers position"[^>]*>\s*<Speed FadeIn="(\d+)"/);
  assert.ok(pos, "a separate position scene");
  assert.equal(pos![1], "0", "no fade on pan and tilt");
});

test("a side-to-side swap changes brightness, not each light's color", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("chorus", 120), mood: "lively", colors: ["magenta", "cyan"], colorChange: "hold" as const };
  generateSong({ ws, profiles, rig, song: { id: "w", title: "Swap", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  const scene = (n: string) => xml.split(`Name="${n}"`)[1]!.split("</Function>")[0]!;
  const vals = (body: string) => [...body.matchAll(/<FixtureVal ID="(\d+)">([^<]*)</g)].map((m) => [m[1], m[2]!.split(",").filter((_, i) => i % 2 === 1).map(Number)] as const);
  const colorOf = (body: string) => new Map(vals(body).map(([id, v]) => [id, v.map((x) => (x > 0 ? 1 : 0)).join("")]));
  const a = colorOf(scene("Side lights A"));
  const b = colorOf(scene("Side lights B"));
  // The same lights are lit in the same channels in both halves of the swap (only the level differs).
  assert.deepEqual([...a.entries()], [...b.entries()]);
});

test("moving-head speed: automatic from the energy, or set per section in beats", () => {
  const auto = newSection("verse", 120);
  assert.equal(moverCycleBeats({ ...auto, energy: 3 }, 4), 16, "a 4-bar circle at energy 3");
  assert.equal(moverCycleBeats({ ...auto, energy: 5 }, 4), 8, "maximum energy doubles the speed");
  assert.equal(moverCycleBeats({ ...auto, moverBeats: 2 }, 4), 2);
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  // Quick heads, so a circle every second is something they can really do.
  const guessed = guessRig(ws.fixtures, profiles);
  const rig = { ...guessed, fixtures: guessed.fixtures.map((f) => (f.role === "mover" ? { ...f, panSeconds: 0.5 } : f)) };
  generateSong({ ws, profiles, rig, song: { id: "m", title: "Fast", bpm: 120, sections: [{ ...auto, movement: "circle", moverBeats: 2 }] } });
  assert.match(serializeWorkspace(ws), /Type="EFX"[\s\S]*?<Speed FadeIn="0" FadeOut="0" Duration="1000"\/>/, "2 beats at 120 BPM is one second");
});

test("each kind of light can use just some colors, and only some kinds switch", () => {
  const palette = ["magenta", "cyan", "amber", "blue"];
  // Just two of the four colors.
  assert.deepEqual(jobPalette(["cyan", "magenta"], palette), ["magenta", "cyan"], "kept in palette order");
  assert.deepEqual(jobPalette(["gone"], palette), ["magenta"], "never empty");
  const s = { ...newSection("chorus", 120), colors: palette, colorChange: "bar" as const, colorLayout: { backdrop: ["magenta", "cyan"], side: "mix" as const, front: "white" as const }, colorSwitch: { side: false } };
  const layout = colorLayoutOf(s);
  // Backdrop switches between its two colors; the side lights hold theirs.
  assert.equal(jobColorAt(s, layout, palette, "backdrop", 0, 0), "magenta");
  assert.equal(jobColorAt(s, layout, palette, "backdrop", 0, 1), "cyan");
  assert.equal(jobColorAt(s, layout, palette, "side", 1, 0), "cyan");
  assert.equal(jobColorAt(s, layout, palette, "side", 1, 3), "cyan");
  // Movers (mix of 4) and backdrop (2) switch: 4 steps bring both round.
  assert.equal(colorSteps(s, palette, true), 4);
  assert.equal(colorSteps({ ...s, colorSwitch: { side: false, mover: false, backdrop: false } }, palette, true), 0, "nothing switches");
  // The export makes one look per step.
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  generateSong({ ws, profiles, rig, song: { id: "c", title: "Picked colors", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  assert.equal((xml.match(/Type="Collection" Name="Colors \d+"/g) ?? []).length, 4);
});

test("presets keep a section's whole look and apply it to any section", () => {
  const src = { ...newSection("chorus", 140), name: "Chorus 1", bars: 16, mood: "colorful", colors: ["magenta", "cyan"], colorLayout: { backdrop: ["magenta"] }, moverBeats: 2, effects: { strobe: true } };
  const p = { id: "p1", name: "Big chorus", type: src.type, look: lookOf(src) };
  assert.equal((p.look as Record<string, unknown>).bars, undefined, "length isn't part of a look");
  assert.equal((p.look as Record<string, unknown>).name, undefined);
  // The preset doesn't share anything with the section it came from.
  src.colors.push("amber");
  assert.deepEqual(p.look.colors, ["magenta", "cyan"]);
  // Applied to a verse: the look comes across; name, length and tempo stay.
  const verse = { ...newSection("verse", 100), name: "Verse 2", bars: 8, focus: "SL" as const, aim: "pos1" };
  const out = applyLook(verse, p);
  assert.equal(out.mood, "colorful");
  assert.deepEqual(out.colorLayout, { backdrop: ["magenta"] });
  assert.equal(out.moverBeats, 2);
  assert.equal(out.name, "Verse 2");
  assert.equal(out.bars, 8);
  assert.equal(out.bpm, 100);
  assert.equal(out.preset, "p1");
  // Settings the preset didn't have go back to their defaults.
  assert.equal(out.focus, "all");
  assert.equal(out.aim, undefined);
});

test("each kind of light can switch colors at its own rate", () => {
  const s = { ...newSection("chorus", 120), colors: ["magenta", "cyan", "amber"], colorChange: "bar" as const, colorRates: { mover: "2bars" as const }, colorSwitch: { front: false } };
  assert.equal(colorRateOf(s, "side"), "bar", "with the section");
  assert.equal(colorRateOf(s, "mover"), "2bars", "its own rate");
  assert.equal(colorRateOf(s, "front"), "hold", "steady");
  assert.equal(colorRateOf({ ...s, colorChange: "hold" }, "mover"), "2bars", "its own rate even when the section holds");
  assert.equal(ratePeriodMs("2bars", 120, 4), 4000);
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  generateSong({ ws, profiles, rig, song: { id: "r", title: "Rates", bpm: 120, sections: [s] } });
  const xml = serializeWorkspace(ws);
  // Two chasers: one for the lights at the section's rate (a bar, 2 s), one for the movers (2 bars, 4 s).
  const chasers = [...xml.matchAll(/Type="Chaser" Name="Color changes([^"]*)"[\s\S]*?<\/Function>/g)];
  assert.equal(chasers.length, 2);
  const holds = chasers.map((m) => Number(/Hold="(\d+)"/.exec(m[0])![1])).sort((a, b) => a - b);
  assert.deepEqual(holds, [2000, 4000]);
});

test("movement shape: size, exact width and height, rotation, nudges and fan", () => {
  const circle = { width: 70, height: 50 };
  assert.deepEqual(moverShapeAt(undefined, circle, { pan: 128, tilt: 128 }), { x: 128, y: 128, width: 70, height: 50, rotation: 0 });
  // QLC+ reads width as travel each way and caps it at 127 when it loads.
  assert.equal(moverShapeAt({ size: 2 }, { width: 110, height: 10 }, { pan: 128, tilt: 128 }).width, 127);
  assert.deepEqual(moverShapeAt({ size: 0.5 }, circle, { pan: 128, tilt: 128 }), { x: 128, y: 128, width: 35, height: 25, rotation: 0 });
  // Exact width wins over size; the shape never runs past 0 or 255.
  const near = moverShapeAt({ size: 2, width: 200, panNudge: -100, rotation: 450 }, circle, { pan: 120, tilt: 128 });
  assert.equal(near.x, 20);
  assert.equal(near.width, 20, "only 20 steps of room either side");
  assert.equal(near.rotation, 90);
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const s = { ...newSection("verse", 120), movement: "circle", moverSpread: "offset" as const, moverShape: { size: 1.5, rotation: 30, fan: 90 } };
  generateSong({ ws, profiles, rig, song: { id: "e", title: "Shape", bpm: 120, sections: [s] } });
  const efx = serializeWorkspace(ws).match(/Type="EFX"[\s\S]*?<\/Function>/)![0];
  assert.match(efx, /<Width>105<\/Width>/);
  assert.match(efx, /<Rotation>30<\/Rotation>/);
  assert.match(efx, /<PropagationMode>Parallel<\/PropagationMode>/, "an exact fan replaces QLC+'s own spread");
  const offsets = [...efx.matchAll(/<Fixture>[\s\S]*?<StartOffset>(\d+)<\/StartOffset>/g)].map((m) => Number(m[1]));
  if (offsets.length > 1) assert.deepEqual(offsets.slice(0, 2), [0, 90]);
});

test("a new moving head starts leaning over the crowd, and keeps its home when the rig is guessed again", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const heads = rig.fixtures.filter((f) => f.role === "mover");
  if (!heads.length) return;
  assert.deepEqual(heads[0]!.home, heads[0]!.facesBack ? defaultHome(true) : DEFAULT_HOME);
  assert.ok(Math.abs(DEFAULT_HOME.tilt - 128) >= UPRIGHT_TILT, "not pointing straight up");
  // A head turned to face the backdrop gets the mirror tilt, so it leans forwards too.
  assert.deepEqual(defaultHome(true), { pan: 128, tilt: 176 });
  assert.ok(isDefaultHome({ pan: 128, tilt: 176 }, true) && !isDefaultHome({ pan: 128, tilt: 176 }, false));
  const own = { ...rig, fixtures: rig.fixtures.map((f) => (f.role === "mover" ? { ...f, home: { pan: 128, tilt: 128 } } : f)) };
  const again = guessRig(ws.fixtures, profiles, own);
  assert.deepEqual(again.fixtures.find((f) => f.role === "mover")!.home, { pan: 128, tilt: 128 }, "an existing rig is left as it was");
});

test("the whole set: every song in one file, one solo frame with a page per song", () => {
  const ws = parseWorkspace(WORKSPACE_QXW);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const a = { ...newSong("First song", 120), sections: sectionsFromTemplate("bridge", 120) };
  const b = { ...newSong("Second song", 100), sections: sectionsFromTemplate("short", 100).slice(0, 3) };
  // A single-song export first: the set replaces its frame.
  generateSong({ ws, profiles, rig, song: a });
  const sum = generateSet({ ws, profiles, rig, songs: [a, b] });
  assert.equal(sum.songs.length, 2);
  const xml = serializeWorkspace(ws);
  const again = parseWorkspace(xml);
  assert.deepEqual(checkWorkspace(again, profiles, PATH_ROOT).filter((i) => i.level === "error"), []);
  const frames: XmlElement[] = [];
  const walk = (e: XmlElement) => childElements(e).forEach((c) => (c.name === "SoloFrame" || c.name === "Frame" ? (frames.push(c), walk(c)) : walk(c)));
  walk(again.virtualConsole!);
  const set = frames.filter((f) => getAttr(f, "Caption") === SET_FRAME);
  assert.equal(set.length, 1, "one set frame");
  assert.equal(frames.filter((f) => getAttr(f, "Caption") === "First song (Lightsmith)").length, 0, "the single-song frame is gone");
  assert.equal(getAttr(firstChild(set[0]!, "Multipage")!, "PagesNum"), "2");
  assert.deepEqual(childElements(set[0]!, "Shortcut").map((s) => getAttr(s, "Name")), ["1. First song", "2. Second song"]);
  const all = childElements(set[0]!, "Button");
  // Every page also has Safe look and Blackout.
  assert.equal(all.filter((x) => getAttr(x, "Caption") === "Safe look").length, 2);
  const buttons = all.filter((x) => !["Safe look", "Blackout"].includes(getAttr(x, "Caption") ?? ""));
  assert.equal(buttons.length, a.sections.length + b.sections.length);
  assert.equal(buttons.filter((x) => getAttr(x, "Page") === "1").length, b.sections.length);
  // Exporting the set again replaces it rather than adding a second one.
  generateSet({ ws: again, profiles, rig, songs: [b] });
  const frames2: XmlElement[] = [];
  const walk2 = (e: XmlElement) => childElements(e).forEach((c) => (c.name === "SoloFrame" || c.name === "Frame" ? (frames2.push(c), walk2(c)) : walk2(c)));
  walk2(again.virtualConsole!);
  assert.equal(frames2.filter((f) => getAttr(f, "Caption") === SET_FRAME).length, 1);
  assert.throws(() => generateSet({ ws: again, profiles, rig, songs: [a, { ...a, id: "x" }] }), /Two songs are called/);
});

test("show control: triggers become QLC+ external inputs, the way its MIDI plugin numbers them", () => {
  // Notes 128-255, controllers 0-127, programs 384-511; on any channel the MIDI channel sits in the top bits.
  assert.equal(qlcInputChannel({ kind: "note", number: 36 }, { channel: 2 }), (1 << 12) | 164);
  assert.equal(qlcInputChannel({ kind: "cc", number: 1 }, { channel: 1 }), 1);
  assert.equal(qlcInputChannel({ kind: "pc", number: 5 }, { channel: 4 }, "own"), 389);
  assert.equal(triggerLabel({ kind: "note", number: 36 }), "Note 36 (C1)");

  const ws = parseWorkspace(WORKSPACE_QXW.replace("<InputOutputMap>", '<InputOutputMap><Universe Name="Universe 3" ID="2"><Input Plugin="MIDI" Name="H4MIDI-WC" UID="1" Line="1"/></Universe>'));
  assert.deepEqual(ws.inputs.map((i) => [i.universe, i.device]), [[3, "H4MIDI-WC"]]);
  const { profiles } = matchProfiles(ws.fixtures, defs());
  const rig = guessRig(ws.fixtures, profiles);
  const control: ShowControl = {
    devices: [
      { id: "strike", name: "Strike", universe: 3, channel: 2 },
      { id: "captain", name: "Captain", universe: 3, channel: 3 },
    ],
    listen: "any",
    slots: [{ device: "strike", kind: "note", number: 36 }, { device: "strike", kind: "note", number: 37 }],
    nextSong: { device: "captain", kind: "cc", number: 20 },
    safeLook: { device: "captain", kind: "cc", number: 22 },
  };
  const a = { ...newSong("First", 120), sections: sectionsFromTemplate("short", 120), trigger: { device: "captain", kind: "pc", number: 1 } as Trigger };
  // A section with its own trigger replaces the one for its place.
  a.sections[1] = { ...a.sections[1]!, trigger: { device: "strike", kind: "note", number: 40 } };
  const b = { ...newSong("Second", 100), sections: sectionsFromTemplate("short", 100) };
  const sum = generateSet({ ws, profiles, rig, songs: [a, b], control });
  const again = parseWorkspace(serializeWorkspace(ws));
  const set: XmlElement[] = [];
  const walk = (e: XmlElement) => childElements(e).forEach((c) => (getAttr(c, "Caption") === SET_FRAME ? set.push(c) : walk(c)));
  walk(again.virtualConsole!);
  const buttons = childElements(set[0]!, "Button");
  const inputOf = (x: XmlElement) => {
    const i = firstChild(x, "Input");
    return i ? [getAttr(i, "Universe"), getAttr(i, "Channel")] : null;
  };
  const page0 = buttons.filter((x) => !getAttr(x, "Page"));
  assert.deepEqual(inputOf(page0[0]!), ["2", String((1 << 12) | 164)]);
  assert.deepEqual(inputOf(page0[1]!), ["2", String((1 << 12) | 168)], "its own trigger");
  assert.equal(inputOf(page0[2]!), null, "no trigger for section 3");
  const page1 = buttons.filter((x) => getAttr(x, "Page") === "1");
  assert.deepEqual(inputOf(page1[1]!), ["2", String((1 << 12) | 165)], "slot 2 on the second song");
  assert.ok(page0.some((x) => getAttr(x, "Caption") === "Safe look" && inputOf(x)?.[1] === String((2 << 12) | 22)));
  assert.ok(page0.some((x) => getAttr(x, "Caption") === "Blackout" && textOf(firstChild(x, "Action")) === "Blackout"));
  assert.equal(getAttr(firstChild(firstChild(set[0]!, "Next")!, "Input")!, "Channel"), String((2 << 12) | 20));
  assert.equal(getAttr(firstChild(childElements(set[0]!, "Shortcut")[0]!, "Input")!, "Channel"), String((2 << 12) | 385));
  // QLC+ is told to listen to any channel on that input.
  assert.match(serializeWorkspace(again), /<PluginParameters midichannel="16"\/>/);
  assert.deepEqual(sum.controlNotes, []);
  // A missing input, and two buttons on one page sharing a message, are pointed out.
  const ws2 = parseWorkspace(WORKSPACE_QXW);
  const clash = { ...control, slots: [control.slots[0]!, control.slots[0]!] };
  const notes = generateSet({ ws: ws2, profiles, rig, songs: [b], control: clash }).controlNotes;
  assert.ok(notes.some((n) => /both use Strike Note 36/.test(n)));
  assert.ok(notes.some((n) => /Nothing MIDI is patched to Universe 3/.test(n)));
});

test("the .lightsmith file carries the project, show file and added definitions, and old .json projects still open", () => {
  const project = { version: 1 as const, rig: { fixtures: [] }, songs: [{ ...newSong("One", 120), sections: sectionsFromTemplate("short", 120) }] };
  const text = bundleProject(project, { name: "Show.qxw", xml: "<Workspace/>" }, [{ name: "Bar.qxf", xml: "<FixtureDefinition/>" }], new Date("2026-11-19T00:00:00Z"));
  const back = readProjectFile(text);
  assert.equal(back.project.songs[0]!.title, "One");
  assert.equal(back.showFile?.name, "Show.qxw");
  assert.equal(back.fixtureDefinitions.length, 1);
  assert.equal(JSON.parse(text).format, "lightsmith");
  const old = readProjectFile(JSON.stringify(project));
  assert.equal(old.showFile, null);
  assert.equal(old.project.songs.length, 1);
  assert.throws(() => readProjectFile("{}"), /isn't a Lightsmith project/);
  assert.throws(() => readProjectFile(JSON.stringify({ format: "lightsmith", formatVersion: 99, project })), /newer Lightsmith/);
  assert.equal(projectFileName("CV Light Show - v2.qxw"), "CV Light Show - v2.lightsmith");
  assert.equal(projectFileName(undefined), "Lightsmith project.lightsmith");
});

test("movement speed: a shape the heads can't get round in time is slowed, on the beat", () => {
  // QLC+'s circle: a full turn, both motors working.
  assert.ok(Math.abs(efxTravel("Circle", 70, 70) - 4 * 70 * Math.SQRT2) < 2, "max-norm round a circle is 4√2·r");
  assert.ok(efxTravel("Line", 110, 10) > 4 * 110 - 2 && efxTravel("Line", 110, 10) < 4 * 110 + 2);
  const rig = { fixtures: [{ fixtureId: 1, role: "mover" as const, side: "C" as const, order: 0, home: { pan: 128, tilt: 78 } }], positions: [] };
  const circle = MOVEMENTS.find((m) => m.id === "circle")!;
  // The Solo at 138 BPM, a circle every 2 beats (0.87 s): far too quick for a 2.5 s head.
  const s = { moverBeats: 2, beatsPerBar: 4, energy: 5, bpm: 138, moverShape: undefined, aim: undefined };
  const t = moverTiming(s, circle, rig);
  assert.equal(t.asked, 2);
  assert.ok(t.slowed);
  assert.ok(t.beats * (60000 / 138) >= t.minMs, "slow enough to get round");
  assert.ok((t.beats / 2) * (60000 / 138) < t.minMs, "and no slower than needed");
  assert.ok([4, 8, 16, 32].includes(t.beats), "still on the beat");
  // Smaller shapes, or quicker heads, can go faster.
  const small = moverTiming({ ...s, moverShape: { size: 0.5 } }, circle, rig);
  assert.ok(small.beats < t.beats);
  const quick = moverTiming(s, circle, { ...rig, fixtures: [{ ...rig.fixtures[0]!, panSeconds: 0.5 }] });
  assert.ok(quick.beats <= small.beats);
  // Slow enough already: left alone.
  assert.equal(moverTiming({ ...s, moverBeats: 32 }, circle, rig).slowed, false);
});

test("times are written and read the way QLC+ does it", () => {
  assert.equal(formatDuration(10200), "10s200ms");
  assert.equal(formatDuration(65000), "1m05s");
  assert.equal(formatDuration(3_723_004), "1h02m03s004ms");
  assert.equal(formatDuration(800), "800ms");
  assert.equal(formatDuration(0), "0ms");
  for (const [text, ms] of [
    ["10s200ms", 10200],
    ["1m05s", 65000],
    ["10s.20", 10200],
    ["10.2s", 10200],
    ["10.2", 10200],
    ["800ms", 800],
    ["1:30", 90000],
    ["2 s 50 ms", 2050],
    ["1h", 3_600_000],
  ] as const)
    assert.equal(parseDuration(text), ms, text);
  assert.equal(parseDuration("250", "ms"), 250, "a bare number in a milliseconds field");
  assert.equal(parseDuration("10x"), null);
  assert.equal(parseDuration(""), null);
  // Round trip.
  for (const ms of [0, 5, 999, 1000, 61001, 3_600_000]) assert.equal(parseDuration(formatDuration(ms)), ms);
});
