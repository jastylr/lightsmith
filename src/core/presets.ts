/**
 * Everything a user picks from. Contributors: this is the file to edit to add
 * colours, moods, movements or section types. Keep ids stable once released,
 * because saved songs refer to them.
 */

export type RGB = readonly [number, number, number];

export interface ColorPreset {
  id: string;
  label: string;
  rgb: RGB;
}

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

export function colorById(id: string): ColorPreset {
  return COLORS.find((c) => c.id === id) ?? COLORS[COLORS.length - 1]!;
}

/** How the backdrop (wash bars, pixel bars) behaves. */
export type BackdropStyle = "solid" | "drift" | "waves" | "slowWaves" | "stripes" | "colorCycle" | "strobe";
/** How side / floor lights behave. */
export type SideStyle = "static" | "swapBar" | "swapBeat";

export type MovementId = "static" | "sweep" | "circle" | "figure8" | "diamond";

export interface MovementPreset {
  id: MovementId;
  label: string;
  description: string;
  /** QLC+ EFX algorithm, or none for a fixed position. */
  algorithm?: "Line" | "Circle" | "Eight" | "Diamond";
  /** One full cycle, in bars, at energy 3. */
  bars: number;
  width: number; // EFX width (0-255 scale)
  height: number;
}

export const MOVEMENTS: MovementPreset[] = [
  { id: "static", label: "Still", description: "Hold the home position.", bars: 0, width: 0, height: 0 },
  { id: "sweep", label: "Slow sweep", description: "Side to side across the stage.", algorithm: "Line", bars: 8, width: 110, height: 10 },
  { id: "circle", label: "Circle", description: "Smooth circles.", algorithm: "Circle", bars: 4, width: 70, height: 50 },
  { id: "figure8", label: "Figure 8", description: "Busier, crossing figure 8.", algorithm: "Eight", bars: 2, width: 90, height: 70 },
  { id: "diamond", label: "Diamond", description: "Sharp corners, punchy.", algorithm: "Diamond", bars: 2, width: 80, height: 60 },
];

export interface MoodPreset {
  id: string;
  label: string;
  description: string;
  colors: string[]; // default palette (colour ids)
  intensity: number; // 0..1 overall level at energy 3
  backdrop: BackdropStyle;
  side: SideStyle;
  movement: MovementId;
}

export const MOODS: MoodPreset[] = [
  { id: "dark", label: "Dark", description: "Low light, deep blues, almost no motion.", colors: ["indigo", "blue"], intensity: 0.35, backdrop: "drift", side: "static", movement: "static" },
  { id: "moody", label: "Moody", description: "Solemn violet and blue, slow movement.", colors: ["violet", "blue"], intensity: 0.55, backdrop: "slowWaves", side: "static", movement: "sweep" },
  { id: "calm", label: "Calm", description: "Soft warm light, steady and gentle.", colors: ["warmWhite", "amber"], intensity: 0.5, backdrop: "solid", side: "static", movement: "static" },
  { id: "warm", label: "Warm", description: "Amber, orange and red with gentle motion.", colors: ["amber", "orange", "red"], intensity: 0.65, backdrop: "slowWaves", side: "swapBar", movement: "sweep" },
  { id: "dreamy", label: "Dreamy", description: "Pastel pinks and teals that float.", colors: ["pink", "violet", "teal"], intensity: 0.55, backdrop: "slowWaves", side: "static", movement: "sweep" },
  { id: "lively", label: "Lively", description: "Upbeat cyan and magenta, medium movement.", colors: ["cyan", "magenta"], intensity: 0.8, backdrop: "waves", side: "swapBar", movement: "circle" },
  { id: "colorful", label: "Colorful", description: "Colours change every bar.", colors: ["magenta", "cyan", "amber", "blue"], intensity: 0.9, backdrop: "colorCycle", side: "swapBar", movement: "circle" },
  { id: "energetic", label: "Energetic", description: "Driving reds and ambers, lots of motion.", colors: ["red", "amber", "white"], intensity: 0.95, backdrop: "stripes", side: "swapBeat", movement: "figure8" },
  { id: "aggressive", label: "Aggressive", description: "Hard red and white, fast and punchy.", colors: ["red", "white"], intensity: 1, backdrop: "strobe", side: "swapBeat", movement: "diamond" },
];

export function moodById(id: string): MoodPreset {
  return MOODS.find((m) => m.id === id) ?? MOODS[1]!;
}

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
