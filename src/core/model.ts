/**
 * The saved project: how the user's rig is used, and their songs.
 * Plain JSON so it can live in the browser or be exported as a file.
 */
import { energyOf, moodById, patternById, SONG_TEMPLATES, sectionTypeById, type ColorChange, type EffectId, type MoverSpread } from "./presets";

export type Role = "backdrop" | "side" | "mover" | "front" | "ignore";
export type Side = "SL" | "C" | "SR";
export type Mount = "floor" | "truss";

export interface RigFixture {
  fixtureId: number;
  role: Role;
  side: Side;
  /** Left-to-right order on stage, stage left first. */
  order: number;
  /**
   * Where it is on the stage, seen from the audience: x from stage right to
   * stage left (0..1), y from the back wall to the front edge (0..1; a little
   * past 1 is in front of the stage). Read from QLC+'s 3D view when it has one.
   */
  pos?: { x: number; y: number };
  /** How high it is, as a share of the stage height (0 = floor). Above half is hung from a truss. */
  height?: number;
  /** A bar standing on its end rather than lying flat. */
  upright?: boolean;
  /**
   * Moving heads: turned around to face the back of the stage. The same pan
   * and tilt then aim it as the mirror image of a head facing the audience.
   */
  facesBack?: boolean;
  /** Moved in Lightsmith since the show file was loaded; otherwise QLC+'s 3D view wins. */
  moved?: boolean;
  /** Movers: the position everything moves around (0-255). */
  home?: { pan: number; tilt: number };
  /** Movers: run movement in the opposite direction (e.g. a head facing the other way). */
  reverse?: boolean;
  /** Older projects: floor or truss, before heights were kept. Use mountOf(). */
  mount?: Mount;
  /** True once the user has edited this fixture; until then we keep re-guessing. */
  userSet?: boolean;
}

export interface Rig {
  fixtures: RigFixture[];
  /** The stage size from QLC+'s 3D view, in metres, when the show has one. */
  stage?: { width: number; depth: number; height: number; feet: boolean };
}

/** On the floor, or hung from a truss (anything in the top half of the stage). */
export function mountOf(f: Pick<RigFixture, "height" | "mount">): Mount {
  if (f.height !== undefined) return f.height > 0.5 ? "truss" : "floor";
  return f.mount ?? "floor";
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
  /** Brightness (0–1) per kind of light; missing = automatic, from the mood and energy. */
  brightness?: Partial<Record<ColorJob, number>>;
  /** Settings for individual lights, by fixture ID. They win over everything above. */
  lights?: Record<string, LightSetting>;
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
    // A plain wash until the user picks a pattern; each mood suggests one.
    pattern: "solid",
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
  // Sections saved before patterns could be chosen followed the mood's; keep that look.
  const out: Section = { ...base, pattern: "mood", ...s, effects: { ...(s.effects ?? {}) }, colors: [...(s.colors ?? [])], effectTargets: { ...(s.effectTargets ?? {}) }, colorLayout: { ...(s.colorLayout ?? {}) }, brightness: { ...(s.brightness ?? {}) }, lights: Object.fromEntries(Object.entries(s.lights ?? {}).map(([k, v]) => [k, { ...v }])) };
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

/** The overall level a section's mood and energy give (0.15–1). */
export function sectionLevel(s: Pick<Section, "mood" | "energy">): number {
  return Math.max(0.15, Math.min(1, moodById(s.mood).intensity * energyOf(s.energy).level));
}

/** How bright each kind of light is: the section's own setting, or automatic from mood and energy. */
export function lightLevels(s: Pick<Section, "mood" | "energy" | "brightness">): Record<ColorJob, { level: number; auto: boolean }> {
  const level = sectionLevel(s);
  const auto: Record<ColorJob, number> = { backdrop: level, side: level, mover: level, front: Math.max(0.3, level * 0.8) };
  const own = s.brightness ?? {};
  const out = {} as Record<ColorJob, { level: number; auto: boolean }>;
  for (const job of Object.keys(auto) as ColorJob[]) {
    const v = own[job];
    out[job] = v === undefined ? { level: auto[job], auto: true } : { level: Math.max(0, Math.min(1, v)), auto: false };
  }
  return out;
}

/**
 * One light's own settings for a section, on top of the mood, energy and the
 * settings for its kind of light. Anything left out stays automatic.
 */
export interface LightSetting {
  /** A color ID ("amber", "warmWhite") or a custom "#rrggbb". */
  color?: string;
  /** Brightness, 0–1. */
  level?: number;
  /** Dark for this section. */
  off?: boolean;
  /** Stay in the section's pattern even with its own color (normally it sits out). */
  keepPattern?: boolean;
}

/** A light's own settings in a section, if it has any. */
export function lightSetting(s: Pick<Section, "lights">, fixtureId: number): LightSetting | undefined {
  const l = s.lights?.[String(fixtureId)];
  return l && (l.color !== undefined || l.level !== undefined || l.off) ? l : undefined;
}

/** Lights that sit out of the pattern and effects: off ones, and (for the pattern) ones holding their own color. */
export function sitsOut(s: Pick<Section, "lights">, fixtureId: number, what: "pattern" | "effects"): boolean {
  const l = lightSetting(s, fixtureId);
  if (!l) return false;
  if (l.off) return true;
  return what === "pattern" && l.color !== undefined && !l.keepPattern;
}

/** Which color each kind of light uses: the section's choices, else the mood's, else the defaults. */
export function colorLayoutOf(s: Pick<Section, "mood" | "colorLayout">): Record<ColorJob, ColorTarget> {
  return { ...DEFAULT_COLOR_LAYOUT, ...(moodById(s.mood).layout ?? {}), ...(s.colorLayout ?? {}) };
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
