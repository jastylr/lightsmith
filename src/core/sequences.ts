/**
 * Sequences: step-by-step chasers the user builds, generates from a quick
 * start, or imports from a chaser in their QLC+ show file.
 */
import type { FixtureProfile } from "./fixture";
import { newId, tidyStepColors, type Rig, type RigFixture, type Section, type Sequence, type SequenceOrder, type SequenceStep, type SequenceUnits } from "./model";
import { childElements, getAttr, textOf, type XmlElement } from "./xml";
import type { Workspace } from "./workspace";

/** A step's time in milliseconds at the section's tempo. */
export function toMs(value: number, units: SequenceUnits, bpm: number): number {
  return Math.max(0, units === "ms" ? value : (value * 60000) / bpm);
}

/** How long one pass through the sequence takes, in milliseconds (each step's fade in plus hold). */
export function sequenceMs(q: Pick<Sequence, "steps" | "units">, bpm: number): number {
  return q.steps.reduce((t, st) => t + toMs(st.fadeIn, q.units, bpm) + toMs(st.hold, q.units, bpm), 0);
}

/** How a chaser sits in its section: when it starts and ends, and the section's length to compare. */
export interface ChaserFit {
  startMs: number;
  /** One run through its steps. */
  runMs: number;
  endMs: number;
  sectionMs: number;
  /** It repeats (loop or back and forth) until the section ends. */
  repeats: boolean;
  /** How far one run goes past the end of the section (0 if it doesn't). */
  overMs: number;
  /** How long before the section ends a one-shot chaser finishes (0 if it doesn't). */
  earlyMs: number;
  /** Whole bars that cover the start delay and one run. */
  fitBars: number;
}

export function chaserFit(q: Pick<Sequence, "steps" | "units" | "order">, delaySec: number, s: Pick<Section, "bpm" | "bars" | "beatsPerBar">): ChaserFit {
  const startMs = Math.max(0, delaySec * 1000);
  const runMs = sequenceMs(q, s.bpm);
  const endMs = startMs + runMs;
  const barMs = (60000 / s.bpm) * s.beatsPerBar;
  const secMs = s.bars * barMs;
  const repeats = q.order !== "once";
  return {
    startMs,
    runMs,
    endMs,
    sectionMs: secMs,
    repeats,
    overMs: Math.max(0, endMs - secMs),
    earlyMs: repeats ? 0 : Math.max(0, secMs - endMs),
    fitBars: Math.max(1, Math.ceil(endMs / barMs - 1e-9)),
  };
}

export const isPause = (st: Pick<SequenceStep, "lights">) => st.lights.length === 0;

export function newStep(lights: number[], hold: number, extra: Partial<SequenceStep> = {}): SequenceStep {
  return { id: newId("st"), lights, fadeIn: 0, hold, fadeOut: 0, ...extra };
}

// ---------------------------------------------------------------- quick starts

export type QuickStartId = "lightning" | "chase" | "bounce" | "sides" | "random";
export const QUICK_STARTS: { id: QuickStartId; label: string; description: string }[] = [
  { id: "lightning", label: "Lightning", description: "A full strike, then single flashes and a closing glow" },
  { id: "chase", label: "Chase across", description: "One light at a time, left to right, a beat each" },
  { id: "bounce", label: "Bounce", description: "Across and back again, a beat each" },
  { id: "sides", label: "Sides take turns", description: "Stage left, then stage right, a beat each" },
  { id: "random", label: "Random flashes", description: "Quick white flashes on lights picked at random" },
];

/** Lights that can show color, left to right as the audience sees them. */
function lightsInOrder(rig: Rig, profiles: Map<number, FixtureProfile>, roles?: RigFixture["role"][]): RigFixture[] {
  return rig.fixtures
    .filter((f) => f.role !== "ignore" && (profiles.get(f.fixtureId)?.heads.length ?? 0) > 0 && (!roles || roles.includes(f.role)))
    .sort((a, b) => (a.pos?.x ?? 0.5) - (b.pos?.x ?? 0.5));
}

/** A deterministic shuffle, so a quick start comes out the same each time. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let x = seed;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function quickStart(kind: QuickStartId, rig: Rig, profiles: Map<number, FixtureProfile>): Sequence {
  const all = lightsInOrder(rig, profiles);
  const back = lightsInOrder(rig, profiles, ["backdrop"]);
  const main = back.length >= 2 ? back : all;
  const ids = (fs: RigFixture[]) => fs.map((f) => f.fixtureId);
  const name = QUICK_STARTS.find((q) => q.id === kind)!.label;
  const make = (units: SequenceUnits, order: SequenceOrder, steps: SequenceStep[]): Sequence => ({ id: newId("seq"), name, units, order, steps });
  switch (kind) {
    case "lightning": {
      // The shape of a hand-built storm: everything at once, single flashes
      // that sweep and then scatter, a few that flicker in, and a glow to finish.
      const one = main.map((f) => [f.fixtureId]);
      const pick = (i: number) => one[i % Math.max(1, one.length)] ?? ids(all);
      const scatter = shuffled(one.map((_, i) => i), 7);
      return make("ms", "once", [
        newStep(ids(all), 200),
        newStep([], 60),
        ...one.map((l, i) => newStep(l, i % 2 ? 80 : 100)),
        newStep([], 40),
        ...scatter.map((i, k) => newStep(pick(i), 80, k % 3 === 1 ? { fadeIn: 60 } : {})),
        newStep([], 80),
        ...shuffled(one.map((_, i) => i), 3).map((i) => newStep(pick(i), 40, { fadeIn: 30 })),
        newStep(ids(main), 1000, { fadeIn: 500, fadeOut: 500 }),
      ]);
    }
    case "chase":
      return make("beats", "loop", main.map((f) => newStep([f.fixtureId], 1)));
    case "bounce":
      return make("beats", "bounce", main.map((f) => newStep([f.fixtureId], 1)));
    case "sides": {
      const left = ids(all.filter((f) => f.side === "SL"));
      const right = ids(all.filter((f) => f.side === "SR"));
      return make("beats", "loop", [newStep(left.length ? left : ids(all), 1), newStep(right.length ? right : ids(all), 1)]);
    }
    case "random": {
      const order = shuffled([...main, ...main], 11);
      return make("ms", "loop", order.flatMap((f) => [newStep([f.fixtureId], 80), newStep([], 160)]));
    }
  }
}

// ---------------------------------------------------------------- import from a QLC+ chaser

export interface ChaserInfo {
  id: number;
  name: string;
  path?: string;
  steps: number;
}

function functionEl(ws: Workspace, id: number): XmlElement | undefined {
  return childElements(ws.engine, "Function").find((f) => Number(getAttr(f, "ID")) === id);
}

/** The chasers in a show file, ready to pick from. Lightsmith's own are left out. */
export function chasersIn(ws: Workspace): ChaserInfo[] {
  return childElements(ws.engine, "Function")
    .filter((f) => getAttr(f, "Type") === "Chaser" && !(getAttr(f, "Path") ?? "").startsWith("Lightsmith"))
    .map((f) => ({ id: Number(getAttr(f, "ID")), name: getAttr(f, "Name") ?? "", path: getAttr(f, "Path"), steps: childElements(f, "Step").length }));
}

/** What a scene does to one fixture: whether it lights it, in what color and how brightly. */
function sceneLook(values: Map<number, number>, p: FixtureProfile): { lit: boolean; rgb: [number, number, number]; white: number; level: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const h of p.heads) {
    r = Math.max(r, values.get(h.red ?? -1) ?? 0);
    g = Math.max(g, values.get(h.green ?? -1) ?? 0);
    b = Math.max(b, values.get(h.blue ?? -1) ?? 0);
    w = Math.max(w, values.get(h.white ?? -1) ?? 0);
  }
  const dim = p.masterDimmer !== undefined ? values.get(p.masterDimmer) : undefined;
  const colorMax = Math.max(r, g, b, w);
  // A scene that only sets a dimmer (or sets it to 0) doesn't flash anything.
  const lit = colorMax > 0 && (dim === undefined || dim > 0);
  const level = (dim ?? 255) / 255;
  return { lit, rgb: [r, g, b], white: w, level };
}

const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

export interface ImportResult {
  sequence: Sequence;
  /** Seconds of nothing at the start, now the section's delay. */
  delay: number;
  /** Things that didn't come across exactly. */
  notes: string[];
}

/** The fixtures a scene lights, each with its color ("white" or a hex) and brightness. */
function sceneLit(fn: XmlElement, profiles: Map<number, FixtureProfile>): { id: number; color: string; level: number }[] {
  const lit: { id: number; color: string; level: number }[] = [];
  for (const fv of childElements(fn, "FixtureVal")) {
    const id = Number(getAttr(fv, "ID"));
    const p = profiles.get(id);
    if (!p) continue;
    const nums = textOf(fv).split(",").map((x) => Number(x.trim()));
    const values = new Map<number, number>();
    for (let i = 0; i + 1 < nums.length; i += 2) values.set(nums[i]!, nums[i + 1]!);
    const look = sceneLook(values, p);
    if (!look.lit) continue;
    const [r, g, b] = look.rgb;
    // Mostly white, or red, green and blue all up together: white.
    const white = look.white >= Math.max(r, g, b) * 0.8 || (Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 30);
    lit.push({ id, color: white ? "white" : hex([r + look.white, g + look.white, b + look.white]), level: look.level });
  }
  return lit;
}

/** A chaser's steps as sequence steps. Steps that run another chaser bring its steps in, in place. */
function stepsOf(ws: Workspace, ch: XmlElement, profiles: Map<number, FixtureProfile>, notes: string[], depth: number): SequenceStep[] {
  const modes = childElements(ch, "SpeedModes")[0];
  const speed = childElements(ch, "Speed")[0];
  const mode = (k: string) => (modes ? getAttr(modes, k) : undefined) ?? "Default";
  const common = (k: string) => Number((speed ? getAttr(speed, k) : undefined) ?? 0);
  const chName = getAttr(ch, "Name") ?? "";
  return childElements(ch, "Step")
    .sort((a, b) => Number(getAttr(a, "Number") ?? 0) - Number(getAttr(b, "Number") ?? 0))
    .flatMap((stEl, n): SequenceStep[] => {
      const where = depth ? `Step ${n + 1} of "${chName}"` : `Step ${n + 1}`;
      const fnId = Number(textOf(stEl).trim());
      const fn = functionEl(ws, fnId);
      const fnSpeed = fn ? childElements(fn, "Speed")[0] : undefined;
      const own = (k: string) => Number((fnSpeed ? getAttr(fnSpeed, k) : undefined) ?? 0);
      const per = (k: string) => Number(getAttr(stEl, k) ?? 0);
      const fadeIn = mode("FadeIn") === "PerStep" ? per("FadeIn") : mode("FadeIn") === "Common" ? common("FadeIn") : own("FadeIn");
      const fadeOut = mode("FadeOut") === "PerStep" ? per("FadeOut") : mode("FadeOut") === "Common" ? common("FadeOut") : own("FadeOut");
      // QLC+ keeps a step's hold apart from its fade in; a common or default duration includes it.
      const hold = mode("Duration") === "PerStep" ? per("Hold") : Math.max(0, (mode("Duration") === "Common" ? common("Duration") : own("Duration")) - fadeIn);
      if (!fn) {
        notes.push(`${where} ran a function that's no longer in the show file; it's a pause now.`);
        return [newStep([], hold)];
      }
      const type = getAttr(fn, "Type");
      if (type === "Chaser" && depth < 3) {
        // A chaser inside a chaser (a delay, then the strikes): bring its steps in.
        const inner = textOf(childElements(fn, "RunOrder")[0]).trim();
        if (inner && inner !== "SingleShot") notes.push(`${where} ran "${getAttr(fn, "Name")}" on a loop; its steps are included once.`);
        return stepsOf(ws, fn, profiles, notes, depth + 1);
      }
      // A scene, or a collection of scenes (QLC+ runs them all at once): what lights up, and how.
      const lit: { id: number; color: string; level: number }[] = [];
      const skipped: string[] = [];
      const gather = (f: XmlElement, seen: Set<string>) => {
        const t = getAttr(f, "Type");
        if (t === "Scene") {
          for (const l of sceneLit(f, profiles)) {
            const had = lit.find((x) => x.id === l.id);
            if (!had) lit.push(l);
            else had.level = Math.max(had.level, l.level); // brightest wins, as QLC+ does for intensity
          }
        } else if (t === "Collection") {
          for (const c of childElements(f, "Step")) {
            const id = textOf(c).trim();
            const part = functionEl(ws, Number(id));
            if (part && !seen.has(id)) gather(part, new Set(seen).add(id));
          }
        } else skipped.push(`${getAttr(f, "Name")} (${t})`);
      };
      if (type !== "Scene" && type !== "Collection") {
        notes.push(`${where} ran "${getAttr(fn, "Name")}", a ${type}, which a chaser step can't hold; it's a pause now.`);
        return [newStep([], hold, { fadeIn, fadeOut })];
      }
      gather(fn, new Set([String(fnId)]));
      if (skipped.length) notes.push(`${where} ran the collection "${getAttr(fn, "Name")}"; its scenes came across, but not ${skipped.join(", ")}.`);
      if (!lit.length) return [newStep([], hold, { fadeIn, fadeOut })];
      // Each light keeps the color the scene gives it: one step can be blue on one side and purple on the other.
      const colorOf = new Map(lit.map((l) => [l.id, l.color]));
      const level = Math.max(...lit.map((l) => l.level));
      const step = newStep(
        lit.map((l) => l.id),
        hold,
        { fadeIn, fadeOut, ...(level < 0.999 ? { level } : {}) },
      );
      return [tidyStepColors(step, (id) => colorOf.get(id) ?? "white")];
    });
}

/**
 * Turn a chaser in the show file into an editable sequence. Each step that
 * runs a scene becomes a step lighting the fixtures that scene lights, in its
 * color; empty scenes and scenes that only set dimmers become pauses; a
 * pause at the start of a one-shot chaser becomes the section's delay.
 */
export function importChaser(ws: Workspace, chaserId: number, profiles: Map<number, FixtureProfile>): ImportResult {
  const ch = functionEl(ws, chaserId);
  if (!ch || getAttr(ch, "Type") !== "Chaser") throw new Error("That chaser isn't in the show file any more.");
  const notes: string[] = [];
  const runOrder = textOf(childElements(ch, "RunOrder")[0]).trim();
  const order: SequenceOrder = runOrder === "PingPong" ? "bounce" : runOrder === "SingleShot" ? "once" : "loop";
  if (runOrder === "Random") notes.push("The chaser ran its steps in a random order; the sequence runs them in order, on a loop.");
  const steps = stepsOf(ws, ch, profiles, notes, 0);
  // Pauses at the start of a one-shot chaser are a delay: the section's job now.
  let delayMs = 0;
  if (order === "once") {
    while (steps.length > 1 && isPause(steps[0]!)) {
      const gap = steps.shift()!;
      delayMs += gap.fadeIn + gap.hold;
    }
  }
  const name = getAttr(ch, "Name") ?? "Imported sequence";
  return { sequence: { id: newId("seq"), name, units: "ms", order, steps }, delay: Math.round(delayMs) / 1000, notes };
}
