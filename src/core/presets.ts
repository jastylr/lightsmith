/**
 * Everything a user picks from. Contributors: this is the file to edit to add
 * colors, moods, patterns, movements, effects or section types. Keep ids
 * stable once released, because saved songs refer to them.
 *
 * RGB matrix patterns only use scripts that ship with both QLC+ 4.14 and
 * QLC+ 5.2, so exported shows work on either. Newer scripts (Fire, Meteor…)
 * can be added once older versions are no longer a concern.
 */

export type RGB = readonly [number, number, number];

export interface ColorPreset {
  id: string;
  label: string;
  rgb: RGB;
}

/** Named "gels". Custom colors are stored as "#rrggbb" strings instead of ids. */
export const COLORS: ColorPreset[] = [
  { id: "red", label: "Red", rgb: [255, 0, 0] },
  { id: "orange", label: "Orange", rgb: [255, 80, 0] },
  { id: "amber", label: "Amber", rgb: [255, 140, 0] },
  { id: "yellow", label: "Yellow", rgb: [255, 210, 0] },
  { id: "green", label: "Green", rgb: [0, 255, 40] },
  { id: "teal", label: "Teal", rgb: [0, 200, 140] },
  { id: "cyan", label: "Cyan", rgb: [0, 200, 255] },
  { id: "blue", label: "Blue", rgb: [0, 50, 255] },
  { id: "indigo", label: "Indigo", rgb: [40, 0, 180] },
  { id: "violet", label: "Violet", rgb: [140, 0, 255] },
  { id: "magenta", label: "Magenta", rgb: [255, 0, 180] },
  { id: "pink", label: "Pink", rgb: [255, 70, 140] },
  { id: "warmWhite", label: "Warm white", rgb: [255, 190, 120] },
  { id: "white", label: "White", rgb: [255, 255, 255] },
];

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** A color id ("amber") or a custom "#rrggbb". */
export function colorById(id: string): ColorPreset {
  const named = COLORS.find((c) => c.id === id);
  if (named) return named;
  const rgb = hexToRgb(id);
  if (rgb) return { id, label: id.toUpperCase(), rgb };
  return COLORS[COLORS.length - 1]!;
}

// ---------------------------------------------------------------- backdrop patterns

export interface PatternPreset {
  id: string;
  label: string;
  description: string;
  /** QLC+ RGB script name; none = a plain color scene. */
  algorithm?: string;
  /** How many palette colors the script takes (0 = it makes its own). */
  colors: 0 | 1 | 2 | 5;
  /** Step length in beats at energy 3 (or fixed ms when `stepMs` is set). */
  stepBeats?: number;
  stepMs?: number;
  /** Brightness of the plain base color under the pattern (0..1). */
  floor: number;
  order?: "Loop" | "PingPong";
  direction?: "Forward" | "Backward";
  props?: Record<string, string | number>;
  /** Lighten the pattern color towards white (rain, snow). */
  whiten?: number;
}

export const PATTERNS: PatternPreset[] = [
  { id: "solid", label: "Solid wash", description: "Even color across the backdrop", colors: 1, floor: 1 },
  { id: "drift", label: "Drift", description: "Soft random twinkle", algorithm: "Noise", colors: 1, stepMs: 140, floor: 0.25, direction: "Backward", props: { noisePercentage: "Medium" } },
  { id: "slowWaves", label: "Slow waves", description: "Gentle waves rolling out from the middle", algorithm: "Waves", colors: 1, stepBeats: 0.5, floor: 0.25, order: "PingPong", props: { direction: "Out", orientation: "Vertical", tailfade: "Yes", taillength: 10 } },
  { id: "waves", label: "Waves", description: "Waves on the beat", algorithm: "Waves", colors: 1, stepBeats: 0.25, floor: 0.25, order: "PingPong", props: { direction: "Out", orientation: "Vertical", tailfade: "Yes", taillength: 10 } },
  { id: "stripes", label: "Stripes", description: "Bands bouncing up and down", algorithm: "Stripes", colors: 1, stepBeats: 0.25, floor: 0.25, order: "PingPong", props: { orientation: "Horizontal" } },
  { id: "sineWave", label: "Sine wave", description: "A two-color wave snaking along", algorithm: "Sine Wave", colors: 2, stepBeats: 0.25, floor: 0, props: { orientation: "Horizontal", amplitude: 100, frequency: 100 } },
  { id: "fillUp", label: "Fill and empty", description: "Bars fill up, then empty", algorithm: "Fill Unfill", colors: 1, stepBeats: 0.25, floor: 0.15, order: "PingPong", props: { orientation: "Vertical" } },
  { id: "fillCenter", label: "Fill from center", description: "Light grows out from the middle", algorithm: "Fill From Center", colors: 1, stepBeats: 0.25, floor: 0.15, order: "PingPong", props: { orientation: "Vertical" } },
  { id: "circles", label: "Pulsing circles", description: "Rings that pulse in and out", algorithm: "Circles", colors: 2, stepBeats: 0.25, floor: 0, props: { circlesAmount: 3, circlesSize: 0, fadeMode: "Pulse", fillCircles: "No" } },
  { id: "alternate", label: "Alternate", description: "Two colors trading places", algorithm: "Alternate", colors: 2, stepBeats: 1, floor: 0 },
  { id: "marquee", label: "Marquee", description: "Chasing lights around the edge", algorithm: "Marquee", colors: 2, stepBeats: 0.25, floor: 0 },
  { id: "balls", label: "Bouncing balls", description: "Balls of color bouncing around", algorithm: "Balls", colors: 5, stepMs: 60, floor: 0.1 },
  { id: "plasma", label: "Plasma", description: "Liquid, shifting color", algorithm: "Plasma", colors: 5, stepMs: 60, floor: 0 },
  { id: "sparkle", label: "Sparkle", description: "Random single pixels", algorithm: "Random Single", colors: 1, stepBeats: 0.125, floor: 0.2 },
  { id: "rainfall", label: "Falling rain", description: "Streaks falling down the bars", algorithm: "Vertical fall", colors: 1, stepMs: 90, floor: 0.2, whiten: 0.4 },
  { id: "snow", label: "Snow", description: "Flakes drifting down", algorithm: "Snow or Bubbles", colors: 1, stepMs: 120, floor: 0.15, whiten: 0.6, props: { presetflakes: 40, windchill: "No", reverse: "No", multiColor: "No" } },
  { id: "bubbles", label: "Bubbles", description: "Bubbles rising up", algorithm: "Snow or Bubbles", colors: 1, stepMs: 120, floor: 0.15, props: { presetflakes: 30, windchill: "No", reverse: "Yes", multiColor: "No" } },
  { id: "starfield", label: "Starfield", description: "Flying through stars", algorithm: "3D Starfield", colors: 1, stepMs: 100, floor: 0.1, props: { StarsAmount: 60, MultiColor: "No", InvertBrightness: "Dim->Bright" } },
  { id: "fireworks", label: "Fireworks", description: "Rockets bursting", algorithm: "Fireworks", colors: 1, stepMs: 60, floor: 0, props: { rocketCount: 3, randomColor: "No", particleCount: 11, particleSteps: 15 } },
  { id: "rainbow", label: "Rainbow", description: "A rolling rainbow (ignores your colors)", algorithm: "Gradient", colors: 0, stepMs: 80, floor: 0, props: { presetIndex: "Rainbow", presetSize: 5, orientation: "Vertical" } },
  { id: "strobe", label: "Strobe", description: "Hard flashing", algorithm: "Strobe", colors: 1, stepBeats: 0.25, floor: 0.3, props: { frequency: 2 } },
];

export function patternById(id: string): PatternPreset {
  if (id === "colorCycle") return patternById("waves"); // saved by version 0.1
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]!;
}

// ---------------------------------------------------------------- movements

export type MovementId = "static" | "sweep" | "circle" | "figure8" | "diamond" | "square" | "leaf" | "ballyhoo";

export interface MovementPreset {
  id: MovementId;
  label: string;
  description: string;
  /** QLC+ EFX algorithm, or none for a fixed position. */
  algorithm?: "Line" | "Circle" | "Eight" | "Diamond" | "Square" | "Leaf" | "Lissajous";
  /** One full cycle, in bars, at energy 3. */
  bars: number;
  width: number; // EFX width (0-255 scale)
  height: number;
  /** SVG path (0..24 box) for the picker icon. */
  icon: string;
}

export const MOVEMENTS: MovementPreset[] = [
  { id: "static", label: "Still", description: "Hold the home position", bars: 0, width: 0, height: 0, icon: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" },
  { id: "sweep", label: "Slow sweep", description: "Side to side across the stage", algorithm: "Line", bars: 8, width: 110, height: 10, icon: "M3 12h18M6 9l-3 3l3 3M18 9l3 3l-3 3" },
  { id: "circle", label: "Circle", description: "Smooth circles", algorithm: "Circle", bars: 4, width: 70, height: 50, icon: "M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" },
  { id: "figure8", label: "Figure 8", description: "Busier, crossing figure 8", algorithm: "Eight", bars: 2, width: 90, height: 70, icon: "M12 12c-3-4-8-4-8 0s5 4 8 0s8-4 8 0s-5 4-8 0" },
  { id: "diamond", label: "Diamond", description: "Sharp corners, punchy", algorithm: "Diamond", bars: 2, width: 80, height: 60, icon: "M12 4l8 8l-8 8l-8-8z" },
  { id: "square", label: "Square", description: "Box pattern", algorithm: "Square", bars: 2, width: 70, height: 60, icon: "M5 5h14v14h-14z" },
  { id: "leaf", label: "Leaf", description: "Flowing petal shape", algorithm: "Leaf", bars: 4, width: 80, height: 60, icon: "M4 20c0-9 7-16 16-16c0 9-7 16-16 16zM4 20L20 4" },
  { id: "ballyhoo", label: "Ballyhoo", description: "Wild crowd-sweeping figure", algorithm: "Lissajous", bars: 2, width: 110, height: 80, icon: "M4 12c2-8 4-8 8 0s6 8 8 0M4 12c2 8 4 8 8 0s6-8 8 0" },
];

export type MoverSpread = "together" | "chase" | "offset";
export const SPREADS: { id: MoverSpread; label: string; description: string; propagation: string }[] = [
  { id: "together", label: "Together", description: "All heads move as one", propagation: "Parallel" },
  { id: "chase", label: "One after another", description: "Each head follows the last", propagation: "Serial" },
  { id: "offset", label: "Offset", description: "Heads spread out across the shape", propagation: "Asymmetric" },
];

// ---------------------------------------------------------------- effects (layered on top)

export type EffectId = "rain" | "lightning" | "strobe" | "blinder" | "beatPulse" | "sparkle";
export const EFFECTS: { id: EffectId; label: string; description: string }[] = [
  { id: "rain", label: "Rain", description: "Drizzle twinkling over the backdrop" },
  { id: "lightning", label: "Lightning", description: "A burst of lightning flashes" },
  { id: "blinder", label: "Blinder hit", description: "A full white hit as the section starts" },
  { id: "beatPulse", label: "Beat pulse", description: "Side and front lights pulse on every beat" },
  { id: "sparkle", label: "Sparkle", description: "White glints over the backdrop" },
  { id: "strobe", label: "Strobe hits", description: "White strobing on the backdrop" },
];

// ---------------------------------------------------------------- color changes

export type ColorChange = "hold" | "beat" | "2beats" | "bar" | "2bars" | "4bars";
export const COLOR_CHANGES: { id: ColorChange; label: string; beats: number }[] = [
  { id: "hold", label: "Keep colors steady", beats: 0 },
  { id: "beat", label: "Every beat", beats: 1 },
  { id: "2beats", label: "Every 2 beats", beats: 2 },
  { id: "bar", label: "Every bar", beats: -1 },
  { id: "2bars", label: "Every 2 bars", beats: -2 },
  { id: "4bars", label: "Every 4 bars", beats: -4 },
];

// ---------------------------------------------------------------- moods

/** How side / floor lights behave. */
export type SideStyle = "static" | "swapBar" | "swapBeat";

export interface MoodPreset {
  id: string;
  label: string;
  description: string;
  colors: string[]; // default palette (color ids)
  intensity: number; // 0..1 overall level at energy 3
  pattern: string; // PATTERNS id
  side: SideStyle;
  movement: MovementId;
  colorChange: ColorChange;
}

export const MOODS: MoodPreset[] = [
  { id: "dark", label: "Dark", description: "Low light, deep blues, almost no motion", colors: ["indigo", "blue"], intensity: 0.35, pattern: "drift", side: "static", movement: "static", colorChange: "hold" },
  { id: "moody", label: "Moody", description: "Solemn violet and blue, slow movement", colors: ["violet", "blue"], intensity: 0.55, pattern: "slowWaves", side: "static", movement: "sweep", colorChange: "hold" },
  { id: "calm", label: "Calm", description: "Soft warm light, steady and gentle", colors: ["warmWhite", "amber"], intensity: 0.5, pattern: "solid", side: "static", movement: "static", colorChange: "hold" },
  { id: "warm", label: "Warm", description: "Amber, orange and red with gentle motion", colors: ["amber", "orange", "red"], intensity: 0.65, pattern: "slowWaves", side: "swapBar", movement: "sweep", colorChange: "hold" },
  { id: "dreamy", label: "Dreamy", description: "Pastel pinks and teals that float", colors: ["pink", "violet", "teal"], intensity: 0.55, pattern: "circles", side: "static", movement: "leaf", colorChange: "4bars" },
  { id: "lively", label: "Lively", description: "Upbeat cyan and magenta, medium movement", colors: ["cyan", "magenta"], intensity: 0.8, pattern: "waves", side: "swapBar", movement: "circle", colorChange: "hold" },
  { id: "colorful", label: "Colorful", description: "Colors change every bar", colors: ["magenta", "cyan", "amber", "blue"], intensity: 0.9, pattern: "waves", side: "swapBar", movement: "circle", colorChange: "bar" },
  { id: "energetic", label: "Energetic", description: "Driving reds and ambers, lots of motion", colors: ["red", "amber", "white"], intensity: 0.95, pattern: "stripes", side: "swapBeat", movement: "figure8", colorChange: "2bars" },
  { id: "aggressive", label: "Aggressive", description: "Hard red and white, fast and punchy", colors: ["red", "white"], intensity: 1, pattern: "strobe", side: "swapBeat", movement: "ballyhoo", colorChange: "hold" },
  { id: "celebration", label: "Celebration", description: "Big, bright and joyful", colors: ["yellow", "magenta", "cyan", "green"], intensity: 1, pattern: "fireworks", side: "swapBeat", movement: "circle", colorChange: "bar" },
];

export function moodById(id: string): MoodPreset {
  return MOODS.find((m) => m.id === id) ?? MOODS[1]!;
}

// ---------------------------------------------------------------- section types and energy

export interface SectionTypePreset {
  id: string;
  label: string;
  mood: string;
  energy: number;
  bars: number;
  transition: "snap" | "fade" | "build";
}

export const SECTION_TYPES: SectionTypePreset[] = [
  { id: "intro", label: "Intro", mood: "dark", energy: 2, bars: 8, transition: "fade" },
  { id: "verse", label: "Verse", mood: "moody", energy: 2, bars: 16, transition: "fade" },
  { id: "prechorus", label: "Pre-Chorus", mood: "warm", energy: 3, bars: 8, transition: "build" },
  { id: "chorus", label: "Chorus", mood: "lively", energy: 4, bars: 16, transition: "snap" },
  { id: "bridge", label: "Bridge", mood: "energetic", energy: 4, bars: 8, transition: "snap" },
  { id: "solo", label: "Solo", mood: "colorful", energy: 5, bars: 16, transition: "snap" },
  { id: "breakdown", label: "Breakdown", mood: "dark", energy: 1, bars: 8, transition: "fade" },
  { id: "outro", label: "Outro", mood: "dark", energy: 2, bars: 8, transition: "fade" },
  { id: "custom", label: "Custom", mood: "moody", energy: 3, bars: 8, transition: "fade" },
];

export function sectionTypeById(id: string): SectionTypePreset {
  return SECTION_TYPES.find((s) => s.id === id) ?? SECTION_TYPES[SECTION_TYPES.length - 1]!;
}

/** Optional starting structures for a new song. */
export const SONG_TEMPLATES: { id: string; label: string; sections: string[] }[] = [
  { id: "short", label: "Short song", sections: ["intro", "verse", "chorus", "verse", "chorus", "outro"] },
  { id: "bridge", label: "With a bridge", sections: ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"] },
  { id: "prechorus", label: "With pre-choruses", sections: ["intro", "verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "bridge", "chorus", "outro"] },
  { id: "solo", label: "With a solo", sections: ["intro", "verse", "chorus", "verse", "chorus", "solo", "chorus", "outro"] },
];

/** Energy 1..5 scales speed and brightness on top of the mood. */
export const ENERGY = [
  { label: "Very low", speed: 0.5, level: 0.6 },
  { label: "Low", speed: 0.75, level: 0.8 },
  { label: "Medium", speed: 1, level: 1 },
  { label: "High", speed: 1.5, level: 1 },
  { label: "Maximum", speed: 2, level: 1 },
] as const;

export function energyOf(e: number) {
  return ENERGY[Math.min(5, Math.max(1, Math.round(e))) - 1]!;
}
