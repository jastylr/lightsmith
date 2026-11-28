/**
 * The look library: ready-made section looks to start from, grouped by
 * genre and tagged with the kinds of section they suit. A library look sets
 * the look (mood, colors, pattern, movement, effects, energy) and leaves the
 * section's own lights, chasers, aim and cues alone.
 */
import { newSection, type Section } from "./model";
import type { ColorChange, EffectId, MoverSpread } from "./presets";

export interface Genre {
  id: string;
  label: string;
  description: string;
}

export const GENRES: Genre[] = [
  { id: "rock", label: "Rock", description: "Warm verses, big hot choruses, heads that sweep" },
  { id: "metal", label: "Metal", description: "Reds and whites, hard hits, strobe and chaos" },
  { id: "pop", label: "Pop", description: "Saturated color, bouncy patterns, party choruses" },
  { id: "electronic", label: "Electronic", description: "Cool builds, fast chases, drops that explode" },
  { id: "hiphop", label: "Hip-hop and R&B", description: "Deep purples and golds, a pulse on the beat" },
  { id: "funk", label: "Funk and soul", description: "Warm, groovy, colors swapping on the beat" },
  { id: "country", label: "Country and folk", description: "Ambers and warm whites, gentle movement" },
  { id: "blues", label: "Blues and jazz", description: "Smoky blues and ambers, slow and intimate" },
  { id: "punk", label: "Punk", description: "Fast, raw, everything flashing at once" },
  { id: "indie", label: "Indie and alternative", description: "Unexpected palettes, drifting patterns" },
  { id: "ambient", label: "Ambient and cinematic", description: "Slow washes, mist and starlight" },
  { id: "latin", label: "Latin and reggae", description: "Bright, warm, dancing color" },
];

/** A ready-made look. `roles` are the kinds of section it suits best. */
export interface LibraryLook {
  id: string;
  name: string;
  description: string;
  /** Genre ids; "classic" for looks that suit anything. */
  genres: string[];
  roles: string[];
  look: Partial<Section>;
}

// Written compactly, then expanded: [name, roles, description, mood, colors, change, pattern, movement, energy, extras]
type Row = [string, string, string, string, string[], ColorChange, string, string, number, { fx?: EffectId[]; spread?: MoverSpread; speed?: number; fade?: boolean }?];

const ROWS: Record<string, Row[]> = {
  classic: [
    ["Warm stage wash", "intro verse outro", "A plain, flattering warm wash; nothing moves", "calm", ["warmWhite", "amber"], "hold", "solid", "static", 2],
    ["Cool blue night", "intro verse bridge", "Calm blues with a slow drift", "moody", ["blue", "indigo"], "4bars", "drift", "static", 2, { fade: true }],
    ["Full color chase", "chorus solo", "Every color round the stage, heads circling", "colorful", ["magenta", "cyan", "amber", "blue"], "bar", "waves", "circle", 4, { spread: "chase" }],
    ["White hot finale", "chorus outro", "Bright white and amber hits with a blinder", "energetic", ["white", "amber"], "beat", "alternate", "ballyhoo", 5, { fx: ["blinder", "beatPulse"] }],
    ["Spotlight moment", "bridge breakdown solo", "Dim color, one warm focus feel", "ember", ["plum", "warmWhite"], "hold", "solid", "static", 1],
    ["Rainbow party", "chorus", "A rainbow across the backdrop, everything moving", "celebration", ["yellow", "magenta", "cyan", "green"], "beat", "rainbow", "figure8", 5, { fx: ["sparkle"], spread: "offset" }],
    ["Two-tone swap", "verse chorus", "Two colors trading sides on the bar", "lively", ["cyan", "magenta"], "bar", "alternate", "sweep", 3],
    ["Golden hour", "verse bridge", "Amber and warm white, slow waves", "warm", ["amber", "warmWhite"], "4bars", "slowWaves", "leaf", 2],
    ["Blackout pulse", "breakdown", "Dark with a white pulse on every beat", "dark", ["white", "midnight"], "beat", "solid", "static", 3, { fx: ["beatPulse"] }],
  ],
  rock: [
    ["Amp glow", "intro", "Low amber like valve amps warming up", "warm", ["amber", "orange"], "hold", "slowWaves", "static", 2, { fade: true }],
    ["Garage verse", "verse", "Moody violet and blue, steady and close", "moody", ["violet", "blue"], "2bars", "solid", "sweep", 2],
    ["Arena chorus", "chorus", "Red, amber and white, heads sweeping the crowd", "energetic", ["red", "amber", "white"], "bar", "stripes", "sweep", 4, { fx: ["beatPulse"] }],
    ["Power bridge", "bridge prechorus", "Warm building waves", "warm", ["amber", "red"], "2beats", "waves", "circle", 3],
    ["Guitar hero", "solo", "Hot reds with white hits, heads going wild", "aggressive", ["red", "white"], "beat", "alternate", "ballyhoo", 5, { fx: ["strobe"] }],
    ["Last chord", "outro", "Fading amber, still heads", "warm", ["amber", "warmWhite"], "hold", "solid", "static", 2, { fade: true }],
    ["Stadium anthem", "chorus", "Full white and amber, a blinder and sweeping heads", "energetic", ["white", "amber", "red"], "bar", "fillCenter", "sweep", 5, { fx: ["blinder"] }],
    ["Riff", "verse chorus", "Red stripes chugging, heads in a figure 8", "energetic", ["red", "orange"], "2beats", "stripes", "figure8", 4],
    ["Dusk ballad", "verse bridge", "Indigo and amber for the slow one", "moody", ["indigo", "amber"], "4bars", "drift", "leaf", 2, { fade: true }],
  ],
  metal: [
    ["Before the storm", "intro", "Near-dark reds with lightning", "dark", ["red", "midnight"], "hold", "solid", "static", 1, { fx: ["lightning"] }],
    ["Iron verse", "verse", "Deep red and white, chugging on the beat", "aggressive", ["red", "white"], "2beats", "stripes", "diamond", 3],
    ["Wall of death", "chorus", "Full red and white, strobe and blinders", "aggressive", ["red", "white"], "beat", "alternate", "ballyhoo", 5, { fx: ["strobe", "blinder"], spread: "offset" }],
    ["Breakdown hits", "breakdown bridge", "Black with white hits on the beat", "dark", ["white", "midnight"], "beat", "strobe", "static", 4, { fx: ["beatPulse"] }],
    ["Shred", "solo", "Red lightning with the heads in a frenzy", "aggressive", ["red", "orange", "white"], "beat", "fireworks", "ballyhoo", 5, { fx: ["lightning", "strobe"] }],
    ["Embers", "outro", "Dying red embers", "ember", ["red", "plum"], "4bars", "sparkle", "static", 1, { fade: true }],
    ["Hellfire", "chorus solo", "Orange and red fire with lightning", "aggressive", ["red", "orange"], "beat", "plasma", "ballyhoo", 5, { fx: ["lightning"] }],
    ["Blast beat", "chorus verse", "White strobing over deep red", "aggressive", ["white", "red"], "beat", "strobe", "diamond", 5, { fx: ["strobe"] }],
    ["Cold steel", "verse bridge", "Steel blue and white, menacing", "mist", ["steelBlue", "white"], "2bars", "stripes", "sweep", 3],
  ],
  pop: [
    ["Sunrise", "intro", "Soft pink and amber coming up", "dreamy", ["pink", "amber"], "4bars", "fillCenter", "static", 2, { fade: true }],
    ["Candy verse", "verse", "Pink and cyan, gently bouncing", "lively", ["pink", "cyan"], "2bars", "bubbles", "leaf", 3],
    ["Pop explosion", "chorus", "Every bright color with a sparkle", "celebration", ["magenta", "yellow", "cyan", "green"], "beat", "balls", "figure8", 5, { fx: ["sparkle"], spread: "offset" }],
    ["Lift", "prechorus bridge", "Rising color filling the stage", "colorful", ["magenta", "cyan", "amber"], "bar", "fillUp", "circle", 4],
    ["Dance break", "solo breakdown", "Fast marquee with heads in a chase", "lively", ["cyan", "magenta", "white"], "2beats", "marquee", "diamond", 5, { spread: "chase", fx: ["beatPulse"] }],
    ["Confetti fade", "outro", "Sparkling pastels to finish", "dreamy", ["pink", "lavender", "cyan"], "2bars", "sparkle", "static", 2],
    ["Bubblegum", "chorus", "Pink, cyan and yellow bubbles everywhere", "celebration", ["pink", "cyan", "yellow"], "beat", "bubbles", "leaf", 4, { fx: ["sparkle"] }],
    ["Neon heart", "verse chorus", "Magenta pulsing on the beat", "lively", ["magenta", "pink"], "bar", "circles", "circle", 4, { fx: ["beatPulse"] }],
    ["Piano ballad", "verse bridge outro", "Lavender and warm white, gentle", "dreamy", ["lavender", "warmWhite"], "4bars", "drift", "static", 2, { fade: true }],
  ],
  electronic: [
    ["Laser fog", "intro", "Cyan and violet through a slow starfield", "moody", ["cyan", "violet"], "4bars", "starfield", "sweep", 2, { fade: true }],
    ["Build-up", "prechorus verse", "Filling up faster and faster", "lively", ["cyan", "blue", "white"], "beat", "fillUp", "circle", 4, { speed: 2 }],
    ["The drop", "chorus solo", "Strobe, blinder and every head flying", "aggressive", ["magenta", "cyan", "white"], "beat", "alternate", "ballyhoo", 5, { fx: ["blinder", "strobe"], spread: "offset" }],
    ["Plasma groove", "verse", "Liquid plasma in neon colors", "colorful", ["magenta", "blue", "cyan"], "bar", "plasma", "figure8", 3],
    ["Breakdown", "breakdown bridge", "Cold blue sine waves, heads still", "mist", ["steelBlue", "iceBlue"], "2bars", "sineWave", "static", 2],
    ["Afterglow", "outro", "Slow violet drift", "twilight", ["midnight", "lavender"], "4bars", "drift", "static", 1, { fade: true }],
    ["Neon tunnel", "chorus", "Fast cyan and magenta marquee, heads chasing", "lively", ["cyan", "magenta"], "2beats", "marquee", "circle", 5, { spread: "chase", speed: 2 }],
    ["Four on the floor", "verse chorus", "Blue with a white pulse on every beat", "moody", ["blue", "white"], "bar", "circles", "diamond", 4, { fx: ["beatPulse"] }],
    ["Rave rainbow", "chorus solo", "A fast rainbow with sparkle", "celebration", ["magenta", "cyan", "yellow", "green"], "beat", "rainbow", "ballyhoo", 5, { fx: ["sparkle"], speed: 2 }],
  ],
  hiphop: [
    ["Smoke and gold", "intro", "Deep purple with a gold glow", "moody", ["violet", "amber"], "hold", "slowWaves", "static", 2],
    ["Head nod", "verse", "Purple and gold pulsing on the beat", "moody", ["violet", "amber"], "2bars", "solid", "sweep", 3, { fx: ["beatPulse"] }],
    ["Hook", "chorus", "Gold and magenta, heads circling", "energetic", ["amber", "magenta", "white"], "bar", "circles", "circle", 4, { fx: ["beatPulse"] }],
    ["Velvet", "bridge prechorus", "Soft magenta and indigo", "dreamy", ["magenta", "indigo"], "2bars", "drift", "leaf", 2],
    ["Flex", "solo breakdown", "Fast gold and white flashes", "aggressive", ["amber", "white"], "beat", "alternate", "diamond", 5, { fx: ["strobe"] }],
    ["Fade to purple", "outro", "Purple wash, lights coming down", "twilight", ["violet", "midnight"], "hold", "solid", "static", 1, { fade: true }],
    ["Gold chain", "chorus", "Gold and white sparkle, heads in a figure 8", "energetic", ["amber", "yellow", "white"], "bar", "sparkle", "figure8", 5, { fx: ["sparkle"] }],
    ["Low end", "verse", "Deep red and indigo, a heavy pulse", "dark", ["red", "indigo"], "2bars", "slowWaves", "static", 3, { fx: ["beatPulse"] }],
    ["Neon city", "chorus bridge", "Magenta and cyan streets", "lively", ["magenta", "cyan"], "bar", "stripes", "sweep", 4],
  ],
  funk: [
    ["Disco warm-up", "intro", "Warm amber with a twinkle", "warm", ["amber", "orange"], "2bars", "sparkle", "static", 2],
    ["Groove", "verse", "Orange and magenta swapping on the beat", "lively", ["orange", "magenta"], "beat", "alternate", "leaf", 3],
    ["Get down", "chorus", "Hot colors, bouncing balls, heads dancing", "celebration", ["orange", "magenta", "yellow"], "beat", "balls", "figure8", 4, { spread: "offset", fx: ["sparkle"] }],
    ["Horn line", "bridge prechorus", "Gold stripes marching", "warm", ["amber", "yellow"], "2beats", "stripes", "sweep", 3],
    ["Slap solo", "solo", "Fast marquee in warm colors", "energetic", ["red", "amber", "white"], "beat", "marquee", "ballyhoo", 5, { fx: ["beatPulse"] }],
    ["Mirror ball", "outro", "Sparkle and slow circles", "dreamy", ["pink", "warmWhite"], "2bars", "sparkle", "circle", 2],
    ["Soul train", "chorus verse", "Warm marquee with heads in a chase", "warm", ["amber", "red", "pink"], "2beats", "marquee", "sweep", 4, { spread: "chase" }],
    ["Velvet soul", "verse bridge", "Plum and amber, slow and warm", "ember", ["plum", "amber"], "4bars", "slowWaves", "leaf", 2],
    ["Boogie wonderland", "chorus solo", "Mirror-ball sparkle in every color", "celebration", ["magenta", "yellow", "cyan"], "beat", "sparkle", "ballyhoo", 5, { fx: ["sparkle", "beatPulse"] }],
  ],
  country: [
    ["Porch light", "intro", "Warm white, still and simple", "calm", ["warmWhite", "amber"], "hold", "solid", "static", 1, { fade: true }],
    ["Dusty road", "verse", "Amber and orange with a slow sway", "warm", ["amber", "orange"], "4bars", "drift", "sweep", 2],
    ["Honky-tonk", "chorus", "Bright ambers and red, heads sweeping", "energetic", ["amber", "red", "warmWhite"], "bar", "waves", "sweep", 4],
    ["Campfire", "bridge breakdown", "Ember glow, flickering", "ember", ["orange", "plum"], "2bars", "sparkle", "static", 2],
    ["Fiddle run", "solo", "Warm chase across the stage", "energetic", ["amber", "white"], "2beats", "marquee", "circle", 4, { spread: "chase" }],
    ["Sundown", "outro", "Fading amber to plum", "ember", ["amber", "plum"], "4bars", "solid", "static", 1, { fade: true }],
    ["Big sky", "chorus", "Wide warm white and amber, heads sweeping", "calm", ["warmWhite", "amber", "steelBlue"], "2bars", "fillCenter", "sweep", 4],
    ["Barn dance", "chorus solo", "Bright warm colors dancing on the beat", "energetic", ["amber", "red", "yellow"], "beat", "alternate", "figure8", 5],
    ["Prairie", "verse bridge", "Soft amber and teal", "calm", ["amber", "teal"], "4bars", "slowWaves", "static", 2],
  ],
  blues: [
    ["Smoky room", "intro", "Deep blue with a warm edge", "moody", ["blue", "amber"], "hold", "solid", "static", 1, { fade: true }],
    ["Twelve bar", "verse", "Blue and indigo, slow drift", "moody", ["blue", "indigo"], "4bars", "slowWaves", "static", 2],
    ["Shout chorus", "chorus", "Amber and blue, heads swaying", "warm", ["amber", "blue", "warmWhite"], "2bars", "waves", "sweep", 3],
    ["Late set", "bridge", "Plum and warm white, intimate", "ember", ["plum", "warmWhite"], "hold", "solid", "static", 2],
    ["Bend it", "solo", "Warm focus with a gentle pulse", "warm", ["amber", "orange"], "bar", "circles", "leaf", 4, { fx: ["beatPulse"] }],
    ["Last call", "outro", "Blue fading to dark", "dark", ["indigo", "blue"], "hold", "solid", "static", 1, { fade: true }],
    ["Juke joint", "chorus solo", "Red and amber, the heads swaying", "warm", ["red", "amber"], "bar", "circles", "leaf", 4, { fx: ["beatPulse"] }],
    ["Midnight sax", "verse bridge", "Deep blue with a single warm accent", "moody", ["midnight", "amber"], "4bars", "drift", "static", 2],
    ["Swing", "chorus", "Gold and blue alternating", "lively", ["amber", "blue"], "2beats", "alternate", "sweep", 4],
  ],
  punk: [
    ["Count-in", "intro", "Red and white snapping on the beat", "aggressive", ["red", "white"], "beat", "alternate", "static", 3],
    ["Three chords", "verse", "Raw red and amber, fast", "energetic", ["red", "amber"], "2beats", "stripes", "diamond", 4],
    ["Pogo", "chorus", "Everything flashing, heads going everywhere", "aggressive", ["red", "white", "yellow"], "beat", "strobe", "ballyhoo", 5, { fx: ["strobe", "blinder"], spread: "offset" }],
    ["Breakdown", "bridge breakdown", "Lime and white, jarring", "dread", ["lime", "white"], "beat", "alternate", "square", 4],
    ["Feedback", "solo", "Lightning and red chaos", "aggressive", ["red", "white"], "beat", "fireworks", "ballyhoo", 5, { fx: ["lightning"] }],
    ["Cut", "outro", "Hard red, then gone", "aggressive", ["red"], "hold", "solid", "static", 3],
    ["Riot", "chorus solo", "Red and yellow fireworks", "aggressive", ["red", "yellow"], "beat", "fireworks", "ballyhoo", 5, { fx: ["blinder"] }],
    ["Fast and loud", "verse chorus", "Red and white stripes, flat out", "aggressive", ["red", "white"], "beat", "stripes", "diamond", 5, { speed: 2 }],
    ["Snarl", "verse", "Sickly lime and amber", "dread", ["lime", "sicklyAmber"], "2beats", "alternate", "square", 3],
  ],
  indie: [
    ["Polaroid", "intro", "Faded teal and pink", "dreamy", ["teal", "pink"], "4bars", "drift", "static", 2, { fade: true }],
    ["Bedroom verse", "verse", "Lavender and amber, unhurried", "dreamy", ["lavender", "amber"], "2bars", "slowWaves", "leaf", 2],
    ["Festival chorus", "chorus", "Teal, coral and gold, heads sweeping", "colorful", ["teal", "orange", "yellow"], "bar", "waves", "sweep", 4],
    ["Shoegaze", "bridge breakdown", "Hazy violet snow", "twilight", ["violet", "lavender"], "4bars", "snow", "static", 2],
    ["Fuzz solo", "solo", "Lime and magenta, wobbling", "lively", ["lime", "magenta"], "2beats", "sineWave", "figure8", 4],
    ["Credits", "outro", "Slow starfield", "mist", ["steelBlue", "lavender"], "4bars", "starfield", "static", 1, { fade: true }],
    ["Golden hour indie", "chorus", "Coral and gold filling the stage", "warm", ["orange", "yellow", "pink"], "bar", "fillCenter", "sweep", 4],
    ["Lo-fi", "verse", "Teal and amber, a little grainy", "calm", ["teal", "amber"], "4bars", "sparkle", "static", 2],
    ["Synth pop", "chorus solo", "Magenta and cyan plasma", "lively", ["magenta", "cyan", "lavender"], "bar", "plasma", "figure8", 4],
  ],
  ambient: [
    ["Mist rising", "intro", "Haunted blue mist", "mist", ["steelBlue", "iceBlue"], "4bars", "snow", "static", 1, { fade: true }],
    ["Slow tide", "verse", "Deep teal waves rolling in", "mist", ["deepTeal", "iceBlue"], "4bars", "slowWaves", "sweep", 2],
    ["Swell", "chorus", "Lavender and white opening up", "dreamy", ["lavender", "white", "teal"], "2bars", "fillCenter", "leaf", 3],
    ["Starlight", "bridge breakdown", "A field of stars", "twilight", ["midnight", "lavender"], "4bars", "starfield", "static", 1],
    ["Aurora", "solo", "Green and violet flowing", "dreamy", ["green", "violet", "teal"], "2bars", "plasma", "circle", 3],
    ["Dissolve", "outro", "Fading into dark blue", "twilight", ["midnight", "steelBlue"], "hold", "drift", "static", 1, { fade: true }],
    ["Deep ocean", "verse chorus", "Deep teal and blue, slow sine", "mist", ["deepTeal", "blue"], "4bars", "sineWave", "leaf", 3],
    ["Cathedral", "chorus", "Warm white light opening from the center", "calm", ["warmWhite", "lavender"], "2bars", "fillCenter", "static", 4, { fade: true }],
    ["Northern lights", "chorus bridge", "Green, teal and violet waves", "dreamy", ["green", "teal", "violet"], "2bars", "waves", "sweep", 3],
  ],
  latin: [
    ["Calor", "intro", "Warm orange glow", "warm", ["orange", "amber"], "4bars", "drift", "static", 2],
    ["Clave", "verse", "Teal and orange alternating on the beat", "lively", ["teal", "orange"], "beat", "alternate", "leaf", 3],
    ["Fiesta", "chorus", "Every warm color dancing", "celebration", ["red", "yellow", "magenta", "green"], "beat", "balls", "figure8", 5, { fx: ["sparkle"], spread: "offset" }],
    ["One drop", "bridge breakdown", "Red, gold and green, laid back", "warm", ["red", "yellow", "green"], "2bars", "stripes", "sweep", 3],
    ["Montuno", "solo", "Fast warm marquee", "energetic", ["orange", "magenta", "white"], "2beats", "marquee", "circle", 4, { spread: "chase" }],
    ["Sunset", "outro", "Magenta to amber, slowing down", "warm", ["magenta", "amber"], "4bars", "solid", "static", 2, { fade: true }],
    ["Carnaval", "chorus solo", "Every color with sparkle and heads dancing", "celebration", ["magenta", "yellow", "green", "cyan"], "beat", "sparkle", "ballyhoo", 5, { fx: ["sparkle", "beatPulse"] }],
    ["Roots", "verse", "Red, gold and green, slow", "warm", ["red", "yellow", "green"], "4bars", "slowWaves", "sweep", 2],
    ["Salsa", "chorus", "Hot red and orange alternating on the beat", "energetic", ["red", "orange", "yellow"], "beat", "alternate", "figure8", 4],
  ],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const LIBRARY: LibraryLook[] = Object.entries(ROWS).flatMap(([genre, rows]) =>
  rows.map(([name, roles, description, mood, colors, change, pattern, movement, energy, x]) => ({
    id: `${genre}-${slug(name)}`,
    name,
    description,
    genres: [genre],
    roles: roles.split(" "),
    look: {
      mood,
      colors,
      colorChange: change,
      colorFade: !!x?.fade,
      pattern,
      movement,
      energy,
      moverSpread: x?.spread ?? "together",
      effects: Object.fromEntries((x?.fx ?? []).map((e) => [e, true])),
      ...(x?.speed ? { patternSpeed: x.speed } : {}),
    },
  })),
);

/** Looks for a genre ("any" or empty for every genre) and, if given, a kind of section; best matches first. */
export function libraryFor(genre: string | undefined, role?: string): LibraryLook[] {
  const inGenre = LIBRARY.filter((l) => !genre || genre === "any" || l.genres.includes(genre) || l.genres.includes("classic"));
  // The genre's own looks before the classics.
  inGenre.sort((a, b) => Number(a.genres.includes("classic")) - Number(b.genres.includes("classic")));
  if (!role) return inGenre;
  const fits = (l: LibraryLook) => l.roles.includes(role) || (role === "prechorus" && l.roles.includes("bridge")) || (role === "breakdown" && l.roles.includes("bridge"));
  return [...inGenre.filter(fits), ...inGenre.filter((l) => !fits(l))];
}

/** The genre's look for a kind of section (the first that suits it), if it has one. */
export function genreLookFor(genre: string, role: string): LibraryLook | undefined {
  if (!genre || genre === "any") return undefined;
  const own = LIBRARY.filter((l) => l.genres.includes(genre));
  const alias: Record<string, string[]> = { prechorus: ["prechorus", "bridge", "verse"], breakdown: ["breakdown", "bridge"], custom: ["verse"], bridge: ["bridge", "breakdown"] };
  for (const r of alias[role] ?? [role]) {
    const hit = own.find((l) => l.roles.includes(r));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * A section with a library look: the look's settings replace the section's
 * look (anything the library look doesn't set goes back to its default), while
 * its name, length, lights, chasers, aim, cues and start stay as they are.
 */
export function applyLibraryLook(s: Section, l: LibraryLook): Section {
  const fresh = newSection(s.type, s.bpm);
  return {
    ...s,
    mood: fresh.mood,
    colors: [],
    colorChange: fresh.colorChange,
    colorFade: false,
    pattern: fresh.pattern,
    movement: fresh.movement,
    moverSpread: fresh.moverSpread,
    effects: {},
    colorLayout: undefined,
    colorSwitch: undefined,
    colorRates: undefined,
    brightness: undefined,
    patternTargets: undefined,
    patternSpeed: undefined,
    effectTargets: undefined,
    moverBeats: undefined,
    moverShape: undefined,
    ...structuredClone(l.look),
    preset: undefined,
  };
}
