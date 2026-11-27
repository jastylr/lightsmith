/**
 * The saved project: how the user's rig is used, and their songs.
 * Plain JSON so it can live in the browser or be exported as a file.
 */
import { normalizeAudio, type SongAudio } from "./audio";
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
  /**
   * Moving heads: seconds it takes to pan from one end of its range to the
   * other at full speed. Sets how fast a movement can really run.
   */
  panSeconds?: number;
  /** Moving heads: how far it pans and tilts end to end, in degrees (from the definition, or typed in). */
  panRange?: number;
  tiltRange?: number;
  /**
   * Moving heads: the pan value that points it straight at the audience
   * with its tilt below 128. Measured once on the rig; with it, the preview
   * can show where the head really points.
   */
  panFront?: number;
  /** Which way raising pan turns the beam: towards stage left (the audience's right) or stage right. */
  panTurns?: "left" | "right";
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
/**
 * Where a new moving head rests until you set it. Tilt 128 is the middle of
 * the range, which points a head straight up (or down, hung), and a head
 * pointing straight up can only spin its beam in place. So it starts tilted
 * well away from the middle, over the crowd: on a real rig (JCYW Flody) a
 * tilt below 128 leans a head the way its base faces, so a head turned round
 * to face the backdrop needs the mirror value (above 128) to lean forwards.
 */
export const DEFAULT_HOME: PanTilt = { pan: 128, tilt: 80 };
export function defaultHome(facesBack?: boolean): PanTilt {
  return facesBack ? { pan: DEFAULT_HOME.pan, tilt: 256 - DEFAULT_HOME.tilt } : { ...DEFAULT_HOME };
}
/** True when a home is still the untouched default for one facing or the other. */
export function isDefaultHome(home: PanTilt | undefined, facesBack?: boolean): boolean {
  const d = defaultHome(facesBack);
  return !!home && home.pan === d.pan && home.tilt === d.tilt;
}

/** Tilt within this of 128 points a floor-standing head (nearly) straight up. */
export const UPRIGHT_TILT = 24;

/** The largest EFX width or height QLC+ accepts. */
export const EFX_MAX = 127;

/** Typical budget moving heads: 540° pan, 270° tilt. */
export const DEFAULT_PAN_RANGE = 540;
export const DEFAULT_TILT_RANGE = 270;

/**
 * A movement's size on a particular head. Movements are sized for a head that
 * pans 540° and tilts 270°; a head with a smaller range needs bigger DMX values
 * to sweep the same angle, so it gets them. Width and height you set yourself
 * (fine-tuning) are DMX values and stay as they are.
 */
export function moverShapeAt(
  shape: MoverShape | undefined,
  movement: { width: number; height: number },
  aim: { pan: number; tilt: number },
  head?: { panRange?: number; tiltRange?: number },
) {
  const sh = shape ?? {};
  const size = sh.size ?? 1;
  const panScale = DEFAULT_PAN_RANGE / (head?.panRange ?? DEFAULT_PAN_RANGE);
  const tiltScale = DEFAULT_TILT_RANGE / (head?.tiltRange ?? DEFAULT_TILT_RANGE);
  const x = Math.max(0, Math.min(255, Math.round(aim.pan + (sh.panNudge ?? 0))));
  const y = Math.max(0, Math.min(255, Math.round(aim.tilt + (sh.tiltNudge ?? 0))));
  // QLC+ treats width and height as how far the head travels EACH WAY from
  // the middle (x = offset ± width), and caps both at 127 when it loads a
  // show. So the shape is kept to 127 and to the room on each side.
  const w = Math.min(Math.round(sh.width ?? movement.width * size * panScale), EFX_MAX, x, 255 - x);
  const h = Math.min(Math.round(sh.height ?? movement.height * size * tiltScale), EFX_MAX, y, 255 - y);
  return { x, y, width: Math.max(0, w), height: Math.max(0, h), rotation: Math.round(((sh.rotation ?? 0) % 360 + 360) % 360) };
}

/**
 * How many beats one full moving-head movement takes in a section: the
 * section's own choice, or the movement's length at energy 3, sped up or
 * slowed down by the section's energy.
 */
/** How fast the section's pattern runs: its own choice, or the pace its energy sets. */
export function patternSpeedOf(s: Pick<Section, "patternSpeed" | "energy">): number {
  return s.patternSpeed && s.patternSpeed > 0 ? s.patternSpeed : energyOf(s.energy).speed;
}

/**
 * A section with another's look: everything a preset would keep is copied
 * (settings the source leaves at their defaults go back to the defaults); the
 * name, type, length, tempo, links and cue stay.
 */
export function copyLook(from: Section, to: Section): Section {
  const next = applyLook(to, { id: "", name: "", type: from.type, look: lookOf(from) });
  if (from.preset) next.preset = from.preset;
  else delete next.preset;
  return next;
}

export function moverCycleBeats(s: Pick<Section, "moverBeats" | "beatsPerBar" | "energy">, movementBars: number): number {
  if (s.moverBeats && s.moverBeats > 0) return s.moverBeats;
  return (movementBars * s.beatsPerBar) / energyOf(s.energy).speed;
}

/** A budget moving head pans its whole range in about this long (seconds). */
export const DEFAULT_PAN_SECONDS = 2.5;
/** Heads speed up and slow down at the corners, so leave this much spare time. */
const MOVE_MARGIN = 1.25;

/**
 * One point of a QLC+ EFX shape, x and y from -1 to 1, as QLC+ works it out
 * (engine/src/efx.cpp). `t` runs from 0 to 2π over one cycle.
 */
export function efxPoint(algorithm: string, t: number): [number, number] {
  const c = Math.cos;
  switch (algorithm) {
    case "Circle":
      return [c(t + Math.PI / 2), c(t)];
    case "Eight":
      return [c(t * 2 + Math.PI / 2), c(t)];
    case "Line":
      return [c(t), c(t)];
    case "Diamond":
      return [c(t - Math.PI / 2) ** 3, c(t) ** 3];
    case "Leaf":
      return [c(t + Math.PI / 2) ** 5, c(t)];
    case "Lissajous":
      // Lightsmith writes X frequency 2 (phase 90°) and Y frequency 3.
      return [c(2 * t - Math.PI / 2), c(3 * t)];
    case "Square": {
      // Round the square's edge: corners (±1, ±1).
      const q = (t / (Math.PI / 2)) % 4;
      const f = q % 1;
      const k = Math.floor(q);
      return k === 0 ? [f * 2 - 1, 1] : k === 1 ? [1, 1 - f * 2] : k === 2 ? [1 - f * 2, -1] : [-1, f * 2 - 1];
    }
    default:
      return [c(t + Math.PI / 2), c(t)];
  }
}

/**
 * How far the busier motor travels in one cycle, in DMX steps. Pan and tilt
 * motors move at the same time, so each moment costs whichever has further to go.
 */
export function efxTravel(algorithm: string, width: number, height: number): number {
  const n = 720;
  let total = 0;
  let [px, py] = efxPoint(algorithm, 0);
  for (let i = 1; i <= n; i++) {
    const [x, y] = efxPoint(algorithm, (i / n) * Math.PI * 2);
    total += Math.max(Math.abs(x - px) * width, Math.abs(y - py) * height);
    px = x;
    py = y;
  }
  return total;
}

export interface MoverTiming {
  /** Beats per cycle that will actually run. */
  beats: number;
  /** Beats per cycle asked for (the Speed setting, or Auto). */
  asked: number;
  /** True when the heads can't keep up with what was asked, so it runs slower. */
  slowed: boolean;
  /** The quickest one cycle can be on these heads, in ms. */
  minMs: number;
}

/**
 * How long one cycle of the movement takes. A shape the heads can't get
 * round in time doesn't look faster on stage: the motors fall behind and the
 * beams twitch on the spot. So the cycle is doubled (staying on the beat)
 * until the slowest head can really get round it.
 */
export function moverTiming(
  s: Pick<Section, "moverBeats" | "beatsPerBar" | "energy" | "bpm" | "moverShape" | "aim">,
  movement: { algorithm?: string; bars: number; width: number; height: number },
  rig: Pick<Rig, "fixtures" | "positions">,
): MoverTiming {
  const asked = movement.bars ? moverCycleBeats(s, movement.bars) : 0;
  if (!movement.algorithm || !asked) return { beats: asked, asked, slowed: false, minMs: 0 };
  const heads = rig.fixtures.filter((f) => f.role === "mover");
  let minMs = 0;
  for (const f of heads) {
    const at = moverShapeAt(s.moverShape, movement, aimOf(s, rig, f), f);
    const stepsPerSec = 255 / Math.max(0.3, f.panSeconds ?? DEFAULT_PAN_SECONDS);
    minMs = Math.max(minMs, (efxTravel(movement.algorithm, at.width, at.height) / stepsPerSec) * 1000 * MOVE_MARGIN);
  }
  const beatMs = 60000 / s.bpm;
  let beats = asked;
  while (beats * beatMs < minMs && beats < 1024) beats *= 2;
  return { beats, asked, slowed: beats !== asked, minMs };
}

/**
 * Where a moving head points in a section: the section's saved position if it
 * has one for this head, otherwise the head's home position.
 */
export function aimOf(s: Pick<Section, "aim">, rig: Pick<Rig, "positions">, f: Pick<RigFixture, "fixtureId" | "home" | "facesBack">): PanTilt {
  const pos = s.aim ? rig.positions?.find((p) => p.id === s.aim) : undefined;
  return pos?.aims[String(f.fixtureId)] ?? f.home ?? defaultHome(f.facesBack);
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
  /** Strobe hits color: a color ID or "#rrggbb". Default white. */
  strobeColor?: string;
  /** The strobe's lights show only the strobe: their look goes dark underneath. */
  strobeOnly?: boolean;
  /** Strobe hits flashes per beat: 1, 2 (default) or 4. */
  strobeRate?: number;
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
  /**
   * Channels set by hand on lights with more than Lightsmith drives (a ring,
   * extra LEDs, a built-in effect): fixture ID → channel offset → value 0-255.
   * Only the channels `extraChannels` offers are written.
   */
  extras?: Record<string, Record<string, number>>;
  /**
   * How fast the backdrop's pattern runs: 1 is its usual pace, 2 twice as fast.
   * Missing: it follows the section's energy.
   */
  patternSpeed?: number;
  /**
   * How long a fade takes, in beats of this section. Missing: one beat for "fade",
   * four bars for "build" (the two fades there were before you could pick a length).
   */
  fadeBeats?: number;
  /** Move to the next section by itself after its length (otherwise wait for a trigger). */
  autoAdvance: boolean;
  /** Its own MIDI trigger, instead of the one for its place in the song. */
  trigger?: Trigger;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  sections: Section[];
  /** A message that jumps straight to this song in the set (its page in QLC+). */
  trigger?: Trigger;
  /** The song's recording, as a reference for laying it out (the sound stays in the browser). */
  audio?: SongAudio;
}

// ---------------------------------------------------------------------------
// Show control: MIDI from pads, footswitches and amp modelers starts sections.

/** Something that sends MIDI: a drum pad, a footswitch, a Quad Cortex. */
export interface ControlDevice {
  id: string;
  name: string;
  /** The QLC+ universe its input is patched to, as QLC+ numbers them (1 = "Universe 1"). */
  universe: number;
  /** The MIDI channel it sends on, 1-16. */
  channel: number;
  /** The name the computer gives its MIDI port, remembered from MIDI learn. */
  port?: string;
}

export type TriggerKind = "note" | "cc" | "pc";

/** One MIDI message from one device: a note (pad), a control change or a program change. */
export interface Trigger {
  device: string;
  kind: TriggerKind;
  /** Note number, controller number or program number, 0-127. */
  number: number;
}

export interface ShowControl {
  devices: ControlDevice[];
  /**
   * How QLC+ listens on the inputs Lightsmith uses: "any" channel (the
   * channel is part of each trigger) or only each device's own channel.
   */
  listen?: "any" | "own";
  /** Section 1, 2, 3 … of whichever song is showing. */
  slots: (Trigger | null)[];
  nextSong?: Trigger;
  previousSong?: Trigger;
  /** Stops everything and brings up a plain warm look, on every song page. */
  safeLook?: Trigger;
  /** What the safe look looks like; it doubles as the look between songs. */
  safeLookStyle?: SafeLookStyle;
  /** QLC+'s blackout, on and off. */
  blackout?: Trigger;
  /**
   * How sections are cued. "jump": each section has a trigger that starts it
   * directly (a pad per section, or a lighting operator). "step": each song
   * is a cue list, and any cue moves it on to its next section, which suits
   * a guitarist's scene switches that repeat through a song.
   */
  cueing?: "jump" | "step";
  /** Step cueing: messages that move whichever song is showing on to its next section. */
  cues?: Trigger[];
  /** Step cueing: one section on or back, to fix a missed or doubled cue. */
  nextSection?: Trigger;
  previousSection?: Trigger;
}

/** The safe look's color, brightness and moving heads. Anything left out is the default. */
export interface SafeLookStyle {
  /** A color ID or "#rrggbb". Default warm white. */
  color?: string;
  /** Brightness 0–1. Default about half (energy 3). */
  level?: number;
  /** "home": lit and pointing home (default). "off": at home but dark. */
  heads?: "home" | "off";
}

export const SAFE_LOOK_DEFAULT_LEVEL = 0.55;

/** Strobe hits flashes per beat. */
export const STROBE_RATES = [1, 2, 4] as const;
export const strobeRateOf = (e: { strobeRate?: number }): number => (e.strobeRate && e.strobeRate > 0 ? e.strobeRate : 2);

const sameTrigger = (a: Trigger, b: Trigger) => a.device === b.device && a.kind === b.kind && a.number === b.number;

/**
 * Step cueing: every message that moves a song on to its next section. The
 * set-wide cues and Next section, plus the song's own section triggers (a
 * sample pad that starts its section), each listed once.
 */
export function stepCuesFor(control: ShowControl | undefined, song: Song): Trigger[] {
  const out: Trigger[] = [];
  for (const t of [control?.nextSection, ...(control?.cues ?? []), ...song.sections.map((s) => s.trigger)]) if (t && !out.some((x) => sameTrigger(x, t))) out.push(t);
  return out;
}

export function emptyShowControl(): ShowControl {
  return { devices: [], listen: "any", slots: [] };
}

/** The trigger that starts a section: its own, or the one for its place in the song. */
export function triggerFor(control: ShowControl | undefined, s: Section, index: number): Trigger | undefined {
  return s.trigger ?? control?.slots[index] ?? undefined;
}

/**
 * The QLC+ input channel a trigger arrives on. The MIDI plugin numbers
 * controllers 0-127, notes 128-255 and programs 384-511; listening on any
 * channel, it adds the MIDI channel (0-15) in the top bits (<< 12).
 */
export function qlcInputChannel(t: Pick<Trigger, "kind" | "number">, device: Pick<ControlDevice, "channel">, listen: ShowControl["listen"] = "any"): number {
  const base = t.kind === "cc" ? 0 : t.kind === "note" ? 128 : 384;
  const ch = base + Math.max(0, Math.min(127, Math.round(t.number)));
  return listen === "own" ? ch : ((Math.max(1, Math.min(16, device.channel)) - 1) << 12) | ch;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** "Note 36 (C1)", "CC 20", "Program 5", in words a musician reads off their gear. */
export function triggerLabel(t: Pick<Trigger, "kind" | "number">): string {
  if (t.kind === "note") return `Note ${t.number} (${NOTE_NAMES[t.number % 12]}${Math.floor(t.number / 12) - 2})`;
  if (t.kind === "cc") return `CC ${t.number}`;
  return `Program change ${t.number}`;
}

/**
 * One step of a sequence: some lights in one color for a moment. A step
 * with no lights is a pause. Lights not in a step show the section's look.
 */
export interface SequenceStep {
  id: string;
  /** Fixture IDs. Empty = a pause. */
  lights: number[];
  /** A color id or hex; missing = white. The step's main color. */
  color?: string;
  /**
   * Lights in a color of their own, by fixture ID: a color id, hex or
   * "white". Lets one step hold two looks at once, like the stage-left bars
   * staying blue while the stage-right bars come up purple.
   */
  lightColors?: Record<string, string>;
  /** 0-1; missing = full. */
  level?: number;
  /** In the sequence's units (milliseconds or beats). */
  fadeIn: number;
  hold: number;
  fadeOut: number;
}

/** The color a step gives one light: its own, or the step's ("white" when neither is set). */
export function stepLightColor(st: Pick<SequenceStep, "color" | "lightColors">, id: number): string {
  return st.lightColors?.[String(id)] ?? st.color ?? "white";
}

/**
 * Tidy a step's colors: the most used color becomes the step's color, and
 * only lights in another color keep one of their own.
 */
export function tidyStepColors(st: SequenceStep, colorOf: (id: number) => string): SequenceStep {
  const counts = new Map<string, number>();
  for (const id of st.lights) counts.set(colorOf(id), (counts.get(colorOf(id)) ?? 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? st.color ?? "white";
  const own: Record<string, string> = {};
  for (const id of st.lights) if (colorOf(id) !== main) own[String(id)] = colorOf(id);
  const { lightColors: _drop, color: _c, ...rest } = st;
  void _drop;
  void _c;
  return { ...rest, ...(main !== "white" ? { color: main } : {}), ...(Object.keys(own).length ? { lightColors: own } : {}) };
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
  "patternSpeed",
  "extras",
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
  "fadeBeats",
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
  /** The set: songs in playing order, and any left out of the export. */
  setlist?: Setlist;
  /** MIDI devices and what they trigger. */
  control?: ShowControl;
}

export interface Setlist {
  /** Song ids in playing order. Songs not listed follow, in the order they were made. */
  order: string[];
  /** Song ids left out of the whole-set export. */
  skip: string[];
}

/** The project's songs in set order, with whether each one is in the set. */
export function setOrder(p: Pick<Project, "songs" | "setlist">): { song: Song; included: boolean }[] {
  const byId = new Map(p.songs.map((s) => [s.id, s]));
  const listed = (p.setlist?.order ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const rest = p.songs.filter((s) => !listed.includes(s));
  const skip = new Set(p.setlist?.skip ?? []);
  return [...listed, ...rest].map((song) => ({ song, included: !skip.has(song.id) }));
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
    songs: (p.songs ?? []).map(({ audio, ...song }) => {
      const a = normalizeAudio(audio);
      return { ...song, sections: song.sections.map(normalizeSection), ...(a ? { audio: a } : {}) };
    }),
    // Chasers belong to the sections that use them: one no section uses is dropped.
    ...(p.sequences ? { sequences: p.sequences.filter((q) => p.songs.some((song) => song.sections.some((s) => (s.sequences ?? []).some((u) => u.id === q.id)))).map((q) => ({ ...q, steps: q.steps.map((st) => ({ ...st, lights: [...st.lights], ...(st.lightColors ? { lightColors: { ...st.lightColors } } : {}) })) })) } : {}),
    ...(p.presets ? { presets: p.presets.map((x) => ({ ...x, look: structuredClone(x.look) })) } : {}),
    ...(p.control ? { control: { ...p.control, devices: [...(p.control.devices ?? [])], slots: [...(p.control.slots ?? [])], ...(p.control.cues ? { cues: [...p.control.cues] } : {}), ...(p.control.safeLookStyle ? { safeLookStyle: { ...p.control.safeLookStyle } } : {}) } } : {}),
    ...(p.setlist ? { setlist: { order: [...(p.setlist.order ?? [])], skip: [...(p.setlist.skip ?? [])] } } : {}),
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
  // A length set freely (not to the beat) shows its beats to two decimals.
  const exact = s.bars * s.beatsPerBar;
  if (Math.abs(exact - Math.round(exact)) > 0.005) {
    const whole = Math.floor(exact / s.beatsPerBar);
    const rest = Number((exact - whole * s.beatsPerBar).toFixed(2));
    const barText = `${whole} ${whole === 1 ? "bar" : "bars"}`;
    return whole ? `${barText} + ${rest} beats` : `${rest} beats`;
  }
  const beats = sectionBeats(s);
  const bars = Math.floor(beats / s.beatsPerBar);
  const rest = beats - bars * s.beatsPerBar;
  const barText = `${bars} ${bars === 1 ? "bar" : "bars"}`;
  if (!rest) return barText;
  const beatText = `${rest} ${rest === 1 ? "beat" : "beats"}`;
  return bars ? `${barText} + ${beatText}` : beatText;
}

/** Where a moment falls in a song, the way a DAW counts it: bar, beat and sixteenth (all from 1). */
export interface MusicalPosition {
  bar: number;
  beat: number;
  sixteenth: number;
  /** The section playing then (the last one, past the end), or -1 with no sections. */
  section: number;
  bpm: number;
  beatsPerBar: number;
}

/**
 * The bar, beat and sixteenth at a time in the song. Bars are counted through
 * the sections, each at its own tempo and time signature; past the last
 * section (a recording that runs on) the count carries on at its tempo.
 */
export function musicalPosition(sections: Pick<Section, "bars" | "bpm" | "beatsPerBar">[], ms: number, fallbackBpm = 120): MusicalPosition {
  if (!sections.length) {
    const beats = Math.max(0, ms) / (60000 / fallbackBpm);
    return { bar: Math.floor(beats / 4) + 1, beat: (Math.floor(beats) % 4) + 1, sixteenth: Math.floor((beats % 1) * 4) + 1, section: -1, bpm: fallbackBpm, beatsPerBar: 4 };
  }
  let t = Math.max(0, ms);
  let bars = 0;
  let i = 0;
  for (; i < sections.length; i++) {
    const s = sections[i]!;
    const len = sectionMs(s);
    if (t < len || i === sections.length - 1) break;
    t -= len;
    bars += s.bars;
  }
  const s = sections[i]!;
  const beatMs = 60000 / s.bpm;
  // Beats into this section; a tiny nudge so a time exactly on a beat isn't counted as the beat before.
  const beatsIn = t / beatMs + 1e-9;
  const barsIn = beatsIn / s.beatsPerBar;
  // A section can end partway through a bar (free lengths): the next starts a new bar.
  const bar = Math.floor(bars + 1e-9) + (bars % 1 > 1e-6 ? 1 : 0) + Math.floor(barsIn) + 1;
  const beatInBar = beatsIn - Math.floor(barsIn) * s.beatsPerBar;
  return { bar, beat: Math.floor(beatInBar) + 1, sixteenth: Math.floor((beatInBar % 1) * 4) + 1, section: i, bpm: s.bpm, beatsPerBar: s.beatsPerBar };
}

/** When a bar starts (bar 1 is the top of the song): the inverse of `musicalPosition`, for "go to bar". */
export function msForBar(sections: Pick<Section, "bars" | "bpm" | "beatsPerBar">[], bar: number, fallbackBpm = 120): number {
  let want = Math.max(0, Math.round(bar) - 1);
  let t = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    // Whole bars this section counts (one more when it ends partway through a bar).
    const whole = Math.ceil(s.bars - 1e-9);
    if (want < whole || i === sections.length - 1) return t + want * (60000 / s.bpm) * s.beatsPerBar;
    want -= whole;
    t += sectionMs(s);
  }
  return want * (60000 / fallbackBpm) * 4;
}

/** How a section's length snaps when you drag or type it: to whole bars, to beats, or not at all. */
export type Snap = "bar" | "beat" | "off";

/**
 * A section's length in bars for a length in milliseconds. "off" keeps it to
 * the nearest 10 ms (at least 100 ms), for songs not recorded to a click,
 * where sections fall between beats. The length is still kept in bars, so it
 * stretches with the tempo like any other.
 */
export function barsForLength(ms: number, s: Pick<Section, "bpm" | "beatsPerBar">, snap: Snap): number {
  const beatMs = 60000 / s.bpm;
  const barMs = beatMs * s.beatsPerBar;
  if (snap === "bar") return Math.max(1, Math.round(ms / barMs));
  if (snap === "beat") return Math.max(1, Math.round(ms / beatMs)) / s.beatsPerBar;
  return Math.max(100, Math.round(ms / 10) * 10) / barMs;
}

/** The whole number of bars nearest to a length in seconds, at least one. */
export function barsForSeconds(seconds: number, bpm: number, beatsPerBar: number): number {
  return Math.max(1, Math.round((seconds * bpm) / (60 * beatsPerBar)));
}

export function sectionMs(s: Pick<Section, "bpm" | "beatsPerBar" | "bars">): number {
  return (60000 / s.bpm) * s.beatsPerBar * s.bars;
}

/**
 * How long the section's look takes to come in, in ms: 0 for an instant change,
 * never longer than the section. QLC+ fades every channel from what's on stage
 * to the new look, so whatever doesn't change stays put while the rest fades.
 */
export function fadeInMs(s: Pick<Section, "bpm" | "beatsPerBar" | "bars" | "transition" | "fadeBeats">): number {
  if (s.transition === "snap") return 0;
  const beats = s.fadeBeats ?? (s.transition === "build" ? 4 * s.beatsPerBar : 1);
  return Math.min(sectionMs(s), beats * (60000 / s.bpm));
}

/**
 * Where the previous or next section marker is, from `posMs`, like a DAW's markers:
 * back goes to the start of this section, or to the one before when you're within its
 * first second (so pressing it twice steps back two). Null when there's nowhere to go.
 */
export function sectionJump(sections: Pick<Section, "bpm" | "beatsPerBar" | "bars">[], posMs: number, dir: -1 | 1): number | null {
  const starts: number[] = [];
  let t = 0;
  for (const s of sections) {
    starts.push(t);
    t += sectionMs(s);
  }
  if (!starts.length) return null;
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1]! <= posMs + 1) i++;
  if (dir === 1) return starts[i + 1] ?? null;
  if (posMs - starts[i]! > 1000) return starts[i]!;
  return i > 0 ? starts[i - 1]! : posMs > 0 ? 0 : null;
}

/** Side of the stage from a stage-plan position seen from the audience (stage left is on the audience's right). */
export function sideFromX(x: number): Side {
  return x > 0.62 ? "SL" : x < 0.38 ? "SR" : "C";
}
