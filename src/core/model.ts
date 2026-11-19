/**
 * The saved project: how the user's rig is used, and their songs.
 * Plain JSON so it can live in the browser or be exported as a file.
 */
import { COLOR_CHANGES, energyOf, moodById, patternById, SONG_TEMPLATES, sectionTypeById, type ColorChange, type EffectId, type MoverSpread } from "./presets";

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

/** Pan and tilt for one moving head (0-255 each). */
export interface PanTilt {
  pan: number;
  tilt: number;
}

/**
 * A named place for the moving heads to point, such as "X over the drums",
 * with each head's own pan and tilt. Set once for the rig, used by any section.
 */
export interface AimPosition {
  id: string;
  name: string;
  /** Pan and tilt by fixture ID. A head without one uses its home position. */
  aims: Record<string, PanTilt>;
}

export interface Rig {
  fixtures: RigFixture[];
  /** Named places for the moving heads to point, in the order the user made them. */
  positions?: AimPosition[];
  /** The stage size from QLC+'s 3D view, in metres, when the show has one. */
  stage?: { width: number; depth: number; height: number; feet: boolean };
}

/**
 * The size and placement of a movement's shape. Size scales the movement's
 * own width and height; width and height (0-255, as in QLC+) replace them.
 */
export interface MoverShape {
  /** 0.5 small, 1 as designed, 1.5 large, 2 huge. */
  size?: number;
  width?: number;
  height?: number;
  /** Degrees the shape is turned (QLC+'s EFX rotation). */
  rotation?: number;
  /** Nudge the shape's middle from the section's position, in DMX steps. */
  panNudge?: number;
  tiltNudge?: number;
  /** With heads spread across the shape: degrees between one head and the next. */
  fan?: number;
}

/**
 * A movement's actual shape around a head's aim: width and height clamped so
 * the shape stays inside 0-255, the middle moved by the nudges, and the turn.
 */
/** Tilt within this of 128 points a floor-standing head (nearly) straight up. */
export const UPRIGHT_TILT = 24;

/** The largest EFX width or height QLC+ accepts. */
export const EFX_MAX = 127;

export function moverShapeAt(shape: MoverShape | undefined, movement: { width: number; height: number }, aim: { pan: number; tilt: number }) {
  const sh = shape ?? {};
  const size = sh.size ?? 1;
  const x = Math.max(0, Math.min(255, Math.round(aim.pan + (sh.panNudge ?? 0))));
  const y = Math.max(0, Math.min(255, Math.round(aim.tilt + (sh.tiltNudge ?? 0))));
  // QLC+ treats width and height as how far the head travels EACH WAY from
  // the middle (x = offset ± width), and caps both at 127 when it loads a
  // show. So the shape is kept to 127 and to the room on each side.
  const w = Math.min(Math.round(sh.width ?? movement.width * size), EFX_MAX, x, 255 - x);
  const h = Math.min(Math.round(sh.height ?? movement.height * size), EFX_MAX, y, 255 - y);
  return { x, y, width: Math.max(0, w), height: Math.max(0, h), rotation: Math.round(((sh.rotation ?? 0) % 360 + 360) % 360) };
}

/**
 * How many beats one full moving-head movement takes in a section: the
 * section's own choice, or the movement's length at energy 3, sped up or
 * slowed down by the section's energy.
 */
export function moverCycleBeats(s: Pick<Section, "moverBeats" | "beatsPerBar" | "energy">, movementBars: number): number {
  if (s.moverBeats && s.moverBeats > 0) return s.moverBeats;
  return (movementBars * s.beatsPerBar) / energyOf(s.energy).speed;
}

/**
 * Where a moving head points in a section: the section's saved position if it
 * has one for this head, otherwise the head's home position.
 */
export function aimOf(s: Pick<Section, "aim">, rig: Pick<Rig, "positions">, f: Pick<RigFixture, "fixtureId" | "home">): PanTilt {
  const pos = s.aim ? rig.positions?.find((p) => p.id === s.aim) : undefined;
  return pos?.aims[String(f.fixtureId)] ?? f.home ?? { pan: 128, tilt: 128 };
}

/**
 * A starting point for one head in a new position, from a head already set:
 * heads facing opposite ways get the same values (they aim as mirror images
 * anyway); heads facing the same way get the pan mirrored about the middle.
 */
export function mirroredAim(from: PanTilt, fromFacesBack: boolean, toFacesBack: boolean): PanTilt {
  return fromFacesBack !== toFacesBack ? { ...from } : { pan: 255 - from.pan, tilt: from.tilt };
}

/** On the floor, or hung from a truss (anything in the top half of the stage). */
export function mountOf(f: Pick<RigFixture, "height" | "mount">): Mount {
  if (f.height !== undefined) return f.height > 0.5 ? "truss" : "floor";
  return f.mount ?? "floor";
}

export type Focus = "all" | Side;

/** The kinds of light that colors can be assigned to. */
export type ColorJob = "backdrop" | "side" | "mover" | "front";
/**
 * Which colors a kind of light uses: "mix" spreads the whole palette across
 * them, a list spreads just those colors (palette entries), a number picks one
 * palette color (older projects), and "white" is warm white.
 */
export type ColorTarget = "mix" | "white" | number | string[];
export const DEFAULT_COLOR_LAYOUT: Record<ColorJob, ColorTarget> = { backdrop: "mix", side: "mix", mover: "mix", front: "white" };
export type Transition = "snap" | "fade" | "build";

export type StrobeSpeed = "slow" | "medium" | "fast";

/** Moving-head beam settings for a section. Anything missing is left as the fixture has it. */
export interface BeamSettings {
  /** 0 = narrowest, 1 = widest. */
  zoom?: number;
  strobe?: StrobeSpeed;
  /** A gobo slot, by its name in the fixture definition. Missing = open. */
  gobo?: string;
  prism?: boolean;
}

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
  /** Which kinds of light switch between their colors when the section's colors change (missing = yes). */
  colorSwitch?: Partial<Record<ColorJob, boolean>>;
  /** A kind of light's own rate for switching colors (a COLOR_CHANGES id); missing = the section's. */
  colorRates?: Partial<Record<ColorJob, ColorChange>>;
  /** Brightness (0–1) per kind of light; missing = automatic, from the mood and energy. */
  brightness?: Partial<Record<ColorJob, number>>;
  /** Settings for individual lights, by fixture ID. They win over everything above. */
  lights?: Record<string, LightSetting>;
  /** Lights the pattern runs on (fixture IDs). Missing = the backdrop. */
  patternTargets?: number[];
  /** Backdrop pattern id, or "mood". */
  pattern: string;
  movement: string; // MOVEMENTS id, or "mood"
  /** Where the moving heads point (an AimPosition id); missing = each head's home position. */
  aim?: string;
  /** Beats for one full movement; missing = from the movement and the energy. */
  moverBeats?: number;
  /** The size and placement of the moving heads' shape; missing parts = the movement's own. */
  moverShape?: MoverShape;
  /** Zoom, strobe, gobo and prism for the moving heads that have them. */
  beam?: BeamSettings;
  /** Sequences that run in this section. */
  sequences?: SequenceUse[];
  /** The preset this section's look came from, if any. */
  preset?: string;
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

/**
 * One step of a sequence: some lights in one color for a moment. A step
 * with no lights is a pause. Lights not in a step show the section's look.
 */
export interface SequenceStep {
  id: string;
  /** Fixture IDs. Empty = a pause. */
  lights: number[];
  /** A color id or hex; missing = white. */
  color?: string;
  /** 0-1; missing = full. */
  level?: number;
  /** In the sequence's units (milliseconds or beats). */
  fadeIn: number;
  hold: number;
  fadeOut: number;
}

export type SequenceUnits = "ms" | "beats";
export type SequenceOrder = "once" | "loop" | "bounce";

/** A step-by-step chaser the user builds (or imports), usable in any section. */
export interface Sequence {
  id: string;
  name: string;
  units: SequenceUnits;
  order: SequenceOrder;
  steps: SequenceStep[];
}

/** A section's use of a sequence: which one, and how long after the section starts. */
export interface SequenceUse {
  id: string;
  /** Seconds after the section starts. */
  delay: number;
}

/** The parts of a section a preset keeps: its whole look, but not its name, length or tempo. */
export const LOOK_KEYS = [
  "mood",
  "energy",
  "colors",
  "colorLayout",
  "colorSwitch",
  "colorRates",
  "colorChange",
  "colorFade",
  "brightness",
  "pattern",
  "patternTargets",
  "movement",
  "moverSpread",
  "moverBeats",
  "moverShape",
  "aim",
  "beam",
  "focus",
  "effects",
  "effectTargets",
  "lights",
  "sequences",
  "transition",
] as const satisfies readonly (keyof Section)[];
export type SectionLook = Partial<Pick<Section, (typeof LOOK_KEYS)[number]>>;

/** A look the user saved, to start any section from. */
export interface LookPreset {
  id: string;
  name: string;
  /** The section type it was saved from, used when adding a section from it. */
  type: string;
  look: SectionLook;
}

export interface Project {
  version: 1;
  rig: Rig;
  songs: Song[];
  /** Sequences, shared by every song. */
  sequences?: Sequence[];
  /** The user's own presets, shared by every song. */
  presets?: LookPreset[];
}

/** A section's look, copied so the preset doesn't share anything with the section. */
export function lookOf(s: Section): SectionLook {
  const out: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) if (s[k] !== undefined) out[k] = structuredClone(s[k]);
  return out as SectionLook;
}

/**
 * A section with a preset's look applied: everything the preset keeps is
 * replaced (settings it doesn't have go back to their defaults); the name,
 * type, length and tempo stay.
 */
export function applyLook(s: Section, p: LookPreset): Section {
  const fresh = newSection(s.type, s.bpm);
  const next: Record<string, unknown> = { ...s };
  for (const k of LOOK_KEYS) {
    const v = p.look[k] ?? (fresh as unknown as Record<string, unknown>)[k];
    if (v === undefined) delete next[k];
    else next[k] = structuredClone(v);
  }
  return { ...(next as unknown as Section), preset: p.id };
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
  const out: Section = { ...base, pattern: "mood", ...s, effects: { ...(s.effects ?? {}) }, colors: [...(s.colors ?? [])], effectTargets: { ...(s.effectTargets ?? {}) }, colorLayout: { ...(s.colorLayout ?? {}) }, brightness: { ...(s.brightness ?? {}) }, ...(s.beam ? { beam: { ...s.beam } } : {}), ...(s.sequences ? { sequences: s.sequences.map((u) => ({ ...u })) } : {}), ...(s.colorSwitch ? { colorSwitch: { ...s.colorSwitch } } : {}), ...(s.colorRates ? { colorRates: { ...s.colorRates } } : {}), ...(s.moverShape ? { moverShape: { ...s.moverShape } } : {}), lights: Object.fromEntries(Object.entries(s.lights ?? {}).map(([k, v]) => [k, { ...v }])) };
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
    // Keep everything the rig holds (stage size, saved positions), not just its fixtures.
    rig: { ...(p.rig ?? {}), fixtures: [...(p.rig?.fixtures ?? [])] },
    songs: (p.songs ?? []).map((song) => ({ ...song, sections: song.sections.map(normalizeSection) })),
    ...(p.sequences ? { sequences: p.sequences.map((q) => ({ ...q, steps: q.steps.map((st) => ({ ...st, lights: [...st.lights] })) })) } : {}),
    ...(p.presets ? { presets: p.presets.map((x) => ({ ...x, look: structuredClone(x.look) })) } : {}),
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

/** The colors a kind of light uses, in palette order, or "white" for warm white. Never empty. */
export function jobPalette(t: ColorTarget, palette: string[]): string[] | "white" {
  if (t === "white") return "white";
  if (typeof t === "number") return [palette[t % palette.length]!];
  if (Array.isArray(t)) {
    const chosen = palette.filter((c) => t.includes(c));
    return chosen.length ? chosen : [palette[0]!];
  }
  return palette;
}

/** Whether a kind of light switches between its colors when the section's colors change. */
export const switchesColors = (s: Pick<Section, "colorSwitch">, job: ColorJob) => s.colorSwitch?.[job] ?? true;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * How many color steps a section's color changes go through: enough for
 * every kind of light that switches to come back round (at most 12), or 0
 * when nothing switches.
 */
export function colorSteps(s: Pick<Section, "colorSwitch" | "colorLayout" | "mood">, palette: string[], changes: boolean): number {
  if (!changes) return 0;
  const layout = colorLayoutOf(s);
  const lengths = COLOR_JOBS.filter((j) => switchesColors(s, j)).map((j) => {
    const set = jobPalette(layout[j], palette);
    return set === "white" ? 1 : set.length;
  }).filter((n) => n > 1);
  if (!lengths.length) return 0;
  return Math.min(12, lengths.reduce((a, b) => (a * b) / gcd(a, b)));
}

/**
 * A light's color at a color step: the i-th light of a kind (stage left
 * first) takes the i-th of its colors, moved on by `k` when it switches.
 */
export function jobColorAt(s: Pick<Section, "colorSwitch">, layout: Record<ColorJob, ColorTarget>, palette: string[], job: ColorJob, i: number, k: number, offset = 0): string {
  const set = jobPalette(layout[job], palette);
  if (set === "white") return "warmWhite";
  const step = switchesColors(s, job) ? k : 0;
  return set[(((i + offset + step) % set.length) + set.length) % set.length]!;
}

export const COLOR_JOBS: ColorJob[] = ["backdrop", "side", "mover", "front"];

/**
 * How often a kind of light switches colors (a COLOR_CHANGES id; "hold"
 * when it doesn't): Steady holds; its own rate wins; otherwise the
 * section's (or its mood's).
 */
export function colorRateOf(s: Pick<Section, "colorSwitch" | "colorRates" | "colorChange" | "mood">, job: ColorJob): ColorChange {
  if (!switchesColors(s, job)) return "hold";
  const own = s.colorRates?.[job];
  if (own) return own;
  return (s.colorChange === "mood" ? moodById(s.mood).colorChange : s.colorChange) as ColorChange;
}

/** Milliseconds between color changes for a rate (0 = they don't change). */
export function ratePeriodMs(rate: string, bpm: number, beatsPerBar: number): number {
  const c = COLOR_CHANGES.find((x) => x.id === rate);
  if (!c || c.beats === 0) return 0;
  const beat = 60000 / bpm;
  return c.beats > 0 ? c.beats * beat : -c.beats * beat * beatsPerBar;
}

/** Color steps for a group of kinds of light switching together: enough for each to come back round (at most 12). */
export function stepsFor(s: Pick<Section, "colorLayout" | "mood">, palette: string[], jobs: ColorJob[]): number {
  const layout = colorLayoutOf(s);
  const lengths = jobs.map((j) => {
    const set = jobPalette(layout[j], palette);
    return set === "white" ? 1 : set.length;
  }).filter((n) => n > 1);
  if (!lengths.length) return 0;
  return Math.min(12, lengths.reduce((a, b) => (a * b) / gcd(a, b)));
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

/** The whole number of bars nearest to a length in seconds, at least one. */
export function barsForSeconds(seconds: number, bpm: number, beatsPerBar: number): number {
  return Math.max(1, Math.round((seconds * bpm) / (60 * beatsPerBar)));
}

export function sectionMs(s: Pick<Section, "bpm" | "beatsPerBar" | "bars">): number {
  return (60000 / s.bpm) * s.beatsPerBar * s.bars;
}

/** Side of the stage from a stage-plan position seen from the audience (stage left is on the audience's right). */
export function sideFromX(x: number): Side {
  return x > 0.62 ? "SL" : x < 0.38 ? "SR" : "C";
}
