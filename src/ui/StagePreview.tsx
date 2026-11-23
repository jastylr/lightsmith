import { useEffect, useId, useMemo, useRef, type ReactElement } from "react";
import { COLOR_CHANGES, aimOf, moverTiming, moverShapeAt, COLOR_JOBS, colorRateOf, jobColorAt, jobPalette, ratePeriodMs, stepsFor, switchesColors, colorById, mountOf, toMs, type Sequence, type SequenceStep, stepLightColor, FOCUS_DIM, colorLayoutOf, lightLevels, lightSetting, effectTargets, energyOf, focusLights, moodById, MOVEMENTS, patternById, patternTargets, type ColorJob, type Rig, type Section } from "../core";

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

export function StagePreview({
  section,
  rig,
  compact = false,
  sequences = [],
  skipDelay = false,
  startAt = 0,
}: {
  section: Section;
  rig: Rig;
  compact?: boolean;
  sequences?: Sequence[];
  skipDelay?: boolean;
  /** Seconds into the section to start the animations at (when the song plays from the middle of it). */
  startAt?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (startAt > 0) svgRef.current?.setCurrentTime?.(startAt);
    // Only on mount: replaying remounts the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const view = useMemo(() => {
    const mood = moodById(section.mood);
    const en = energyOf(section.energy);
    const ids = section.colors.length ? section.colors : mood.colors;
    const pal = ids.map(css);
    const pattern = patternById(section.pattern === "mood" ? mood.pattern : section.pattern);
    const changeId = section.colorChange === "mood" ? mood.colorChange : section.colorChange;
    const change = COLOR_CHANGES.find((c) => c.id === changeId)!;
    const beat = 60 / section.bpm;
    const period = change.beats === 0 ? 0 : change.beats > 0 ? change.beats * beat : -change.beats * beat * section.beatsPerBar;
    const moveId = section.movement === "mood" ? mood.movement : section.movement;
    const movement = MOVEMENTS.find((m) => m.id === moveId) ?? MOVEMENTS[0]!;
    const level = Math.max(0.2, Math.min(1, mood.intensity * en.level));
    return { mood, en, pal, ids, pattern, period, beat, movement, level };
  }, [section]);

  const { pal, pattern, period, beat, movement, level, en } = view;
  const beam = section.beam ?? {};
  // Each kind of light's brightness (the section's own, or automatic); vis()
  // keeps dim lights visible on screen while still showing the difference.
  const lv = lightLevels(section);
  const vis = (l: number) => 0.3 + 0.7 * l;
  const p0 = pal[0]!;
  // Color steps, as in the export: only the kinds of light that switch move on.
  // Each kind of light switches at its own rate (or the section's), as in the export.
  const rateOf = (job: ColorJob) => ratePeriodMs(colorRateOf(section, job), section.bpm, section.beatsPerBar) / 1000;
  const rotating = COLOR_JOBS.some((j) => rateOf(j) > 0 && stepsFor(section, view.ids, [j]) > 1);
  const animate = !reduceMotion;

  // Fixtures from the rig, placed by their stage-plan position (audience view).
  const byRole = (role: string) => rig.fixtures.filter((f) => f.role === role && f.pos).sort((a, b) => a.pos!.x - b.pos!.x);
  const backFx = byRole("backdrop");
  // Only the backdrop lights the rig really has: a rig without any shows a bare wall.
  const bars = backFx.map((f) => ({ x: f.pos!.x, id: f.fixtureId, upright: f.upright !== false, hung: mountOf(f) === "truss" }));
  const sides = byRole("side");
  const movers = byRole("mover");

  // Chasers: for each light, one layer per color it takes, lit only on its own
  // steps (so a white flash after a blue step really is white). Moving heads
  // also get the layers in their beams, so the beam changes color with the head.
  const chaserLights: { id: number; layers: { key: string; color: string; anim: ReactElement }[] }[] = [];
  for (const [k, use] of (section.sequences ?? []).entries()) {
    const q = sequences.find((x) => x.id === use.id);
    if (!q || !q.steps.length) continue;
    const order = q.order === "bounce" && q.steps.length > 2 ? [...q.steps, ...q.steps.slice(1, -1).reverse()] : q.steps;
    const sec = (v: number) => toMs(v, q.units, section.bpm) / 1000;
    const total = order.reduce((t, st) => t + sec(st.fadeIn) + sec(st.hold), 0);
    if (total <= 0) continue;
    const begin = skipDelay ? 0 : use.delay;
    for (const id of [...new Set(order.flatMap((st) => st.lights))]) {
      const fillOf = (st: SequenceStep) => {
        const c = stepLightColor(st, id);
        return c === "white" ? "#ffffff" : css(c);
      };
      const colors = [...new Set(order.filter((st) => st.lights.includes(id)).map(fillOf))];
      const layers = colors.map((color) => {
        // Opacity over one pass: up over the fade in, held, then off as the step ends.
        const pts: [number, number][] = [[0, 0]];
        let t = 0;
        for (const st of order) {
          const fi = sec(st.fadeIn);
          const h = sec(st.hold);
          if (st.lights.includes(id) && fillOf(st) === color) {
            const lv = st.level ?? 1;
            const push = (time: number, v: number) => {
              const last = pts[pts.length - 1]!;
              pts.push([Math.max(time, last[0] + 0.0005), v]);
            };
            push(t, 0);
            push(t + fi, lv);
            push(t + fi + h - 0.001, lv);
            push(t + fi + h + Math.min(0.15, sec(st.fadeOut)), 0);
          }
          t += fi + h;
        }
        const end = Math.max(total, pts[pts.length - 1]![0]);
        if (pts[pts.length - 1]![0] < end) pts.push([end, 0]);
        const keyTimes = pts.map(([x]) => (x / end).toFixed(5)).join(";");
        const values = pts.map(([, v]) => v.toFixed(3)).join(";");
        const anim = <animate attributeName="opacity" values={values} keyTimes={keyTimes} dur={`${end}s`} begin={`${begin}s`} repeatCount={q.order === "once" ? 1 : "indefinite"} fill="freeze" />;
        return { key: `${use.id}-${k}-${id}-${color}`, color, anim };
      });
      chaserLights.push({ id, layers });
    }
  }
  const chaserOf = (id: number) => (animate ? chaserLights.filter((c) => c.id === id).flatMap((c) => c.layers) : []);
  const fronts = byRole("front");
  // Colors are handed out stage left first, the same way the export does it.
  const stageIndex = (list: { pos?: { x: number } }[], i: number) =>
    [...list.keys()].sort((a, b) => (list[b]!.pos?.x ?? 0) - (list[a]!.pos?.x ?? 0)).indexOf(i);
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

  /** A fill that steps through a kind of light's colors at its rate. */
  const series = (job: ColorJob, at: (k: number) => string) => {
    const every = rateOf(job);
    const n = every > 0 ? stepsFor(section, view.ids, [job]) : 0;
    const values = n > 1 ? Array.from({ length: n }, (_, k) => at(k)) : [at(0)];
    const changes = animate && values.some((v) => v !== values[0]);
    return {
      fill: values[0]!,
      anim: changes ? <animate attributeName="fill" values={[...values, values[0]].join(";")} dur={`${every * values.length}s`} calcMode={section.colorFade ? "linear" : "discrete"} repeatCount="indefinite" /> : null,
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
  /** Same rules as the export: each kind of light spreads its own colors, moved on at each color step. */
  const colorAt = (job: ColorJob, k: number, step: number, offset: number) => (jobPalette(layout[job], view.ids) === "white" ? WARM : css(jobColorAt(section, layout, view.ids, job, k, step, offset)));
  const colorFor = (job: ColorJob, k: number, offset: number) => colorAt(job, k, 0, offset);
  const fillJob = (job: ColorJob, k: number, offset: number) => series(job, (step) => colorAt(job, k, step, offset));
  // The backdrop's colors: the pattern runs in the second over the others, or
  // in the one color when there's only one (as in the export).
  const bset = (() => {
    const set = jobPalette(layout.backdrop, view.ids);
    return set === "white" ? [WARM] : set.map(css);
  })();
  const bpal = (step: number) => {
    const r = switchesColors(section, "backdrop") ? step : 0;
    return bset.map((_, i) => bset[(i + r) % bset.length]!);
  };
  const bMain = (step: number) => bpal(step)[0]!;
  const bAccent = (step: number) => bpal(step)[1] ?? bpal(step)[0]!;
  const bUnder = (step: number) => {
    const p = bpal(step);
    return p.length > 2 ? p.filter((_, j) => j !== 1) : [p[0]!];
  };
  const barColor = (i: number, step: number) => (pattern.id === "solid" ? bpal(step)[i % bset.length]! : bUnder(step)[i % bUnder(step).length]!);
  const main = bMain(0);
  const accent = bAccent(0);
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
  const depthOf = (y: number) => Math.max(0, Math.min(1, y));
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
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={compact ? "preview compact" : "preview"} role="img" aria-label={`Preview of ${section.name}`}>
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
        {animate && rotating && <animate attributeName="opacity" values="1;0.75;1" dur={`${period || 2}s`} repeatCount="indefinite" />}
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
        const c = fillJob("side", stageIndex(sides, i), 0);
        const paint = o.off ? DARK_LENS : steady ? color : c.fill;
        const anim = steady || o.off ? null : c.anim;
        const sideLevel = o.off ? 0 : focused ? 1 : (o.level ?? lv.side.level) * (focusing ? FOCUS_DIM : 1);
        // Beat pulse, or the pattern when it runs on this light (rigs without a backdrop).
        const onPattern = !!pattern.algorithm && family !== "solid" && patternOn.has(f.fixtureId);
        // A side-to-side swap (from the mood): each side bright in turn, the other at about a third.
        const swapSec = view.mood.side === "swapBeat" ? beat : view.mood.side === "swapBar" ? beat * section.beatsPerBar : 0;
        const swapping = animate && swapSec > 0 && !focusing && !focused && f.side !== "C" && !o.off;
        const swap = swapping ? (
          <animate attributeName="opacity" values={f.side === "SL" ? "1;0.35" : "0.35;1"} keyTimes="0;0.5" calcMode="discrete" dur={`${2 * swapSec}s`} repeatCount="indefinite" />
        ) : null;
        const pulse =
          animate && section.effects.beatPulse ? (
            <animate attributeName="opacity" values="1;0.35;0.35" keyTimes="0;0.4;1" dur={`${beat}s`} repeatCount="indefinite" />
          ) : animate && onPattern ? (
            <animate attributeName="opacity" values="0.35;1;0.35" dur={`${cycle}s`} begin={`${-rnd(f.fixtureId * 7) * cycle}s`} repeatCount="indefinite" />
          ) : null;
        if (mountOf(f) === "truss") {
          // Hung from the truss: a cone down onto the stage and a pool where it lands.
          const hy = HANG_Y;
          return (
            <g key={f.fixtureId}>
              {swap}
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
            {swap}
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
          const base = o.color ? { fill: o.color, anim: null } : series("backdrop", (step) => barColor(k, step));
          const backLevel = o.off ? 0 : (o.level ?? lv.backdrop.level);
          const floorLevel = o.off ? 0.04 : runsPattern ? Math.max(0.12, pattern.floor) * vis(backLevel) : vis(backLevel);
          // A bar lying flat is drawn turned on its side: along the truss when
          // it's hung, along the foot of the wall when it's on the floor.
          const midY = topY + (cells * cellH) / 2;
          const flat = bar.upright ? undefined : `translate(0 ${(bar.hung ? HANG_Y + 12 : BACK - 10) - midY}) rotate(90 ${x + barW / 2} ${midY})`;
          return (
            <g key={i} transform={flat}>
              <ellipse cx={x + barW / 2} cy={topY + (cells * cellH) / 2} rx="34" ry="62" fill={base.fill} opacity={0.32 * floorLevel} filter={url("glow")}>
                {base.anim}
              </ellipse>
              <ellipse cx={x + barW / 2} cy={BACK + 4} rx="20" ry="4" fill={base.fill} opacity={0.4 * floorLevel} filter={url("soft")}>
                {base.anim}
              </ellipse>
              <rect x={x - 1.5} y={topY - 1.5} width={barW + 3} height={cells * cellH + 3} rx="2" fill="#141217" stroke="#34303a" strokeWidth="0.6" />
              {bar.upright && <rect x={x + barW / 2 - 4} y={topY + cells * cellH + 1.5} width="8" height={BACK - topY - cells * cellH - 1.5} fill="#141217" />}
              {Array.from({ length: cells }, (_, c) => {
                const y = topY + c * cellH;
                const over = family === "rain" ? { fill: whiten(pattern.floor > 0 ? accent : main), anim: null } : series("backdrop", (step) => (pattern.colors === 2 && c % 2 ? bMain(step) : bAccent(step)));
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
        const c = moverFocused ? { fill: WARM, anim: null } : o.color ? { fill: o.color, anim: null } : fillJob("mover", stageIndex(movers, i), 1);
        const moverLevel = o.off ? 0 : moverFocused ? 1 : (o.level ?? lv.mover.level) * (focusing ? FOCUS_DIM : 1);
        // The same cycle as the export: slowed down when the heads couldn't keep up.
        const dur = movement.bars ? moverTiming(section, movement, rig).beats * beat : 0;
        // A head turned to face the back mirrors one facing the audience for the
        // same pan and tilt, so its sweep (and its lean) runs the other way.
        const mirror = (f.reverse ? -1 : 1) * (f.facesBack ? -1 : 1);
        // The shape's size scales the swing, as width does in the export.
        const shaped = moverShapeAt(section.moverShape, movement, aimOf(section, rig, f));
        const sizeScale = movement.width ? Math.min(2.4, shaped.width / movement.width) : 1;
        // A head pointing straight up (tilt near 128) only turns its beam round
        // its own axis when it pans, so the movement shrinks to a small wobble,
        // as it does on the real rig. The further it tilts, the wider it reads.
        const tiltAway = Math.min(1, Math.max(0.12, Math.abs(shaped.y - 128) / 64));
        const swing = (movement.id === "sweep" ? 32 : movement.id === "ballyhoo" ? 40 : movement.id === "static" ? 0 : 24) * sizeScale * tiltAway;
        const values =
          movement.id === "figure8" || movement.id === "ballyhoo"
            ? `${-swing * mirror};${swing * mirror};${-swing * mirror * 0.4};${swing * mirror * 0.4};${-swing * mirror}`
            : `${-swing * mirror};${swing * mirror};${-swing * mirror}`;
        // Match the export: "Together" moves every head as one; the other spreads
        // stagger the heads across the shape, stage left first.
        const fan = section.moverSpread === "offset" && section.moverShape?.fan ? section.moverShape.fan : 0;
        const phase = section.moverSpread === "together" ? 0 : fan ? -((stageIndex(movers, i) * fan) % 360) / 360 * dur : -(stageIndex(movers, i) * dur) / Math.max(2, movers.length);
        // Where the head points at rest (its section position or home). Only a
        // sketch: pan swings the beam left or right, and tilt away from the
        // middle shortens it, as if leaning towards or away from the audience.
        // Pan below the middle swings a head that faces the audience towards
        // stage left (checked against a real pair: pan 42, tilt 70 on both, one
        // turned to face the back, makes an X). A head facing the back mirrors it.
        const home = movement.id === "static" ? aimOf(section, rig, f) : { pan: shaped.x, tilt: shaped.y };
        const lean = Math.max(-70, Math.min(70, ((128 - home.pan) / 128) * 70)) * (f.facesBack ? -1 : 1);
        const reach = 1 - 0.45 * Math.min(1, Math.abs(home.tilt - 128) / 128);
        const rotateAnim = (cx: number, cy: number) =>
          animate && dur > 0 && <animateTransform attributeName="transform" type="rotate" values={values.split(";").map((v) => `${v} ${cx} ${cy}`).join(";")} dur={`${dur}s`} begin={`${phase}s`} repeatCount="indefinite" additive="sum" />;
        // Zoom widens or narrows the beam; a strobe flickers it.
        const spread = beam.zoom === undefined ? 1 : 0.45 + 1.3 * beam.zoom;
        const flicker =
          animate && beam.strobe ? (
            <animate attributeName="opacity" values="1;0.04;0.04" keyTimes="0;0.3;1" dur={`${beam.strobe === "fast" ? 0.09 : beam.strobe === "medium" ? 0.22 : 0.5}s`} repeatCount="indefinite" />
          ) : null;
        if (mountOf(f) === "truss") {
          // Hung upside down: the beam points down at the stage and sweeps across it.
          const top = HANG_Y;
          const hh = top + 14 * sc;
          const len = fy - hh + 6;
          return (
            <g key={f.fixtureId}>
              <g transform={`rotate(${-lean} ${fx} ${hh})`}>
                {flicker}
                <path d={`M${fx - 2.5} ${hh} L${fx - 15 * spread} ${hh + len * reach} L${fx + 15 * spread} ${hh + len * reach} L${fx + 2.5} ${hh} Z`} fill={c.fill} opacity={o.off ? 0 : 0.2 + 0.75 * moverLevel} mask={url("beamDown")}>
                  {c.anim}
                </path>
                {chaserOf(f.fixtureId).map(({ key, color, anim }) => (
                  <g key={key} opacity="0">
                    {anim}
                    <path d={`M${fx - 2.5} ${hh} L${fx - 15 * spread} ${hh + len * reach} L${fx + 15 * spread} ${hh + len * reach} L${fx + 2.5} ${hh} Z`} fill={color} mask={url("beamDown")} />
                  </g>
                ))}
                <ellipse cx={fx} cy={hh + len * reach} rx={18 * sc * spread} ry={5 * sc} fill={c.fill} opacity={o.off ? 0 : 0.5 * vis(moverLevel)} filter={url("soft")}>
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
              {flicker}
              <path d={`M${fx - 2.5} ${hy} L${fx - 16 * spread} ${hy - 230 * reach} L${fx + 16 * spread} ${hy - 230 * reach} L${fx + 2.5} ${hy} Z`} fill={c.fill} opacity={o.off ? 0 : 0.2 + 0.75 * moverLevel} mask={url("beam")}>
                {c.anim}
              </path>
              {/* A chaser step colors the beam too, moving with the head. */}
              {chaserOf(f.fixtureId).map(({ key, color, anim }) => (
                <g key={key} opacity="0">
                  {anim}
                  <path d={`M${fx - 2.5} ${hy} L${fx - 16 * spread} ${hy - 230 * reach} L${fx + 16 * spread} ${hy - 230 * reach} L${fx + 2.5} ${hy} Z`} fill={color} mask={url("beam")} />
                </g>
              ))}
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

      {/* Chasers: each step lights its lights, on top of the look */}
      {animate &&
        chaserLights.map(({ id, layers }) => {
          const f = rig.fixtures.find((x) => x.fixtureId === id);
          if (!f?.pos || f.role === "ignore") return null;
          return layers.map(({ color, anim, key }) => {
            if (f.role === "backdrop") {
              const x = xAt(f.pos!.x, 0) - barW / 2;
              return (
                <g key={key} opacity="0" pointerEvents="none">
                  {anim}
                  <ellipse cx={x + barW / 2} cy={topY + (cells * cellH) / 2} rx="44" ry="80" fill={color} opacity="0.55" filter={url("glow")} />
                  <rect x={x - 0.5} y={topY} width={barW + 1} height={cells * cellH} rx="1.5" fill={color} />
                </g>
              );
            }
            const d = f.role === "front" ? 1 : depthOf(f.pos!.y);
            const cx = xAt(f.pos!.x, d);
            const cy = f.role === "front" ? LIP - 6 : mountOf(f) === "truss" ? HANG_Y + 10 : floorY(d) - 8;
            return (
              <g key={key} opacity="0" pointerEvents="none">
                {anim}
                <ellipse cx={cx} cy={cy} rx="46" ry="30" fill={color} opacity="0.5" filter={url("glow")} />
                <circle cx={cx} cy={cy} r="6" fill={color} />
              </g>
            );
          });
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
