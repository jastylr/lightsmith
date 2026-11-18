import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ROLE_ROW, settleRig, type Mount, type Rig, type RigFixture, type Role, type WsFixture } from "../core";
import { Field, NumberInput, Segmented, Toggle } from "./controls";
import { Icon, type IconName } from "./icons";
import type { Store } from "./store";

const VW = 1000;
const VH = 620;
/** Lanes on the plan, back to front. Dropping a light in a lane gives it that job. */
const LANES: { role: Exclude<Role, "ignore">; label: string; top: number; bottom: number }[] = [
  { role: "backdrop", label: "Backdrop", top: 0.04, bottom: 0.27 },
  { role: "mover", label: "Moving heads", top: 0.27, bottom: 0.54 },
  { role: "side", label: "Side and floor", top: 0.54, bottom: 0.79 },
  { role: "front", label: "Front light", top: 0.82, bottom: 0.98 },
];
const ROLE_INFO: Record<Role, { label: string; icon: IconName; help: string }> = {
  backdrop: { label: "Backdrop", icon: "backdrop", help: "Bars or washes behind the band. They set the mood and run the patterns." },
  mover: { label: "Moving head", icon: "mover", help: "Pans and tilts. Follows each section's movement." },
  side: { label: "Side and floor", icon: "par", help: "Aimed at the players from the sides or floor. Used for focus and side swaps." },
  front: { label: "Front light", icon: "front", help: "Lights the band from the audience side so faces are visible." },
  ignore: { label: "Not used", icon: "hidden", help: "Lightsmith leaves this fixture alone." },
};

const laneAt = (y: number) => LANES.find((l) => y >= l.top && y <= l.bottom);
const clamp01 = (v: number) => Math.max(0.03, Math.min(0.97, v));

export function StagePage({ store, onNext }: { store: Store; onNext: () => void }) {
  const rig = store.project.rig;
  const byId = new Map(store.fixtures.map((f) => [f.id, f]));
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; fromTray: boolean; sx: number; sy: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const canBe = (id: number, role: Role) => {
    const p = store.profiles.get(id);
    if (role === "ignore") return true;
    if (!p) return false;
    if (role === "mover") return p.isMover;
    return p.heads.length > 0;
  };

  const commit = (next: Rig) => store.setRig(settleRig(next));
  const update = (id: number, patch: Partial<RigFixture>) => commit({ fixtures: rig.fixtures.map((f) => (f.fixtureId === id ? { ...f, ...patch, userSet: true } : f)) });

  const toPlan = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
  };

  const place = (id: number, x: number, y: number) => {
    const f = rig.fixtures.find((r) => r.fixtureId === id);
    if (!f) return;
    const lane = laneAt(y) ?? LANES.reduce((a, b) => (Math.abs((a.top + a.bottom) / 2 - y) < Math.abs((b.top + b.bottom) / 2 - y) ? a : b));
    let role: Role = lane.role;
    if (!canBe(id, role)) {
      const name = byId.get(id)?.name ?? "That light";
      setNotice(role === "mover" ? `${name} can't pan or tilt, so it can't go in the moving heads lane.` : `${name} has no color or white channels Lightsmith can use there.`);
      role = f.role !== "ignore" && canBe(id, f.role) ? f.role : "ignore";
      if (role === "ignore") return update(id, { role, pos: undefined });
    } else setNotice(null);
    update(id, { role, pos: { x: clamp01(x), y: ROLE_ROW[role] }, home: role === "mover" ? f.home ?? { pan: 128, tilt: 128 } : f.home });
    setSelected(id);
  };

  const startDrag = (e: ReactPointerEvent, id: number, fromTray: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toPlan(e.clientX, e.clientY);
    setDrag({ id, x: p.x, y: p.y, fromTray, sx: e.clientX, sy: e.clientY });
    setSelected(id);
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toPlan(e.clientX, e.clientY);
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toPlan(e.clientX, e.clientY);
    const moved = drag.fromTray || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
    if (p.inside && moved) place(drag.id, p.x, p.y);
    else if (!p.inside && !drag.fromTray) update(drag.id, { role: "ignore", pos: undefined });
    setDrag(null);
  };

  const onStage = rig.fixtures.filter((f) => f.role !== "ignore" && f.pos);
  const offStage = rig.fixtures.filter((f) => f.role === "ignore" || !f.pos);
  const sel = rig.fixtures.find((f) => f.fixtureId === selected);
  const selFixture = sel ? byId.get(sel.fixtureId) : undefined;

  return (
    <section className="page stage-page">
      <header className="page-head">
        <h1>Set up your stage</h1>
        <p className="lead">Drag each light to where it hangs. The lane you drop it in sets its job, and its position sets which side of the stage it's on.</p>
      </header>

      {notice && (
        <div className="notice warn" role="status">
          <Icon name="info" />
          <span>{notice}</span>
          <button className="ghost small" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}

      <div className="stage-layout">
        <div className="stage-col">
          <div className="plan-frame">
            <svg ref={svg} viewBox={`0 0 ${VW} ${VH}`} className="plan" role="application" aria-label="Stage plan seen from the audience. Drag lights to move them." onPointerMove={moveDrag} onPointerUp={endDrag}>
              <defs>
                <linearGradient id="plan-deck" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#24212a" />
                  <stop offset="1" stopColor="#2c2832" />
                </linearGradient>
                <pattern id="plan-boards" width="60" height="620" patternUnits="userSpaceOnUse">
                  <path d="M60 0V620" stroke="#ffffff" strokeOpacity="0.025" />
                </pattern>
              </defs>
              <rect x="20" y={VH * 0.02} width={VW - 40} height={VH * 0.78} rx="10" fill="url(#plan-deck)" stroke="#3b3640" />
              <rect x="20" y={VH * 0.02} width={VW - 40} height={VH * 0.78} rx="10" fill="url(#plan-boards)" />
              <rect x="20" y={VH * 0.02} width={VW - 40} height="10" rx="5" fill="#0e0d10" />
              {LANES.map((l) => {
                const hot = drag && laneAt(drag.y)?.role === l.role;
                return (
                  <g key={l.role} className={hot ? "lane hot" : "lane"}>
                    <rect x="28" y={l.top * VH} width={VW - 56} height={(l.bottom - l.top) * VH} rx="8" />
                    <text x="40" y={l.top * VH + 22}>
                      {l.label}
                    </text>
                  </g>
                );
              })}
              {/* Drum riser for orientation */}
              <g className="riser" aria-hidden="true">
                <rect x={VW / 2 - 85} y={VH * 0.3} width="170" height="78" rx="6" />
                <circle cx={VW / 2} cy={VH * 0.3 + 40} r="20" />
                <circle cx={VW / 2 - 42} cy={VH * 0.3 + 32} r="12" />
                <circle cx={VW / 2 + 42} cy={VH * 0.3 + 32} r="12" />
                <text x={VW / 2} y={VH * 0.3 + 72}>
                  Drums
                </text>
              </g>
              <text className="plan-side" x="36" y={VH * 0.8 - 12}>
                Stage right
              </text>
              <text className="plan-side" x={VW - 36} y={VH * 0.8 - 12} textAnchor="end">
                Stage left
              </text>
              <text className="plan-audience" x={VW / 2} y={VH - 6}>
                Audience
              </text>

              {onStage.map((f) => {
                const live = drag && drag.id === f.fixtureId && !drag.fromTray ? { x: drag.x, y: drag.y } : f.pos!;
                return (
                  <FixtureGlyph
                    key={f.fixtureId}
                    rf={f}
                    fixture={byId.get(f.fixtureId)}
                    x={live.x * VW}
                    y={live.y * VH}
                    selected={selected === f.fixtureId}
                    dragging={drag?.id === f.fixtureId}
                    onPointerDown={(e) => startDrag(e, f.fixtureId, false)}
                    onKey={(dx, dy) => f.pos && place(f.fixtureId, f.pos.x + dx, f.pos.y + dy)}
                    onSelect={() => setSelected(f.fixtureId)}
                  />
                );
              })}
              {drag?.fromTray && <circle cx={drag.x * VW} cy={drag.y * VH} r="22" className="drop-ghost" />}
            </svg>
          </div>

          <div className="tray" aria-label="Lights not on the stage">
            <div className="tray-head">
              <h2>Not on stage</h2>
              <span className="hint">Drag a light onto the plan to use it. Drag one off the plan to stop using it.</span>
            </div>
            {offStage.length === 0 ? (
              <p className="hint">Every light is on the stage.</p>
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
                        title={usable ? "Drag onto the stage" : "Add this fixture's definition in step 1 first"}
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
            <Inspector rf={sel} fixture={selFixture} canBe={(r) => canBe(sel.fixtureId, r)} onChange={(p) => update(sel.fixtureId, p)} />
          ) : (
            <div className="inspector-empty">
              <Icon name="stage" size={28} />
              <h2>Pick a light</h2>
              <p>Click a light on the plan to see its details, set moving-head positions, or change its job.</p>
              <dl className="counts">
                {LANES.map((l) => (
                  <div key={l.role}>
                    <dt>{l.label}</dt>
                    <dd>{rig.fixtures.filter((f) => f.role === l.role).length}</dd>
                  </div>
                ))}
              </dl>
            </div>
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
  fixture,
  x,
  y,
  selected,
  dragging,
  onPointerDown,
  onKey,
  onSelect,
}: {
  rf: RigFixture;
  fixture?: WsFixture;
  x: number;
  y: number;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onKey: (dx: number, dy: number) => void;
  onSelect: () => void;
}) {
  const name = fixture?.name ?? `Fixture ${rf.fixtureId}`;
  const short = name.length > 18 ? name.slice(0, 17) + "…" : name;
  const shape = (() => {
    switch (rf.role) {
      case "backdrop":
        return (
          <>
            <rect x={-9} y={-38} width="18" height="76" rx="4" className="body" />
            {Array.from({ length: 7 }, (_, i) => (
              <circle key={i} cx="0" cy={-30 + i * 10} r="3" className="lens" />
            ))}
          </>
        );
      case "mover":
        return (
          <>
            <rect x={-18} y={10} width="36" height="12" rx="3" className="body" />
            <path d="M-14 12V-6M14 12V-6" className="yoke" />
            <circle cx="0" cy="-6" r="13" className="body" />
            <circle cx="0" cy="-6" r="7" className="lens" />
          </>
        );
      case "front":
        return (
          <>
            <path d="M-14 -12h28l-5 22h-18z" className="body" />
            <circle cx="0" cy="-2" r="6" className="lens" />
          </>
        );
      default:
        return (
          <>
            <rect x={-18} y={-13} width="36" height="26" rx="5" className="body" />
            <circle cx="0" cy="0" r="8" className="lens" />
          </>
        );
    }
  })();
  const labelY = rf.role === "backdrop" ? 54 : 38;
  // Hung from a truss: a clamp above the light, and moving heads drawn upside down.
  const hung = rf.mount === "truss" && rf.role !== "backdrop";
  const top = rf.role === "mover" ? -22 : -13;
  return (
    <g
      className={`glyph${selected ? " on" : ""}${dragging ? " dragging" : ""}`}
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-label={`${name}, ${ROLE_INFO[rf.role].label}, ${rf.side === "SL" ? "stage left" : rf.side === "SR" ? "stage right" : "center"}${hung ? ", hung from a truss" : ""}`}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        if (e.key === "ArrowLeft") onKey(-step, 0);
        else if (e.key === "ArrowRight") onKey(step, 0);
        else if (e.key === "ArrowUp") onKey(0, -0.26);
        else if (e.key === "ArrowDown") onKey(0, 0.26);
        else if (e.key === "Enter") onSelect();
        else return;
        e.preventDefault();
      }}
    >
      <circle r="46" className="halo" />
      {hung && (
        <g className="hanger" aria-hidden="true">
          <rect x={-16} y={top - 14} width="32" height="5" rx="1.5" />
          <path d={`M0 ${top - 9}V${top}`} />
        </g>
      )}
      <g transform={hung && rf.role === "mover" ? "translate(0 -4) scale(1 -1)" : undefined}>{shape}</g>
      <text y={labelY} className="glyph-label">
        {short}
      </text>
    </g>
  );
}

function Inspector({ rf, fixture, canBe, onChange }: { rf: RigFixture; fixture: WsFixture; canBe: (r: Role) => boolean; onChange: (p: Partial<RigFixture>) => void }) {
  const roles: Role[] = ["backdrop", "mover", "side", "front", "ignore"];
  const sideLabel = rf.side === "SL" ? "Stage left" : rf.side === "SR" ? "Stage right" : "Center";
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
              disabled={!canBe(r)}
              aria-pressed={rf.role === r}
              onClick={() => onChange({ role: r, pos: r === "ignore" ? undefined : { x: rf.pos?.x ?? 0.5, y: ROLE_ROW[r] }, home: r === "mover" ? rf.home ?? { pan: 128, tilt: 128 } : rf.home })}
            >
              <Icon name={ROLE_INFO[r].icon} size={20} />
              <span>{ROLE_INFO[r].label}</span>
            </button>
          ))}
        </div>
        <span className="field-hint">{ROLE_INFO[rf.role].help}</span>
      </Field>

      {rf.role !== "ignore" && (
        <Field label="Side of the stage" hint="Set by where it sits on the plan. Stage left is the performers' left.">
          <span className="pill">{sideLabel}</span>
        </Field>
      )}

      {rf.role !== "ignore" && rf.role !== "backdrop" && (
        <Field
          label="Mounting"
          hint={
            fixture.height !== undefined
              ? `QLC+'s 3D view has it ${fixture.height > 0.5 ? "high up" : "low down"} (${Math.round(fixture.height * 100)}% of the stage height). This changes how it's drawn in the preview, not its colors.`
              : "This changes how it's drawn in the preview, not its colors."
          }
        >
          <Segmented
            label="Mounting"
            value={rf.mount ?? "floor"}
            onChange={(mount: Mount) => onChange({ mount })}
            options={[
              { value: "floor", label: "On the floor" },
              { value: "truss", label: "Hung from a truss" },
            ]}
          />
        </Field>
      )}

      {rf.role === "mover" && (
        <div className="mover-box">
          <h3>Home position</h3>
          <p className="hint">
            Where the head points when still, and the center of every movement. Find good values in QLC+'s Simple Desk.
            {rf.mount === "truss" && " Hung upside down, 128/128 points straight down at the stage, and pan and tilt run the opposite way to a head on the floor."}
          </p>
          {(["pan", "tilt"] as const).map((axis) => (
            <div key={axis} className="slider-row">
              <span>{axis === "pan" ? "Pan" : "Tilt"}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={rf.home?.[axis] ?? 128}
                aria-label={axis}
                onChange={(e) => onChange({ home: { pan: rf.home?.pan ?? 128, tilt: rf.home?.tilt ?? 128, [axis]: +e.target.value } })}
              />
              <NumberInput label={`${axis} value`} value={rf.home?.[axis] ?? 128} min={0} max={255} onChange={(v) => onChange({ home: { pan: rf.home?.pan ?? 128, tilt: rf.home?.tilt ?? 128, [axis]: Math.round(v) } })} />
            </div>
          ))}
          <Toggle checked={!!rf.reverse} onChange={(reverse) => onChange({ reverse })} label="Reverse movement" hint="For a head facing the other way, so pairs mirror each other." />
        </div>
      )}

      <p className="hint">Position: {sideLabel}, number {rf.order + 1} from stage left among {ROLE_INFO[rf.role].label.toLowerCase()} lights.</p>
    </div>
  );
}
