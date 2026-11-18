/**
 * The generator: turns a song (sections + preset choices) and a rig into QLC+
 * functions, a song cue chaser and Virtual Console buttons, merged into the
 * user's workspace.
 *
 * Rules learned the hard way (see docs/qlc-notes.md):
 *  - Never write a shutter/strobe channel unless the definition says the value
 *    opens the shutter or is a strobe. "No function" values can read as closed.
 *  - Light needs the master dimmer up AND a color. Every look sets both.
 *  - RGB matrices only drive color, so a scene must hold the dimmer.
 */
import { APP_NAME } from "../config";
import type { FixtureProfile, HeadProfile } from "./fixture";
import { colorLayoutOf, lightLevels, type ColorJob, type Rig, type RigFixture, type Song } from "./model";
import { isBlackout, sectionMs } from "./model";
import { COLOR_CHANGES, colorById, energyOf, moodById, MOVEMENTS, patternById, SPREADS, type EffectId, type RGB } from "./presets";
import { effectTargets, fixturesWithRole, focusLights, patternTargets, stageOrder } from "./rig";
import { el, getAttr, childElements, firstChild, textEl, textOf, type XmlElement } from "./xml";
import { insertChildren, nextFunctionId, nextGroupId, nextWidgetId, removeWhere, type Workspace } from "./workspace";

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
const WARM_WHITE = colorById("warmWhite").rgb;

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

  efx(name: string, path: string, opts: { algorithm: string; movers: RigFixture[]; width: number; height: number; x: number; y: number; durationMs: number; propagation?: string }): number {
    const kids: XmlElement[] = [];
    for (const m of opts.movers) {
      kids.push(
        el("Fixture", {}, [
          textEl("ID", m.fixtureId),
          textEl("Head", 0),
          textEl("Mode", 0),
          textEl("Direction", m.reverse ? "Backward" : "Forward"),
          textEl("StartOffset", 0),
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
      textEl("Rotation", 0),
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
}

export interface GenerateSummary {
  sections: number;
  functions: number;
  removedPrevious: number;
  buttonsFrame: string;
  /** Where the button frame was put, in words: "inside “CV Console” on the page “CV Show”". */
  buttonsWhere: string;
  songChaserId: number;
}

function safeName(s: string): string {
  return s.replace(/[/\\]/g, "-").trim() || "Untitled";
}

/** The function folder a song's generated content lives in. */
export function songPathFor(title: string): string {
  return `${PATH_ROOT}/${safeName(title)}`;
}

/** Mutates `ws` (merging the song into it) and returns a summary. */
export function generateSong({ ws, profiles, rig, song }: GenerateInput): GenerateSummary {
  const title = safeName(song.title);
  const songPath = songPathFor(song.title);
  const frameCaption = `${title} (${APP_NAME})`;
  const engine = ws.engine;

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
  const sceneCache = new Map<string, number>();
  const sharedScene = (name: string, targets: RigFixture[], color: RGB) => {
    const key = `${name}|${idsKey(targets)}`;
    const hit = sceneCache.get(key);
    if (hit !== undefined) return hit;
    const id = b.scene(name, sharedPath, flash(targets, color));
    sceneCache.set(key, id);
    return id;
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
    const en = energyOf(s.energy);
    const palette: RGB[] = (s.colors.length ? s.colors : mood.colors).map((c) => colorById(c).rgb);
    const levels = lightLevels(s);
    const speed = en.speed;
    const beat = 60000 / s.bpm;
    const bar = beat * s.beatsPerBar;
    const fade = s.transition === "snap" ? 0 : s.transition === "fade" ? beat : Math.min(sectionMs(s), bar * 4);
    const pattern = patternById(s.pattern === "mood" ? mood.pattern : s.pattern);
    const changeId = s.colorChange === "mood" ? mood.colorChange : s.colorChange;
    const change = COLOR_CHANGES.find((c) => c.id === changeId) ?? COLOR_CHANGES[0]!;
    const period = change.beats === 0 ? 0 : change.beats > 0 ? change.beats * beat : -change.beats * bar;
    const moveId = s.movement === "mood" ? mood.movement : s.movement;
    const mv = MOVEMENTS.find((m) => m.id === moveId) ?? MOVEMENTS[0]!;
    const parts: number[] = [];

    // Focus: these lights go warm white at full; the other side and floor lights dim.
    const focusSet = new Set(s.focus === "all" ? [] : focusLights({ fixtures: usedLights }, s.focus));
    const focusing = focusSet.size > 0;
    const layout = colorLayoutOf(s);
    /** The color for the k-th light (stage left first) of a kind, given the palette arrangement. */
    const colorFor = (pal: RGB[], job: ColorJob, k: number, mixOffset: number): RGB => {
      const t = layout[job];
      if (t === "white") return WARM_WHITE;
      if (typeof t === "number") return pal[t % pal.length]!;
      return pal[(k + mixOffset) % pal.length]!;
    };
    const patternLights = (() => {
      const ids = new Set(patternTargets(s, rig));
      return usedLights.filter((r) => ids.has(r.fixtureId)).sort(stageOrder);
    })();
    const patternGroup = pattern.algorithm ? groupFor(patternLights) : undefined;

    /** Everything that depends on color, for one arrangement of the palette. */
    const look = (pal: RGB[], tag: string, withFades: boolean): number[] => {
      const out: number[] = [];
      const named = (n: string) => (tag ? `${n} ${tag}` : n);
      const fi = withFades ? fade : 0;
      const fo = toBlack ?? (withFades ? beat : 0);
      const p0 = pal[0]!;
      const fixed = typeof layout.backdrop === "number" ? layout.backdrop : null;
      // The pattern's color: the one after the backdrop's chosen color, or the second color.
      // With the backdrop set to warm white, the pattern is warm white too.
      const white = layout.backdrop === "white";
      const main = white ? WARM_WHITE : fixed !== null ? pal[fixed % pal.length]! : p0;
      const accent = white ? WARM_WHITE : fixed !== null ? pal[(fixed + 1) % pal.length]! : (pal[1] ?? p0);

      if (backdrop.length) {
        const v: Vals = new Map();
        // With "mix", spread the palette across the bars, keeping the pattern's color for the pattern.
        const under = pal.length > 2 ? pal.filter((_, k) => k !== 1) : [p0];
        backdrop.forEach((r, i) => {
          const p = prof(r);
          const sc = fixtureLevel(v, r.fixtureId, p, levels.backdrop.level);
          const color = layout.backdrop === "mix" ? (pattern.id === "solid" ? pal[i % pal.length]! : under[i % under.length]!) : colorFor(pal, "backdrop", i, 0);
          // Bars the pattern runs on sit at the pattern's base level; others show a steady wash.
          const underPattern = patternGroup !== undefined && patternLights.some((x) => x.fixtureId === r.fixtureId);
          for (const h of p.heads) headColor(v, r.fixtureId, h, color, (underPattern ? pattern.floor : 1) * sc);
          if (focusSet.has(r.fixtureId)) for (const h of p.heads) if (h.white !== undefined) setVal(v, r.fixtureId, h.white, 80);
        });
        out.push(b.scene(named("Backdrop base"), path, v, fi, fo));
      }
      if (patternGroup !== undefined && pattern.algorithm) {
        const single = pattern.whiten ? mix(pattern.floor > 0 ? accent : main, WHITE, pattern.whiten) : pattern.floor > 0 ? accent : main;
        const colors = pattern.colors === 0 ? [] : pattern.colors === 1 ? [single] : pattern.colors === 2 ? [main, accent] : pal.slice(0, 5);
        const stepMs = (pattern.stepMs ?? (pattern.stepBeats ?? 0.25) * beat) / speed;
        out.push(b.matrix(named(`Pattern: ${pattern.label.toLowerCase()}`), path, { algorithm: pattern.algorithm, colors, stepMs, group: patternGroup, direction: pattern.direction, order: pattern.order, props: pattern.props, fadeOut: toBlack }));
      }

      /** Side and front lights; `hot` is the side that's bright in a side-to-side swap. */
      const floorLook = (rs: RigFixture[], job: ColorJob, hot: "SL" | "SR" | null): Vals => {
        const v: Vals = new Map();
        for (const [k, r] of rs.entries()) {
          const p = prof(r);
          const focused = focusSet.has(r.fixtureId);
          const isHot = hot === null || r.side === hot || r.side === "C";
          const base = levels[job].level;
          const lv = focused ? 1 : focusing ? base * 0.35 : isHot ? base : base * 0.35;
          const sc = fixtureLevel(v, r.fixtureId, p, lv);
          const color = focused ? WARM_WHITE : colorFor(pal, job, k, isHot ? 0 : 1);
          for (const h of p.heads) {
            const whiteOnly = h.red === undefined && h.white !== undefined;
            if (whiteOnly) setVal(v, r.fixtureId, h.white, focused ? 255 : 0);
            else headColor(v, r.fixtureId, h, color, sc);
          }
        }
        return v;
      };
      if (sides.length) {
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
      if (fronts.length) out.push(b.scene(named("Front light"), path, floorLook(fronts, "front", null), fi, fo));
      if (movers.length) {
        const v: Vals = new Map();
        for (const [k, r] of movers.entries()) {
          const p = prof(r);
          const focused = focusSet.has(r.fixtureId);
          const sc = fixtureLevel(v, r.fixtureId, p, focused ? 1 : focusing ? levels.mover.level * 0.5 : levels.mover.level);
          for (const h of p.heads) headColor(v, r.fixtureId, h, focused ? WARM_WHITE : colorFor(pal, "mover", k, 1), sc);
          if (p.ptSpeed) setVal(v, r.fixtureId, p.ptSpeed.channel, mv.algorithm ? (p.ptSpeed.fastIsLow ? 0 : 255) : p.ptSpeed.fastIsLow ? 200 : 55);
          if (!mv.algorithm) {
            const home = r.home ?? { pan: 128, tilt: 128 };
            setVal(v, r.fixtureId, p.pan, home.pan);
            setVal(v, r.fixtureId, p.panFine, 0);
            setVal(v, r.fixtureId, p.tilt, home.tilt);
            setVal(v, r.fixtureId, p.tiltFine, 0);
          }
        }
        out.push(b.scene(named(mv.algorithm ? "Movers color" : "Movers color + position"), path, v, fi, fo));
      }
      return out;
    };

    if (period > 0 && palette.length > 1) {
      const rotations = palette.map((_, k) => [...palette.slice(k), ...palette.slice(0, k)]);
      const looks = rotations.map((pal, k) => b.collection(`Colors ${k + 1}`, path, look(pal, `(colors ${k + 1})`, false)));
      const cf = s.colorFade ? Math.min(period / 2, 1500) : 0;
      parts.push(b.chaser("Color changes", path, looks.map((id) => ({ id, fadeIn: cf, hold: period - cf }))));
    } else {
      parts.push(...look(palette, "", true));
    }

    // ---- movement
    if (movers.length && mv.algorithm) {
      const spread = SPREADS.find((x) => x.id === s.moverSpread) ?? SPREADS[0]!;
      const byHome = new Map<string, RigFixture[]>();
      for (const r of movers) {
        const h = r.home ?? { pan: 128, tilt: 128 };
        const k = `${h.pan},${h.tilt}`;
        byHome.set(k, [...(byHome.get(k) ?? []), r]);
      }
      for (const [k, rs] of byHome) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        const w = Math.min(mv.width, 2 * Math.min(x, 255 - x));
        const h = Math.min(mv.height, 2 * Math.min(y, 255 - y));
        parts.push(b.efx(`Movers ${mv.label.toLowerCase()}`, path, { algorithm: mv.algorithm, movers: rs, width: w, height: h, x, y, durationMs: (mv.bars * bar) / speed, propagation: spread.propagation }));
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

    sectionIds.push(b.collection(label, path, parts));
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
  const rows = Math.ceil(song.sections.length / perRow);
  const width = Math.min(song.sections.length, perRow) * stepPx + 20;
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
  song.sections.forEach((s, i) => {
    frame.children.push(
      el("Button", { Caption: `${i + 1}. ${s.name}`, ID: wid++ }, [
        el("WindowState", { Visible: "True", X: 10 + (i % perRow) * stepPx, Y: 40 + Math.floor(i / perRow) * stepPx, Width: size, Height: size }),
        el("Function", { ID: sectionIds[i]! }),
        textEl("Action", "Toggle"),
      ]),
    );
  });
  spot.parent.children.push(frame);

  return { sections: song.sections.length, functions: b.functions.length, removedPrevious: removed, buttonsFrame: frameCaption, buttonsWhere: spot.where, songChaserId };
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

