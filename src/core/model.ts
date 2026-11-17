/**
 * The saved project: how the user's rig is used, and their songs.
 * Plain JSON so it can live in the browser or be exported as a file.
 */
import { sectionTypeById } from "./presets";

export type Role = "backdrop" | "side" | "mover" | "front" | "ignore";
export type Side = "SL" | "C" | "SR";

export interface RigFixture {
  fixtureId: number;
  role: Role;
  side: Side;
  /** Left-to-right order on stage, as seen from the stage (stage left first). */
  order: number;
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
export type Transition = "snap" | "fade" | "build";

export interface Section {
  id: string;
  type: string; // SECTION_TYPES id
  name: string;
  bpm: number;
  bars: number;
  beatsPerBar: number;
  mood: string; // MOODS id
  energy: number; // 1..5
  colors: string[]; // empty = use the mood's colours
  movement: string; // MOVEMENTS id, or "mood" to follow the mood
  focus: Focus;
  effects: {
    rain?: boolean;
    lightning?: boolean;
    lightningDelaySec?: number;
    strobe?: boolean;
  };
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
    movement: "mood",
    focus: "all",
    effects: {},
    transition: t.transition,
    autoAdvance: false,
  };
}

export function newSong(title = "New song", bpm = 120): Song {
  return {
    id: newId("song"),
    title,
    bpm,
    sections: ["intro", "verse", "chorus", "verse", "chorus", "outro"].map((t) => newSection(t, bpm)),
  };
}

export function sectionMs(s: Section): number {
  return (60000 / s.bpm) * s.beatsPerBar * s.bars;
}
