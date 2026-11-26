import { formatDuration, formatSignedDuration, parseDuration, parseSignedDuration } from "../core";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons";

/** Close something when the user clicks outside `ref` or presses Escape. */
export function useDismiss(open: boolean, close: () => void, ref: { current: HTMLElement | null }) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  swatches?: string[];
  icon?: ReactNode;
  group?: string;
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="swatch-row" aria-hidden="true">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

/** A select that can show color swatches, icons and a description per option. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  placeholder,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  /** Shown when the value isn't one of the options (an action menu). */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? (placeholder !== undefined ? undefined : options[0]);
  useDismiss(open, () => setOpen(false), root);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" }));
  }, [open, options, value]);

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") setOpen(false);
  };
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  let lastGroup: string | undefined;
  return (
    <div className={`dropdown ${className ?? ""}`} ref={root}>
      <button
        type="button"
        className="dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {current?.icon}
        {current?.swatches && <Swatches colors={current.swatches} />}
        <span className={current ? "dropdown-value" : "dropdown-value placeholder"}>{current?.label ?? placeholder}</span>
        <Icon name="chevronDown" size={16} className="dropdown-chevron" />
      </button>
      {open && (
        <ul className="dropdown-list" role="listbox" id={id} ref={list} aria-label={label} aria-activedescendant={`${id}-${active}`} tabIndex={-1}>
          {options.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value} role="presentation">
                {heading && <div className="dropdown-group">{heading}</div>}
                <div
                  role="option"
                  id={`${id}-${i}`}
                  data-i={i}
                  aria-selected={o.value === value}
                  className={`dropdown-option${i === active ? " active" : ""}${o.value === value ? " selected" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  {o.icon}
                  {o.swatches && <Swatches colors={o.swatches} />}
                  <span className="dropdown-text">
                    <span>{o.label}</span>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {o.value === value && <Icon name="check" size={16} className="dropdown-check" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : ""}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** Energy 1-5 as a lit meter, like the level LEDs on a console. */
export function EnergyMeter({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: readonly { label: string }[] }) {
  return (
    <div className="meter" role="radiogroup" aria-label="Energy">
      {labels.map((l, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          aria-label={`${i + 1}: ${l.label}`}
          title={l.label}
          className={i < value ? `lit lvl${i + 1}` : ""}
          onClick={() => onChange(i + 1)}
        />
      ))}
      <span className="meter-label">{labels[value - 1]?.label}</span>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, label, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; suffix?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    else setDraft(String(value));
  };
  return (
    <span className="number">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {suffix && <span className="number-suffix">{suffix}</span>}
    </span>
  );
}

/**
 * A time, typed the way QLC+ writes it: "10s200ms", "1m30s", "800ms". Also
 * takes "10.2s", "1:30" and a bare number (in `bare` units). Shows the value
 * back in QLC+'s style. Up and down arrows step it by `stepMs`.
 */
export function DurationInput({
  valueMs,
  onChange,
  minMs = 0,
  maxMs = 3_600_000,
  stepMs = 100,
  bare = "s",
  label,
  signed = false,
}: {
  /** Allows a minus sign (minMs below 0). */
  signed?: boolean;
  valueMs: number;
  onChange: (ms: number) => void;
  minMs?: number;
  maxMs?: number;
  stepMs?: number;
  bare?: "s" | "ms";
  label: string;
}) {
  const fmtD = signed ? formatSignedDuration : formatDuration;
  const [draft, setDraft] = useState(fmtD(valueMs));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(fmtD(valueMs));
    setBad(false);
  }, [valueMs]);
  const clamp = (ms: number) => Math.max(minMs, Math.min(maxMs, ms));
  const commit = () => {
    const ms = signed ? parseSignedDuration(draft, bare) : parseDuration(draft, bare);
    if (ms === null) {
      setBad(true);
      return;
    }
    setBad(false);
    const next = clamp(ms);
    setDraft(fmtD(next));
    if (next !== valueMs) onChange(next);
  };
  return (
    <span className={bad ? "number duration bad" : "number duration"}>
      <input
        type="text"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        aria-label={label}
        aria-invalid={bad || undefined}
        title={`Type it like QLC+: 10s200ms, 1m30s or 800ms. A plain number is in ${bare === "s" ? "seconds" : "milliseconds"}.`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (bad) setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(fmtD(valueMs));
            setBad(false);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = (signed ? parseSignedDuration(draft, bare) : parseDuration(draft, bare)) ?? valueMs;
            const next = clamp(base + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? stepMs * 10 : stepMs));
            setDraft(fmtD(next));
            onChange(next);
          }
        }}
      />
      {bad && <span className="duration-error" role="alert">Try 10s200ms</span>}
    </span>
  );
}

/**
 * Tap along with the beat to find a tempo. Each tap after the first gives a
 * reading from the average gap of the last eight taps; a pause of more than
 * two seconds starts again.
 */
export function TapTempo({ onTempo, label = "Tap tempo" }: { onTempo: (bpm: number) => void; label?: string }) {
  const taps = useRef<number[]>([]);
  const [reading, setReading] = useState<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(idle.current), []);
  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > 2000) taps.current = [];
    taps.current = [...taps.current, now].slice(-8);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      taps.current = [];
      setReading(null);
    }, 2500);
    const t = taps.current;
    if (t.length < 2) return setReading(0);
    const gap = (t[t.length - 1]! - t[0]!) / (t.length - 1);
    const bpm = Math.max(30, Math.min(300, Math.round(60000 / gap)));
    setReading(bpm);
    onTempo(bpm);
  };
  return (
    <button
      type="button"
      className={reading !== null ? "tap-tempo on" : "tap-tempo"}
      onPointerDown={(e) => {
        // On press, not release, so taps land on the beat.
        if (e.button !== 0) return;
        e.preventDefault();
        tap();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!e.repeat) tap();
        }
      }}
      aria-label={`${label}: tap along with the beat`}
      title="Tap along with the beat, four or more times"
    >
      {reading === null ? "Tap" : reading === 0 ? "Keep tapping" : `${reading} BPM`}
    </button>
  );
}

/** Large radio choices with a title and a sentence each. */
export function ChoiceCards<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; title: string; text: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "choice on" : "choice"} onClick={() => onChange(o.value)}>
          <span className="choice-dot" aria-hidden="true" />
          <span>
            <strong>{o.title}</strong>
            <small>{o.text}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

