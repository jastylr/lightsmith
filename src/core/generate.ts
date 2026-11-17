/**
 * The generator: turns a song (sections + preset choices) and a rig into QLC+
 * functions, a song cue chaser and Virtual Console buttons, merged into the
 * user's workspace.
 *
 * Rules learned the hard way (see docs/qlc-notes.md):
 *  - Never write a shutter/strobe channel unless the definition says the value
 *    opens the shutter or is a strobe. "No function" values can read as closed.
 *  - Light needs the master dimmer up AND a colour. Every look sets both.
 *  - RGB matrices only drive colour, so a scene must hold the dimmer.
 */
import { APP_NAME } from "../config";
import type { FixtureProfile, HeadProfile } from "./fixture";
import type { Rig, RigFixture, Song } from "./model";
import { sectionMs } from "./model";
import { COLOR_CHANGES, colorById, energyOf, moodById, MOVEMENTS, patternById, SPREADS, type RGB } from "./presets";
import { fixturesWithRole } from "./rig";
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

/** Put a colour on one head. RGBW heads take the white part on the white LED. */
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
  return level; // no dimmer: scale the colour instead
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const WARM_WHITE = colorById("warmWhite").rgb;

class Builder {
  functions: XmlElement[] = [];
  constructor(private nextId: number) {}

  private fn(type: string, name: string, path: string, children: XmlElement[]): number {
    const id = this.nextId++;
    this.functions.push(el("Function", { ID: id, Type: type, Name: name, Path: path }, children));
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

  matrix(name: string, path: string, opts: { algorithm: string; colors: RGB[]; stepMs: number; group: number; direction?: string; order?: string; props?: Record<string, string | number> }): number {
    const kids: XmlElement[] = [
      el("Speed", { FadeIn: 0, FadeOut: 0, Duration: Math.max(20, Math.round(opts.stepMs)) }),
      textEl("Direction", opts.direction ?? "Forward"),
      textEl("RunOrder", opts.order ?? "Loop"),
      textEl("Algorithm", opts.algorithm, { Type: "Script" }),
      ...opts.colors.map((c, i) => textEl("Color", String((0xff000000 | (clamp(c[0]) << 16) | (clamp(c[1]) << 8) | clamp(c[2])) >>> 0), { Index: i })),
      textEl("ControlMode", "RGB"),
      textEl("FixtureGroup", opts.group),
      ...Object.entries(opts.props ?? {}).map(([k, v]) => el("Property", { Name: k, Value: v })),
    ];
    return this.fn("RGBMatrix", name, path, kids);
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
  if (ws.virtualConsole) {
    removed += removeWhere(ws.virtualConsole, (e) => (e.name === "Frame" || e.name === "SoloFrame") && getAttr(e, "Caption") === frameCaption);
  }

  const usable = (r: RigFixture) => profiles.has(r.fixtureId);
  const backdrop = fixturesWithRole(rig, "backdrop").filter(usable);
  const sides = fixturesWithRole(rig, "side").filter(usable);
  const fronts = fixturesWithRole(rig, "front").filter(usable);
  const movers = fixturesWithRole(rig, "mover").filter(usable);
  const prof = (r: RigFixture) => profiles.get(r.fixtureId)!;

  // 2. A pixel group for the backdrop (shared by all songs; rebuilt each export).
  let backdropGroup: number | undefined;
  const rgbBackdrop = backdrop.filter((r) => prof(r).hasRgb);
  if (rgbBackdrop.length) {
    const groupName = "Lightsmith Backdrop";
    const existing = childElements(engine, "FixtureGroup").find((g) => textOf(firstChild(g, "Name")).trim() === groupName);
    backdropGroup = existing ? Number(getAttr(existing, "ID")) : nextGroupId(engine);
    const maxHeads = Math.max(...rgbBackdrop.map((r) => prof(r).heads.filter((h) => h.red !== undefined).length));
    const heads: XmlElement[] = [];
    rgbBackdrop.forEach((r, x) => {
      const p = prof(r);
      const rgbHeads = p.heads.map((h, i) => ({ h, i })).filter(({ h }) => h.red !== undefined);
      rgbHeads.forEach(({ i }, y) => heads.push(textEl("Head", i, { X: x, Y: y, Fixture: r.fixtureId })));
    });
    const group = el("FixtureGroup", { ID: backdropGroup }, [textEl("Name", groupName), el("Size", { X: rgbBackdrop.length, Y: maxHeads }), ...heads]);
    if (existing) {
      existing.children = group.children;
    } else {
      insertChildren(engine, [group], ["FixtureGroup", "Fixture"]);
    }
  }

  const b = new Builder(nextFunctionId(engine));
  const sharedPath = `${songPath}/Shared`;

  // Shared: a blank spacer and lightning strikes (created on first use).
  let blankId: number | undefined;
  const blank = () => (blankId ??= b.scene("Blank (spacer)", sharedPath, new Map()));
  let strikesId: number | undefined;
  let strikesMs = 0;
  const strikes = () => {
    if (strikesId !== undefined) return strikesId;
    const lp = `${sharedPath}/Lightning`;
    const flash = (rs: RigFixture[]) => {
      const v: Vals = new Map();
      for (const r of rs) {
        const p = prof(r);
        const s = fixtureLevel(v, r.fixtureId, p, 1);
        for (const h of p.heads) headColor(v, r.fixtureId, h, WHITE, s);
      }
      return v;
    };
    const all = b.scene("Strike all", lp, flash([...backdrop, ...sides, ...fronts, ...movers]));
    const each = [...backdrop, ...sides].map((r, i) => b.scene(`Strike ${i + 1}`, lp, flash([r])));
    const moverFlash = movers.length ? b.scene("Strike movers", lp, flash(movers)) : all;
    const pick = (i: number) => each.length ? each[i % each.length]! : all;
    const pattern: Step[] = [
      { id: all, hold: 200 }, { id: blank(), hold: 60 }, { id: pick(0), hold: 100 }, { id: pick(2), hold: 80 },
      { id: moverFlash, hold: 120 }, { id: pick(1), hold: 100 }, { id: pick(3), hold: 80 }, { id: blank(), hold: 40 },
      { id: all, hold: 150 }, { id: blank(), hold: 80 }, { id: pick(4), fadeIn: 80, hold: 80 }, { id: pick(1), fadeIn: 80, hold: 80 },
      { id: pick(5), hold: 30 }, { id: all, hold: 60 }, { id: moverFlash, fadeIn: 40, hold: 40 }, { id: blank(), hold: 40 },
      { id: pick(2), hold: 100 }, { id: pick(0), hold: 80 }, { id: all, hold: 120, fadeOut: 1500 },
    ];
    strikesMs = pattern.reduce((t, s) => t + (s.fadeIn ?? 0) + s.hold, 0) + 1600;
    strikesId = b.chaser("Lightning strikes", lp, pattern, "SingleShot");
    return strikesId;
  };

  // Shared overlays.
  let blinderSceneId: number | undefined;
  const blinderScene = () => {
    if (blinderSceneId !== undefined) return blinderSceneId;
    const v: Vals = new Map();
    for (const r of [...backdrop, ...sides, ...fronts, ...movers]) {
      const p = prof(r);
      const s = fixtureLevel(v, r.fixtureId, p, 1);
      for (const h of p.heads) headColor(v, r.fixtureId, h, WHITE, s);
    }
    return (blinderSceneId = b.scene("Blinder flash", sharedPath, v));
  };
  let pulseSceneId: number | undefined;
  const pulseScene = () => {
    if (pulseSceneId !== undefined) return pulseSceneId;
    const v: Vals = new Map();
    for (const r of [...sides, ...fronts]) {
      const p = prof(r);
      const s = fixtureLevel(v, r.fixtureId, p, 1);
      for (const h of p.heads) headColor(v, r.fixtureId, h, WARM_WHITE, s);
    }
    return (pulseSceneId = b.scene("Beat pulse", sharedPath, v));
  };

  const sectionIds: number[] = [];
  song.sections.forEach((s, idx) => {
    const label = `${idx + 1}. ${safeName(s.name)}`;
    const path = `${songPath}/${label}`;
    const mood = moodById(s.mood);
    const en = energyOf(s.energy);
    const palette: RGB[] = (s.colors.length ? s.colors : mood.colors).map((c) => colorById(c).rgb);
    const level = Math.max(0.15, Math.min(1, mood.intensity * en.level));
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

    /** Everything that depends on colour, for one arrangement of the palette. */
    const look = (pal: RGB[], tag: string, withFades: boolean): number[] => {
      const out: number[] = [];
      const named = (n: string) => (tag ? `${n} ${tag}` : n);
      const fi = withFades ? fade : 0;
      const fo = withFades ? beat : 0;
      const p0 = pal[0]!;
      const p1 = pal[1] ?? p0;

      if (backdrop.length) {
        const v: Vals = new Map();
        backdrop.forEach((r, i) => {
          const p = prof(r);
          const sc = fixtureLevel(v, r.fixtureId, p, level);
          const color = pattern.id === "solid" ? pal[i % pal.length]! : p0;
          for (const h of p.heads) headColor(v, r.fixtureId, h, color, pattern.floor * sc);
          if (s.focus !== "all" && r.side === s.focus) for (const h of p.heads) if (h.white !== undefined) setVal(v, r.fixtureId, h.white, 80);
        });
        out.push(b.scene(named("Backdrop base"), path, v, fi, fo));
        if (backdropGroup !== undefined && pattern.algorithm) {
          const single = pattern.whiten ? mix(pattern.floor > 0 ? p1 : p0, WHITE, pattern.whiten) : pattern.floor > 0 ? p1 : p0;
          const colors = pattern.colors === 0 ? [] : pattern.colors === 1 ? [single] : pattern.colors === 2 ? [p0, p1] : pal.slice(0, 5);
          const stepMs = (pattern.stepMs ?? (pattern.stepBeats ?? 0.25) * beat) / speed;
          out.push(b.matrix(named(`Backdrop ${pattern.label.toLowerCase()}`), path, { algorithm: pattern.algorithm, colors, stepMs, group: backdropGroup, direction: pattern.direction, order: pattern.order, props: pattern.props }));
        }
      }

      const sideLook = (rs: RigFixture[], hot: "SL" | "SR" | null): Vals => {
        const v: Vals = new Map();
        for (const r of rs) {
          const p = prof(r);
          const focused = s.focus !== "all" && r.side === s.focus;
          const dimmed = s.focus !== "all" && !focused;
          const isHot = hot === null || r.side === hot || r.side === "C";
          const lv = focused ? 1 : dimmed ? level * 0.35 : isHot ? level : level * 0.35;
          const sc = fixtureLevel(v, r.fixtureId, p, lv);
          const color = focused ? WARM_WHITE : isHot ? p0 : p1;
          for (const h of p.heads) {
            const whiteOnly = h.red === undefined && h.white !== undefined;
            if (whiteOnly) setVal(v, r.fixtureId, h.white, focused ? 255 : 0);
            else headColor(v, r.fixtureId, h, color, sc);
          }
        }
        return v;
      };
      if (sides.length) {
        if (s.focus !== "all" || mood.side === "static") {
          out.push(b.scene(named("Side lights"), path, sideLook(sides, null), fi, fo));
        } else {
          const swap = mood.side === "swapBeat" ? beat : bar;
          const a = b.scene(named("Side lights A"), path, sideLook(sides, "SL"));
          const c = b.scene(named("Side lights B"), path, sideLook(sides, "SR"));
          const sf = mood.side === "swapBar" ? Math.min(300, swap / 4) : 0;
          out.push(b.chaser(named("Side lights swap"), path, [{ id: a, fadeIn: sf, hold: swap - sf }, { id: c, fadeIn: sf, hold: swap - sf }]));
        }
      }
      if (fronts.length) {
        const v: Vals = new Map();
        for (const r of fronts) {
          const p = prof(r);
          const sc = fixtureLevel(v, r.fixtureId, p, Math.max(0.3, level * 0.8));
          for (const h of p.heads) headColor(v, r.fixtureId, h, WARM_WHITE, sc);
        }
        out.push(b.scene(named("Front light"), path, v, fi, fo));
      }
      if (movers.length) {
        const v: Vals = new Map();
        for (const r of movers) {
          const p = prof(r);
          const sc = fixtureLevel(v, r.fixtureId, p, level);
          for (const h of p.heads) headColor(v, r.fixtureId, h, p1, sc);
          if (p.ptSpeed) setVal(v, r.fixtureId, p.ptSpeed.channel, mv.algorithm ? (p.ptSpeed.fastIsLow ? 0 : 255) : p.ptSpeed.fastIsLow ? 200 : 55);
          if (!mv.algorithm) {
            const home = r.home ?? { pan: 128, tilt: 128 };
            setVal(v, r.fixtureId, p.pan, home.pan);
            setVal(v, r.fixtureId, p.panFine, 0);
            setVal(v, r.fixtureId, p.tilt, home.tilt);
            setVal(v, r.fixtureId, p.tiltFine, 0);
          }
        }
        out.push(b.scene(named(mv.algorithm ? "Movers colour" : "Movers colour + position"), path, v, fi, fo));
      }
      return out;
    };

    if (period > 0 && palette.length > 1) {
      const rotations = palette.map((_, k) => [...palette.slice(k), ...palette.slice(0, k)]);
      const looks = rotations.map((pal, k) => b.collection(`Colours ${k + 1}`, path, look(pal, `(colours ${k + 1})`, false)));
      const cf = s.colorFade ? Math.min(period / 2, 1500) : 0;
      parts.push(b.chaser("Colour changes", path, looks.map((id) => ({ id, fadeIn: cf, hold: period - cf }))));
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

    // ---- effects layered on top
    const p0 = palette[0]!;
    if (backdropGroup !== undefined) {
      if (s.effects.rain) parts.push(b.matrix("Rain", path, { algorithm: "Noise", colors: [mix(p0, WHITE, 0.4)], stepMs: 120 / speed, group: backdropGroup, direction: "Backward", props: { noisePercentage: "Medium" } }));
      if (s.effects.sparkle) parts.push(b.matrix("Sparkle", path, { algorithm: "Random Single", colors: [WHITE], stepMs: beat / 8, group: backdropGroup }));
      if (s.effects.strobe && pattern.id !== "strobe") parts.push(b.matrix("Strobe hits", path, { algorithm: "Strobe", colors: [WHITE], stepMs: beat / 4, group: backdropGroup, props: { frequency: 2 } }));
    }
    if (s.effects.blinder) parts.push(b.chaser("Blinder hit", path, [{ id: blinderScene(), hold: beat, fadeOut: 1500 }, { id: blank(), hold: 1500 }], "SingleShot"));
    if (s.effects.beatPulse && (sides.length || fronts.length)) {
      parts.push(b.chaser("Beat pulse", path, [{ id: pulseScene(), hold: beat * 0.2, fadeOut: beat * 0.5 }, { id: blank(), hold: beat * 0.8 }]));
    }
    if (s.effects.lightning) {
      const delay = Math.max(0, (s.effects.lightningDelaySec ?? 0) * 1000);
      const st = strikes();
      parts.push(b.chaser("Lightning", path, delay > 0 ? [{ id: blank(), hold: delay }, { id: st, hold: strikesMs }] : [{ id: st, hold: strikesMs }], "SingleShot"));
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
  let bottom = 15;
  for (const c of childElements(page)) {
    const wsEl = firstChild(c, "WindowState");
    if (wsEl && c.name !== "WindowState") bottom = Math.max(bottom, Number(getAttr(wsEl, "Y") ?? 0) + Number(getAttr(wsEl, "Height") ?? 0) + 15);
  }
  let wid = nextWidgetId(vc);
  const perRow = 10;
  const size = 80;
  const stepPx = 90;
  const rows = Math.ceil(song.sections.length / perRow);
  const width = Math.min(song.sections.length, perRow) * stepPx + 20;
  const height = rows * stepPx + 46;
  // Make sure the page is tall enough to show the new frame.
  const pageState = firstChild(page, "WindowState");
  if (pageState && Number(getAttr(pageState, "Height") ?? 0) < bottom + height + 15) {
    pageState.attrs = pageState.attrs.map(([k, v]) => [k, k === "Height" ? String(bottom + height + 15) : v]);
  }
  const frame = el("SoloFrame", { Caption: frameCaption, ID: wid++ }, [
    el("WindowState", { Visible: "True", X: 15, Y: bottom, Width: width, Height: height }),
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
  page.children.push(frame);

  return { sections: song.sections.length, functions: b.functions.length, removedPrevious: removed, buttonsFrame: frameCaption, songChaserId };
}

