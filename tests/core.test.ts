import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  checkWorkspace,
  fixtureKey,
  focusLights,
  generateSong,
  guessRig,
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
  const movers = xml.split('Name="Movers color + position"')[1]!.split("</Function>")[0]!;
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
  assert.deepEqual(rf(1).pos, { x: 0.9, y: 0.1 });
  assert.equal(rf(1).side, "SL");
  assert.equal(rf(3).side, "SR");
  // The job doesn't follow the position: it's guessed from what the light can do.
  if (!profiles.get(3)!.isMover && !isBar(profiles.get(3))) assert.equal(rf(3).role, "front");
  // Move fixture 1 in Lightsmith; the export puts it there in QLC+'s 3D view too.
  const moved = { ...rig, fixtures: rig.fixtures.map((f) => (f.fixtureId === 1 ? { ...f, pos: { x: 0.5, y: 0.5 }, height: 0.5, moved: true } : f)) };
  generateSong({ ws, profiles, rig: moved, song: { id: "s", title: "Layout", bpm: 120, sections: [newSection("verse", 120)] } });
  const out = serializeWorkspace(ws);
  assert.match(out, /<FxItem ID="1" XPos="2500" YPos="1500" ZPos="2000"\/>/);
  // Lights not moved here are left exactly as QLC+ had them.
  assert.match(out, /<FxItem ID="3" XPos="500" YPos="1500" ZPos="4400"\/>/);
});
