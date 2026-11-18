import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Role } from "../core";
import { Segmented } from "./controls";
import { Icon, type IconName } from "./icons";

export interface Light {
  id: number;
  name: string;
  role: Role;
  hasRgb: boolean;
  /** Where the light sits on the stage plan, 0–1 across and front to back. */
  pos: { x: number; y: number };
}

export const ROLE_LABEL: Record<Role, string> = { backdrop: "Backdrop", mover: "Moving heads", side: "Side and floor", front: "Front", ignore: "Not used" };
const ROLE_ORDER: Role[] = ["backdrop", "mover", "side", "front"];

/** Names a set of lights briefly: "Backdrop · 4", "Backdrop + Moving heads · 6", "All lights · 8". */
export function describeLights(ids: Set<number>, lights: Light[], custom: boolean): string {
  if (ids.size === 0) return "No lights";
  const roles = ROLE_ORDER.filter((r) => lights.some((l) => l.role === r && ids.has(l.id)));
  const allRoles = ROLE_ORDER.filter((r) => lights.some((l) => l.role === r));
  const name = roles.length === allRoles.length && roles.length > 1 ? "All lights" : roles.length <= 2 ? roles.map((r) => ROLE_LABEL[r]).join(" + ") : `${roles.length} kinds`;
  return `${name} · ${ids.size}${custom ? " (custom)" : ""}`;
}

/** Short label for a light on the mini stage: the "[5]" number in its name, if any. */
const shortName = (l: Light) => /\[(\d+)\]\s*$/.exec(l.name)?.[1] ?? String(l.id + 1);

/**
 * A small chip that says which lights something runs on. Clicking it opens a
 * popover with a mini stage plan to click lights on (or a list), plus
 * "Select all" shortcuts per kind of light. Used for patterns and effects.
 */
export function LightPicker({ title, chosen, custom, lights, needsRgb, onChange }: { title: string; chosen: number[]; custom: boolean; lights: Light[]; needsRgb: boolean; onChange: (ids: number[] | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const set = new Set(chosen.filter((id) => lights.some((l) => l.id === id && (!needsRgb || l.hasRgb))));
  return (
    <>
      <button ref={chip} type="button" className={`lights-chip${open ? " open" : ""}${set.size ? "" : " empty"}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="Choose which lights run this">
        <Icon name="stage" size={14} />
        <span>{describeLights(set, lights, custom)}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && <LightPopover anchor={chip} title={title} set={set} custom={custom} lights={lights} needsRgb={needsRgb} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

function LightPopover({ anchor, title, set, custom, lights, needsRgb, onChange, onClose }: { anchor: RefObject<HTMLButtonElement | null>; title: string; set: Set<number>; custom: boolean; lights: Light[]; needsRgb: boolean; onChange: (ids: number[] | undefined) => void; onClose: () => void }) {
  const pop = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"stage" | "list">("stage");
  const [hover, setHover] = useState<Light | null>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" });

  // Sit under the chip, or above it when there's no room; stay on screen.
  useLayoutEffect(() => {
    const position = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = pop.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const left = Math.max(12, Math.min(a.left, window.innerWidth - w - 12));
      const below = a.bottom + 8;
      const top = below + h > window.innerHeight - 12 && a.top - h - 8 > 12 ? a.top - h - 8 : Math.max(12, Math.min(below, window.innerHeight - h - 12));
      setPlace({ left, top });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [anchor, view]);

  // Close on a click outside or Escape.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  const usable = (l: Light) => !needsRgb || l.hasRgb;
  const toggle = (l: Light) => {
    if (!usable(l)) return;
    const next = new Set(set);
    if (next.has(l.id)) next.delete(l.id);
    else next.add(l.id);
    onChange([...next]);
  };
  const roles = ROLE_ORDER.filter((r) => lights.some((l) => l.role === r));
  const toggleRole = (role: Role) => {
    const ids = lights.filter((l) => l.role === role && usable(l)).map((l) => l.id);
    const all = ids.every((id) => set.has(id));
    const next = new Set(set);
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    onChange([...next]);
  };
  const usableCount = lights.filter(usable).length;

  return createPortal(
    <div ref={pop} className="lights-pop" role="dialog" aria-label={title} style={place}>
      <div className="lights-pop-head">
        <strong>{title}</strong>
        <span>
          {set.size} of {usableCount} lights
        </span>
      </div>

      <Segmented
        label="Show lights as"
        value={view}
        onChange={setView}
        options={[
          { value: "stage", label: "Stage", icon: <Icon name="stage" size={14} /> },
          { value: "list", label: "List", icon: <Icon name="list" size={14} /> },
        ]}
      />

      {view === "stage" ? (
        <div className="mini-stage-wrap">
          <MiniStage lights={lights} set={set} usable={usable} onToggle={toggle} onHover={setHover} />
          <p className="mini-stage-status">{hover ? `${hover.name}${usable(hover) ? "" : " — can't show this"}` : "Click a light to add or remove it."}</p>
        </div>
      ) : (
        <div className="lights-list">
          {roles.map((role) => (
            <fieldset key={role}>
              <legend>{ROLE_LABEL[role]}</legend>
              {lights
                .filter((l) => l.role === role)
                .map((l) => (
                  <label key={l.id} className={usable(l) ? "check" : "check blocked"} title={usable(l) ? undefined : "This light has no color channels for this"}>
                    <input type="checkbox" checked={set.has(l.id)} disabled={!usable(l)} onChange={() => toggle(l)} />
                    {l.name}
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      )}

      <div className="select-all">
        <span>Select all</span>
        <div>
          {roles.map((role) => {
            const ids = lights.filter((l) => l.role === role && usable(l)).map((l) => l.id);
            if (!ids.length) return null;
            const n = ids.filter((id) => set.has(id)).length;
            const icon: IconName = n === 0 ? "boxEmpty" : n === ids.length ? "boxChecked" : "boxSome";
            return (
              <button key={role} type="button" className={n ? "group-toggle some" : "group-toggle"} onClick={() => toggleRole(role)} title={n === ids.length ? `Remove all ${ROLE_LABEL[role].toLowerCase()} lights` : `Add all ${ROLE_LABEL[role].toLowerCase()} lights`}>
                <Icon name={icon} size={15} />
                {ROLE_LABEL[role]}
                <small>
                  {n}/{ids.length}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      {needsRgb && lights.some((l) => !usable(l)) && <p className="hint">Greyed-out lights have no color channels, so they can't show this.</p>}

      <div className="lights-pop-foot">
        {custom ? (
          <button type="button" className="link small" onClick={() => onChange(undefined)}>
            Use the usual lights
          </button>
        ) : (
          <span className="hint">Using the usual lights</span>
        )}
        <button type="button" className="ghost small" onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

const SW = 400;
const SH = 220;

/** The user's stage plan in miniature, with each light clickable. */
function MiniStage({ lights, set, usable, onToggle, onHover }: { lights: Light[]; set: Set<number>; usable: (l: Light) => boolean; onToggle: (l: Light) => void; onHover: (l: Light | null) => void }) {
  // Spread the lights over the whole mini stage, front to back.
  const ys = lights.map((l) => l.pos.y);
  const y0 = Math.min(...ys);
  const span = Math.max(0.2, Math.max(...ys) - y0);
  const at = (l: Light) => ({ x: 40 + l.pos.x * (SW - 80), y: 52 + ((l.pos.y - y0) / span) * (SH - 104) });
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} className="mini-stage" role="group" aria-label="Stage plan">
      <rect x="14" y="10" width={SW - 28} height={SH - 36} rx="8" className="ms-deck" />
      <line x1="14" y1={SH - 22} x2={SW - 14} y2={SH - 22} className="ms-edge" />
      <text x={SW / 2} y={SH - 8} textAnchor="middle" className="ms-audience">
        Audience
      </text>
      {lights.map((l) => {
        const { x, y } = at(l);
        const on = set.has(l.id);
        const ok = usable(l);
        const cls = `ms-light ${on ? "on" : ""} ${ok ? "" : "blocked"}`;
        return (
          <g
            key={l.id}
            className={cls}
            role="checkbox"
            aria-checked={on}
            aria-disabled={!ok}
            aria-label={l.name}
            tabIndex={ok ? 0 : -1}
            onClick={() => onToggle(l)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle(l);
              }
            }}
            onPointerEnter={() => onHover(l)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(l)}
            onBlur={() => onHover(null)}
          >
            <title>{l.name}</title>
            <rect x={x - 20} y={y - 24} width="40" height="48" className="ms-hit" />
            {l.role === "backdrop" ? (
              <>
                <rect x={x - 5} y={y - 20} width="10" height="40" rx="2" className="ms-body" />
                {on && <rect x={x - 2.5} y={y - 17.5} width="5" height="35" rx="1" className="ms-lens" />}
              </>
            ) : l.role === "mover" ? (
              <>
                <rect x={x - 10} y={y + 6} width="20" height="5" rx="1" className="ms-body" />
                <circle cx={x} cy={y - 1} r="8" className="ms-body" />
                {on && <circle cx={x} cy={y - 1} r="4" className="ms-lens" />}
              </>
            ) : (
              <>
                <path d={`M${x - 11} ${y + 7} L${x - 8} ${y - 6} L${x + 8} ${y - 6} L${x + 11} ${y + 7} Z`} className="ms-body" />
                {on && <ellipse cx={x} cy={y - 6} rx="7" ry="2.4" className="ms-lens" />}
              </>
            )}
            <text x={x} y={l.role === "backdrop" ? y + 33 : y + 25} textAnchor="middle" className="ms-label">
              {shortName(l)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
