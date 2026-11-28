import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_PAN_RANGE, DEFAULT_TILT_RANGE, DEFAULT_PAN_SECONDS, defaultHome, isDefaultHome, guessRole, isBar, mountOf, settleRig, type FixtureProfile, type Mount, type Rig, type RigFixture, type Role, type WsFixture } from "../core";
import { DurationInput, Field, NumberInput, Segmented, Toggle } from "./controls";
import { Icon, type IconName } from "./icons";
import { LightsList, ShowFileBar } from "./ShowFile";
import { PositionsCard } from "./PositionsCard";
import type { Store } from "./store";

/** What each job is called and does. Where a light is and what it does are separate. */
const ROLE_INFO: Record<Role, { label: string; icon: IconName; help: string; color: string }> = {
  backdrop: { label: "Backdrop", icon: "backdrop", help: "Bars or washes behind the band. They set the mood and run the patterns.", color: "#b792ff" },
  mover: { label: "Moving head", icon: "mover", help: "Pans and tilts, from the floor or a truss. Follows each section's movement.", color: "#f2a73b" },
  side: { label: "Wash light", icon: "par", help: "Colors the band and the stage, from the floor, stands or a truss. Used for focus and side-to-side swaps.", color: "#4cc7c0" },
  front: { label: "Front light", icon: "front", help: "Lights the band from the audience side so faces are visible.", color: "#f1ece4" },
  ignore: { label: "Not used", icon: "hidden", help: "Lightsmith leaves this fixture alone.", color: "#7a7369" },
};
const JOBS: Role[] = ["backdrop", "mover", "side", "front"];

type View = "above" | "audience";
const VIEW_KEY = "lightsmith.stageView.v1";

// ---- drawing geometry (SVG units)
const VW = 1000;
const MX = 40; // left and right margin around the stage
const DW = VW - 2 * MX; // stage width on screen
const TOP = 34; // back wall, from above
const APRON = 0.25; // how far in front of the stage the plan reaches, as a share of the depth
const FLOOR_Y = 410; // the floor, from the audience
const CEIL_Y = 46; // the top of the stage, from the audience
const AUD_VH = 470;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** "Wash Zoom LED 36x18W RGBWA+UV [5]" → "Wash Zoom… [5]": short enough to sit under a light. */
function shortName(name: string): string {
  const m = name.match(/\s*\[(\d+)\]\s*$/);
  const base = m ? name.slice(0, m.index) : name;
  const room = m ? 11 : 16;
  const head = base.length > room ? base.slice(0, room - 1).trimEnd() + "…" : base;
  return m ? `${head} [${m[1]}]` : head;
}

export function StagePage({ store, onNext }: { store: Store; onNext: () => void }) {
  const rig = store.project.rig;
  const byId = new Map(store.fixtures.map((f) => [f.id, f]));
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setViewState] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "audience" ? "audience" : "above";
    } catch {
      return "above";
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not saved; fine */
    }
  };
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; fromTray: boolean; sx: number; sy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  // The stage's shape: from QLC+'s 3D view, or a typical club stage.
  const stage = rig.stage ?? { width: 6, depth: 4, height: 3, feet: false };
  const DH = clamp(DW * (stage.depth / stage.width), 240, 520);
  const ABOVE_VH = TOP + DH * (1 + APRON) + 34;
  const VH = view === "above" ? ABOVE_VH : AUD_VH;

  const canBe = (id: number, role: Role) => {
    const p = store.profiles.get(id);
    if (role === "ignore") return true;
    if (!p) return false;
    if (role === "mover") return p.isMover;
    return p.heads.length > 0;
  };

  const commit = (next: Rig) => store.setRig(settleRig(next));
  const update = (id: number, patch: Partial<RigFixture>) => commit({ ...rig, fixtures: rig.fixtures.map((f) => (f.fixtureId === id ? { ...f, ...patch, userSet: true } : f)) });
  /** The other moving heads of the same make and model as this one. */
  const modelOf = (f: RigFixture) => {
    const d = store.profiles.get(f.fixtureId)?.def;
    return d ? `${d.manufacturer}/${d.model}` : "";
  };
  const sameModel = (from: RigFixture) => rig.fixtures.filter((f) => f !== from && f.role === "mover" && modelOf(f) && modelOf(f) === modelOf(from));
  /**
   * Copy a head's setup to the others like it: ranges, which way pan turns and
   * its speed to all of them, and the front pan to those facing the same way
   * (a head turned round has its own).
   */
  const copyToLike = (from: RigFixture) => {
    const like = new Set(sameModel(from));
    commit({
      ...rig,
      fixtures: rig.fixtures.map((f) =>
        like.has(f)
          ? {
              ...f,
              panRange: from.panRange,
              tiltRange: from.tiltRange,
              panTurns: from.panTurns,
              panSeconds: from.panSeconds,
              ...(!!f.facesBack === !!from.facesBack && from.panFront !== undefined ? { panFront: from.panFront } : {}),
              userSet: true,
            }
          : f,
      ),
    });
  };

  /** Screen point → stage shares for the current view. */
  const toStage = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * VW;
    const sy = ((clientY - r.top) / r.height) * VH;
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    const x = clamp((sx - MX) / DW, 0, 1);
    const y = view === "above" ? clamp((sy - TOP) / DH, 0, 1 + APRON) : clamp((FLOOR_Y - sy) / (FLOOR_Y - CEIL_Y), 0, 1);
    return { x, y, inside };
  };
  /** Stage shares → screen point for a light. */
  const toScreen = (f: Pick<RigFixture, "pos" | "height">) =>
    view === "above"
      ? { x: MX + f.pos!.x * DW, y: TOP + f.pos!.y * DH }
      : { x: MX + f.pos!.x * DW, y: FLOOR_Y - (f.height ?? 0) * (FLOOR_Y - CEIL_Y) };

  /** Put a light where it was dropped. Only its place changes, never its job. */
  const place = (id: number, x: number, y: number, fromTray: boolean) => {
    const f = rig.fixtures.find((r) => r.fixtureId === id);
    if (!f) return;
    const patch: Partial<RigFixture> = { moved: true };
    if (view === "above") patch.pos = { x, y };
    else {
      patch.pos = { x, y: f.pos?.y ?? 0.5 };
      patch.height = y;
    }
    if (fromTray || f.role === "ignore") {
      const p = store.profiles.get(id);
      const role = p ? guessRole(p, patch.pos) : "ignore";
      patch.role = role;
      if (role === "mover") patch.home = f.home ?? defaultHome(f.facesBack);
    }
    update(id, patch);
    setSelected(id);
  };

  const startDrag = (e: ReactPointerEvent, id: number, fromTray: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toStage(e.clientX, e.clientY);
    setDrag({ id, x: p.x, y: p.y, fromTray, sx: e.clientX, sy: e.clientY });
    setSelected(id);
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toStage(e.clientX, e.clientY);
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toStage(e.clientX, e.clientY);
    const moved = drag.fromTray || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
    if (p.inside && moved) place(drag.id, p.x, p.y, drag.fromTray);
    else if (!p.inside && !drag.fromTray) update(drag.id, { role: "ignore" });
    setDrag(null);
  };
  const nudge = (f: RigFixture, dx: number, dy: number) => {
    if (!f.pos) return;
    if (view === "above") place(f.fixtureId, clamp(f.pos.x + dx, 0, 1), clamp(f.pos.y + dy, 0, 1 + APRON), false);
    else place(f.fixtureId, clamp(f.pos.x + dx, 0, 1), clamp((f.height ?? 0) - dy, 0, 1), false);
  };

  const onStage = rig.fixtures.filter((f) => f.role !== "ignore" && f.pos);
  const offStage = rig.fixtures.filter((f) => f.role === "ignore" || !f.pos);
  // From the audience, lights further back are drawn first so nearer ones sit on top.
  const drawOrder = view === "audience" ? [...onStage].sort((a, b) => a.pos!.y - b.pos!.y) : onStage;
  const sel = rig.fixtures.find((f) => f.fixtureId === selected);
  const selFixture = sel ? byId.get(sel.fixtureId) : undefined;
  const hungHeights = onStage.filter((f) => mountOf(f) === "truss").map((f) => f.height ?? 0.9);
  // The truss sits at the height of the highest hung light, with the lights hanging below it.
  const trussY = FLOOR_Y - Math.max(0.9, ...hungHeights) * (FLOOR_Y - CEIL_Y) - 12;
  const unit = stage.feet ? "ft" : "m";
  const per = stage.feet ? 3.28084 : 1;
  const gridStep = stage.feet ? 1 / 3.28084 * 5 : 1; // a line every metre, or every 5 ft

  return (
    <section className="page stage-page">
      <header className="page-head stage-head">
        <h1>Your stage</h1>
        <p className="lead">
          {rig.stage
            ? "Your lights are where you put them in QLC+'s 3D view. Pick a light to set its job, or drag it to move it. Moves here go back into QLC+ when you export."
            : "This show file has no 3D layout, so Lightsmith has spread your lights out. Drag them to where they really are, and pick a light to set its job."}
        </p>
      </header>
      <ShowFileBar store={store} />

      <div className="stage-layout">
        <div className="stage-col">
          <div className="plan-frame">
            <div className="plan-bar">
              <Segmented
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: "above", label: "From above" },
                  { value: "audience", label: "From the audience" },
                ]}
              />
              <ul className="job-legend" aria-label="Jobs">
                {JOBS.map((r) => (
                  <li key={r} style={{ "--job": ROLE_INFO[r].color } as CSSProperties}>
                    <i aria-hidden="true" />
                    {ROLE_INFO[r].label} <span>{onStage.filter((f) => f.role === r).length}</span>
                  </li>
                ))}
              </ul>
            </div>
            <svg
              ref={svg}
              viewBox={`0 0 ${VW} ${VH}`}
              className="plan"
              role="application"
              aria-label={view === "above" ? "The stage seen from above, audience at the bottom. Drag lights to move them." : "The stage seen from the audience. Drag lights to change how high they are."}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >
              <defs>
                <linearGradient id="plan-deck" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#24212a" />
                  <stop offset="1" stopColor="#2c2832" />
                </linearGradient>
                <linearGradient id="plan-wall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#121014" />
                  <stop offset="1" stopColor="#1d1a21" />
                </linearGradient>
              </defs>

              {view === "above" ? (
                <g aria-hidden="true">
                  <rect x={MX} y={TOP} width={DW} height={DH} rx="8" fill="url(#plan-deck)" stroke="#3b3640" />
                  {Array.from({ length: Math.floor(stage.width / gridStep) }, (_, k) => (k + 1) * gridStep)
                    .filter((m) => m < stage.width - 0.01)
                    .map((m) => (
                      <line key={`x${m}`} x1={MX + (m / stage.width) * DW} y1={TOP} x2={MX + (m / stage.width) * DW} y2={TOP + DH} className="plan-grid" />
                    ))}
                  {Array.from({ length: Math.floor(stage.depth / gridStep) }, (_, k) => (k + 1) * gridStep)
                    .filter((m) => m < stage.depth - 0.01)
                    .map((m) => (
                      <line key={`y${m}`} x1={MX} y1={TOP + (m / stage.depth) * DH} x2={MX + DW} y2={TOP + (m / stage.depth) * DH} className="plan-grid" />
                    ))}
                  <rect x={MX} y={TOP - 8} width={DW} height="8" rx="3" fill="#0e0d10" />
                  <text className="plan-note" x={VW / 2} y={TOP - 14}>
                    Back wall
                  </text>
                  <rect x={MX} y={TOP + DH} width={DW} height={DH * APRON} className="apron" />
                  <text className="plan-note" x={VW / 2} y={TOP + DH + (DH * APRON) / 2 + 5}>
                    In front of the stage
                  </text>
                  <text className="plan-side" x={MX + 10} y={TOP + DH + 22}>
                    Stage right
                  </text>
                  <text className="plan-side" x={MX + DW - 10} y={TOP + DH + 22} textAnchor="end">
                    Stage left
                  </text>
                  <text className="plan-audience" x={VW / 2} y={ABOVE_VH - 8}>
                    Audience
                  </text>
                  <text className="plan-scale" x={MX + DW} y={ABOVE_VH - 8} textAnchor="end">
                    {(stage.width * per).toFixed(1)} × {(stage.depth * per).toFixed(1)} {unit}
                    {rig.stage ? ", from QLC+" : ""}
                  </text>
                </g>
              ) : (
                <g aria-hidden="true">
                  <rect x={MX} y={CEIL_Y} width={DW} height={FLOOR_Y - CEIL_Y} fill="url(#plan-wall)" stroke="#2c2832" />
                  {hungHeights.length > 0 && (
                    <g className="truss">
                      <line x1={MX} y1={trussY} x2={MX + DW} y2={trussY} />
                      <line x1={MX} y1={trussY + 12} x2={MX + DW} y2={trussY + 12} />
                      <path d={Array.from({ length: Math.ceil(DW / 24) }, (_, k) => `M${MX + k * 24} ${trussY} L${MX + k * 24 + 12} ${trussY + 12} L${MX + k * 24 + 24} ${trussY}`).join(" ")} />
                    </g>
                  )}
                  <rect x={MX} y={FLOOR_Y} width={DW} height="22" fill="url(#plan-deck)" stroke="#3b3640" />
                  <text className="plan-note" x={MX - 6} y={CEIL_Y + 4} textAnchor="end">
                    {(stage.height * per).toFixed(0)} {unit}
                  </text>
                  <text className="plan-note" x={MX - 6} y={FLOOR_Y + 4} textAnchor="end">
                    0
                  </text>
                  <text className="plan-side" x={MX + 10} y={FLOOR_Y + 48}>
                    Stage right
                  </text>
                  <text className="plan-side" x={MX + DW - 10} y={FLOOR_Y + 48} textAnchor="end">
                    Stage left
                  </text>
                  <text className="plan-audience" x={VW / 2} y={FLOOR_Y + 48}>
                    Seen from the audience
                  </text>
                </g>
              )}

              {drawOrder.map((f) => {
                const dragging = drag && drag.id === f.fixtureId && !drag.fromTray;
                const live: RigFixture = dragging ? (view === "above" ? { ...f, pos: { x: drag.x, y: drag.y } } : { ...f, pos: { x: drag.x, y: f.pos!.y }, height: drag.y }) : f;
                const at = toScreen(live);
                const depthScale = view === "audience" ? 0.75 + 0.35 * clamp(f.pos!.y, 0, 1) : 1;
                return (
                  <FixtureGlyph
                    key={f.fixtureId}
                    rf={live}
                    profile={store.profiles.get(f.fixtureId)}
                    fixture={byId.get(f.fixtureId)}
                    view={view}
                    x={at.x}
                    y={at.y}
                    scale={depthScale}
                    trussY={trussY}
                    selected={selected === f.fixtureId}
                    dragging={!!dragging}
                    onPointerDown={(e) => startDrag(e, f.fixtureId, false)}
                    onKey={(dx, dy) => nudge(f, dx, dy)}
                    onSelect={() => setSelected(f.fixtureId)}
                  />
                );
              })}
              {drag?.fromTray && <circle cx={MX + drag.x * DW} cy={view === "above" ? TOP + drag.y * DH : FLOOR_Y - drag.y * (FLOOR_Y - CEIL_Y)} r="22" className="drop-ghost" />}
            </svg>
          </div>

          <div className="tray" aria-label="Lights not in use">
            <div className="tray-head">
              <h2>Not in use</h2>
              <span className="hint">Drag a light onto the stage to use it. Drag one off the stage to stop using it.</span>
            </div>
            {offStage.length === 0 ? (
              <p className="hint">Every light is in use.</p>
            ) : (
              <ul className="tray-list">
                {offStage.map((f) => {
                  const fx = byId.get(f.fixtureId);
                  const usable = store.profiles.has(f.fixtureId);
                  return (
                    <li key={f.fixtureId}>
                      <button
                        className={selected === f.fixtureId ? "tray-chip on" : "tray-chip"}
                        disabled={!usable}
                        onPointerDown={(e) => usable && startDrag(e, f.fixtureId, true)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onClick={() => setSelected(f.fixtureId)}
                        title={usable ? "Drag onto the stage" : "Add this fixture's definition first (Replace or add files, above)"}
                      >
                        <Icon name="grip" size={14} />
                        <span>{fx?.name ?? `Fixture ${f.fixtureId}`}</span>
                        {!usable && <small>needs definition</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <aside className="inspector" aria-label="Selected light">
          {sel && selFixture ? (
            <>
            <button type="button" className="link small inspector-back" onClick={() => setSelected(null)}>
              <Icon name="chevronLeft" size={14} /> All lights
            </button>
            <Inspector
              rf={sel}
              fixture={selFixture}
              profile={store.profiles.get(sel.fixtureId)}
              stage={rig.stage}
              canBe={(r) => canBe(sel.fixtureId, r)}
              onChange={(p) => update(sel.fixtureId, p)}
              likeThis={sameModel(sel).length}
              onCopyToLike={() => copyToLike(sel)}
            />
            {/* A moving head's saved positions (one place per section, shared by all the heads) sit with it. */}
            {sel.role === "mover" && <PositionsCard rig={rig} fixtures={byId} onChange={commit} />}
            </>
          ) : (
            <LightsList store={store} rig={rig} roleInfo={ROLE_INFO} selected={selected} onSelect={setSelected} />
          )}
        </aside>
      </div>

      <div className="page-actions">
        <button className="primary" onClick={onNext}>
          Continue to songs
        </button>
      </div>
    </section>
  );
}

function FixtureGlyph({
  rf,
  profile,
  fixture,
  view,
  x,
  y,
  scale,
  trussY,
  selected,
  dragging,
  onPointerDown,
  onKey,
  onSelect,
}: {
  rf: RigFixture;
  profile?: FixtureProfile;
  fixture?: WsFixture;
  view: View;
  x: number;
  y: number;
  scale: number;
  trussY: number;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onKey: (dx: number, dy: number) => void;
  onSelect: () => void;
}) {
  const name = fixture?.name ?? `Fixture ${rf.fixtureId}`;
  const hung = mountOf(rf) === "truss";
  const kind = profile?.isMover ? "mover" : isBar(profile) ? "bar" : rf.role === "front" ? "front" : "par";
  const upright = rf.upright !== false;
  const shape = (() => {
    switch (kind) {
      case "bar":
        return upright ? (
          <>
            <rect x={-8} y={-34} width="16" height="68" rx="4" className="body" />
            {Array.from({ length: 6 }, (_, i) => (
              <circle key={i} cx="0" cy={-26 + i * 10.4} r="2.8" className="lens" />
            ))}
          </>
        ) : (
          <>
            <rect x={-34} y={-8} width="68" height="16" rx="4" className="body" />
            {Array.from({ length: 6 }, (_, i) => (
              <circle key={i} cx={-26 + i * 10.4} cy="0" r="2.8" className="lens" />
            ))}
          </>
        );
      case "mover":
        return (
          <>
            <rect x={-16} y={8} width="32" height="10" rx="3" className="body" />
            <path d="M-12 10V-5M12 10V-5" className="yoke" />
            <circle cx="0" cy="-5" r="11.5" className="body" />
            <circle cx="0" cy="-5" r="6" className="lens" />
          </>
        );
      case "front":
        return (
          <>
            <path d="M-13 -11h26l-5 20h-16z" className="body" />
            <circle cx="0" cy="-2" r="5.5" className="lens" />
          </>
        );
      default:
        return (
          <>
            <rect x={-16} y={-12} width="32" height="24" rx="5" className="body" />
            <circle cx="0" cy="0" r="7.5" className="lens" />
          </>
        );
    }
  })();
  const half = kind === "bar" ? (upright ? 34 : 8) : kind === "mover" ? 18 : 12;
  const flip = hung && kind === "mover";
  // From the audience, a light on the floor stands on its height and a hung one hangs below it.
  const lift = view === "audience" ? (hung ? half + 4 : -half) * scale : 0;
  const style = { "--job": ROLE_INFO[rf.role].color } as CSSProperties;
  return (
    <g
      className={`glyph${selected ? " on" : ""}${dragging ? " dragging" : ""}`}
      style={style}
      transform={`translate(${x} ${y + lift})`}
      tabIndex={0}
      role="button"
      aria-label={`${name}, ${ROLE_INFO[rf.role].label}, ${rf.side === "SL" ? "stage left" : rf.side === "SR" ? "stage right" : "center"}${hung ? ", hung from a truss" : ""}`}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        if (e.key === "ArrowLeft") onKey(-step, 0);
        else if (e.key === "ArrowRight") onKey(step, 0);
        else if (e.key === "ArrowUp") onKey(0, -step);
        else if (e.key === "ArrowDown") onKey(0, step);
        else if (e.key === "Enter") onSelect();
        else return;
        e.preventDefault();
      }}
    >
      {/* From the audience, a hung light hangs from the truss on a clamp. */}
      {view === "audience" && hung && <line x1="0" y1={trussY + 12 - y - lift} x2="0" y2={-half * scale} className="hang-line" />}
      <g transform={`scale(${scale})`}>
        <circle r={kind === "bar" && upright ? 44 : 34} className="halo" />
        <circle r={kind === "bar" && upright ? 40 : 28} className="job-ring" />
        <g transform={flip ? "scale(1 -1)" : undefined}>{shape}</g>
        {/* From above, a moving head shows which way it faces: down the page is towards the audience. */}
        {view === "above" && kind === "mover" && <path d={rf.facesBack ? "M-7 -33 L0 -41 L7 -33" : "M-7 33 L0 41 L7 33"} className="facing" />}
        {view === "above" && hung && (
          <g className="hanger" aria-hidden="true">
            <rect x={-14} y={-half - 12} width="28" height="4.5" rx="1.5" />
            <path d={`M0 ${-half - 7.5}V${-half}`} />
          </g>
        )}
      </g>
      <text y={(kind === "bar" && upright ? 52 : view === "above" && kind === "mover" && !rf.facesBack ? 54 : 40) * scale} className="glyph-label">
        {shortName(name)}
      </text>
    </g>
  );
}

function Inspector({
  rf,
  fixture,
  profile,
  stage,
  canBe,
  onChange,
  likeThis,
  onCopyToLike,
}: {
  /** Other moving heads of the same make and model. */
  likeThis?: number;
  onCopyToLike?: () => void;
  rf: RigFixture;
  fixture: WsFixture;
  profile?: FixtureProfile;
  stage?: Rig["stage"];
  canBe: (r: Role) => boolean;
  onChange: (p: Partial<RigFixture>) => void;
}) {
  const roles: Role[] = ["backdrop", "mover", "side", "front", "ignore"];
  const sideLabel = rf.side === "SL" ? "Stage left" : rf.side === "SR" ? "Stage right" : "Center";
  const mount = mountOf(rf);
  const fmt = (share: number, metres: number) => {
    const v = share * metres * (stage?.feet ? 3.28084 : 1);
    return `${v.toFixed(1)} ${stage?.feet ? "ft" : "m"}`;
  };
  const where =
    rf.pos && stage
      ? `${fmt(rf.pos.x, stage.width)} from the stage right edge, ${rf.pos.y > 1 ? `${fmt(rf.pos.y - 1, stage.depth)} in front of the stage` : `${fmt(rf.pos.y, stage.depth)} from the back wall`}, ${fmt(rf.height ?? 0, stage.height)} up.`
      : undefined;
  const fromQlc = !!fixture.place && !rf.moved;
  return (
    <div className="inspector-body">
      <h2>{fixture.name}</h2>
      <p className="muted">
        {fixture.manufacturer} {fixture.model}
        <br />
        {fixture.mode}, universe {fixture.universe + 1}, address {fixture.address + 1}
      </p>

      <Field label="Job">
        <div className="role-grid">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              className={rf.role === r ? "role on" : "role"}
              style={{ "--job": ROLE_INFO[r].color } as CSSProperties}
              disabled={!canBe(r)}
              aria-pressed={rf.role === r}
              onClick={() => onChange({ role: r, home: r === "mover" ? rf.home ?? defaultHome(rf.facesBack) : rf.home })}
            >
              <Icon name={ROLE_INFO[r].icon} size={20} />
              <span>{ROLE_INFO[r].label}</span>
            </button>
          ))}
        </div>
        <span className="field-hint">{ROLE_INFO[rf.role].help} Its job doesn't change where it is.</span>
      </Field>

      {rf.role !== "ignore" && (
        <Field
          label="Where it is"
          hint={
            fromQlc
              ? "From QLC+'s 3D view."
              : rf.moved
                ? "Moved here. Exporting puts it here in QLC+'s 3D view too."
                : "Placed by Lightsmith, because the show file has no 3D layout. Drag it to where it really is."
          }
        >
          <span className="pill">{sideLabel}</span>
          {where && <span className="where">{where}</span>}
          {rf.moved && fixture.place && (
            <button
              type="button"
              className="ghost small"
              onClick={() => onChange({ moved: false })}
            >
              Put it back where QLC+ has it
            </button>
          )}
        </Field>
      )}

      {rf.role !== "ignore" && (
        <Field label="Mounting" hint="Anything in the top half of the stage is hung from a truss. This changes how it's drawn, not its colors.">
          <Segmented
            label="Mounting"
            value={mount}
            onChange={(m: Mount) => onChange({ height: m === "truss" ? Math.max(0.9, rf.height ?? 0) : 0, moved: true })}
            options={[
              { value: "floor", label: "On the floor" },
              { value: "truss", label: "Hung from a truss" },
            ]}
          />
        </Field>
      )}

      {rf.role !== "ignore" && isBar(profile) && (
        <Field label="Which way it stands">
          <Segmented
            label="Which way it stands"
            value={rf.upright === false ? "flat" : "upright"}
            onChange={(v: "upright" | "flat") => onChange({ upright: v === "upright", moved: true })}
            options={[
              { value: "upright", label: "Standing up" },
              { value: "flat", label: "Lying flat" },
            ]}
          />
        </Field>
      )}

      {rf.role === "mover" && (
        <Field
          label="Which way it faces"
          hint="A head turned to face the back aims as the mirror image of one facing the audience when both get the same pan and tilt, so a pair can make an X over the drums with the same values. QLC+ shows this as Invert pan in its 3D view."
        >
          <Segmented
            label="Which way it faces"
            value={rf.facesBack ? "back" : "front"}
            onChange={(v: "front" | "back") => {
              const back = v === "back";
              // A home still on the default follows the head round, so it keeps leaning over the crowd.
              const home = isDefaultHome(rf.home, rf.facesBack) ? defaultHome(back) : rf.home;
              onChange({ facesBack: back, moved: true, home });
            }}
            options={[
              { value: "front", label: "The audience" },
              { value: "back", label: "The back" },
            ]}
          />
        </Field>
      )}

      {rf.role === "mover" && (
        <div className="mover-box">
          <h3>Home position</h3>
          <p className="hint">
            Where the head points when still, and the center of every movement. Find good values in QLC+'s Simple Desk.
            {mount === "truss" && " Hung upside down, 128/128 points straight down at the stage, and pan and tilt run the opposite way to a head on the floor."}
          </p>
          {(["pan", "tilt"] as const).map((axis) => (
            <div key={axis} className="slider-row">
              <span>{axis === "pan" ? "Pan" : "Tilt"}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={(rf.home ?? defaultHome(rf.facesBack))[axis]}
                aria-label={axis}
                onChange={(e) => onChange({ home: { ...(rf.home ?? defaultHome(rf.facesBack)), [axis]: +e.target.value } })}
              />
              <NumberInput label={`${axis} value`} value={(rf.home ?? defaultHome(rf.facesBack))[axis]} min={0} max={255} onChange={(v) => onChange({ home: { ...(rf.home ?? defaultHome(rf.facesBack)), [axis]: Math.round(v) } })} />
            </div>
          ))}
          <Toggle checked={!!rf.reverse} onChange={(reverse) => onChange({ reverse })} label="Reverse movement" hint="Runs each movement's shape the other way round, for example clockwise instead of counterclockwise." />
          <h3>How fast it moves</h3>
          <p className="hint">
            Seconds to pan from one end of its range to the other at full speed. To time it, set pan to 0 in QLC+'s Simple Desk, then jump to 255 and count. Lightsmith slows any movement these heads can't keep up with, so they trace the shape instead of twitching on the spot. Leave it at {DEFAULT_PAN_SECONDS} if you're not sure.
          </p>
          <DurationInput label="Time to pan all the way" valueMs={(rf.panSeconds ?? DEFAULT_PAN_SECONDS) * 1000} minMs={500} maxMs={10000} stepMs={100} onChange={(ms) => onChange({ panSeconds: ms / 1000 })} />

          <h3>Where it faces</h3>
          <p className="hint">
            So the preview can show where this head really points, from the audience and from above. In QLC+'s Simple Desk: set tilt to about 80, then change pan until the beam points straight at the audience, and enter that pan here. Then raise pan a little and note which way the beam turns. This only changes the preview, never the show.
          </p>
          <div className="aim-cal">
            <Field label="Pan that faces the audience" hint={rf.panFront === undefined ? "Not set yet" : undefined}>
              <NumberInput label="Pan that faces the audience" value={rf.panFront ?? 128} min={0} max={255} step={1} onChange={(v) => onChange({ panFront: Math.round(v) })} />
            </Field>
            <Field label="Raising pan turns it toward">
              <Segmented
                label="Raising pan turns it toward"
                value={rf.panTurns ?? "left"}
                options={[
                  { value: "left", label: "Stage left" },
                  { value: "right", label: "Stage right" },
                ]}
                onChange={(panTurns: "left" | "right") => onChange({ panTurns })}
              />
            </Field>
            <Field label="Pan range" hint={profile?.def.focus?.panMax ? "From its definition" : "Check the spec sheet"}>
              <NumberInput label="Pan range in degrees" value={rf.panRange ?? DEFAULT_PAN_RANGE} min={90} max={720} step={10} suffix="°" onChange={(v) => onChange({ panRange: Math.round(v) })} />
            </Field>
            <Field label="Tilt range" hint={profile?.def.focus?.tiltMax ? "From its definition" : "Check the spec sheet"}>
              <NumberInput label="Tilt range in degrees" value={rf.tiltRange ?? DEFAULT_TILT_RANGE} min={90} max={360} step={10} suffix="°" onChange={(v) => onChange({ tiltRange: Math.round(v) })} />
            </Field>
          </div>
          {!!likeThis && onCopyToLike && (
            <button type="button" className="ghost small" onClick={onCopyToLike} title="Ranges, pan direction and speed go to all of them; the front pan goes to those facing the same way">
              <Icon name="copy" size={14} /> Use this setup for the {likeThis} other {likeThis === 1 ? "head" : "heads"} like it
            </button>
          )}
        </div>
      )}
    </div>
  );
}
