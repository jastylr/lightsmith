/**
 * The saved project: how the user's rig is used, and their songs.
 * Plain JSON so it can live in the browser or be exported as a file.
 */
import { patternById, SONG_TEMPLATES, sectionTypeById, type ColorChange, type EffectId, type MoverSpread } from "./presets";

export type Role = "backdrop" | "side" | "mover" | "front" | "ignore";
export type Side = "SL" | "C" | "SR";

export interface RigFixture {
  fixtureId: number;
  role: Role;
  side: Side;
  /** Left-to-right order on stage, stage left first. */
  order: number;
  /** Where it sits on the stage plan, seen from the audience (0..1, x = left→right, y = back→front). */
  pos?: { x: number; y: number };
  /** Movers: the position everything moves around (0-255). */
  home?: { pan: number; tilt: number };
  /** Movers: run movement in the opposite direction (e.g. a head facing the other way). */
  reverse?: boolean;
  /** True once the user has edited this fixture; until then we keep re-guessing. */
  userSet?: boolean;
}

export interface Rig {
  fixtures: RigFixture[];
}

export type Focus = "all" | Side;

/** The kinds of light that colors can be assigned to. */
export type ColorJob = "backdrop" | "side" | "mover" | "front";
/** "mix" spreads the palette across those lights, a number picks one palette color, "white" is warm white. */
export type ColorTarget = "mix" | "white" | number;
export const DEFAULT_COLOR_LAYOUT: Record<ColorJob, ColorTarget> = { backdrop: "mix", side: "mix", mover: "mix", front: "white" };
export type Transition = "snap" | "fade" | "build";

export interface SectionEffects {
  lightning?: boolean;
  lightningDelaySec?: number;
  strobe?: boolean;
  blinder?: boolean;
  beatPulse?: boolean;
  sparkle?: boolean;
}

export interface Section {
  id: string;
  type: string; // SECTION_TYPES id
  name: string;
  bpm: number;
  bars: number;
  beatsPerBar: number;
  mood: string; // MOODS id
  energy: number; // 1..5
  colors: string[]; // color ids or "#rrggbb"; empty = use the mood's colors
  /** How often to switch between the colors ("mood" follows the mood). */
  colorChange: ColorChange | "mood";
  /** Crossfade when switching colors. */
  colorFade: boolean;
  /** Which palette color each kind of light uses (missing = DEFAULT_COLOR_LAYOUT). */
  colorLayout?: Partial<Record<ColorJob, ColorTarget>>;
  /** Lights the pattern runs on (fixture IDs). Missing = the backdrop. */
  patternTargets?: number[];
  /** Backdrop pattern id, or "mood". */
  pattern: string;
  movement: string; // MOVEMENTS id, or "mood"
  moverSpread: MoverSpread;
  focus: Focus;
  effects: SectionEffects;
  /** Which lights each effect uses (fixture IDs). Missing = the effect's default lights. */
  effectTargets?: Partial<Record<EffectId, number[]>>;
  transition: Transition;
  /** Move to the next section by itself after its length (otherwise wait for a trigger). */
  autoAdvance: boolean;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  sections: Section[];
}

export interface Project {
  version: 1;
  rig: Rig;
  songs: Song[];
}

let counter = 0;
export function newId(prefix = "s"): string {
  counter++;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function newSection(type: string, bpm: number): Section {
  const t = sectionTypeById(type);
  return {
    id: newId("sec"),
    type: t.id,
    name: t.label,
    bpm,
    bars: t.bars,
    beatsPerBar: 4,
    mood: t.mood,
    energy: t.energy,
    colors: [],
    colorChange: "mood",
    colorFade: false,
    pattern: "mood",
    movement: "mood",
    moverSpread: "together",
    focus: "all",
    effects: {},
    transition: t.transition,
    autoAdvance: false,
  };
}

/** Fill in fields added after a section was saved. */
export function normalizeSection(s: Partial<Section> & { id: string }): Section {
  const base = newSection(s.type ?? "custom", s.bpm ?? 120);
  const out: Section = { ...base, ...s, effects: { ...(s.effects ?? {}) }, colors: [...(s.colors ?? [])], effectTargets: { ...(s.effectTargets ?? {}) }, colorLayout: { ...(s.colorLayout ?? {}) } };
  // Version 0.2 had a "Rain" effect; it's now the Drizzle pattern. Keep the
  // drizzle where there was no other pattern, on the same lights.
  const old = out.effects as SectionEffects & { rain?: boolean };
  const oldTargets = out.effectTargets as Record<string, number[] | undefined>;
  if (old.rain && !patternById(out.pattern).algorithm) {
    out.pattern = "drizzle";
    if (oldTargets.rain) out.patternTargets = oldTargets.rain;
  }
  delete old.rain;
  delete oldTargets.rain;
  return out;
}

export function normalizeProject(p: Project): Project {
  return {
    version: 1,
    rig: { fixtures: [...(p.rig?.fixtures ?? [])] },
    songs: (p.songs ?? []).map((song) => ({ ...song, sections: song.sections.map(normalizeSection) })),
  };
}

/** A new song starts empty; the user adds sections (or picks a starting structure). */
export function newSong(title = "New song", bpm = 120): Song {
  return { id: newId("song"), title, bpm, sections: [] };
}

/** Sections for one of the SONG_TEMPLATES, at the song's tempo. */
export function sectionsFromTemplate(templateId: string, bpm: number): Section[] {
  const t = SONG_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return [];
  const count: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const type of t.sections) totals[type] = (totals[type] ?? 0) + 1;
  return t.sections.map((type) => {
    const s = newSection(type, bpm);
    count[type] = (count[type] ?? 0) + 1;
    // Number repeated sections: Verse 1, Verse 2…
    if ((totals[type] ?? 0) > 1) s.name = `${s.name} ${count[type]}`;
    return s;
  });
}

/** A Blackout section: every light off, for a gap, a pause or a dramatic stop. */
export const isBlackout = (s: Pick<Section, "type">) => s.type === "blackout";

/** A section's length in beats (bars can include part of a bar). */
export const sectionBeats = (s: Pick<Section, "bars" | "beatsPerBar">) => Math.max(1, Math.round(s.bars * s.beatsPerBar));

/** "16 bars", "1 bar", or "16 bars + 2 beats". */
export function lengthLabel(s: Pick<Section, "bars" | "beatsPerBar">): string {
  const beats = sectionBeats(s);
  const bars = Math.floor(beats / s.beatsPerBar);
  const rest = beats - bars * s.beatsPerBar;
  const barText = `${bars} ${bars === 1 ? "bar" : "bars"}`;
  if (!rest) return barText;
  const beatText = `${rest} ${rest === 1 ? "beat" : "beats"}`;
  return bars ? `${barText} + ${beatText}` : beatText;
}

export function sectionMs(s: Pick<Section, "bpm" | "beatsPerBar" | "bars">): number {
  return (60000 / s.bpm) * s.beatsPerBar * s.bars;
}

/** Side of the stage from a stage-plan position seen from the audience (stage left is on the audience's right). */
export function sideFromX(x: number): Side {
  return x > 0.62 ? "SL" : x < 0.38 ? "SR" : "C";
}
