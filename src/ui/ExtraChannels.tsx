import { useState, type CSSProperties } from "react";
import { extraChannels, type ChannelKind, type ExtraChannel, type FixtureProfile, type Section } from "../core";
import { Dropdown } from "./controls";
import { Icon } from "./icons";
import type { Light } from "./LightPicker";

type Gesture = { begin: () => void; end: () => void };
type Extras = NonNullable<Section["extras"]>;

const COLOR_KINDS: Partial<Record<ChannelKind, { short: string; css: string }>> = {
  red: { short: "R", css: "#e5484d" },
  green: { short: "G", css: "#46a758" },
  blue: { short: "B", css: "#3e63dd" },
  white: { short: "W", css: "#e8e2d6" },
  amber: { short: "A", css: "#f5a623" },
  uv: { short: "UV", css: "#8e4ec6" },
  cyan: { short: "C", css: "#05a2c2" },
  magenta: { short: "M", css: "#d6409f" },
  yellow: { short: "Y", css: "#f5d90a" },
  lime: { short: "L", css: "#99d52a" },
};

interface Block {
  label: string;
  channels: ExtraChannel[];
  /** Blocks with the same colors in the same order ("LED 1" to "LED 7"). */
  signature: string;
}

/** Names a run of color channels by the words their names share: "LED 1 R", "LED 1 G" → "LED 1". */
function blockLabel(names: string[]): string {
  const words = names.map((n) => n.trim().split(/\s+/));
  const shared = (pick: (w: string[], i: number) => string | undefined) => {
    const out: string[] = [];
    for (let i = 0; ; i++) {
      const w = pick(words[0]!, i);
      if (w === undefined || !words.every((x) => pick(x, i)?.toLowerCase() === w.toLowerCase())) break;
      out.push(w);
    }
    return out;
  };
  const start = shared((w, i) => (i < w.length - 1 ? w[i] : undefined));
  if (start.length) return start.join(" ");
  const end = shared((w, i) => (i < w.length - 1 ? w[w.length - 1 - i] : undefined)).reverse();
  if (end.length) return end.join(" ").replace(/^./, (c) => c.toUpperCase());
  return `${names[0]} to ${names[names.length - 1]}`;
}

/** Splits a light's extra channels into single controls and runs of color channels (a ring's LEDs). */
function arrange(channels: ExtraChannel[]): { single: ExtraChannel[]; blocks: Block[] } {
  const single: ExtraChannel[] = [];
  const blocks: Block[] = [];
  let run: ExtraChannel[] = [];
  const flush = () => {
    if (run.length >= 2) blocks.push({ label: blockLabel(run.map((c) => c.name)), channels: run, signature: run.map((c) => c.kind).join(",") });
    else single.push(...run);
    run = [];
  };
  for (const c of channels) {
    const isColor = !!COLOR_KINDS[c.kind] && !c.capabilities.length;
    const last = run[run.length - 1];
    if (isColor && last && last.channel === c.channel - 1 && !run.some((x) => x.kind === c.kind)) run.push(c);
    else {
      flush();
      if (isColor) run = [c];
      else single.push(c);
    }
  }
  flush();
  single.sort((a, b) => a.channel - b.channel);
  return { single, blocks };
}

const hex2 = (v: number) => v.toString(16).padStart(2, "0");

/**
 * Full mode: the channels of each kind of light that Lightsmith doesn't drive
 * (a ring, background LEDs, a built-in effect), set by hand for this section,
 * like the sliders in QLC+'s Simple Desk. Lights of the same model and mode
 * share one panel; the chips choose which of them an edit goes to.
 */
export function ExtraChannelsEditor({ s, lights, profiles, onChange, gesture }: { s: Section; lights: Light[]; profiles: Map<number, FixtureProfile>; onChange: (extras: Section["extras"]) => void; gesture: Gesture }) {
  const groups = new Map<string, { title: string; mode: string; lights: Light[]; channels: ExtraChannel[] }>();
  for (const l of lights) {
    const p = profiles.get(l.id);
    if (!p) continue;
    const key = `${p.def.manufacturer}|${p.def.model}|${p.mode.name}`;
    let g = groups.get(key);
    if (!g) {
      const channels = extraChannels(p);
      if (!channels.length) continue;
      groups.set(key, (g = { title: p.def.model, mode: p.mode.name, lights: [], channels }));
    }
    g.lights.push(l);
  }
  if (!groups.size) return <p className="hint">None of your lights have channels beyond the ones Lightsmith already sets.</p>;
  const all = [...groups.entries()];
  return (
    <div className="extra-channels">
      {all.map(([key, g]) => (
        <ExtraGroup key={key} {...g} only={all.length === 1} extras={s.extras ?? {}} onChange={onChange} gesture={gesture} />
      ))}
    </div>
  );
}

function ExtraGroup({ title, mode, lights, channels, only, extras, onChange, gesture }: { title: string; mode: string; lights: Light[]; channels: ExtraChannel[]; only: boolean; extras: Extras; onChange: (extras: Section["extras"]) => void; gesture: Gesture }) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(lights.map((l) => l.id)));
  const ids = lights.map((l) => l.id).filter((id) => chosen.has(id));
  const { single, blocks } = arrange(channels);
  const setCount = channels.filter((c) => lights.some((l) => extras[l.id]?.[c.channel] !== undefined)).length;
  const lightsWithSome = lights.filter((l) => Object.keys(extras[l.id] ?? {}).length > 0).length;

  /** The value the chosen lights share, or the first one set when they differ. */
  const read = (ch: number): { value?: number; mixed: boolean } => {
    const vals = ids.map((id) => extras[id]?.[ch]);
    const set = vals.filter((v): v is number => v !== undefined);
    return { value: set[0], mixed: set.length > 0 && (set.length !== vals.length || set.some((v) => v !== set[0])) };
  };
  /** Writes channel values (undefined clears one) on every chosen light. */
  const write = (changes: Record<number, number | undefined>) => {
    const next: Extras = { ...extras };
    for (const id of ids) {
      const own = { ...(next[id] ?? {}) };
      for (const [ch, v] of Object.entries(changes)) {
        if (v === undefined) delete own[ch];
        else own[ch] = Math.max(0, Math.min(255, Math.round(v)));
      }
      if (Object.keys(own).length) next[id] = own;
      else delete next[id];
    }
    onChange(Object.keys(next).length ? next : undefined);
  };
  const clearAll = () => write(Object.fromEntries(channels.map((c) => [c.channel, undefined])));
  const anyChosenSet = ids.some((id) => channels.some((c) => extras[id]?.[c.channel] !== undefined));
  const colorSet = blocks.some((b) => b.channels.some((c) => read(c.channel).value !== undefined));

  return (
    <details className="extra-group" open={only || setCount > 0 || undefined}>
      <summary>
        <Icon name="chevronRight" size={14} />
        <span className="extra-title">
          {title} <span className="extra-mode">{mode}</span>
        </span>
        <small>
          {lights.length === 1 ? "1 light" : `${lights.length} lights`}
          {setCount > 0 ? `, ${setCount} ${setCount === 1 ? "channel" : "channels"} set${lights.length > 1 ? (lightsWithSome === lights.length ? " (on all of them)" : ` (on ${lightsWithSome} of them)`) : ""}` : ""}
        </small>
      </summary>
      {lights.length > 1 && (
        <div className="extra-lights" role="group" aria-label={`Lights these settings go to`}>
          <span className="extra-lights-label">Changes go to</span>
          {lights.map((l) => {
            const on = chosen.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={on ? "extra-light on" : "extra-light"}
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(chosen);
                  if (on) next.delete(l.id);
                  else next.add(l.id);
                  setChosen(next);
                }}
              >
                {on && <Icon name="check" size={13} />}
                {l.name}
              </button>
            );
          })}
        </div>
      )}
      {!ids.length ? (
        <p className="hint">Choose at least one light to change.</p>
      ) : (
        <>
          <div className="extra-rows">
            {single.map((c) => (
              <ChannelRow key={c.channel} c={c} {...read(c.channel)} onSet={(v) => write({ [c.channel]: v })} gesture={gesture} />
            ))}
          </div>
          {blocks.length > 0 && (
            <details className="fine-tune extra-colors" open={colorSet || undefined}>
              <summary>
                <Icon name="chevronRight" size={14} /> Color channels ({blocks.reduce((n, b) => n + b.channels.length, 0)}){colorSet ? " (in use)" : ""}
              </summary>
              <div className="extra-blocks">
                {blocks.map((b, i) => {
                  const twins = blocks.filter((x, j) => j !== i && x.signature === b.signature);
                  return <ColorBlock key={b.label + i} block={b} read={read} write={write} gesture={gesture} twins={twins} />;
                })}
              </div>
            </details>
          )}
          {anyChosenSet && (
            <button type="button" className="ghost small extra-clear" onClick={clearAll}>
              <Icon name="reset" size={14} /> Clear {ids.length === lights.length ? "all" : "these lights'"} extra channels
            </button>
          )}
        </>
      )}
    </details>
  );
}

function Slider({ label, value, mixed, color, onSet, gesture }: { label: string; value?: number; mixed: boolean; color?: string; onSet: (v: number) => void; gesture: Gesture }) {
  const v = value ?? 0;
  return (
    <input
      type="range"
      min={0}
      max={255}
      value={v}
      className={value === undefined ? "extra-slider unset" : mixed ? "extra-slider mixed" : "extra-slider"}
      style={{ "--pct": `${(v / 255) * 100}%`, ...(color ? { "--fill": color } : {}) } as CSSProperties}
      aria-label={label}
      aria-valuetext={value === undefined ? "Not set" : String(value)}
      onPointerDown={gesture.begin}
      onPointerUp={gesture.end}
      onChange={(e) => onSet(Number(e.target.value))}
    />
  );
}

function ValueBox({ label, value, mixed, onSet }: { label: string; value?: number; mixed: boolean; onSet: (v: number | undefined) => void }) {
  return (
    <input
      type="number"
      className="extra-number"
      min={0}
      max={255}
      value={value ?? ""}
      placeholder="–"
      title={mixed ? "The chosen lights differ; this is the first one's value" : undefined}
      aria-label={`${label} value`}
      onChange={(e) => onSet(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function ChannelRow({ c, value, mixed, onSet, gesture }: { c: ExtraChannel; value?: number; mixed: boolean; onSet: (v: number | undefined) => void; gesture: Gesture }) {
  const caps = c.capabilities;
  const at = value === undefined ? -1 : caps.findIndex((x) => value >= x.min && value <= x.max);
  return (
    <div className={value === undefined ? "extra-row unset" : "extra-row"}>
      <span className="extra-name" title={`Channel ${c.channel + 1} of the light`}>
        {c.name}
        {mixed && <small className="extra-mixed">differs</small>}
      </span>
      <Slider label={c.name} value={value} mixed={mixed} onSet={onSet} gesture={gesture} />
      <ValueBox label={c.name} value={value} mixed={mixed} onSet={onSet} />
      {caps.length > 1 ? (
        <Dropdown
          className="extra-caps"
          label={`${c.name}: what it does`}
          value={at >= 0 ? String(at) : ""}
          placeholder={value === undefined ? "Not set" : "Between ranges"}
          options={caps.map((x, i) => ({ value: String(i), label: x.name, description: x.min === x.max ? String(x.min) : `${x.min}–${x.max}` }))}
          onChange={(i) => {
            const x = caps[Number(i)]!;
            onSet(Math.round((x.min + x.max) / 2));
          }}
        />
      ) : (
        <span className="extra-caps-none">{caps[0]?.name ?? ""}</span>
      )}
      <button type="button" className="icon-btn extra-unset" disabled={value === undefined} title="Don't set this channel" aria-label={`Don't set ${c.name}`} onClick={() => onSet(undefined)}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function ColorBlock({ block, read, write, gesture, twins }: { block: Block; read: (ch: number) => { value?: number; mixed: boolean }; write: (changes: Record<number, number | undefined>) => void; gesture: Gesture; twins: Block[] }) {
  const byKind = (k: ChannelKind) => block.channels.find((c) => c.kind === k);
  const r = byKind("red");
  const g = byKind("green");
  const b = byKind("blue");
  const rgb = r && g && b ? [r, g, b].map((c) => read(c.channel).value ?? 0) : undefined;
  const anySet = block.channels.some((c) => read(c.channel).value !== undefined);
  return (
    <div className="extra-block">
      <div className="extra-block-head">
        <strong>{block.label}</strong>
        {rgb && (
          <input
            type="color"
            className="extra-swatch"
            aria-label={`${block.label} color`}
            value={`#${rgb.map(hex2).join("")}`}
            onChange={(e) => {
              const h = e.target.value;
              const w = byKind("white");
              write({ [r!.channel]: parseInt(h.slice(1, 3), 16), [g!.channel]: parseInt(h.slice(3, 5), 16), [b!.channel]: parseInt(h.slice(5, 7), 16), ...(w && read(w.channel).value === undefined ? { [w.channel]: 0 } : {}) });
            }}
          />
        )}
        {twins.length > 0 && anySet && (
          <button
            type="button"
            className="icon-btn"
            title={`Same on all ${twins.length + 1}: give ${twins.map((t) => t.label).join(", ")} these values too`}
            aria-label={`Give ${twins.map((t) => t.label).join(", ")} the same values as ${block.label}`}
            onClick={() => {
              const changes: Record<number, number | undefined> = {};
              for (const t of twins) t.channels.forEach((c, i) => (changes[c.channel] = read(block.channels[i]!.channel).value));
              write(changes);
            }}
          >
            <Icon name="copy" size={14} />
          </button>
        )}
        {anySet && (
          <button type="button" className="icon-btn extra-unset" title="Don't set these channels" aria-label={`Don't set ${block.label}`} onClick={() => write(Object.fromEntries(block.channels.map((c) => [c.channel, undefined])))}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {block.channels.map((c) => {
        const { value, mixed } = read(c.channel);
        const info = COLOR_KINDS[c.kind]!;
        return (
          <div key={c.channel} className={value === undefined ? "extra-mini unset" : "extra-mini"}>
            <span className="extra-short" title={c.name}>
              {info.short}
            </span>
            <Slider label={c.name} value={value} mixed={mixed} color={info.css} onSet={(v) => write({ [c.channel]: v })} gesture={gesture} />
            <ValueBox label={c.name} value={value} mixed={mixed} onSet={(v) => write({ [c.channel]: v })} />
          </div>
        );
      })}
    </div>
  );
}
