/**
 * The guided song builder: a song's structure, a vibe (which mood each kind
 * of section gets), an energy arc and a few signature moments, turned into
 * sections. Pure, so the builder's preview and its tests see the same song.
 */
import { newSection, type Section } from "./model";
import { SONG_TEMPLATES, sectionTypeById } from "./presets";

/** One section of the plan: what kind it is, what it's called and how long it is. */
export interface PlannedSection {
  type: string;
  name: string;
  bars: number;
}

export interface SongPlan {
  bpm: number;
  beatsPerBar: number;
  sections: PlannedSection[];
  vibe: string;
  arc: string;
  moments: string[];
}

/** A vibe: the mood for each kind of section (`default` for any other). */
export interface Vibe {
  id: string;
  label: string;
  description: string;
  moods: Record<string, string>;
}

export const VIBES: Vibe[] = [
  {
    id: "rock",
    label: "Big rock",
    description: "Moody verses that explode into hot, bright choruses",
    moods: { intro: "moody", verse: "moody", prechorus: "warm", chorus: "energetic", bridge: "warm", solo: "aggressive", breakdown: "dark", outro: "moody", default: "moody" },
  },
  {
    id: "dark",
    label: "Dark and heavy",
    description: "Deep blues and reds, hard white hits",
    moods: { intro: "dark", verse: "dark", prechorus: "moody", chorus: "aggressive", bridge: "dread", solo: "energetic", breakdown: "twilight", outro: "dark", default: "dark" },
  },
  {
    id: "pop",
    label: "Bright and poppy",
    description: "Saturated color everywhere, a party in the chorus",
    moods: { intro: "calm", verse: "lively", prechorus: "colorful", chorus: "celebration", bridge: "dreamy", solo: "colorful", breakdown: "calm", outro: "lively", default: "lively" },
  },
  {
    id: "dreamy",
    label: "Dreamy and floating",
    description: "Soft pinks, violets and teals that drift",
    moods: { intro: "calm", verse: "dreamy", prechorus: "dreamy", chorus: "colorful", bridge: "twilight", solo: "lively", breakdown: "mist", outro: "calm", default: "dreamy" },
  },
  {
    id: "warm",
    label: "Warm and intimate",
    description: "Ambers and embers, like a small room",
    moods: { intro: "ember", verse: "warm", prechorus: "warm", chorus: "energetic", bridge: "calm", solo: "energetic", breakdown: "ember", outro: "ember", default: "warm" },
  },
  {
    id: "eerie",
    label: "Eerie and melancholy",
    description: "Bruised twilight, haunted mist and decay",
    moods: { intro: "mist", verse: "twilight", prechorus: "dread", chorus: "dread", bridge: "mist", solo: "ember", breakdown: "mist", outro: "twilight", default: "twilight" },
  },
];

/** An energy arc: the energy (1–5) for each section, given the whole plan. */
export interface Arc {
  id: string;
  label: string;
  description: string;
  energies: (sections: PlannedSection[]) => number[];
}

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
const BASE: Record<string, number> = { intro: 2, verse: 2, prechorus: 3, chorus: 4, bridge: 3, solo: 5, breakdown: 1, outro: 2, custom: 3, blackout: 1 };
const lastIndexOf = (xs: PlannedSection[], type: string) => xs.map((x) => x.type).lastIndexOf(type);

export const ARCS: Arc[] = [
  {
    id: "punch",
    label: "Verse and chorus punch",
    description: "Calm verses, big choruses, the last chorus biggest",
    energies: (xs) => {
      const last = lastIndexOf(xs, "chorus");
      return xs.map((x, i) => clamp((BASE[x.type] ?? 3) + (i === last && xs.filter((y) => y.type === "chorus").length > 1 ? 1 : 0)));
    },
  },
  {
    id: "build",
    label: "Slow build",
    description: "Starts low and climbs all the way to the end",
    energies: (xs) =>
      xs.map((x, i) => {
        if (x.type === "outro" && i === xs.length - 1) return 2;
        const lift = x.type === "chorus" || x.type === "solo" ? 1 : 0;
        return clamp(1 + (3 * i) / Math.max(1, xs.length - 1) + lift);
      }),
  },
  {
    id: "steady",
    label: "Steady groove",
    description: "An even feel, the choruses a step up",
    energies: (xs) => xs.map((x) => (x.type === "chorus" || x.type === "solo" ? 4 : x.type === "intro" || x.type === "outro" || x.type === "breakdown" ? 2 : 3)),
  },
  {
    id: "finish",
    label: "Big finish",
    description: "Held back early, everything in the last third",
    energies: (xs) =>
      xs.map((x, i) => {
        if (x.type === "outro" && i === xs.length - 1) return 3;
        const late = i >= Math.floor((xs.length * 2) / 3);
        return clamp((BASE[x.type] ?? 3) - (late ? -1 : 1) + (late && (x.type === "chorus" || x.type === "solo") ? 1 : 0));
      }),
  },
];

export interface Moment {
  id: string;
  label: string;
  description: string;
  /** Only offered when the stage has moving heads. */
  needsMovers?: boolean;
}

export const MOMENTS: Moment[] = [
  { id: "ending", label: "Blackout on the last hit", description: "The song ends with a cut to black, so everyone knows it's over" },
  { id: "cutChorus", label: "Cut into every chorus", description: "The chorus look lands on the downbeat instead of fading in" },
  { id: "fadeIntro", label: "Fade the intro in slowly", description: "The first look rises over two bars" },
  { id: "darkIntro", label: "A low, still intro", description: "The intro stays dim and steady, so the first verse feels bigger" },
  { id: "sweep", label: "Moving heads sweep the crowd in the choruses", description: "A slow sweep side to side whenever the chorus comes round", needsMovers: true },
  { id: "blinder", label: "A blinder hit on the first chorus", description: "A flash of white as the first chorus starts" },
  { id: "strobePeak", label: "Strobe at the peak", description: "Strobe hits, in the look's own colors, in the biggest section" },
];

/** Moments ticked to start with. */
export const DEFAULT_MOMENTS = ["ending", "cutChorus", "sweep"];

/** A plan's sections from one of the common structures, numbered where a kind repeats. */
export function planFromTemplate(templateId: string): PlannedSection[] {
  const t = SONG_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return [];
  const totals: Record<string, number> = {};
  for (const type of t.sections) totals[type] = (totals[type] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return t.sections.map((type) => {
    const def = sectionTypeById(type);
    seen[type] = (seen[type] ?? 0) + 1;
    return { type, name: (totals[type] ?? 0) > 1 ? `${def.label} ${seen[type]}` : def.label, bars: def.bars };
  });
}

/**
 * A plan's sections from section changes marked while the recording played:
 * the times (ms) where each new section starts, after the first at 0. Lengths
 * are rounded to whole beats; kinds are a first guess (intro, then verse and
 * chorus in turn, outro last) to be corrected.
 */
export function planFromMarks(marksMs: number[], totalMs: number, bpm: number, beatsPerBar: number): PlannedSection[] {
  const beatMs = 60000 / bpm;
  const starts = [0, ...marksMs.filter((m) => m > beatMs && m < totalMs - beatMs).sort((a, b) => a - b)];
  const n = starts.length;
  const counts: Record<string, number> = {};
  return renumber(starts.map((start, i) => {
    const end = i + 1 < n ? starts[i + 1]! : totalMs;
    const beats = Math.max(1, Math.round((end - start) / beatMs));
    const type = n === 1 ? "verse" : i === 0 ? "intro" : i === n - 1 ? "outro" : i % 2 === 1 ? "verse" : "chorus";
    counts[type] = (counts[type] ?? 0) + 1;
    return { type, name: `${sectionTypeById(type).label} ${counts[type]}`, bars: beats / beatsPerBar };
  }));
}

/** Gives repeated kinds numbers (Verse 1, Verse 2) and single ones plain names. */
export function renumber(sections: PlannedSection[]): PlannedSection[] {
  const totals: Record<string, number> = {};
  for (const s of sections) totals[s.type] = (totals[s.type] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return sections.map((s) => {
    const label = sectionTypeById(s.type).label;
    seen[s.type] = (seen[s.type] ?? 0) + 1;
    // Only names that are still the automatic kind-and-number get renamed.
    const auto = s.name === label || new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+$`).test(s.name) || /^Part \d+$/.test(s.name) || s.name === "";
    if (!auto) return s;
    return { ...s, name: (totals[s.type] ?? 0) > 1 ? `${label} ${seen[s.type]}` : label };
  });
}

/** The sections a plan makes, with the vibe's moods, the arc's energies and the moments. */
export function buildSong(plan: SongPlan, opts: { hasMovers: boolean }): Section[] {
  const vibe = VIBES.find((v) => v.id === plan.vibe) ?? VIBES[0]!;
  const arc = ARCS.find((a) => a.id === plan.arc) ?? ARCS[0]!;
  const energies = arc.energies(plan.sections);
  const has = (m: string) => plan.moments.includes(m) && (!MOMENTS.find((x) => x.id === m)?.needsMovers || opts.hasMovers);

  const sections: Section[] = plan.sections.map((p, i) => {
    const s = newSection(p.type, plan.bpm);
    const mood = vibe.moods[p.type] ?? vibe.moods.default ?? s.mood;
    return {
      ...s,
      name: p.name,
      bars: p.bars,
      beatsPerBar: plan.beatsPerBar,
      mood,
      energy: energies[i] ?? s.energy,
      // Let each mood bring its own pattern; intros and outros stay plainer.
      pattern: p.type === "intro" || p.type === "outro" || p.type === "breakdown" ? "solid" : "mood",
    };
  });

  const choruses = sections.filter((s) => s.type === "chorus");
  if (has("cutChorus")) for (const s of choruses) s.transition = "snap";
  if (has("sweep")) for (const s of choruses) s.movement = "sweep";
  if (has("blinder") && choruses[0]) choruses[0].effects = { ...choruses[0].effects, blinder: true };
  const intro = sections[0]?.type === "intro" ? sections[0] : undefined;
  if (intro && has("darkIntro")) Object.assign(intro, { energy: 1, colorChange: "hold", pattern: "solid", movement: "static" });
  if (intro && has("fadeIntro")) Object.assign(intro, { transition: "fade", fadeBeats: plan.beatsPerBar * 2 });
  if (has("strobePeak") && sections.length) {
    const top = Math.max(...sections.map((s) => s.energy));
    const peak = [...sections].reverse().find((s) => s.energy === top)!;
    peak.effects = { ...peak.effects, strobe: true, strobeColor: "look" };
  }
  if (has("ending")) sections.push({ ...newSection("blackout", plan.bpm), bars: 1, beatsPerBar: plan.beatsPerBar, transition: "snap" });
  return sections;
}
