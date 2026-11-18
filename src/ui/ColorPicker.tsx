import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { COLORS, colorById, hexToRgb, rgbToHex, type RGB } from "../core";
import { useDismiss } from "./controls";
import { Icon } from "./icons";

export const cssColor = (id: string) => {
  const [r, g, b] = colorById(id).rgb;
  return `rgb(${r},${g},${b})`;
};

const MAX_COLORS = 6;

function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

/** Hue/saturation wheel plus a brightness slider. */
function ColorWheel({ value, onChange }: { value: RGB; onChange: (rgb: RGB) => void }) {
  const [h, s, v] = rgbToHsv(value);
  const wheel = useRef<HTMLDivElement>(null);
  const pick = (e: ReactPointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const radius = r.width / 2;
    const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const sat = Math.min(1, Math.hypot(dx, dy) / radius);
    onChange(hsvToRgb(hue, sat, v || 1));
  };
  const angle = (h * Math.PI) / 180;
  return (
    <div className="wheel-wrap">
      <div
        className="wheel"
        ref={wheel}
        role="slider"
        aria-label="Hue and saturation"
        aria-valuetext={rgbToHex(value)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => e.buttons && pick(e)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 15 : 5;
          if (e.key === "ArrowLeft") onChange(hsvToRgb((h - step + 360) % 360, s, v));
          if (e.key === "ArrowRight") onChange(hsvToRgb((h + step) % 360, s, v));
          if (e.key === "ArrowUp") onChange(hsvToRgb(h, Math.min(1, s + 0.05), v));
          if (e.key === "ArrowDown") onChange(hsvToRgb(h, Math.max(0, s - 0.05), v));
        }}
      >
        <span className="wheel-dim" style={{ opacity: 1 - v }} />
        <span className="wheel-marker" style={{ left: `${50 + 50 * s * Math.sin(angle)}%`, top: `${50 - 50 * s * Math.cos(angle)}%`, background: rgbToHex(value) }} />
      </div>
      <label className="brightness">
        <span>Brightness</span>
        <input type="range" min={10} max={100} value={Math.round(v * 100)} onChange={(e) => onChange(hsvToRgb(h, s, +e.target.value / 100))} style={{ background: `linear-gradient(90deg, #000, ${rgbToHex(hsvToRgb(h, s, 1))})` }} />
      </label>
    </div>
  );
}

/** The section's palette: gels or custom colors, with a picker to add more. */
export function PaletteEditor({ colors, fallback, onChange }: { colors: string[]; fallback: string[]; onChange: (c: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"gels" | "custom">("gels");
  const [custom, setCustom] = useState<RGB>([255, 120, 40]);
  const [hex, setHex] = useState("#ff7828");
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), pop);
  const using = colors.length ? colors : fallback;
  const add = (id: string) => {
    // Adding to the mood's colors starts from them, so nothing disappears.
    const base = colors.length ? colors : fallback;
    if (base.includes(id) || base.length >= MAX_COLORS) return;
    onChange([...base, id]);
  };
  const remove = (i: number) => onChange(colors.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= colors.length) return;
    const next = [...colors];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="palette">
      <div className={colors.length ? "palette-chips" : "palette-chips from-mood"}>
        {using.map((c, i) => (
          <span key={`${c}-${i}`} className="palette-chip" style={{ "--c": cssColor(c) } as CSSProperties}>
            <i />
            <span>{colorById(c).label}</span>
            {colors.length > 0 && (
              <span className="palette-chip-actions">
                {colors.length > 1 && (
                  <button type="button" aria-label={`Move ${colorById(c).label} earlier`} onClick={() => move(i, -1)} disabled={i === 0}>
                    ‹
                  </button>
                )}
                <button type="button" aria-label={`Remove ${colorById(c).label}`} onClick={() => remove(i)}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            )}
          </span>
        ))}
        <div className="popover-anchor" ref={pop}>
          <button type="button" className="ghost small" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={colors.length >= MAX_COLORS}>
            <Icon name="plus" size={14} /> Add color
          </button>
          {open && (
            <div className="popover color-popover" role="dialog" aria-label="Add a color">
              <div className="tabs">
                <button type="button" className={tab === "gels" ? "on" : ""} onClick={() => setTab("gels")}>
                  <Icon name="palette" size={15} /> Gels
                </button>
                <button type="button" className={tab === "custom" ? "on" : ""} onClick={() => setTab("custom")}>
                  <Icon name="wheel" size={15} /> Color wheel
                </button>
              </div>
              {tab === "gels" ? (
                <div className="gel-grid">
                  {COLORS.map((c) => {
                    const on = colors.includes(c.id);
                    return (
                      <button key={c.id} type="button" className={on ? "gel on" : "gel"} style={{ "--c": cssColor(c.id) } as CSSProperties} onClick={() => (on ? onChange(colors.filter((x) => x !== c.id)) : add(c.id))} aria-pressed={on}>
                        <i />
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="custom-color">
                  <ColorWheel
                    value={custom}
                    onChange={(rgb) => {
                      setCustom(rgb);
                      setHex(rgbToHex(rgb));
                    }}
                  />
                  <div className="custom-row">
                    <span className="custom-preview" style={{ background: rgbToHex(custom) }} />
                    <input
                      aria-label="Hex color"
                      value={hex}
                      onChange={(e) => {
                        setHex(e.target.value);
                        const rgb = hexToRgb(e.target.value);
                        if (rgb) setCustom(rgb);
                      }}
                      spellCheck={false}
                    />
                    <button type="button" className="primary small" onClick={() => add(rgbToHex(custom))}>
                      Add
                    </button>
                  </div>
                </div>
              )}
              <p className="popover-foot">Up to {MAX_COLORS} colors. They're spread across your lights; to cycle them over time, choose how often to switch below.</p>
            </div>
          )}
        </div>
        {colors.length > 0 && (
          <button type="button" className="link small" onClick={() => onChange([])}>
            Use the mood's colors
          </button>
        )}
      </div>
    </div>
  );
}
