/**
 * The generator: turns a song (sections + preset choices) and a rig into QLC+
 * functions, a song cue chaser and Virtual Console buttons, merged into the
 * user's workspace.
 *
 * Rules learned the hard way (see docs/qlc-notes.md):
 *  - Never write a shutter/strobe channel unless the definition says the value
 *    opens the shutter or is a strobe. "No function" values can read as closed.
 *    The one exception: when a song strobes a moving head, other sections
 *    stop the strobe with the value the definition calls "no function" or
 *    "off", because some heads have no "open" value at all.
 *  - Light needs the master dimmer up AND a color. Every look sets both.
 *  - RGB matrices only drive color, so a scene must hold the dimmer.
 */
import { APP_NAME } from "../config";
import { capabilityNamed, extraChannels, restingValue, openGobo, prismRange, strobeOffValue, strobeRange, type FixtureProfile, type HeadProfile } from "./fixture";
import { newSection, stepLightColor, qlcInputChannel, stepCuesFor, triggerFor, triggerLabel, type SafeLookStyle, type Section, type ShowControl, type Trigger } from "./model";
import { aimOf, moverTiming, moverShapeAt, colorLayoutOf, colorRateOf, COLOR_JOBS, jobColorAt, jobPalette, ratePeriodMs, stepsFor, switchesColors, lightLevels, lightSetting, type BeamSettings, type ColorJob, type Rig, type RigFixture, type Sequence, type SequenceOrder, type SequenceStep, type Song } from "./model";
import { toMs } from "./sequences";
import { fadeInMs, isBlackout, patternSpeedOf, sectionMs } from "./model";
import { colorById, moodById, MOVEMENTS, patternById, SPREADS, type EffectId, type RGB } from "./presets";
import { cornerOf, effectTargets, fixturesWithRole, focusLights, patternTargets, stageOrder } from "./rig";
import { el, getAttr, childElements, firstChild, textEl, textOf, type XmlElement } from "./xml";
import { insertChildren, nextFunctionId, nextGroupId, nextWidgetId, qlcMajorVersion, removeWhere, setMidiListen, writePlaces, type Workspace } from "./workspace";

export const INFINITE = 4294967294; // QLC+ "hold forever"
export const PATH_ROOT = APP_NAME;

type Vals = Map<number, Map<number, number>>;

interface Step {
  id: number;
  fadeIn?: number;
  hold: number;
  fadeOut?: number;
}

const clamp = (v: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, Math.round(v)));

function setVal(vals: Vals, fixture: number, channel: number | undefined, value: number) {
  if (channel === undefined) return;
  let m = vals.get(fixture);
  if (!m) vals.set(fixture, (m = new Map()));
  m.set(channel, clamp(value));
}

/** Put a color on one head. RGBW heads take the white part on the white LED. */
function headColor(vals: Vals, fid: number, head: HeadProfile, rgb: RGB, scale = 1) {
  let [r, g, b] = rgb.map((x) => x * scale) as [number, number, number];
  let w = 0;
  if (head.white !== undefined) {
    w = Math.min(r, g, b);
    if (head.red !== undefined) {
      r -= w;
      g -= w;
      b -= w;
    }
  }
  setVal(vals, fid, head.red, r);
  setVal(vals, fid, head.green, g);
  setVal(vals, fid, head.blue, b);
  setVal(vals, fid, head.white, w);
  setVal(vals, fid, head.amber, 0);
  setVal(vals, fid, head.uv, 0);
  setVal(vals, fid, head.dimmer, 255);
}

/** Fixture-level brightness: the master dimmer when there is one. */
function fixtureLevel(vals: Vals, fid: number, p: FixtureProfile, level: number): number {
  if (p.masterDimmer !== undefined) {
    setVal(vals, fid, p.masterDimmer, level * 255);
    return 1;
  }
  return level; // no dimmer: scale the color instead
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const JOB_NAME: Record<ColorJob, string> = { backdrop: "backdrop", side: "wash", mover: "movers", front: "front" };
const WARM_WHITE = colorById("warmWhite").rgb;
/** With Focus on, lights outside the spotlight run at this share of their level. */
export const FOCUS_DIM = 0.5;

class Builder {
  functions: XmlElement[] = [];
  constructor(private nextId: number) {}

  private fn(type: string, name: string, path: string, children: XmlElement[], extra: Record<string, string> = {}): number {
    const id = this.nextId++;
    this.functions.push(el("Function", { ID: id, Type: type, Name: name, Path: path, ...extra }, children));
    return id;
  }

  scene(name: string, path: string, vals: Vals, fadeIn = 0, fadeOut = 0): number {
    const kids: XmlElement[] = [el("Speed", { FadeIn: Math.round(fadeIn), FadeOut: Math.round(fadeOut), Duration: 0 })];
    for (const fid of [...vals.keys()].sort((a, b) => a - b)) {
      const chs = [...vals.get(fid)!.entries()].sort((a, b) => a[0] - b[0]);
      kids.push(textEl("FixtureVal", chs.map(([c, v]) => `${c},${v}`).join(","), { ID: fid }));
    }
    return this.fn("Scene", name, path, kids);
  }

  /**
   * An RGB matrix. `blend: "Additive"` adds its light on top of whatever else
   * runs on those lights (QLC+ writes this as BlendMode="Additive"); without
   * it the matrix replaces their colors.
   */
  matrix(name: string, path: string, opts: { algorithm: string; colors: RGB[]; stepMs: number; group: number; direction?: string; order?: string; props?: Record<string, string | number>; blend?: "Additive"; fadeOut?: number }): number {
    const kids: XmlElement[] = [
      el("Speed", { FadeIn: 0, FadeOut: Math.round(opts.fadeOut ?? 0), Duration: Math.max(20, Math.round(opts.stepMs)) }),
      textEl("Direction", opts.direction ?? "Forward"),
      textEl("RunOrder", opts.order ?? "Loop"),
      textEl("Algorithm", opts.algorithm, { Type: "Script" }),
      ...opts.colors.map((c, i) => textEl("Color", String((0xff000000 | (clamp(c[0]) << 16) | (clamp(c[1]) << 8) | clamp(c[2])) >>> 0), { Index: i })),
      textEl("ControlMode", "RGB"),
      textEl("FixtureGroup", opts.group),
      ...Object.entries(opts.props ?? {}).map(([k, v]) => el("Property", { Name: k, Value: v })),
    ];
    return this.fn("RGBMatrix", name, path, kids, opts.blend ? { BlendMode: opts.blend } : {});
  }

  chaser(name: string, path: string, steps: Step[], order: "Loop" | "SingleShot" | "PingPong" = "Loop"): number {
    const kids: XmlElement[] = [
      el("Speed", { FadeIn: 0, FadeOut: 0, Duration: 0 }),
      textEl("Direction", "Forward"),
      textEl("RunOrder", order),
      el("SpeedModes", { FadeIn: "PerStep", FadeOut: "PerStep", Duration: "PerStep" }),
      ...steps.map((s, n) =>
        textEl("Step", s.id, { Number: n, FadeIn: Math.round(s.fadeIn ?? 0), Hold: Math.round(s.hold), FadeOut: Math.round(s.fadeOut ?? 0) }),
      ),
    ];
    return this.fn("Chaser", name, path, kids);
  }

  collection(name: string, path: string, ids: number[]): number {
    return this.fn("Collection", name, path, ids.map((id, n) => textEl("Step", id, { Number: n })));
  }

  efx(name: string, path: string, opts: { algorithm: string; movers: RigFixture[]; width: number; height: number; x: number; y: number; durationMs: number; propagation?: string; rotation?: number; fan?: number }): number {
    const kids: XmlElement[] = [];
    for (const [i, m] of opts.movers.entries()) {
      kids.push(
        el("Fixture", {}, [
          textEl("ID", m.fixtureId),
          textEl("Head", 0),
          textEl("Mode", 0),
          textEl("Direction", m.reverse ? "Backward" : "Forward"),
          // A fan: each head starts that many degrees further round the shape.
          textEl("StartOffset", opts.fan ? Math.round((i * opts.fan) % 360) : 0),
        ]),
      );
    }
    kids.push(
      textEl("PropagationMode", opts.propagation ?? "Parallel"),
      el("Speed", { FadeIn: 0, FadeOut: 0, Duration: Math.round(opts.durationMs) }),
      textEl("Direction", "Forward"),
      textEl("RunOrder", "Loop"),
      textEl("Algorithm", opts.algorithm),
      textEl("Width", opts.width),
      textEl("Height", opts.height),
      textEl("Rotation", opts.rotation ?? 0),
      textEl("StartOffset", 0),
      textEl("IsRelative", 0),
      el("Axis", { Name: "X" }, [textEl("Offset", opts.x), textEl("Frequency", 2), textEl("Phase", 90)]),
      el("Axis", { Name: "Y" }, [textEl("Offset", opts.y), textEl("Frequency", 3), textEl("Phase", 0)]),
    );
    return this.fn("EFX", name, path, kids);
  }
}

export interface GenerateInput {
  ws: Workspace;
  profiles: Map<number, FixtureProfile>;
  rig: Rig;
  song: Song;
  /** The project's sequences, for sections that use them. */
  sequences?: Sequence[];
  /** Add the song's own frame of buttons (default). The whole set puts its buttons in one frame instead. */
  buttons?: boolean;
  /** MIDI devices and triggers, written into the buttons as QLC+ external inputs. */
  control?: ShowControl;
  /**
   * The songs played around this one (the whole set). An extra channel set in
   * any of them is put back to rest in every section that doesn't set it, so
   * it doesn't carry on into the next section or song. Defaults to this song.
   */
  neighbours?: Song[];
}

export interface GenerateSummary {
  sections: number;
  functions: number;
  removedPrevious: number;
  buttonsFrame: string;
  /** Where the button frame was put, in words: "inside “CV Console” on the page “CV Show”". */
  buttonsWhere: string;
  songChaserId: number;
  /** The Collection for each section, in order. */
  sectionIds: number[];
  /**
   * What each section's button starts: its Collection, or, when it's linked to
   * the sections after it, a chaser that plays it and goes straight into them.
   */
  startIds: number[];
  /** Triggers that couldn't be written, or clash. */
  controlNotes: string[];
}

function safeName(s: string): string {
  return s.replace(/[/\\]/g, "-").trim() || "Untitled";
}

/** The function folder a song's generated content lives in. */
export function songPathFor(title: string): string {
  return `${PATH_ROOT}/${safeName(title)}`;
}

/** Mutates `ws` (merging the song into it) and returns a summary. */
export function generateSong({ ws, profiles, rig, song, sequences = [], buttons = true, control, neighbours }: GenerateInput): GenerateSummary {
  const title = safeName(song.title);
  const songPath = songPathFor(song.title);
  const frameCaption = `${title} (${APP_NAME})`;
  const engine = ws.engine;

  // 0. Lights moved in Lightsmith: move them in QLC+'s 3D view too.
  // QLC+ places a fixture by its corner, Lightsmith by its middle.
  const stage = ws.stage;
  if (stage)
    writePlaces(
      ws,
      new Map(
        rig.fixtures
          .filter((f) => f.moved && f.pos)
          .map((f) => {
            const p = profiles.get(f.fixtureId);
            return [f.fixtureId, { ...cornerOf(f, p, stage), upright: f.upright, facesBack: p?.isMover ? !!f.facesBack : undefined }];
          }),
      ),
    );

  // 1. Remove what a previous export of this song created.
  let removed = removeWhere(engine, (e) => {
    if (e.name !== "Function") return false;
    const p = getAttr(e, "Path") ?? "";
    return p === songPath || p.startsWith(songPath + "/");
  });
  // Remember where the previous button frame was, so a re-export (or a frame
  // the user moved in QLC+) stays put.
  let previousSpot: { parent: XmlElement; x: number; y: number } | undefined;
  if (ws.virtualConsole) {
    const find = (parent: XmlElement): void => {
      for (const c of childElements(parent)) {
        if ((c.name === "Frame" || c.name === "SoloFrame") && getAttr(c, "Caption") === frameCaption) {
          const st = firstChild(c, "WindowState");
          if (!previousSpot) previousSpot = { parent, x: Number(getAttr(st!, "X") ?? 15), y: Number(getAttr(st!, "Y") ?? 15) };
        } else find(c);
      }
    };
    find(ws.virtualConsole);
    removed += removeWhere(ws.virtualConsole, (e) => (e.name === "Frame" || e.name === "SoloFrame") && getAttr(e, "Caption") === frameCaption);
  }

  const usable = (r: RigFixture) => profiles.has(r.fixtureId);
  const backdrop = fixturesWithRole(rig, "backdrop").filter(usable);
  const sides = fixturesWithRole(rig, "side").filter(usable);
  const fronts = fixturesWithRole(rig, "front").filter(usable);
  const movers = fixturesWithRole(rig, "mover").filter(usable);
  const prof = (r: RigFixture) => profiles.get(r.fixtureId)!;

  // 2. Fixture groups for RGB matrices: "Lightsmith Backdrop", plus one per
  //    other set of lights an effect is aimed at. Rebuilt on each export.
  const fixtureName = new Map(ws.fixtures.map((f) => [f.id, f.name]));
  const groupCache = new Map<string, number>();
  const ensureGroup = (name: string, rs: RigFixture[]): number => {
    const cached = groupCache.get(name);
    if (cached !== undefined) return cached;
    const existing = childElements(engine, "FixtureGroup").find((g) => textOf(firstChild(g, "Name")).trim() === name);
    const id = existing ? Number(getAttr(existing, "ID")) : nextGroupId(engine);
    const maxHeads = Math.max(1, ...rs.map((r) => prof(r).heads.filter((h) => h.red !== undefined).length));
    const heads: XmlElement[] = [];
    rs.forEach((r, x) => {
      const rgbHeads = prof(r).heads.map((h, i) => ({ h, i })).filter(({ h }) => h.red !== undefined);
      rgbHeads.forEach(({ i }, y) => heads.push(textEl("Head", i, { X: x, Y: y, Fixture: r.fixtureId })));
    });
    const group = el("FixtureGroup", { ID: id }, [textEl("Name", name), el("Size", { X: rs.length, Y: maxHeads }), ...heads]);
    if (existing) existing.children = group.children;
    else insertChildren(engine, [group], ["FixtureGroup", "Fixture"]);
    groupCache.set(name, id);
    return id;
  };
  const idsKey = (rs: RigFixture[]) => rs.map((r) => r.fixtureId).sort((a, b) => a - b).join(",");
  const rgbBackdrop = backdrop.filter((r) => prof(r).hasRgb);
  const backdropGroup = rgbBackdrop.length ? ensureGroup("Lightsmith Backdrop", rgbBackdrop) : undefined;
  /** A matrix group for any set of lights (only those with RGB can show a matrix). */
  const groupFor = (rs: RigFixture[]): number | undefined => {
    const rgb = rs.filter((r) => prof(r).hasRgb);
    if (!rgb.length) return undefined;
    if (backdropGroup !== undefined && idsKey(rgb) === idsKey(rgbBackdrop)) return backdropGroup;
    return ensureGroup(`Lightsmith: ${rgb.map((r) => fixtureName.get(r.fixtureId) ?? `Fixture ${r.fixtureId}`).join(" + ")}`, rgb);
  };
  const usedLights = rig.fixtures.filter((r) => r.role !== "ignore" && usable(r));
  const targetsFor = (s: Song["sections"][number], e: EffectId): RigFixture[] => {
    const ids = new Set(effectTargets(s, e, rig));
    return usedLights.filter((r) => ids.has(r.fixtureId)).sort(stageOrder);
  };

  const b = new Builder(nextFunctionId(engine));
  const sharedPath = `${songPath}/Shared`;

  // Shared: a blank spacer and lightning strikes (created on first use).
  let blankId: number | undefined;
  const blank = () => (blankId ??= b.scene("Blank (spacer)", sharedPath, new Map()));
  const flash = (rs: RigFixture[], color: RGB) => {
    const v: Vals = new Map();
    for (const r of rs) {
      const p = prof(r);
      const sc = fixtureLevel(v, r.fixtureId, p, 1);
      for (const h of p.heads) headColor(v, r.fixtureId, h, color, sc);
    }
    return v;
  };
  // Lightning strikes, blinder flashes and beat pulses are shared by every
  // section that aims them at the same lights.
  const strikeCache = new Map<string, { id: number; ms: number }>();
  const strikes = (targets: RigFixture[]) => {
    const key = idsKey(targets);
    const hit = strikeCache.get(key);
    if (hit) return hit;
    const n = strikeCache.size + 1;
    const lp = `${sharedPath}/Lightning${n > 1 ? ` ${n}` : ""}`;
    const all = b.scene("Strike all", lp, flash(targets, WHITE));
    const still = targets.filter((r) => r.role !== "mover");
    const moving = targets.filter((r) => r.role === "mover");
    const each = still.map((r, i) => b.scene(`Strike ${i + 1}`, lp, flash([r], WHITE)));
    const moverFlash = moving.length ? b.scene("Strike movers", lp, flash(moving, WHITE)) : all;
    const pick = (i: number) => (each.length ? each[i % each.length]! : all);
    const pattern: Step[] = [
      { id: all, hold: 200 }, { id: blank(), hold: 60 }, { id: pick(0), hold: 100 }, { id: pick(2), hold: 80 },
      { id: moverFlash, hold: 120 }, { id: pick(1), hold: 100 }, { id: pick(3), hold: 80 }, { id: blank(), hold: 40 },
      { id: all, hold: 150 }, { id: blank(), hold: 80 }, { id: pick(4), fadeIn: 80, hold: 80 }, { id: pick(1), fadeIn: 80, hold: 80 },
      { id: pick(5), hold: 30 }, { id: all, hold: 60 }, { id: moverFlash, fadeIn: 40, hold: 40 }, { id: blank(), hold: 40 },
      { id: pick(2), hold: 100 }, { id: pick(0), hold: 80 }, { id: all, hold: 120, fadeOut: 1500 },
    ];
    const result = { id: b.chaser("Lightning strikes", lp, pattern, "SingleShot"), ms: pattern.reduce((t, s) => t + (s.fadeIn ?? 0) + s.hold, 0) + 1600 };
    strikeCache.set(key, result);
    return result;
  };
  // Sequences: one scene per distinct look (lights, color, brightness),
  // shared by every step and section that uses it.
  const seqLooks = new Map<string, number>();
  const seqLook = (q: Sequence, st: SequenceStep): number => {
    const rs = st.lights.map((id) => rig.fixtures.find((f) => f.fixtureId === id)).filter((r): r is RigFixture => !!r && profiles.has(r.fixtureId));
    if (!rs.length) return blank();
    const level = Math.max(0, Math.min(1, st.level ?? 1));
    const colorOf = (r: RigFixture) => stepLightColor(st, r.fixtureId);
    const key = `${rs.map((r) => `${r.fixtureId}:${colorOf(r)}`).sort().join(",")}|${level.toFixed(3)}`;
    const hit = seqLooks.get(key);
    if (hit !== undefined) return hit;
    const v: Vals = new Map();
    for (const r of rs) {
      const p = prof(r);
      const c = colorOf(r);
      const rgb = c === "white" ? WHITE : colorById(c).rgb;
      const sc = fixtureLevel(v, r.fixtureId, p, level);
      for (const h of p.heads) headColor(v, r.fixtureId, h, rgb, sc);
    }
    const id = b.scene(`${safeName(q.name)} look ${seqLooks.size + 1}`, `${sharedPath}/Sequences`, v);
    seqLooks.set(key, id);
    return id;
  };
  const RUN: Record<SequenceOrder, "SingleShot" | "Loop" | "PingPong"> = { once: "SingleShot", loop: "Loop", bounce: "PingPong" };
  /** A section's sequence as a chaser, started after its delay. */
  const sequenceChaser = (q: Sequence, delaySec: number, bpm: number, path: string): number | undefined => {
    if (!q.steps.length) return undefined;
    const ms = (v: number) => Math.round(toMs(v, q.units, bpm));
    const steps: Step[] = q.steps.map((st) => ({ id: seqLook(q, st), fadeIn: ms(st.fadeIn), hold: Math.max(1, ms(st.hold)), fadeOut: ms(st.fadeOut) }));
    const name = `Sequence: ${safeName(q.name)}`;
    const delay = Math.round(Math.max(0, delaySec) * 1000);
    if (q.order === "once") return b.chaser(name, path, delay > 0 ? [{ id: blank(), hold: delay }, ...steps] : steps, "SingleShot");
    // A looping sequence can't hold its own delay (it would repeat); wait in an outer chaser instead.
    const inner = b.chaser(name, path, steps, RUN[q.order]);
    return delay > 0 ? b.chaser(`${name} (after ${delaySec}s)`, path, [{ id: blank(), hold: delay }, { id: inner, hold: INFINITE }], "SingleShot") : inner;
  };

  const sceneCache = new Map<string, number>();
  const sharedScene = (name: string, targets: RigFixture[], color: RGB) => {
    const key = `${name}|${idsKey(targets)}`;
    const hit = sceneCache.get(key);
    if (hit !== undefined) return hit;
    const id = b.scene(name, sharedPath, flash(targets, color));
    sceneCache.set(key, id);
    return id;
  };

  // Beam settings are left alone unless some section in the song sets them;
  // then every other section puts them back (zoom to the middle, strobe off,
  // gobo open, prism out), so one section's setting doesn't carry on.
  const uses = {
    zoom: song.sections.some((x) => x.beam?.zoom !== undefined),
    strobe: song.sections.some((x) => !!x.beam?.strobe),
    gobo: song.sections.some((x) => !!x.beam?.gobo),
    prism: song.sections.some((x) => !!x.beam?.prism),
  };
  // Extra channels set anywhere in the set, each with its resting value.
  const extrasInUse = new Map<number, Map<number, number>>();
  for (const x of neighbours ?? [song])
    for (const sec of x.sections)
      for (const [fid, chans] of Object.entries(sec.extras ?? {})) {
        const id = Number(fid);
        const p = rig.fixtures.some((f) => f.fixtureId === id) ? profiles.get(id) : undefined;
        if (!p) continue;
        const extras = extraChannels(p);
        for (const ch of Object.keys(chans).map(Number)) {
          const c = extras.find((e) => e.channel === ch);
          if (!c) continue;
          let m = extrasInUse.get(id);
          if (!m) extrasInUse.set(id, (m = new Map()));
          m.set(ch, restingValue(c));
        }
      }
  const STROBE_AT = { slow: 0.15, medium: 0.5, fast: 0.9 };
  const beamValues = (v: Vals, id: number, p: FixtureProfile, beam: BeamSettings) => {
    if (p.zoom && (beam.zoom !== undefined || uses.zoom)) {
      const z = Math.max(0, Math.min(1, beam.zoom ?? 0.5));
      setVal(v, id, p.zoom.channel, Math.round((p.zoom.wideIsLow ? 1 - z : z) * 255));
    }
    const sr = strobeRange(p);
    if (sr && beam.strobe) {
      const f = sr.fastFirst ? 1 - STROBE_AT[beam.strobe] : STROBE_AT[beam.strobe];
      setVal(v, id, sr.channel, Math.round(sr.min + f * (sr.max - sr.min)));
    } else if (sr && uses.strobe) {
      const off = strobeOffValue(p, sr.channel);
      if (off !== undefined) setVal(v, id, sr.channel, off);
    }
    if (p.gobo && (beam.gobo || uses.gobo)) {
      const cap = (beam.gobo ? capabilityNamed(p.gobo.capabilities, beam.gobo) : undefined) ?? openGobo(p.gobo.capabilities);
      if (cap) setVal(v, id, p.gobo.channel, Math.round((cap.min + cap.max) / 2));
    }
    if (p.prism && (beam.prism || uses.prism)) {
      const cap = prismRange(p.prism.capabilities, !!beam.prism);
      if (cap) setVal(v, id, p.prism.channel, Math.round((cap.min + cap.max) / 2));
    }
  };

  const sectionIds: number[] = [];
  song.sections.forEach((s, idx) => {
    const label = `${idx + 1}. ${safeName(s.name)}`;
    const path = `${songPath}/${label}`;
    // A blackout is just an empty look: starting it stops the section before
    // (in the solo frame and the song cue list), so every light goes out.
    if (isBlackout(s)) {
      sectionIds.push(b.collection(label, path, [blank()]));
      return;
    }
    // Going into a blackout: cut (no fade-out) or fade to black over one of its bars.
    const next = song.sections[idx + 1];
    const toBlack = next && isBlackout(next) ? (next.transition === "snap" ? 0 : (60000 / next.bpm) * next.beatsPerBar) : undefined;
    const mood = moodById(s.mood);
    const paletteIds = s.colors.length ? s.colors : mood.colors;
    const levels = lightLevels(s);
    const beat = 60000 / s.bpm;
    const bar = beat * s.beatsPerBar;
    const fade = fadeInMs(s);
    const pattern = patternById(s.pattern === "mood" ? mood.pattern : s.pattern);
    const moveId = s.movement === "mood" ? mood.movement : s.movement;
    const mv = MOVEMENTS.find((m) => m.id === moveId) ?? MOVEMENTS[0]!;
    const parts: number[] = [];

    // Focus: these lights go warm white at full; the other side and floor lights dim.
    const focusSet = new Set(s.focus === "all" ? [] : focusLights({ fixtures: usedLights }, s.focus));
    const focusing = focusSet.size > 0;
    const layout = colorLayoutOf(s);
    const rgbOf = (c: string): RGB => colorById(c).rgb;
    /** A light's own settings: its color, brightness and whether it's off. */
    const own = (r: RigFixture) => {
      const l = lightSetting(s, r.fixtureId);
      return { color: l?.color !== undefined ? colorById(l.color).rgb : undefined, level: l?.level, off: !!l?.off };
    };
    const BLACK: RGB = [0, 0, 0];
    const patternLights = (() => {
      const ids = new Set(patternTargets(s, rig));
      return usedLights.filter((r) => ids.has(r.fixtureId)).sort(stageOrder);
    })();
    const patternGroup = pattern.algorithm ? groupFor(patternLights) : undefined;

    /** Everything that depends on color, for one arrangement of the palette. */
    const look = (step: number, tag: string, withFades: boolean, jobs: Set<ColorJob> = new Set(COLOR_JOBS)): number[] => {
      /** The color for the k-th light (stage left first) of a kind, at this color step. */
      const colorFor = (job: ColorJob, k: number, mixOffset: number): RGB => rgbOf(jobColorAt(s, layout, paletteIds, job, k, step, mixOffset));
      // The backdrop's own colors, moved on by this step when it switches.
      const bset = (() => {
        const set = jobPalette(layout.backdrop, paletteIds);
        return set === "white" ? [WARM_WHITE] : set.map(rgbOf);
      })();
      const bn = bset.length;
      const br = switchesColors(s, "backdrop") ? step : 0;
      const pal = bset.map((_, i) => bset[(i + br) % bn]!);
      const out: number[] = [];
      const named = (n: string) => (tag ? `${n} ${tag}` : n);
      const fi = withFades ? fade : 0;
      const fo = toBlack ?? (withFades ? beat : 0);
      const p0 = pal[0]!;
      // The pattern's color: with several backdrop colors, the second over the
      // others; with one color (or warm white), the pattern is that color too.
      const main = p0;
      const accent = pal[1] ?? p0;

      if (backdrop.length && jobs.has("backdrop")) {
        const v: Vals = new Map();
        // With "mix", spread the palette across the bars, keeping the pattern's color for the pattern.
        const under = pal.length > 2 ? pal.filter((_, k) => k !== 1) : [p0];
        backdrop.forEach((r, i) => {
          const p = prof(r);
          const o = own(r);
          const sc = fixtureLevel(v, r.fixtureId, p, o.off ? 0 : (o.level ?? levels.backdrop.level));
          const auto = pattern.id === "solid" ? pal[i % pal.length]! : under[i % under.length]!;
          const color = o.off ? BLACK : (o.color ?? auto);
          // Bars the pattern runs on sit at the pattern's base level; others show a steady wash.
          const underPattern = patternGroup !== undefined && patternLights.some((x) => x.fixtureId === r.fixtureId);
          for (const h of p.heads) headColor(v, r.fixtureId, h, color, (underPattern ? pattern.floor : 1) * sc);
          if (focusSet.has(r.fixtureId) && !o.off) for (const h of p.heads) if (h.white !== undefined) setVal(v, r.fixtureId, h.white, 80);
        });
        out.push(b.scene(named("Backdrop base"), path, v, fi, fo));
      }
      if (patternGroup !== undefined && pattern.algorithm && jobs.has("backdrop")) {
        const single = pattern.whiten ? mix(pattern.floor > 0 ? accent : main, WHITE, pattern.whiten) : pattern.floor > 0 ? accent : main;
        const colors = pattern.colors === 0 ? [] : pattern.colors === 1 ? [single] : pattern.colors === 2 ? [main, accent] : pal.slice(0, 5);
        const stepMs = (pattern.stepMs ?? (pattern.stepBeats ?? 0.25) * beat) / patternSpeedOf(s);
        out.push(b.matrix(named(`Pattern: ${pattern.label.toLowerCase()}`), path, { algorithm: pattern.algorithm, colors, stepMs, group: patternGroup, direction: pattern.direction, order: pattern.order, props: pattern.props, fadeOut: toBlack }));
      }

      /** Side and front lights; `hot` is the side that's bright in a side-to-side swap. */
      const floorLook = (rs: RigFixture[], job: ColorJob, hot: "SL" | "SR" | null): Vals => {
        const v: Vals = new Map();
        for (const [k, r] of rs.entries()) {
          const p = prof(r);
          const o = own(r);
          const focused = focusSet.has(r.fixtureId);
          const isHot = hot === null || r.side === hot || r.side === "C";
          const base = levels[job].level;
          // Focus: the spotlight lights go warm white at full, even with their own
          // settings; every other light dims to half. Only "Off" wins over Focus.
          const lv = o.off ? 0 : focused ? 1 : (o.level ?? (isHot ? base : base * 0.35)) * (focusing ? FOCUS_DIM : 1);
          const sc = fixtureLevel(v, r.fixtureId, p, lv);
          // A side-to-side swap changes brightness only; each light keeps its color.
          const color = o.off ? BLACK : focused ? WARM_WHITE : (o.color ?? colorFor(job, k, 0));
          for (const h of p.heads) {
            const whiteOnly = h.red === undefined && h.white !== undefined;
            if (whiteOnly) setVal(v, r.fixtureId, h.white, o.off ? 0 : focused ? 255 : o.color || o.level !== undefined ? 255 * lv : 0);
            else headColor(v, r.fixtureId, h, color, sc);
          }
        }
        return v;
      };
      if (sides.length && jobs.has("side")) {
        if (focusing || mood.side === "static") {
          out.push(b.scene(named("Side lights"), path, floorLook(sides, "side", null), fi, fo));
        } else {
          const swap = mood.side === "swapBeat" ? beat : bar;
          const a = b.scene(named("Side lights A"), path, floorLook(sides, "side", "SL"));
          const c = b.scene(named("Side lights B"), path, floorLook(sides, "side", "SR"));
          const sf = mood.side === "swapBar" ? Math.min(300, swap / 4) : 0;
          out.push(b.chaser(named("Side lights swap"), path, [{ id: a, fadeIn: sf, hold: swap - sf }, { id: c, fadeIn: sf, hold: swap - sf }]));
        }
      }
      if (fronts.length && jobs.has("front")) out.push(b.scene(named("Front light"), path, floorLook(fronts, "front", null), fi, fo));
      if (movers.length && jobs.has("mover")) {
        const v: Vals = new Map();
        // Where the heads point goes in its own scene with no fade, at full
        // pan/tilt speed: a scene's fade (or a slow motor) would make the heads
        // crawl into position instead of being there when the section starts.
        const aimVals: Vals = new Map();
        for (const [k, r] of movers.entries()) {
          const p = prof(r);
          const o = own(r);
          const focused = focusSet.has(r.fixtureId);
          const sc = fixtureLevel(v, r.fixtureId, p, o.off ? 0 : focused ? 1 : (o.level ?? levels.mover.level) * (focusing ? FOCUS_DIM : 1));
          for (const h of p.heads) headColor(v, r.fixtureId, h, o.off ? BLACK : focused ? WARM_WHITE : (o.color ?? colorFor("mover", k, 1)), sc);
          if (p.ptSpeed) setVal(aimVals, r.fixtureId, p.ptSpeed.channel, p.ptSpeed.fastIsLow ? 0 : 255);
          if (!o.off) beamValues(v, r.fixtureId, p, s.beam ?? {});
          if (!mv.algorithm) {
            const home = aimOf(s, rig, r);
            setVal(aimVals, r.fixtureId, p.pan, home.pan);
            setVal(aimVals, r.fixtureId, p.panFine, 0);
            setVal(aimVals, r.fixtureId, p.tilt, home.tilt);
            setVal(aimVals, r.fixtureId, p.tiltFine, 0);
          }
        }
        out.push(b.scene(named("Movers color"), path, v, fi, fo));
        if (aimVals.size) out.push(b.scene(named(mv.algorithm ? "Movers speed" : "Movers position"), path, aimVals, 0, 0));
      }
      return out;
    };

    // Color changes: kinds of light that switch at the same rate share a
    // chaser of color looks; each other rate gets its own; the rest are steady.
    const byRate = new Map<number, ColorJob[]>();
    const steady = new Set<ColorJob>();
    for (const j of COLOR_JOBS) {
      const ms = ratePeriodMs(colorRateOf(s, j), s.bpm, s.beatsPerBar);
      if (ms > 0 && stepsFor(s, paletteIds, [j]) > 1) byRate.set(ms, [...(byRate.get(ms) ?? []), j]);
      else steady.add(j);
    }
    if (steady.size) parts.push(...look(0, "", true, steady));
    const rateTag = (jobs: ColorJob[]) => (byRate.size > 1 ? ` (${jobs.map((j) => JOB_NAME[j]).join(", ")})` : "");
    for (const [ms, jobs] of byRate) {
      const set = new Set(jobs);
      const steps = stepsFor(s, paletteIds, jobs);
      const tag = rateTag(jobs);
      const looks = Array.from({ length: steps }, (_, k) => b.collection(`Colors ${k + 1}${tag}`, path, look(k, `(colors ${k + 1})${tag}`, false, set)));
      const cf = s.colorFade ? Math.min(ms / 2, 1500) : 0;
      parts.push(b.chaser(`Color changes${tag}`, path, looks.map((id) => ({ id, fadeIn: cf, hold: ms - cf }))));
    }

    // ---- movement
    if (movers.length && mv.algorithm) {
      const spread = SPREADS.find((x) => x.id === s.moverSpread) ?? SPREADS[0]!;
      const byHome = new Map<string, RigFixture[]>();
      for (const r of movers) {
        const h = aimOf(s, rig, r);
        // Heads with different ranges need different sizes for the same sweep.
        const k = `${h.pan},${h.tilt},${r.panRange ?? ""},${r.tiltRange ?? ""}`;
        byHome.set(k, [...(byHome.get(k) ?? []), r]);
      }
      // A fan in degrees (Pro) replaces QLC+'s own even spread.
      const fan = s.moverSpread === "offset" && s.moverShape?.fan ? s.moverShape.fan : 0;
      for (const [k, rs] of byHome) {
        const [pan, tilt] = k.split(",").map(Number) as [number, number];
        const at = moverShapeAt(s.moverShape, mv, { pan, tilt }, rs[0]);
        parts.push(
          b.efx(`Movers ${mv.label.toLowerCase()}`, path, {
            algorithm: mv.algorithm,
            movers: rs,
            width: at.width,
            height: at.height,
            x: at.x,
            y: at.y,
            rotation: at.rotation,
            fan,
            durationMs: moverTiming(s, mv, rig).beats * beat,
            propagation: fan ? "Parallel" : spread.propagation,
          }),
        );
      }
    }

    // ---- effects layered on top, each on its chosen lights
    // Matrix effects blend additively, so they sit on top of the pattern.
    const matrixOn = (e: EffectId) => (s.effects[e] ? groupFor(targetsFor(s, e)) : undefined);
    const sparkleGroup = matrixOn("sparkle");
    if (sparkleGroup !== undefined) parts.push(b.matrix("Sparkle", path, { algorithm: "Random Single", colors: [WHITE], stepMs: beat / 8, group: sparkleGroup, blend: "Additive" }));
    const strobeGroup = matrixOn("strobe");
    if (strobeGroup !== undefined) parts.push(b.matrix("Strobe hits", path, { algorithm: "Strobe", colors: [WHITE], stepMs: beat / 4, group: strobeGroup, props: { frequency: 2 }, blend: "Additive" }));
    if (s.effects.blinder) {
      const t = targetsFor(s, "blinder");
      if (t.length) parts.push(b.chaser("Blinder hit", path, [{ id: sharedScene("Blinder flash", t, WHITE), hold: beat, fadeOut: 1500 }, { id: blank(), hold: 1500 }], "SingleShot"));
    }
    if (s.effects.beatPulse) {
      const t = targetsFor(s, "beatPulse");
      if (t.length) parts.push(b.chaser("Beat pulse", path, [{ id: sharedScene("Beat pulse", t, WARM_WHITE), hold: beat * 0.2, fadeOut: beat * 0.5 }, { id: blank(), hold: beat * 0.8 }]));
    }
    if (s.effects.lightning) {
      const t = targetsFor(s, "lightning");
      if (t.length) {
        const delay = Math.max(0, (s.effects.lightningDelaySec ?? 0) * 1000);
        const st = strikes(t);
        parts.push(b.chaser("Lightning", path, delay > 0 ? [{ id: blank(), hold: delay }, { id: st.id, hold: st.ms }] : [{ id: st.id, hold: st.ms }], "SingleShot"));
      }
    }

    // Sequences the user built (or imported), each started after its delay.
    for (const use of s.sequences ?? []) {
      const q = sequences.find((x) => x.id === use.id);
      const id = q ? sequenceChaser(q, use.delay, s.bpm, path) : undefined;
      if (id !== undefined) parts.push(id);
    }
    // Channels set by hand (a ring, extra LEDs, a built-in effect): their own
    // scene, with no fade, so an effect number jumps straight to the one asked
    // for instead of sweeping through the others on the way.
    // Extra channels are held by QLC+ at their last value (like the strobe), so
    // a section that doesn't set one that's used elsewhere puts it back to rest.
    const extraVals: Vals = new Map();
    for (const [id, chans] of extrasInUse) {
      const own = s.extras?.[id] ?? {};
      for (const [ch, rest] of chans) {
        const val = own[ch];
        setVal(extraVals, id, ch, val !== undefined && Number.isFinite(val) ? val : rest);
      }
    }
    if (extraVals.size) parts.push(b.scene("Extra channels", path, extraVals, 0, 0));
    sectionIds.push(b.collection(label, path, parts));
  });

  // Linked sections: a section set to go straight into the next one plays it,
  // and so on down the chain, from a single cue. Each button starts a chaser
  // from its own section to the end of its chain, so jumping in partway works
  // too; the chain's last section holds until the next cue.
  const startIds = song.sections.map((s, i) => {
    let end = i;
    while (song.sections[end]?.autoAdvance && end + 1 < song.sections.length) end++;
    if (end === i) return sectionIds[i]!;
    const chain = song.sections.slice(i, end + 1);
    const steps = chain.map((c, k) => ({ id: sectionIds[i + k]!, hold: k < chain.length - 1 ? Math.max(1, Math.round(sectionMs(c))) : INFINITE }));
    return b.chaser(`${i + 1}. ${safeName(s.name)} → ${end + 1}. ${safeName(chain.at(-1)!.name)}`, `${songPath}/Linked`, steps, "SingleShot");
  });

  const songChaserId = b.chaser(
    `${title} — song cues`,
    songPath,
    song.sections.map((s, i) => ({ id: sectionIds[i]!, hold: s.autoAdvance ? sectionMs(s) : INFINITE })),
    "SingleShot",
  );

  // 3. Write functions into the workspace.
  insertChildren(engine, b.functions, ["Function"], ["Monitor"]);

  // Tidy up effect groups that no matrix uses any more.
  const usedGroups = new Set(
    childElements(engine, "Function")
      .filter((f) => getAttr(f, "Type") === "RGBMatrix")
      .map((f) => Number(textOf(firstChild(f, "FixtureGroup")))),
  );
  removed += removeWhere(engine, (e) => e.name === "FixtureGroup" && textOf(firstChild(e, "Name")).trim().startsWith("Lightsmith: ") && !usedGroups.has(Number(getAttr(e, "ID"))));

  if (!buttons) return { sections: song.sections.length, functions: b.functions.length, removedPrevious: removed, buttonsFrame: "", buttonsWhere: "", songChaserId, sectionIds, startIds, controlNotes: [] };
  const inputs = new ControlInputs(ws, control);

  // 4. Virtual Console: a solo frame with one button per section.
  let vc = ws.virtualConsole;
  if (!vc) {
    vc = el("VirtualConsole", {}, []);
    ws.doc.root.children.push(vc);
    ws.virtualConsole = vc;
  }
  let page = childElements(vc, "Frame")[0];
  if (!page) {
    page = el("Frame", { Caption: "", ID: nextWidgetId(vc) }, [el("WindowState", { Visible: "True", X: 0, Y: 0, Width: 1920, Height: 1080 })]);
    vc.children.push(page);
  }
  let wid = nextWidgetId(vc);
  const perRow = 10;
  const size = 80;
  const stepPx = 90;
  const step = control?.cueing === "step";
  const rows = step ? 3 : Math.ceil(song.sections.length / perRow);
  const width = step ? 580 : Math.min(song.sections.length, perRow) * stepPx + 20;
  const height = rows * stepPx + 46;
  const spot = placeFrame(page, width, height, previousSpot);
  const frame = el("SoloFrame", { Caption: frameCaption, ID: wid++ }, [
    el("WindowState", { Visible: "True", X: spot.x, Y: spot.y, Width: width, Height: height }),
    textEl("AllowResize", "True"),
    textEl("ShowHeader", "True"),
    textEl("ShowEnableButton", "True"),
    textEl("Collapsed", "False"),
    textEl("Disabled", "False"),
  ]);
  const extraNotes: string[] = [];
  if (step) {
    const cues = stepCuesFor(control, song);
    frame.children.push(
      cueListWidget(wid++, `${title}: cues`, songChaserId, { Visible: "True", X: 10, Y: 40, Width: width - 20, Height: rows * stepPx - 10 }, undefined, inputs.many(cues, `${song.title}: next section`, song.title), inputs.many(control?.previousSection ? [control.previousSection] : [], `${song.title}: previous section`, song.title)),
    );
    extraNotes.push(...oneInputNote(ws, cues, control, `“${song.title}”`));
  } else
    song.sections.forEach((s, i) => {
      frame.children.push(
        el("Button", { Caption: `${i + 1}. ${s.name}`, ID: wid++ }, [
          el("WindowState", { Visible: "True", X: 10 + (i % perRow) * stepPx, Y: 40 + Math.floor(i / perRow) * stepPx, Width: size, Height: size }),
          el("Function", { ID: startIds[i]! }),
          textEl("Action", "Toggle"),
          ...inputs.button(triggerFor(control, s, i), `${song.title}: ${s.name}`, song.title),
        ]),
      );
    });
  spot.parent.children.push(frame);

  return { sections: song.sections.length, functions: b.functions.length, removedPrevious: removed, buttonsFrame: frameCaption, buttonsWhere: spot.where, songChaserId, sectionIds, startIds, controlNotes: [...inputs.finish(), ...extraNotes] };
}

/**
 * Step cueing: a song as a QLC+ Cue List on its chaser of sections. Any of
 * the song's cues moves it on one section (a linked section moves on by
 * itself, after its length); Previous steps back. "Run next" means that
 * after the Safe look (which stops the list), the next cue carries on from
 * where the song was rather than starting it again.
 */
function cueListWidget(id: number, caption: string, chaserId: number, box: { X: number; Y: number; Width: number; Height: number; Visible: string }, page: number | undefined, next: XmlElement[], previous: XmlElement[]): XmlElement {
  return el("CueList", { Caption: caption, ID: id, ...(page ? { Page: page } : {}) }, [
    el("WindowState", box),
    textEl("Chaser", chaserId),
    textEl("NextPrevBehavior", 1),
    ...(next.length ? [el("Next", {}, next)] : []),
    ...(previous.length ? [el("Previous", {}, previous)] : []),
  ]);
}

/** A note for step cueing on a QLC+ 4 show file, which answers only one message per control. */
function oneInputNote(ws: Workspace, cues: Trigger[], control: ShowControl | undefined, where: string): string[] {
  const v = qlcMajorVersion(ws);
  if (v === undefined || v >= 5 || cues.length < 2 || !control) return [];
  const last = cues.at(-1)!;
  const dev = control.devices.find((d) => d.id === last.device)?.name ?? "a device";
  return [`${where} has ${cues.length} cue messages, but this show file was saved by QLC+ ${v}, which answers only one message per control: it will hear only ${dev} ${triggerLabel(last)}. Use QLC+ 5, or have every device also send one shared message and make that your only cue.`];
}

/**
 * Turns triggers into QLC+ external inputs, and keeps track of what's used
 * where so clashes can be pointed out. Each input it uses is set to listen the
 * way the project says (any channel, or the device's own).
 */
class ControlInputs {
  private notes: string[] = [];
  private used = new Map<string, Map<string, string>>(); // scope -> key -> what
  private universes = new Set<number>();
  constructor(
    private ws: Workspace,
    private control: ShowControl | undefined,
  ) {}
  private source(t: Trigger | undefined, what: string, scope: string): { Universe: number; Channel: number } | undefined {
    if (!t || !this.control) return undefined;
    const dev = this.control.devices.find((d) => d.id === t.device);
    if (!dev) {
      this.notes.push(`${what}: its device is gone, so it has no trigger.`);
      return undefined;
    }
    const key = `${dev.universe}/${dev.channel}/${t.kind}/${t.number}`;
    const seen = this.used.get(scope) ?? new Map<string, string>();
    const other = seen.get(key);
    if (other) this.notes.push(`${what} and ${other} both use ${dev.name} ${triggerLabel(t)}; only one can answer it.`);
    else seen.set(key, what);
    this.used.set(scope, seen);
    this.universes.add(dev.universe);
    return { Universe: dev.universe - 1, Channel: qlcInputChannel(t, dev, this.control.listen) };
  }
  /** The <Input> a button reads. */
  button(t: Trigger | undefined, what: string, scope: string): XmlElement[] {
    const src = this.source(t, what, scope);
    return src ? [el("Input", { ID: 0, ...src })] : [];
  }
  /** Several <Input>s for one control (QLC+ 5 answers each of them; QLC+ 4 only the last). */
  many(ts: Trigger[], what: string, scope: string): XmlElement[] {
    return ts.flatMap((t) => this.inner(t, what, scope));
  }
  /** An <Input> wrapped in a frame's own tag (Next, Previous, Shortcut). */
  inner(t: Trigger | undefined, what: string, scope: string): XmlElement[] {
    const src = this.source(t, what, scope);
    return src ? [el("Input", src)] : [];
  }
  finish(): string[] {
    for (const u of this.universes) {
      const ok = setMidiListen(this.ws, u, this.control?.listen === "own" ? (this.control.devices.find((d) => d.universe === u)?.channel ?? 1) : "any");
      if (!ok) this.notes.push(`Nothing MIDI is patched to Universe ${u} in QLC+ yet. Patch the device there in QLC+ (Inputs/Outputs), or pick its universe in Show control.`);
    }
    // Buttons you mapped yourself in QLC+ on an input that now listens to any
    // channel are read as MIDI channel 1 from now on.
    if (this.control?.listen !== "own" && this.ws.virtualConsole) {
      const yours: string[] = [];
      const walk = (e: XmlElement, ours: boolean) => {
        for (const c of childElements(e)) {
          const mine = ours || (getAttr(c, "Caption") ?? "").endsWith(`(${APP_NAME})`);
          const input = c.name !== "Input" ? childElements(c, "Input")[0] : undefined;
          if (!mine && input && this.universes.has(Number(getAttr(input, "Universe")) + 1) && Number(getAttr(input, "Channel")) < 4096) yours.push(getAttr(c, "Caption") ?? c.name);
          walk(c, mine);
        }
      };
      walk(this.ws.virtualConsole, false);
      if (yours.length)
        this.notes.push(
          `QLC+ will now listen to every MIDI channel on ${[...this.universes].map((u) => `Universe ${u}`).join(" and ")}. Widgets you mapped yourself there (${[...new Set(yours)].slice(0, 4).join(", ")}${yours.length > 4 ? " …" : ""}) keep working only if their device sends on MIDI channel 1; otherwise map them again in QLC+, or choose "each device's channel" in Show control.`,
        );
    }
    if (this.control?.listen === "own") {
      for (const u of this.universes) {
        const chs = new Set(this.control.devices.filter((d) => d.universe === u).map((d) => d.channel));
        if (chs.size > 1) this.notes.push(`Universe ${u} has devices on different MIDI channels, so QLC+ must listen to any channel. Choose "any channel" in Show control.`);
      }
    }
    return [...new Set(this.notes)];
  }
}

/** The Virtual Console frame that holds the whole set. */
export const SET_FRAME = `Set (${APP_NAME})`;

export interface SetSummary {
  songs: { title: string; sections: number; functions: number }[];
  functions: number;
  removedPrevious: number;
  buttonsFrame: string;
  buttonsWhere: string;
  controlNotes: string[];
}

/**
 * The whole set in one show file: every song's functions, and one solo frame
 * with a page per song (in set order) holding that song's section buttons.
 * One solo frame means a button stops whatever was running, even from the
 * song before; pages mean the same spot (and later the same pad) starts the
 * same section number in whichever song is showing. QLC+ answers external
 * input only for widgets on a frame's current page, in both its interfaces.
 */
export function generateSet({ ws, profiles, rig, songs, sequences = [], control }: Omit<GenerateInput, "song" | "buttons"> & { songs: Song[] }): SetSummary {
  if (!songs.length) throw new Error("The set has no songs in it.");
  if (songs.some((s) => songPathFor(s.title).toLowerCase() === songPathFor(SAFE_LOOK).toLowerCase())) throw new Error(`“${SAFE_LOOK}” is the name Lightsmith uses for its own safe look. Rename that song.`);
  const titles = new Map<string, string>();
  for (const song of songs) {
    const key = songPathFor(song.title).toLowerCase();
    if (titles.has(key)) throw new Error(`Two songs are called “${song.title.trim() || "Untitled"}”. Rename one so each song has its own name.`);
    titles.set(key, song.title);
  }

  // Remember where the set frame was, then take it out (it's rebuilt below).
  let previousSpot: { parent: XmlElement; x: number; y: number } | undefined;
  let removed = 0;
  if (ws.virtualConsole) {
    const find = (parent: XmlElement): void => {
      for (const c of childElements(parent)) {
        if (c.name === "SoloFrame" && getAttr(c, "Caption") === SET_FRAME) {
          const st = firstChild(c, "WindowState");
          if (!previousSpot) previousSpot = { parent, x: Number(getAttr(st!, "X") ?? 15), y: Number(getAttr(st!, "Y") ?? 15) };
        } else find(c);
      }
    };
    find(ws.virtualConsole);
    removed += removeWhere(ws.virtualConsole, (e) => e.name === "SoloFrame" && getAttr(e, "Caption") === SET_FRAME);
  }

  const results = songs.map((song) => ({ song, r: generateSong({ ws, profiles, rig, song, sequences, buttons: false, neighbours: songs }) }));
  removed += results.reduce((n, { r }) => n + r.removedPrevious, 0);
  // The safe look: a plain warm wash with the heads at home, made the same way as any section.
  const safe = generateSong({ ws, profiles, rig, song: safeLookSong(control?.safeLookStyle), buttons: false, neighbours: songs });
  const inputs = new ControlInputs(ws, control);

  let vc = ws.virtualConsole;
  if (!vc) {
    vc = el("VirtualConsole", {}, []);
    ws.doc.root.children.push(vc);
    ws.virtualConsole = vc;
  }
  let page = childElements(vc, "Frame")[0];
  if (!page) {
    page = el("Frame", { Caption: "", ID: nextWidgetId(vc) }, [el("WindowState", { Visible: "True", X: 0, Y: 0, Width: 1920, Height: 1080 })]);
    vc.children.push(page);
  }
  let wid = nextWidgetId(vc);
  const perRow = 10;
  const size = 80;
  const stepPx = 90;
  const step = control?.cueing === "step";
  const most = Math.max(1, ...songs.map((s) => s.sections.length));
  const rows = step ? 3 : Math.max(2, Math.ceil(most / perRow));
  // Section buttons (or, with step cueing, the song's cue list) on the left;
  // Safe look and Blackout in a column on the right of every page.
  const listW = 560;
  const sideX = step ? listW + 20 : Math.min(most, perRow) * stepPx + 30;
  const width = Math.max(sideX + stepPx + 10, 340);
  const height = rows * stepPx + 46;
  const spot = placeFrame(page, width, height, previousSpot);
  const pageName = (i: number, song: Song) => `${i + 1}. ${safeName(song.title)}`;
  const frame = el("SoloFrame", { Caption: SET_FRAME, ID: wid++ }, [
    el("WindowState", { Visible: "True", X: spot.x, Y: spot.y, Width: width, Height: height }),
    textEl("AllowResize", "True"),
    textEl("ShowHeader", "True"),
    textEl("ShowEnableButton", "True"),
    textEl("Collapsed", "False"),
    textEl("Disabled", "False"),
    el("Multipage", { PagesNum: songs.length, CurrentPage: 0 }),
    ...(control?.nextSong ? [el("Next", {}, inputs.inner(control.nextSong, "Next song", "frame"))] : []),
    ...(control?.previousSong ? [el("Previous", {}, inputs.inner(control.previousSong, "Previous song", "frame"))] : []),
    ...songs.map((song, i) => el("Shortcut", { Page: i, Name: pageName(i, song) }, inputs.inner(song.trigger, `The song “${song.title}”`, "frame"))),
    textEl("PagesLoop", "False"),
  ]);
  const stepNotes: string[] = [];
  results.forEach(({ song, r }, p) => {
    const page = (x: number, y: number) => ({ Visible: p ? "False" : "True", X: x, Y: y, Width: size, Height: size });
    const scope = `page ${p}`;
    // Next, previous and song jumps share the frame with every page's buttons.
    if (step) {
      const cues = stepCuesFor(control, song);
      frame.children.push(
        cueListWidget(
          wid++,
          `${safeName(song.title)}: cues`,
          r.songChaserId,
          { Visible: p ? "False" : "True", X: 10, Y: 40, Width: listW, Height: rows * stepPx - 10 },
          p,
          inputs.many(cues, `“${song.title}”: next section`, scope),
          inputs.many(control?.previousSection ? [control.previousSection] : [], `“${song.title}”: previous section`, scope),
        ),
      );
      stepNotes.push(...oneInputNote(ws, cues, control, `“${song.title}”`));
    } else
      song.sections.forEach((s, i) => {
        frame.children.push(
          el("Button", { Caption: `${i + 1}. ${s.name}`, ID: wid++, ...(p ? { Page: p } : {}) }, [
            el("WindowState", page(10 + (i % perRow) * stepPx, 40 + Math.floor(i / perRow) * stepPx)),
            el("Function", { ID: r.startIds[i]! }),
            textEl("Action", "Toggle"),
            ...inputs.button(triggerFor(control, s, i), `“${song.title}”: ${s.name}`, scope),
          ]),
        );
      });
    frame.children.push(
      el("Button", { Caption: "Safe look", ID: wid++, ...(p ? { Page: p } : {}) }, [
        el("WindowState", page(sideX, 40)),
        el("Function", { ID: safe.sectionIds[0]! }),
        textEl("Action", "Toggle"),
        ...inputs.button(control?.safeLook, "Safe look", scope),
      ]),
      el("Button", { Caption: "Blackout", ID: wid++, ...(p ? { Page: p } : {}) }, [
        el("WindowState", page(sideX, 40 + stepPx)),
        textEl("Action", "Blackout"),
        ...inputs.button(control?.blackout, "Blackout", scope),
      ]),
    );
  });
  spot.parent.children.push(frame);

  // A trigger shared by a page's buttons and the frame's own (next, previous, song jumps) is a clash too.
  const frameKeys = [control?.nextSong, control?.previousSong, ...songs.map((s) => s.trigger)].filter(Boolean) as Trigger[];
  const clash = new Set<string>();
  for (const t of frameKeys) {
    const k = `${t.device}/${t.kind}/${t.number}`;
    songs.forEach((song) => {
      if (step) {
        for (const st of stepCuesFor(control, song)) if (`${st.device}/${st.kind}/${st.number}` === k) clash.add(`A cue in “${song.title}” uses the same message as a song change, so one hit would do both.`);
      } else
        song.sections.forEach((s, i) => {
          const st = triggerFor(control, s, i);
          if (st && `${st.device}/${st.kind}/${st.number}` === k) clash.add(`“${song.title}”: ${s.name} uses the same message as a song change, so one hit would do both.`);
        });
    });
  }

  return {
    songs: results.map(({ song, r }) => ({ title: song.title, sections: r.sections, functions: r.functions })),
    functions: results.reduce((n, { r }) => n + r.functions, 0) + safe.functions,
    removedPrevious: removed,
    buttonsFrame: SET_FRAME,
    buttonsWhere: spot.where,
    controlNotes: [...inputs.finish(), ...clash, ...new Set(stepNotes)],
  };
}

/** The name of the safe look's folder in QLC+, next to the songs. */
export const SAFE_LOOK = "Safe look";

/** A plain warm wash, heads at home and still: what's safe to fall back on mid-song. */
export function safeLookSong(style: SafeLookStyle = {}): Song {
  const s = newSection("verse", 120);
  const level = style.level === undefined ? undefined : Math.max(0, Math.min(1, style.level));
  const brightness: Section["brightness"] = {
    ...(level !== undefined ? { backdrop: level, side: level, front: level * 0.8, mover: level } : {}),
    ...(style.heads === "off" ? { mover: 0 } : {}),
  };
  return {
    id: "lightsmith-safe-look",
    title: SAFE_LOOK,
    bpm: 120,
    sections: [
      {
        ...s,
        id: "lightsmith-safe-look-1",
        name: "Safe look",
        energy: 3,
        colors: [style.color ?? "warmWhite"],
        // A chosen color goes on every light, the front ones too.
        ...(style.color ? { colorLayout: { backdrop: 0, side: 0, front: 0, mover: 0 } } : {}),
        colorChange: "hold",
        pattern: "solid",
        movement: "static",
        effects: {},
        transition: "fade",
        focus: "all",
        ...(Object.keys(brightness).length ? { brightness } : {}),
      },
    ],
  };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const boxOf = (e: XmlElement): Box | undefined => {
  const st = firstChild(e, "WindowState");
  if (!st) return undefined;
  return { x: Number(getAttr(st, "X") ?? 0), y: Number(getAttr(st, "Y") ?? 0), w: Number(getAttr(st, "Width") ?? 0), h: Number(getAttr(st, "Height") ?? 0) };
};
const widgetsIn = (e: XmlElement) => childElements(e).filter((c) => c.name !== "WindowState" && c.name !== "Appearance" && boxOf(c));
const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The first free spot for a w × h box inside `area`, scanning top to bottom, left to right. */
function freeSpot(taken: Box[], area: Box, w: number, h: number): { x: number; y: number } | undefined {
  for (let y = area.y; y + h <= area.y + area.h; y += 15) {
    for (let x = area.x; x + w <= area.x + area.w; x += 15) {
      const box = { x, y, w, h };
      if (!taken.some((t) => overlaps(box, t, 14))) return { x, y };
    }
  }
  return undefined;
}

/**
 * Where to put a song's button frame so it's easy to find on a laptop screen:
 * where it was last time; else the first free spot near the top-left of the
 * first page; else inside a big frame on that page that has room (a console
 * frame many shows are built around); else under everything on the page.
 */
function placeFrame(page: XmlElement, w: number, h: number, previous?: { parent: XmlElement; x: number; y: number }): { parent: XmlElement; x: number; y: number; where: string } {
  const pageName = (getAttr(page, "Caption") ?? "").trim();
  const onPage = pageName ? `on the Virtual Console page “${pageName}”` : "on the first Virtual Console page";
  const inside = (f: XmlElement) => `inside the frame “${getAttr(f, "Caption") ?? ""}” ${onPage}`;
  if (previous) {
    const onTop = previous.parent === page;
    // Version 0.2 tucked frames under everything on the page, often off screen;
    // only keep a top-level spot that's actually in view.
    const inView = previous.x + w <= 1280 && previous.y + h <= 720;
    if ((onTop && inView) || (!onTop && containsEl(page, previous.parent))) return { ...previous, where: onTop ? onPage : inside(previous.parent) };
  }
  const pageBox = boxOf(page) ?? { x: 0, y: 0, w: 1920, h: 1080 };
  const top = widgetsIn(page).map((c) => boxOf(c)!);
  // A laptop-sized corner of the page first, so the frame is on screen.
  const visible = { x: 15, y: 15, w: Math.min(pageBox.w, 1280) - 30, h: Math.min(pageBox.h, 720) - 30 };
  const near = freeSpot(top, visible, w, h);
  if (near) return { parent: page, ...near, where: onPage };
  // Inside a container frame on the page, below what's already in it.
  const containers = widgetsIn(page)
    .filter((c) => c.name === "Frame" || c.name === "SoloFrame")
    .map((c) => ({ c, box: boxOf(c)! }))
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  for (const { c, box } of containers) {
    const kids = widgetsIn(c).map((k) => boxOf(k)!);
    const spot = freeSpot(kids, { x: 15, y: 46, w: box.w - 30, h: Math.min(box.h, 720 - box.y) - 61 }, w, h);
    if (spot) return { parent: c, ...spot, where: inside(c) };
  }
  // Anywhere else on the page, then under everything.
  const any = freeSpot(top, { x: 15, y: 15, w: pageBox.w - 30, h: pageBox.h - 30 }, w, h);
  if (any) return { parent: page, ...any, where: onPage };
  const bottom = top.reduce((m, b) => Math.max(m, b.y + b.h + 15), 15);
  const st = firstChild(page, "WindowState");
  if (st && pageBox.h < bottom + h + 15) st.attrs = st.attrs.map(([k, v]) => [k, k === "Height" ? String(bottom + h + 15) : v]);
  return { parent: page, x: 15, y: bottom, where: onPage };
}

function containsEl(root: XmlElement, target: XmlElement): boolean {
  return childElements(root).some((c) => c === target || containsEl(c, target));
}

