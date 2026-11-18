import { useId, useMemo } from "react";
import { COLOR_CHANGES, colorById, FOCUS_DIM, colorLayoutOf, lightLevels, lightSetting, effectTargets, energyOf, focusLights, moodById, MOVEMENTS, patternById, patternTargets, type ColorJob, type Rig, type Section } from "../core";

const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const W = 640;
const H = 250;
const css = (id: string) => {
  const [r, g, b] = colorById(id).rgb;
  return `rgb(${r},${g},${b})`;
};
/** Deterministic 0..1 "random" so the preview doesn't jump between renders. */
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

type Family = "solid" | "wave" | "vertical" | "random" | "strobe" | "rain";
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
  rainfall: "rain",
  drizzle: "random",
  snow: "rain",
  bubbles: "vertical",
  strobe: "strobe",
};

/**
 * An impression of a section's look on the user's stage: backdrop, side
 * lights, moving-head beams and front light, animated at the song's tempo.
 * It's a sketch to judge color and energy, not a simulation.
 */
const cells = 9;

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
  // Each kind of light's brightness (the section's own, or automatic); vis()
  // keeps dim lights visible on screen while still showing the difference.
  const lv = lightLevels(section);
  const vis = (l: number) => 0.3 + 0.7 * l;
  const p0 = pal[0]!;
  const p1 = pal[1] ?? p0;
  const rotating = period > 0 && pal.length > 1;
  const animate = !reduceMotion;

  // Fixtures from the rig, placed by their stage-plan position (audience view).
  const byRole = (role: string) => rig.fixtures.filter((f) => f.role === role && f.pos).sort((a, b) => a.pos!.x - b.pos!.x);
  const backFx = byRole("backdrop");
  // Only the backdrop lights the rig really has: a rig without any shows a bare wall.
  const bars = backFx.map((f) => ({ x: f.pos!.x, id: f.fixtureId }));
  const sides = byRole("side");
  const movers = byRole("mover");
  const fronts = byRole("front");
  // Colors are handed out stage left first, the same way the export does it.
  const stageIndex = (list: { pos?: { x: number } }[], i: number) =>
    [...list.keys()].sort((a, b) => (list[b]!.pos?.x ?? 0) - (list[a]!.pos?.x ?? 0)).indexOf(i);
  const under = pal.length > 2 ? pal.filter((_, k) => k !== 1) : [p0];
  const sparkleOn = new Set(section.effects.sparkle ? effectTargets(section, "sparkle", rig) : []);
  const twinkles = (id: number) => sparkleOn.has(id);
  /** A light's own settings for this section (they win over everything else). */
  const ownOf = (id: number) => {
    const l = lightSetting(section, id);
    const rgb = l?.color !== undefined ? colorById(l.color).rgb : undefined;
    return { color: rgb ? `rgb(${rgb.join(",")})` : undefined, level: l?.level, off: !!l?.off };
  };
  const DARK_LENS = "#2c2832";
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
  const cycle = Math.max(0.6, (beat * 4) / en.speed);
  const barW = 8;
  const topY = 52;
  const cellH = 10.5;
  const focusSet = new Set(section.focus === "all" ? [] : focusLights({ fixtures: rig.fixtures.filter((f) => f.role !== "ignore") }, section.focus));
  const focusing = focusSet.size > 0;
  const layout = colorLayoutOf(section);
  /** Same rules as the export: mix spreads the palette; a number picks one color; "white" is warm white. */
  const colorFor = (job: ColorJob, k: number, offset: number) => {
    const t = layout[job];
    if (t === "white") return WARM;
    if (typeof t === "number") return pal[t % pal.length]!;
    return pal[(k + offset) % pal.length]!;
  };
  const fixedBack = typeof layout.backdrop === "number" ? layout.backdrop : null;
  const whiteBack = layout.backdrop === "white";
  const main = whiteBack ? WARM : fixedBack !== null ? pal[fixedBack % pal.length]! : p0;
  const accent = whiteBack ? WARM : fixedBack !== null ? pal[(fixedBack + 1) % pal.length]! : p1;
  /** Rain and snow are lightened towards white, as in the export. */
  const whiten = (c: string) => (pattern.whiten ? `color-mix(in srgb, ${c} ${Math.round((1 - pattern.whiten) * 100)}%, white)` : c);
  // Rain: streaks run down each bar, each bar at its own moment.
  const stepT = ((pattern.stepMs ?? 90) / 1000) / en.speed;
  const rainDur = Math.max(0.6, stepT * cells * 2.2);
  const patternOn = new Set(patternTargets(section, rig));

  // ---- stage geometry (audience view, gentle perspective)
  const BACK = 168; // where the back wall meets the floor
  const HANG_Y = 22; // where lights hung from the truss are clamped
  const LIP = 236; // front edge of the stage
  const depthOf = (y: number) => Math.max(0, Math.min(1, (y - 0.14) / 0.76));
  const floorY = (d: number) => BACK + d * (LIP - BACK);
  const xAt = (px: number, d: number) => {
    const left = 50 * (1 - d);
    return left + (0.07 + 0.86 * px) * (W - 2 * left);
  };
  const scaleAt = (d: number) => 0.85 + 0.3 * d;
  const ids = useId().replace(/[^a-zA-Z0-9]/g, "");
  const u = (name: string) => `pv${ids}-${name}`;
  const url = (name: string) => `url(#${u(name)})`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={compact ? "preview compact" : "preview"} role="img" aria-label={`Preview of ${section.name}`}>
      <defs>
        <linearGradient id={u("wall")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e0c11" />
          <stop offset="1" stopColor="#1a171e" />
        </linearGradient>
        <linearGradient id={u("floor")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1920" />
          <stop offset="1" stopColor="#25212a" />
        </linearGradient>
        <radialGradient id={u("haze")} cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor={p0} stopOpacity={0.16 * level} />
          <stop offset="1" stopColor={p0} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u("fade")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={u("beam")} maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill={url("fade")} />
        </mask>
        {/* For lights hung from the truss: bright at the top, fading towards the floor. */}
        <linearGradient id={u("fadeDown")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
        </linearGradient>
        <mask id={u("beamDown")} maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill={url("fadeDown")} />
        </mask>
        <filter id={u("soft")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={u("glow")} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      {/* The room: back wall, truss, floor and the front of the stage */}
      <rect width={W} height={BACK} fill={url("wall")} />
      <rect width={W} height={H} fill={url("haze")}>
        {animate && rotating && <animate attributeName="opacity" values="1;0.75;1" dur={`${period}s`} repeatCount="indefinite" />}
      </rect>
      <g stroke="#2b2731" strokeWidth="1" fill="none">
        <line x1="0" y1="10" x2={W} y2="10" />
        <line x1="0" y1="20" x2={W} y2="20" />
        <path d={Array.from({ length: 32 }, (_, k) => `M${k * 20} 10 L${k * 20 + 10} 20 L${k * 20 + 20} 10`).join(" ")} strokeWidth="0.7" />
      </g>
      <rect y={BACK} width={W} height={LIP - BACK} fill={url("floor")} />
      <g stroke="#fff" strokeOpacity="0.035" strokeWidth="1">
        {Array.from({ length: 9 }, (_, k) => (
          <line key={k} x1={50 + (k * (W - 100)) / 8} y1={BACK} x2={(k * W) / 8} y2={LIP} />
        ))}
      </g>
      <line x1="0" y1={BACK} x2={W} y2={BACK} stroke="#2e2a33" strokeWidth="1" />
      <rect y={LIP} width={W} height={H - LIP} fill="#0b0a0d" />
      <line x1="0" y1={LIP + 0.5} x2={W} y2={LIP + 0.5} stroke="#3a3540" strokeWidth="1" />
      {/* Seen from the audience, so stage right is on the left. */}
      <text x="10" y={LIP + 10.5} fontSize="8.5" fill="#6f6875" letterSpacing="0.04em">
        STAGE RIGHT
      </text>
      <text x={W - 10} y={LIP + 10.5} fontSize="8.5" fill="#6f6875" letterSpacing="0.04em" textAnchor="end">
        STAGE LEFT
      </text>

      {/* Side and floor lights: soft washes up onto the wall */}
      {sides.map((f, i) => {
        const d = depthOf(f.pos!.y);
        const fx = xAt(f.pos!.x, d);
        const fy = floorY(d);
        const sc = scaleAt(d);
        const focused = focusSet.has(f.fixtureId);
        const o = ownOf(f.fixtureId);
        // The same rules as the export: the spotlight goes warm white at full,
        // everything else runs at half its level, and only "Off" wins over Focus.
        const color = focused ? WARM : (o.color ?? colorFor("side", stageIndex(sides, i), 0));
        const steady = focused || !!o.color;
        const dir = fx < W / 2 ? 1 : -1;
        const tx = fx + dir * Math.min(110, Math.abs(W / 2 - fx) * 0.5 + 30);
        const c = fill(color, 0);
        const paint = o.off ? DARK_LENS : steady ? color : c.fill;
        const anim = steady || o.off ? null : c.anim;
        const sideLevel = o.off ? 0 : focused ? 1 : (o.level ?? lv.side.level) * (focusing ? FOCUS_DIM : 1);
        // Beat pulse, or the pattern when it runs on this light (rigs without a backdrop).
        const onPattern = !!pattern.algorithm && family !== "solid" && patternOn.has(f.fixtureId);
        const pulse =
          animate && section.effects.beatPulse ? (
            <animate attributeName="opacity" values="1;0.35;0.35" keyTimes="0;0.4;1" dur={`${beat}s`} repeatCount="indefinite" />
          ) : animate && onPattern ? (
            <animate attributeName="opacity" values="0.35;1;0.35" dur={`${cycle}s`} begin={`${-rnd(f.fixtureId * 7) * cycle}s`} repeatCount="indefinite" />
          ) : null;
        if (f.mount === "truss") {
          // Hung from the truss: a cone down onto the stage and a pool where it lands.
          const hy = HANG_Y;
          return (
            <g key={f.fixtureId}>
              <g opacity={o.off ? 0 : 0.2 + 0.8 * sideLevel}>
                {pulse}
                <path d={`M${fx - 4} ${hy + 8} L${fx - 36 * sc} ${fy} L${fx + 36 * sc} ${fy} L${fx + 4} ${hy + 8} Z`} fill={paint} opacity="0.32" mask={url("beamDown")} filter={url("soft")}>
                  {anim}
                </path>
                <ellipse cx={fx} cy={fy + 2} rx={42 * sc} ry={8 * sc} fill={paint} opacity="0.6" filter={url("soft")}>
                  {anim}
                </ellipse>
              </g>
              <g transform={`translate(${fx} ${hy})`}>
                <path d="M0 -3 V0" stroke="#3d3844" strokeWidth="2" />
                <path d="M-5.5 0 L5.5 0 L7 7 L-7 7 Z" fill="#26222b" stroke="#3d3844" strokeWidth="0.6" />
                <ellipse cx="0" cy="7" rx="5.5" ry="1.8" fill={paint}>
                  {anim}
                </ellipse>
              </g>
              {twinkles(f.fixtureId) && animate && (
                <circle cx={fx} cy={hy + 7} r="6" fill="#fff" opacity="0">
                  <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.1;1" dur={`${0.7 + rnd(f.fixtureId) * 0.9}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        }
        return (
          <g key={f.fixtureId}>
            <g opacity={o.off ? 0 : 0.2 + 0.8 * sideLevel}>
              {pulse}
              <ellipse cx={tx} cy={BACK - 60} rx="80" ry="55" fill={paint} opacity="0.35" filter={url("glow")}>
                {anim}
              </ellipse>
              <path d={`M${fx - 4 * sc} ${fy - 6 * sc} L${tx - 85} 30 L${tx + 85} 30 L${fx + 4 * sc} ${fy - 6 * sc} Z`} fill={paint} opacity="0.42" mask={url("beam")} filter={url("soft")}>
                {anim}
              </path>
              <ellipse cx={fx} cy={fy + 1} rx={28 * sc} ry={6 * sc} fill={paint} opacity="0.45" filter={url("soft")}>
                {anim}
              </ellipse>
            </g>
            <g transform={`translate(${fx} ${fy}) scale(${sc})`}>
              <path d="M-7 0 L-5.5 -7 L5.5 -7 L7 0 Z" fill="#26222b" stroke="#3d3844" strokeWidth="0.6" />
              <ellipse cx="0" cy="-7" rx="5.5" ry="1.8" fill={paint}>
                {anim}
              </ellipse>
            </g>
            {twinkles(f.fixtureId) && animate && (
              <circle cx={fx} cy={fy - 7 * sc} r="6" fill="#fff" opacity="0">
                <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.1;1" dur={`${0.7 + rnd(f.fixtureId) * 0.9}s`} repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}

      {/* Front lights: a broad wash over the front of the stage */}
      {fronts.map((f, i) => {
        const fx = xAt(f.pos!.x, 1);
        const focused = focusSet.has(f.fixtureId);
        const o = ownOf(f.fixtureId);
        const color = focused ? WARM : (o.color ?? colorFor("front", stageIndex(fronts, i), 0));
        const frontLevel = o.off ? 0 : focused ? 1 : (o.level ?? lv.front.level) * (focusing ? FOCUS_DIM : 1);
        return (
          <g key={f.fixtureId}>
            {!o.off && <ellipse cx={fx} cy={LIP - 14} rx="110" ry="18" fill={color} opacity={0.06 + 0.3 * frontLevel} filter={url("glow")} />}
            <rect x={fx - 7} y={LIP + 3} width="14" height="7" rx="2" fill="#26222b" stroke="#3d3844" strokeWidth="0.6" />
            <rect x={fx - 4.5} y={LIP + 3} width="9" height="1.6" rx="0.8" fill={o.off ? DARK_LENS : color} />
          </g>
        );
      })}

      {/* Backdrop bars, with the glow they throw on the wall and floor */}
      <g>
        {bars.map((bar, i) => {
          const x = xAt(bar.x, 0) - barW / 2;
          const k = backFx.length ? stageIndex(backFx, i) : i;
          const runsPattern = !!pattern.algorithm && patternOn.has(bar.id);
          const o = ownOf(bar.id);
          const solidColor = layout.backdrop === "mix" ? (pattern.id === "solid" ? pal[k % pal.length]! : under[k % under.length]!) : colorFor("backdrop", k, 0);
          const base = o.color ? { fill: o.color, anim: null } : fill(solidColor, 0);
          const backLevel = o.off ? 0 : (o.level ?? lv.backdrop.level);
          const floorLevel = o.off ? 0.04 : runsPattern ? Math.max(0.12, pattern.floor) * vis(backLevel) : vis(backLevel);
          return (
            <g key={i}>
              <ellipse cx={x + barW / 2} cy={topY + (cells * cellH) / 2} rx="34" ry="62" fill={base.fill} opacity={0.32 * floorLevel} filter={url("glow")}>
                {base.anim}
              </ellipse>
              <ellipse cx={x + barW / 2} cy={BACK + 4} rx="20" ry="4" fill={base.fill} opacity={0.4 * floorLevel} filter={url("soft")}>
                {base.anim}
              </ellipse>
              <rect x={x - 1.5} y={topY - 1.5} width={barW + 3} height={cells * cellH + 3} rx="2" fill="#141217" stroke="#34303a" strokeWidth="0.6" />
              <rect x={x + barW / 2 - 4} y={topY + cells * cellH + 1.5} width="8" height={BACK - topY - cells * cellH - 1.5} fill="#141217" />
              {Array.from({ length: cells }, (_, c) => {
                const y = topY + c * cellH;
                const over = family === "rain" ? { fill: whiten(pattern.floor > 0 ? accent : main), anim: null } : fill(pattern.colors === 2 && c % 2 ? main : accent, 1);
                let begin = 0;
                const phase = rnd(i * 17 + 3) * rainDur;
                if (family === "wave") begin = (Math.abs(c - (cells - 1) / 2) / cells) * cycle;
                else if (family === "vertical") begin = (c / cells) * cycle;
                else if (family === "random") begin = rnd(i * 31 + c * 7) * cycle;
                else if (family === "rain") begin = (((phase - c * stepT) % rainDur) + rainDur) % rainDur;
                const peak = vis(backLevel);
                const showOver = family !== "solid" && runsPattern;
                return (
                  <g key={c}>
                    <rect x={x} y={y + 0.6} width={barW} height={cellH - 1.2} rx="1" fill={base.fill} opacity={floorLevel}>
                      {base.anim}
                    </rect>
                    {showOver && (
                      <rect x={x} y={y + 0.6} width={barW} height={cellH - 1.2} rx="1" fill={pattern.id === "rainbow" ? `hsl(${(c * 40 + i * 25) % 360} 90% 55%)` : over.fill} opacity={animate ? 0 : 0.6 * vis(backLevel)}>
                        {pattern.id !== "rainbow" && over.anim}
                        {animate && (
                          <animate
                            attributeName="opacity"
                            values={family === "strobe" ? `0;${peak};0;0` : family === "rain" ? `${peak};${peak * 0.35};0;0` : `0;${peak};0`}
                            keyTimes={family === "strobe" ? "0;0.05;0.15;1" : family === "rain" ? "0;0.12;0.3;1" : "0;0.35;1"}
                            dur={`${family === "strobe" ? beat / en.speed : family === "rain" ? rainDur : cycle}s`}
                            begin={`${-begin}s`}
                            repeatCount="indefinite"
                          />
                        )}
                      </rect>
                    )}
                    {twinkles(bar.id) && animate && (
                      <rect x={x} y={y + 0.6} width={barW} height={cellH - 1.2} rx="1" fill="#fff" opacity="0">
                        <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.1;1" dur={`${0.9 + rnd(i * 13 + c) * 1.6}s`} begin={`${-rnd(i * 5 + c * 11) * 2}s`} repeatCount="indefinite" />
                      </rect>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* Moving heads: crisp beams that follow the chosen movement */}
      {movers.map((f, i) => {
        const d = depthOf(f.pos!.y);
        const fx = xAt(f.pos!.x, d);
        const fy = floorY(d);
        const sc = scaleAt(d);
        const hy = fy - 12 * sc;
        const moverFocused = focusSet.has(f.fixtureId);
        const o = ownOf(f.fixtureId);
        const c = moverFocused ? { fill: WARM, anim: null } : o.color ? { fill: o.color, anim: null } : fill(colorFor("mover", stageIndex(movers, i), 1), 0);
        const moverLevel = o.off ? 0 : moverFocused ? 1 : (o.level ?? lv.mover.level) * (focusing ? FOCUS_DIM : 1);
        const dur = movement.bars ? (movement.bars * beat * section.beatsPerBar) / en.speed : 0;
        const mirror = f.reverse ? -1 : 1;
        const swing = movement.id === "sweep" ? 32 : movement.id === "ballyhoo" ? 40 : movement.id === "static" ? 0 : 24;
        const values =
          movement.id === "figure8" || movement.id === "ballyhoo"
            ? `${-swing * mirror};${swing * mirror};${-swing * mirror * 0.4};${swing * mirror * 0.4};${-swing * mirror}`
            : `${-swing * mirror};${swing * mirror};${-swing * mirror}`;
        // Match the export: "Together" moves every head as one; the other spreads
        // stagger the heads across the shape, stage left first.
        const phase = section.moverSpread === "together" ? 0 : -(stageIndex(movers, i) * dur) / Math.max(2, movers.length);
        const lean = movement.id === "static" ? (fx < W / 2 ? 16 : -16) : 0;
        const rotateAnim = (cx: number, cy: number) =>
          animate && dur > 0 && <animateTransform attributeName="transform" type="rotate" values={values.split(";").map((v) => `${v} ${cx} ${cy}`).join(";")} dur={`${dur}s`} begin={`${phase}s`} repeatCount="indefinite" additive="sum" />;
        if (f.mount === "truss") {
          // Hung upside down: the beam points down at the stage and sweeps across it.
          const top = HANG_Y;
          const hh = top + 14 * sc;
          const len = fy - hh + 6;
          return (
            <g key={f.fixtureId}>
              <g transform={`rotate(${-lean} ${fx} ${hh})`}>
                <path d={`M${fx - 2.5} ${hh} L${fx - 15} ${hh + len} L${fx + 15} ${hh + len} L${fx + 2.5} ${hh} Z`} fill={c.fill} opacity={o.off ? 0 : 0.2 + 0.75 * moverLevel} mask={url("beamDown")}>
                  {c.anim}
                </path>
                <ellipse cx={fx} cy={hh + len} rx={18 * sc} ry={5 * sc} fill={c.fill} opacity={o.off ? 0 : 0.5 * vis(moverLevel)} filter={url("soft")}>
                  {c.anim}
                </ellipse>
                {rotateAnim(fx, hh)}
              </g>
              <g transform={`translate(${fx} ${top}) scale(${sc})`}>
                <rect x="-9" y="0" width="18" height="4" rx="1" fill="#26222b" stroke="#3d3844" strokeWidth="0.6" />
                <path d="M-7 4 L-7 14 M7 4 L7 14" stroke="#3d3844" strokeWidth="2" strokeLinecap="round" />
                <circle cx="0" cy="14" r="5.5" fill="#2c2832" stroke="#3d3844" strokeWidth="0.6" />
                <circle cx="0" cy="14" r="2.8" fill={o.off ? DARK_LENS : c.fill}>
                  {c.anim}
                </circle>
              </g>
            </g>
          );
        }
        return (
          <g key={f.fixtureId}>
            <ellipse cx={fx} cy={fy + 1} rx={18 * sc} ry={4 * sc} fill={c.fill} opacity={o.off ? 0 : 0.35 * vis(moverLevel)} filter={url("soft")}>
              {c.anim}
            </ellipse>
            <g transform={`rotate(${lean} ${fx} ${hy})`}>
              <path d={`M${fx - 2.5} ${hy} L${fx - 16} ${hy - 230} L${fx + 16} ${hy - 230} L${fx + 2.5} ${hy} Z`} fill={c.fill} opacity={o.off ? 0 : 0.2 + 0.75 * moverLevel} mask={url("beam")}>
                {c.anim}
              </path>
              {rotateAnim(fx, hy)}
            </g>
            <g transform={`translate(${fx} ${fy}) scale(${sc})`}>
              <rect x="-9" y="-4" width="18" height="4" rx="1" fill="#26222b" stroke="#3d3844" strokeWidth="0.6" />
              <path d="M-7 -4 L-7 -14 M7 -4 L7 -14" stroke="#3d3844" strokeWidth="2" strokeLinecap="round" />
              <circle cx="0" cy="-12" r="5.5" fill="#2c2832" stroke="#3d3844" strokeWidth="0.6" />
              <circle cx="0" cy="-12" r="2.8" fill={o.off ? DARK_LENS : c.fill}>
                {c.anim}
              </circle>
            </g>
          </g>
        );
      })}

      {/* Lightning / blinder: a white flash */}
      {animate && (section.effects.lightning || section.effects.blinder) && (
        <rect width={W} height={H} fill="#fff" opacity="0" pointerEvents="none">
          <animate attributeName="opacity" values="0;0;0.75;0;0.45;0;0" keyTimes="0;0.7;0.72;0.75;0.78;0.81;1" dur={section.effects.lightning ? "4.5s" : "3s"} repeatCount="indefinite" />
        </rect>
      )}
      {animate && section.effects.strobe && (
        <rect width={W} height={BACK} fill="#fff" opacity="0" pointerEvents="none">
          <animate attributeName="opacity" values="0;0.35;0;0" keyTimes="0;0.05;0.12;1" dur={`${beat / 2}s`} repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  );
}
