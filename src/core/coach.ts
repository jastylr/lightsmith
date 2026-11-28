/**
 * The show coach and look variations: suggestions that make a song's lighting
 * land better (contrast between verse and chorus, a clear ending, movement),
 * and alternative looks for one section to choose from.
 *
 * Everything here is pure: a tip's fix and a variation's patch return new
 * data and never change what they're given.
 */
import { isBlackout, newSection, type Section, type Song } from "./model";
import { COLOR_CHANGES, MOODS, moodById, type ColorChange } from "./presets";

/** One suggestion. `fix` (when there is one) returns the song with it applied. */
export interface CoachTip {
  /** Stable across edits, for dismissing: the rule, and the section it's about. */
  id: string;
  sectionId?: string;
  title: string;
  detail: string;
  fix?: { label: string; apply: (song: Song) => Song };
  /** A suggestion the app acts on itself, such as opening variations for a section. */
  action?: "variations";
}

const VERSE_LIKE = new Set(["verse", "prechorus"]);

/** What a section really shows, with "follow the mood" resolved. */
export function effectiveLook(s: Section) {
  const mood = moodById(s.mood);
  return {
    palette: s.colors.length ? s.colors : mood.colors,
    pattern: s.pattern === "mood" ? mood.pattern : s.pattern,
    movement: s.movement === "mood" ? mood.movement : s.movement,
    colorChange: (s.colorChange === "mood" ? mood.colorChange : s.colorChange) as ColorChange,
  };
}

/** Two sections that would look the same on stage (same mood, energy, colors, pattern and movement). */
export function looksAlike(a: Section, b: Section): boolean {
  const x = effectiveLook(a);
  const y = effectiveLook(b);
  return a.mood === b.mood && a.energy === b.energy && x.pattern === y.pattern && x.movement === y.movement && x.colorChange === y.colorChange && x.palette.join() === y.palette.join() && !!a.effects.strobe === !!b.effects.strobe;
}

const patchSection = (song: Song, id: string, patch: Partial<Section>): Song => ({ ...song, sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

/** A step faster through the color changes: hold → every 4 bars → … → every beat. */
function fasterChange(c: ColorChange): ColorChange {
  const order = ["hold", "4bars", "2bars", "bar", "2beats", "beat"] as ColorChange[];
  const i = order.indexOf(c);
  return order[Math.min(order.length - 1, Math.max(0, i) + 1)]!;
}
function slowerChange(c: ColorChange): ColorChange {
  const order = ["hold", "4bars", "2bars", "bar", "2beats", "beat"] as ColorChange[];
  const i = order.indexOf(c);
  return order[Math.max(0, (i < 0 ? 1 : i) - 1)]!;
}

/**
 * Suggestions for a song, most useful first. `hasMovers` says whether the
 * stage has moving heads (the movement tip only makes sense with them).
 */
export function coachSong(song: Song, opts: { hasMovers: boolean }): CoachTip[] {
  const tips: CoachTip[] = [];
  const lit = song.sections.filter((s) => !isBlackout(s));
  if (lit.length < 2) return tips;

  // Chorus versus the verse before it: the chorus should feel bigger.
  song.sections.forEach((s, i) => {
    if (s.type !== "chorus" || isBlackout(s)) return;
    const before = song.sections.slice(0, i).reverse().find((x) => VERSE_LIKE.has(x.type) && !isBlackout(x));
    if (!before) return;
    if (s.energy <= before.energy && s.energy < 5) {
      const energy = Math.min(5, before.energy + 1);
      tips.push({
        id: `lift:${s.id}`,
        sectionId: s.id,
        title: `${s.name} isn't bigger than ${before.name}`,
        detail: `A chorus lands when it lifts: more energy means brighter, busier lights and faster changes. ${s.name} is at ${s.energy} and ${before.name} at ${before.energy}.`,
        fix: { label: `Raise ${s.name} to ${energy}`, apply: (song) => patchSection(song, s.id, { energy }) },
      });
    } else if (looksAlike(s, before)) {
      const change = fasterChange(effectiveLook(s).colorChange);
      tips.push({
        id: `same:${s.id}`,
        sectionId: s.id,
        title: `${s.name} looks just like ${before.name}`,
        detail: "With the same mood, colors and movement, the audience won't see the song change. Try a variation, or speed up its color changes.",
        fix: { label: "Change colors faster", apply: (song) => patchSection(song, s.id, { colorChange: change }) },
        action: "variations",
      });
    }
    // A chorus that fades in softens the hit; cutting in suits it better.
    if (s.transition === "fade" && (s.fadeBeats ?? 1) >= 4 && VERSE_LIKE.has(song.sections[i - 1]?.type ?? "")) {
      tips.push({
        id: `cut:${s.id}`,
        sectionId: s.id,
        title: `${s.name} fades in slowly`,
        detail: "A slow fade blurs the moment the chorus kicks in. Changing instantly makes the hit.",
        fix: { label: "Change instantly", apply: (song) => patchSection(song, s.id, { transition: "snap" }) },
      });
    }
  });

  // Three or more sections in a row that look the same.
  for (let i = 0; i + 2 < song.sections.length; i++) {
    const [a, b, c] = [song.sections[i]!, song.sections[i + 1]!, song.sections[i + 2]!];
    if ([a, b, c].some(isBlackout) || !looksAlike(a, b) || !looksAlike(b, c)) continue;
    tips.push({
      id: `run:${b.id}`,
      sectionId: b.id,
      title: `${a.name}, ${b.name} and ${c.name} look the same`,
      detail: "Three sections in a row with one look can feel long. Give the middle one a twist.",
      action: "variations",
    });
    i += 2;
  }

  // The whole song at one energy.
  if (lit.length >= 3 && lit.every((s) => s.energy === lit[0]!.energy)) {
    tips.push({
      id: "flat",
      title: "The whole song sits at one energy",
      detail: "A show feels alive when it rises and falls: calmer verses, a bigger chorus, a peak near the end. Drag the energy dots on the timeline to shape it.",
    });
  }

  // Moving heads that never move.
  if (opts.hasMovers && lit.every((s) => effectiveLook(s).movement === "static")) {
    const targets = lit.filter((s) => s.type === "chorus");
    const top = targets.length ? targets : lit.filter((s) => s.energy === Math.max(...lit.map((x) => x.energy)));
    tips.push({
      id: "still-heads",
      title: "The moving heads never move",
      detail: `They hold still in every section. A slow sweep in ${top.length === 1 ? top[0]!.name : "the biggest sections"} uses them for what they do best.`,
      fix: { label: `Sweep in ${top.length === 1 ? top[0]!.name : `${top.length} sections`}`, apply: (song) => ({ ...song, sections: song.sections.map((s) => (top.some((t) => t.id === s.id) ? { ...s, movement: "sweep" } : s)) }) },
    });
  }

  // A long section where nothing changes.
  for (const s of lit) {
    const look = effectiveLook(s);
    const busy = look.pattern !== "solid" || look.movement !== "static" || look.colorChange !== "hold" || Object.values(s.effects).some(Boolean) || (s.sequences ?? []).length > 0;
    if (s.bars >= 24 && !busy) {
      tips.push({
        id: `still:${s.id}`,
        sectionId: s.id,
        title: `Nothing changes for ${Math.round(s.bars)} bars in ${s.name}`,
        detail: "A long section with one steady look can go flat. Switching colors every couple of bars keeps it moving without getting busy.",
        fix: { label: "Change colors every 2 bars", apply: (song) => patchSection(song, s.id, { colorChange: "2bars" }) },
      });
    }
  }

  // No clear ending.
  const last = song.sections[song.sections.length - 1]!;
  if (!isBlackout(last)) {
    tips.push({
      id: "ending",
      title: "The song has no ending",
      detail: `The last look holds after ${last.name} until the next cue. A blackout on the last hit tells the audience the song is over; then Safe look while you talk.`,
      fix: {
        label: "Add a blackout ending",
        apply: (song) => {
          const end = { ...newSection("blackout", last.bpm), bars: 1, beatsPerBar: last.beatsPerBar, transition: "snap" as const };
          return { ...song, sections: [...song.sections, end] };
        },
      },
    });
  }
  return tips;
}

// ---------------------------------------------------------------------------
// Variations: three alternatives for one section's look.

export interface Variation {
  id: string;
  label: string;
  description: string;
  patch: Partial<Section>;
}

const MOVING_PATTERNS = ["waves", "stripes", "sineWave", "fillCenter", "circles", "alternate", "marquee", "plasma", "sparkle", "rainfall", "drizzle", "starfield", "bubbles", "slowWaves", "drift"];
const CALM_PATTERNS = ["drift", "slowWaves", "solid", "snow", "starfield"];
const HEAD_MOVES = ["sweep", "circle", "figure8", "diamond", "leaf", "ballyhoo"];

/** A small, repeatable shuffle: the same seed gives the same picks. */
function pick<T>(list: T[], seed: number, avoid?: T): T {
  const options = list.filter((x) => x !== avoid);
  const pool = options.length ? options : list;
  const i = Math.abs(Math.imul(seed + 1, 2654435761) >>> 0) % pool.length;
  return pool[i]!;
}

/**
 * Three looks to try for a section: more motion, other colors, and a step up
 * in energy (or down, for a section already at the top). `seed` reshuffles.
 */
export function variationsOf(s: Section, seed: number, opts: { hasMovers: boolean }): Variation[] {
  const look = effectiveLook(s);
  const out: Variation[] = [];

  const pattern = pick(MOVING_PATTERNS, seed, look.pattern);
  const move = opts.hasMovers ? pick(HEAD_MOVES, seed + 7, look.movement) : undefined;
  out.push({
    id: "motion",
    label: "More motion",
    description: move ? "A moving pattern, and the heads on the move" : "A moving pattern across the lights",
    patch: { pattern, ...(move ? { movement: move } : {}) },
  });

  const otherMoods = MOODS.filter((m) => m.id !== "custom" && m.colors.join() !== look.palette.join());
  const mood = pick(otherMoods, seed + 3);
  out.push({
    id: "colors",
    label: "Other colors",
    description: `The ${mood.label.toLowerCase()} colors, keeping everything else`,
    patch: { colors: [...mood.colors], colorLayout: undefined },
  });

  if (s.energy < 5) {
    out.push({
      id: "bigger",
      label: "Bigger",
      description: "More energy, faster color changes and a pulse on the beat",
      patch: { energy: s.energy + 1, colorChange: fasterChange(look.colorChange), effects: { ...s.effects, beatPulse: true } },
    });
  } else {
    out.push({
      id: "calmer",
      label: "A breath",
      description: "A step down: less energy, slower changes, a gentler pattern",
      patch: { energy: 4, colorChange: slowerChange(look.colorChange), pattern: pick(CALM_PATTERNS, seed + 5, look.pattern) },
    });
  }
  return out;
}

/** The color-change label, for describing a variation. */
export const colorChangeLabel = (c: ColorChange) => COLOR_CHANGES.find((x) => x.id === c)?.label ?? c;
