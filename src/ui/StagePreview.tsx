import { useMemo } from "react";
import { COLOR_CHANGES, colorById, DEFAULT_COLOR_LAYOUT, effectTargets, energyOf, focusLights, moodById, MOVEMENTS, patternById, patternTargets, type ColorJob, type Rig, type Section } from "../core";

const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const W = 400;
const H = 225;
const css = (id: string) => {
  const [r, g, b] = colorById(id).rgb;
  return `rgb(${r},${g},${b})`;
};
/** Deterministic 0..1 "random" so the preview doesn't jump between renders. */
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

type Family = "solid" | "wave" | "vertical" | "random" | "strobe";
const FAMILY: Record<string, Family> = {
  solid: "solid",
  slowWaves: "wave",
  waves: "wave",
  circles: "wave",
  fillCenter: "wave",
  stripes: "vertical",
  fillUp: "vertical",
  sineWave: "vertical",
  alternate: "vertical",
  marquee: "vertical",
  rainfall: "vertical",
  snow: "vertical",
  bubbles: "vertical",
  strobe: "strobe",
};

/**
 * An impression of a section's look on the user's stage: backdrop, side
 * lights, moving-head beams and front light, animated at the song's tempo.
 * It's a sketch to judge color and energy, not a simulation.
 */
export function StagePreview({ section, rig, compact = false }: { section: Section; rig: Rig; compact?: boolean }) {
  const view = useMemo(() => {
    const mood = moodById(section.mood);
    const en = energyOf(section.energy);
    const pal = (section.colors.length ? section.colors : mood.colors).map(css);
    const pattern = patternById(section.pattern === "mood" ? mood.pattern : section.pattern);
    const changeId = section.colorChange === "mood" ? mood.colorChange : section.colorChange;
    const change = COLOR_CHANGES.find((c) => c.id === changeId)!;
    const beat = 60 / section.bpm;
    const period = change.beats === 0 ? 0 : change.beats > 0 ? change.beats * beat : -change.beats * beat * section.beatsPerBar;
    const moveId = section.movement === "mood" ? mood.movement : section.movement;
    const movement = MOVEMENTS.find((m) => m.id === moveId) ?? MOVEMENTS[0]!;
    const level = Math.max(0.2, Math.min(1, mood.intensity * en.level));
    return { mood, en, pal, pattern, period, beat, movement, level };
  }, [section]);

  const { pal, pattern, period, beat, movement, level, en } = view;
  const p0 = pal[0]!;
  const p1 = pal[1] ?? p0;
  const rotating = period > 0 && pal.length > 1;
  const animate = !reduceMotion;

  // Fixtures from the rig, placed by their stage-plan position (audience view).
  const byRole = (role: string) => rig.fixtures.filter((f) => f.role === role && f.pos).sort((a, b) => a.pos!.x - b.pos!.x);
  const backFx = byRole("backdrop");
  // With no backdrop on the plan, sketch four generic bars (id -1).
  const bars = backFx.length ? backFx.map((f) => ({ x: f.pos!.x, id: f.fixtureId })) : [0.2, 0.4, 0.6, 0.8].map((x) => ({ x, id: -1 }));
  const sides = byRole("side");
  const movers = byRole("mover");
  const fronts = byRole("front");
  // Colors are handed out stage left first, the same way the export does it.
  const stageIndex = (list: { pos?: { x: number } }[], i: number) =>
    [...list.keys()].sort((a, b) => (list[b]!.pos?.x ?? 0) - (list[a]!.pos?.x ?? 0)).indexOf(i);
  const under = pal.length > 2 ? pal.filter((_, k) => k !== 1) : [p0];
  const rainOn = new Set(section.effects.rain ? effectTargets(section, "rain", rig) : []);
  const sparkleOn = new Set(section.effects.sparkle ? effectTargets(section, "sparkle", rig) : []);
  const twinkles = (id: number) => (id === -1 ? !!(section.effects.rain || section.effects.sparkle) : rainOn.has(id) || sparkleOn.has(id));
  const WARM = "#ffd9a8";

  /** A fill that steps through the palette when colors change. */
  const fill = (base: string, offset: number) => {
    if (!rotating || !animate) return { fill: base, anim: null };
    const k = pal.indexOf(base);
    const order = [...pal.slice(k >= 0 ? k + offset : offset), ...pal.slice(0, k >= 0 ? k + offset : offset)];
    const values = [...order, order[0]].join(";");
    return {
      fill: base,
      anim: <animate attributeName="fill" values={values} dur={`${period * pal.length}s`} calcMode={section.colorFade ? "linear" : "discrete"} repeatCount="indefinite" />,
    };
  };

  const family = FAMILY[pattern.id] ?? "random";
  const cells = 9;
  const cycle = Math.max(0.6, (beat * 4) / en.speed);
  const barW = 14;
  const topY = 18;
  const cellH = 11;
  const focusSet = new Set(section.focus === "all" ? [] : focusLights({ fixtures: rig.fixtures.filter((f) => f.role !== "ignore") }, section.focus));
  const focusing = focusSet.size > 0;
  const layout = { ...DEFAULT_COLOR_LAYOUT, ...(section.colorLayout ?? {}) };
  /** Same rules as the export: mix spreads the palette; a number picks one color; "white" is warm white. */
  const colorFor = (job: ColorJob, k: number, offset: number) => {
    const t = layout[job];
    if (t === "white") return WARM;
    if (typeof t === "number") return pal[t % pal.length]!;
    return pal[(k + offset) % pal.length]!;
  };
  const fixedBack = typeof layout.backdrop === "number" ? layout.backdrop : null;
  const main = fixedBack !== null ? pal[fixedBack % pal.length]! : p0;
  const accent = fixedBack !== null ? pal[(fixedBack + 1) % pal.length]! : p1;
  const patternOn = new Set(patternTargets(section, rig));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={compact ? "preview compact" : "preview"} role="img" aria-label={`Preview of ${section.name}`}>
      <defs>
        <radialGradient id="pv-haze" cx="50%" cy="15%" r="80%">
          <stop offset="0" stopColor={p0} stopOpacity={0.28 * level} />
          <stop offset="1" stopColor={p0} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pv-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a262e" />
          <stop offset="1" stopColor="#141216" />
        </linearGradient>
        <linearGradient id="pv-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="pv-beam-mask" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="url(#pv-beam)" />
        </mask>
      </defs>

      <rect width={W} height={H} fill="#121014" />
      <rect width={W} height={H} fill="url(#pv-haze)">
        {animate && rotating && <animate attributeName="opacity" values="1;0.8;1" dur={`${period}s`} repeatCount="indefinite" />}
      </rect>
      <path d={`M0 ${H * 0.62} L${W} ${H * 0.62} L${W} ${H} L0 ${H} Z`} fill="url(#pv-floor)" />

      {/* Backdrop bars */}
      <g>
        {bars.map((bar, i) => {
          const x = 40 + bar.x * (W - 80) - barW / 2;
          const k = backFx.length ? stageIndex(backFx, i) : i;
          const runsPattern = !!pattern.algorithm && (bar.id === -1 ? patternOn.size === 0 && backFx.length === 0 : patternOn.has(bar.id));
          const solidColor = layout.backdrop === "mix" ? (pattern.id === "solid" ? pal[k % pal.length]! : under[k % under.length]!) : colorFor("backdrop", k, 0);
          const base = fill(solidColor, 0);
          return (
            <g key={i}>
              <rect x={x - 3} y={topY - 3} width={barW + 6} height={cells * cellH + 6} rx="3" fill="#0b0a0c" />
              {Array.from({ length: cells }, (_, c) => {
                const y = topY + c * cellH;
                const floor = runsPattern ? Math.max(0.12, pattern.floor) * level : level;
                const over = fill(pattern.colors === 2 && c % 2 ? main : accent, 1);
                let begin = 0;
                if (family === "wave") begin = (Math.abs(c - (cells - 1) / 2) / cells) * cycle;
                else if (family === "vertical") begin = (c / cells) * cycle;
                else if (family === "random") begin = rnd(i * 31 + c * 7) * cycle;
                const showOver = family !== "solid" && runsPattern;
                return (
                  <g key={c}>
                    <rect x={x} y={y + 1} width={barW} height={cellH - 2} rx="2" fill={base.fill} opacity={floor}>
                      {base.anim}
                    </rect>
                    {showOver && (
                      <rect x={x} y={y + 1} width={barW} height={cellH - 2} rx="2" fill={pattern.id === "rainbow" ? `hsl(${(c * 40 + i * 25) % 360} 90% 55%)` : over.fill} opacity={animate ? 0 : 0.6 * level}>
                        {pattern.id !== "rainbow" && over.anim}
                        {animate && (
                          <animate
                            attributeName="opacity"
                            values={family === "strobe" ? `0;${level};0;0` : `0;${level};0`}
                            keyTimes={family === "strobe" ? "0;0.05;0.15;1" : "0;0.35;1"}
                            dur={`${family === "strobe" ? beat / en.speed : cycle}s`}
                            begin={`${-begin}s`}
                            repeatCount="indefinite"
                          />
                        )}
                      </rect>
                    )}
                    {twinkles(bar.id) && animate && (
                      <rect x={x} y={y + 1} width={barW} height={cellH - 2} rx="2" fill={sparkleOn.has(bar.id) || (bar.id === -1 && section.effects.sparkle) ? "#fff" : "#cfe3ff"} opacity="0">
                        <animate attributeName="opacity" values="0;0.85;0" keyTimes="0;0.1;1" dur={`${0.9 + rnd(i * 13 + c) * 1.6}s`} begin={`${-rnd(i * 5 + c * 11) * 2}s`} repeatCount="indefinite" />
                      </rect>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* Side / floor lights: cones towards center stage */}
      {sides.map((f, i) => {
        const fx = 40 + f.pos!.x * (W - 80);
        const fy = H * 0.62 + f.pos!.y * (H * 0.36);
        const focused = focusSet.has(f.fixtureId);
        const dimmed = focusing && !focused;
        const color = focused ? WARM : colorFor("side", stageIndex(sides, i), 0);
        const toX = fx < W / 2 ? fx + 70 : fx - 70;
        const c = fill(color, 0);
        return (
          <g key={f.fixtureId} opacity={dimmed ? 0.35 : 1}>
            <path d={`M${fx} ${fy} L${toX - 22} ${fy - 95} L${toX + 22} ${fy - 95} Z`} fill={focused ? color : c.fill} opacity={0.35 + 0.35 * level} mask="url(#pv-beam-mask)">
              {!focused && c.anim}
              {animate && section.effects.beatPulse && <animate attributeName="opacity" values={`${0.6 * level};${0.2 * level};${0.2 * level}`} keyTimes="0;0.4;1" dur={`${beat}s`} repeatCount="indefinite" />}
            </path>
            <rect x={fx - 7} y={fy - 4} width="14" height="8" rx="2" fill="#3b3640" />
            <circle cx={fx} cy={fy - 4} r="3.2" fill={focused ? color : c.fill}>
              {!focused && c.anim}
            </circle>
            {twinkles(f.fixtureId) && animate && (
              <circle cx={fx} cy={fy - 4} r="6" fill="#fff" opacity="0">
                <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.1;1" dur={`${0.7 + rnd(f.fixtureId) * 0.9}s`} repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}

      {/* Moving heads: beams that follow the chosen movement */}
      {movers.map((f, i) => {
        const fx = 40 + f.pos!.x * (W - 80);
        const fy = H * 0.5 + f.pos!.y * 40;
        const moverFocused = focusSet.has(f.fixtureId);
        const c = moverFocused ? { fill: WARM, anim: null } : fill(colorFor("mover", stageIndex(movers, i), 1), 0);
        const dur = movement.bars ? (movement.bars * beat * section.beatsPerBar) / en.speed : 0;
        const mirror = f.reverse ? -1 : 1;
        const swing = movement.id === "sweep" ? 32 : movement.id === "ballyhoo" ? 40 : movement.id === "static" ? 0 : 24;
        const values =
          movement.id === "figure8" || movement.id === "ballyhoo"
            ? `${-swing * mirror};${swing * mirror};${-swing * mirror * 0.4};${swing * mirror * 0.4};${-swing * mirror}`
            : `${-swing * mirror};${swing * mirror};${-swing * mirror}`;
        const lean = movement.id === "static" ? (fx < W / 2 ? 16 : -16) : 0;
        return (
          <g key={f.fixtureId}>
            <g transform={`rotate(${lean} ${fx} ${fy})`}>
              <path d={`M${fx - 2} ${fy} L${fx - 20} ${fy - 175} L${fx + 20} ${fy - 175} L${fx + 2} ${fy} Z`} fill={c.fill} opacity={0.5 + 0.35 * level} mask="url(#pv-beam-mask)">
                {c.anim}
              </path>
              {animate && dur > 0 && <animateTransform attributeName="transform" type="rotate" values={values.split(";").map((v) => `${v} ${fx} ${fy}`).join(";")} dur={`${dur}s`} begin={`${-(i * dur) / Math.max(2, movers.length)}s`} repeatCount="indefinite" additive="sum" />}
            </g>
            <rect x={fx - 9} y={fy - 2} width="18" height="10" rx="3" fill="#3b3640" />
            <circle cx={fx} cy={fy} r="4.5" fill={c.fill}>
              {c.anim}
            </circle>
          </g>
        );
      })}

      {/* Front wash */}
      {fronts.length > 0 && <rect x="0" y={H * 0.78} width={W} height={H * 0.22} fill={colorFor("front", 0, 0)} opacity={0.08 + 0.12 * level} />}

      {/* Lightning / blinder: a white flash */}
      {animate && (section.effects.lightning || section.effects.blinder) && (
        <rect width={W} height={H} fill="#fff" opacity="0" pointerEvents="none">
          <animate attributeName="opacity" values="0;0;0.75;0;0.45;0;0" keyTimes="0;0.7;0.72;0.75;0.78;0.81;1" dur={section.effects.lightning ? "4.5s" : "3s"} repeatCount="indefinite" />
        </rect>
      )}
      {animate && section.effects.strobe && (
        <rect width={W} height={H * 0.6} fill="#fff" opacity="0" pointerEvents="none">
          <animate attributeName="opacity" values="0;0.35;0;0" keyTimes="0;0.05;0.12;1" dur={`${beat / 2}s`} repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  );
}
