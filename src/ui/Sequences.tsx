import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  colorName,
  stepLightColor,
  tidyStepColors,
  chasersIn,
  formatDuration,
  importChaser,
  isPause,
  newId,
  newStep,
  QUICK_STARTS,
  quickStart,
  sequenceMs,
  chaserFit,
  type FixtureProfile,
  type QuickStartId,
  type Rig,
  type Section,
  type Sequence,
  type SequenceOrder,
  type SequenceStep,
  type SequenceUnits,
  type Workspace,
} from "../core";
import { AddColor, cssColor } from "./ColorPicker";
import { Dropdown, DurationInput, Field, NumberInput, Segmented, type Option } from "./controls";
import { Icon } from "./icons";
import { MiniStage, type Light } from "./LightPicker";

const secs = (ms: number) => (ms >= 10000 ? `${Math.round(ms / 100) / 10} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2).replace(/0$/, "")} s` : `${Math.round(ms)} ms`);

/**
 * The Sequences card: step-by-step chasers that run on top of the section's
 * look. Sequences belong to the project, so one can be used in any section;
 * each use has its own delay.
 */
export function SequencesCard({
  s,
  sequences,
  rig,
  profiles,
  lights,
  showFile,
  palette,
  onSection,
  onSequences,
  onPlay,
  usedIn,
}: {
  /** Every section that uses each chaser, across all songs. */
  usedIn: Map<string, { song: string; section: string; sectionId: string }[]>;
  s: Section;
  sequences: Sequence[];
  rig: Rig;
  profiles: Map<number, FixtureProfile>;
  lights: Light[];
  showFile: Workspace | null;
  /** The section's colors, as color IDs or "#hex". */
  palette: string[];
  onSection: (p: Partial<Section>) => void;
  onSequences: (next: Sequence[]) => void;
  /** Replay the preview; `skipDelay` starts sequences at once. */
  onPlay: (skipDelay: boolean) => void;
}) {
  const uses = (s.sequences ?? []).filter((u) => sequences.some((q) => q.id === u.id));
  const [open, setOpen] = useState<string | null>(uses[0]?.id ?? null);
  const [notes, setNotes] = useState<string[]>([]);
  const chasers = useMemo(() => (showFile ? chasersIn(showFile) : []), [showFile]);

  /** The other sections using a chaser, besides this one. */
  const elsewhere = (id: string) => (usedIn.get(id) ?? []).filter((x) => x.sectionId !== s.id);
  const where = (x: { song: string; section: string }) => `${x.song} › ${x.section}`;
  const uniqueName = (base: string) => {
    let name = base;
    for (let n = 2; sequences.some((q) => q.name === name); n++) name = `${base} (${n})`;
    return name;
  };
  const attach = (q: Sequence, delay = 0, also: Sequence[] = []) => {
    if (also.length) onSequences([...sequences, ...also]);
    onSection({ sequences: [...(s.sequences ?? []), { id: q.id, delay }] });
    setOpen(q.id);
  };
  const addOptions: Option<string>[] = [
    ...QUICK_STARTS.map((q) => ({ value: `quick:${q.id}`, label: q.label, description: q.description, group: "Start from" })),
    { value: "blank", label: "Empty chaser", description: "Add steps yourself", group: "Start from" },
    ...chasers.map((c) => ({ value: `import:${c.id}`, label: c.name, description: `${c.path ? `${c.path} · ` : ""}${c.steps} steps · a fresh copy`, group: "Import from your QLC+ show file" })),
    // One another section uses: the same chaser (edits change both), or a copy of it.
    ...sequences
      .filter((q) => !uses.some((u) => u.id === q.id) && elsewhere(q.id).length)
      .flatMap((q) => [
        { value: `use:${q.id}`, label: `${q.name}: the same one`, description: `Used in ${elsewhere(q.id).map(where).join(", ")}. Editing it changes it there too.`, group: "Use one from another section" },
        { value: `copy:${q.id}`, label: `${q.name}: a copy`, description: "A separate copy for this section; changes stay here.", group: "Use one from another section" },
      ]),
  ];

  const add = (v: string) => {
    setNotes([]);
    if (v.startsWith("use:")) {
      const q = sequences.find((x) => x.id === v.slice(4));
      if (q) attach(q);
    } else if (v.startsWith("copy:")) {
      const q = sequences.find((x) => x.id === v.slice(5));
      if (q) {
        const copy: Sequence = { ...structuredClone(q), id: newId("seq"), name: uniqueName(`${q.name} (copy)`) };
        attach(copy, 0, [copy]);
      }
    } else if (v.startsWith("quick:")) {
      const q = quickStart(v.slice(6) as QuickStartId, rig, profiles);
      attach(q, 0, [q]);
    } else if (v === "blank") {
      const q: Sequence = { id: newId("seq"), name: `Chaser ${sequences.length + 1}`, units: "beats", order: "loop", steps: [newStep([], 1)] };
      attach(q, 0, [q]);
    } else if (v.startsWith("import:") && showFile) {
      try {
        const r = importChaser(showFile, Number(v.slice(7)), profiles);
        // A fresh copy of one imported before gets its own name, so the two can be told apart.
        r.sequence.name = uniqueName(r.sequence.name);
        attach(r.sequence, r.delay, [r.sequence]);
        setNotes([`Imported "${r.sequence.name}": ${r.sequence.steps.length} steps${r.delay ? `, starting ${r.delay} s into the section` : ""}.`, ...r.notes]);
      } catch (e) {
        setNotes([(e as Error).message]);
      }
    }
  };
  /** Take a chaser out of this section; if no other section uses it, it's gone from the project (Undo brings it back). */
  const remove = (id: string) => {
    onSection({ sequences: (s.sequences ?? []).filter((u) => u.id !== id) });
    if (!elsewhere(id).length) onSequences(sequences.filter((q) => q.id !== id));
  };
  /** Give this section its own copy of a shared chaser. */
  const separate = (q: Sequence) => {
    const copy: Sequence = { ...structuredClone(q), id: newId("seq"), name: uniqueName(`${q.name} (copy)`) };
    onSequences([...sequences, copy]);
    onSection({ sequences: (s.sequences ?? []).map((u) => (u.id === q.id ? { ...u, id: copy.id } : u)) });
    setOpen(copy.id);
  };
  const setDelay = (id: string, delay: number) => onSection({ sequences: (s.sequences ?? []).map((u) => (u.id === id ? { ...u, delay } : u)) });
  const replace = (q: Sequence) => onSequences(sequences.map((x) => (x.id === q.id ? q : x)));

  return (
    <div className="sequences">
      {uses.length === 0 && <p className="hint">Build a chaser step by step: a lightning storm, a chase across the bars, sides taking turns. It runs on top of this section's look, and lights not in a step keep that look.</p>}
      {uses.map((u) => {
        const q = sequences.find((x) => x.id === u.id)!;
        const isOpen = open === q.id;
        return (
          <div key={u.id} className={isOpen ? "seq-use open" : "seq-use"}>
            <div className="seq-use-row">
              <button type="button" className="seq-use-name" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen}>
                <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={16} />
                <strong>{q.name}</strong>
                <small>
                  {q.steps.length} steps · {secs(sequenceMs(q, s.bpm))}
                  {q.order === "loop" ? " · loops" : q.order === "bounce" ? " · back and forth" : ""}
                </small>
              </button>
              <label className="seq-delay">
                <span>Starts after</span>
                <DurationInput label={`${q.name} starts after`} valueMs={u.delay * 1000} maxMs={600_000} stepMs={100} onChange={(ms) => setDelay(u.id, ms / 1000)} />
              </label>
              <button type="button" className="cue-action" onClick={() => onPlay(false)} title="Play this section in the preview from the start, delay included" aria-label="Play from the start">
                <Icon name="play" size={15} />
              </button>
              <button type="button" className="cue-action danger" onClick={() => remove(u.id)} title={elsewhere(q.id).length ? `Remove from this section (it stays in ${elsewhere(q.id).map(where).join(", ")})` : "Remove this chaser (Undo brings it back)"} aria-label={`Remove ${q.name}`}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <ChaserTiming q={q} delay={u.delay} s={s} onFit={(bars) => onSection({ bars })} />
            {elsewhere(q.id).length > 0 && (
              <div className="seq-shared">
                <Icon name="link" size={14} />
                <span>
                  Shared with {elsewhere(q.id).map(where).join(", ")}. Editing it here changes it there too.
                </span>
                <button type="button" className="ghost small" onClick={() => separate(q)}>
                  Make a separate copy
                </button>
              </div>
            )}
            {isOpen && <SequenceEditor q={q} delay={u.delay} bpm={s.bpm} lights={lights} palette={palette} onChange={replace} onPlay={() => onPlay(true)} />}
          </div>
        );
      })}
      {notes.length > 0 && (
        <div className="notice" role="status">
          <Icon name="info" />
          <div>
            {notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
          <button type="button" className="ghost small" onClick={() => setNotes([])}>
            OK
          </button>
        </div>
      )}
      <Field label={uses.length ? "Add another chaser" : "Add a chaser"} hint={showFile ? undefined : "Load your show file on the Stage page to import its chasers."}>
        <Dropdown label="Add a chaser" value="" placeholder="Choose…" options={addOptions} onChange={add} className="wide" />
      </Field>
    </div>
  );
}

/** Edit one sequence: its timing units and run order, and each step. */
function SequenceEditor({ q, delay, bpm, lights, palette, onChange, onPlay }: { q: Sequence; delay: number; bpm: number; lights: Light[]; palette: string[]; onChange: (q: Sequence) => void; onPlay: () => void }) {
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, q.steps.length - 1);
  const st = q.steps[i];
  const setSteps = (steps: SequenceStep[], select?: number) => {
    onChange({ ...q, steps });
    if (select !== undefined) setSel(select);
  };
  const patch = (p: Partial<SequenceStep>) => st && setSteps(q.steps.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const setUnits = (units: SequenceUnits) => {
    if (units === q.units) return;
    // Keep the timing the same at this section's tempo.
    const conv = (v: number) => (units === "beats" ? Math.round(((v * bpm) / 60000) * 100) / 100 : Math.round((v * 60000) / bpm));
    onChange({ ...q, units, steps: q.steps.map((x) => ({ ...x, fadeIn: conv(x.fadeIn), hold: conv(x.hold), fadeOut: conv(x.fadeOut) })) });
  };
  const insert = (step: SequenceStep) => setSteps([...q.steps.slice(0, i + 1), step, ...q.steps.slice(i + 1)], i + 1);
  const move = (dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= q.steps.length) return;
    const next = [...q.steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next, j);
  };
  const lightSet = new Set(st?.lights ?? []);
  // Select lights on the plan, then pick a color: like a lighting desk.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const stepId = st?.id;
  useEffect(() => setSelected(new Set()), [stepId]);
  const mixed = !!st?.lightColors && Object.keys(st.lightColors).length > 0;
  /** Set the step's lights and their colors, keeping its data tidy. */
  const paint = (ids: number[], colorOf: (id: number) => string) => st && patch(tidyStepColors({ ...st, lights: ids }, colorOf));
  const toggle = (l: Light) => {
    const next = new Set(selected);
    if (next.has(l.id)) next.delete(l.id);
    else next.add(l.id);
    setSelected(next);
  };
  const pickColor = (c: string) => {
    if (!st) return;
    const now = (id: number) => stepLightColor(st, id);
    // Selected lights come on in this color; with nothing selected, the whole step changes color.
    if (selected.size) paint([...new Set([...st.lights, ...selected])], (id) => (selected.has(id) ? c : now(id)));
    else paint(st.lights, () => c);
  };
  const turnOff = () => st && paint(st.lights.filter((id) => !selected.has(id)), (id) => stepLightColor(st, id));
  // The ringed swatch: the selected lights' color when they share one, otherwise the step's.
  const selColors = st ? [...new Set([...selected].filter((id) => lightSet.has(id)).map((id) => stepLightColor(st, id)))] : [];
  const shown = selected.size ? (selColors.length === 1 && [...selected].every((id) => lightSet.has(id)) ? selColors[0] : undefined) : mixed ? undefined : (st?.color ?? "white");
  const byRole = (role: string) => lights.filter((l) => l.role === role).map((l) => l.id);
  const lensColors = new Map((st?.lights ?? []).map((id) => [id, ((c) => (c === "white" ? "#ffffff" : cssColor(c)))(stepLightColor(st!, id))]));
  // The section's colors, plus any this step already uses (an imported chaser brings its own).
  // White, the colors this chaser already uses (in any step), then the section's colors.
  const chaserColors = q.steps.flatMap((x) => x.lights.map((id) => stepLightColor(x, id)));
  const colorChoices = [...new Set(["white", ...chaserColors, ...palette])];
  // This step's colors, with the lights in each: shown as a key under the plan.
  const stepKey = st ? [...new Set(st.lights.map((id) => stepLightColor(st, id)))].map((c) => ({ c, ids: st.lights.filter((id) => stepLightColor(st, id) === c) })) : [];
  const nameOfLight = (id: number) => lights.find((l) => l.id === id)?.name ?? `Fixture ${id}`;
  const defaultHold = q.units === "ms" ? 100 : 1;

  return (
    <div className="seq-editor">
      <div className="seq-top">
        <input className="position-name" value={q.name} aria-label="Chaser name" onChange={(e) => onChange({ ...q, name: e.target.value })} />
      </div>
      <div className="seq-settings">
        <Field label="Runs">
          <Segmented
            label="Runs"
            value={q.order}
            onChange={(order: SequenceOrder) => onChange({ ...q, order })}
            options={[
              { value: "once", label: "Once" },
              { value: "loop", label: "On a loop" },
              { value: "bounce", label: "Back and forth" },
            ]}
          />
        </Field>
        <Field label="Times in">
          <Segmented
            label="Times in"
            value={q.units}
            onChange={setUnits}
            options={[
              { value: "ms", label: "Milliseconds" },
              { value: "beats", label: "Beats" },
            ]}
          />
        </Field>
      </div>

      <div className="seq-tools">
        <button type="button" className="ghost small" onClick={() => insert(newStep(st?.lights ?? [], defaultHold, { color: st?.color }))} title="Add a step after the selected one, with the same lights">
          <Icon name="plus" size={14} /> Step
        </button>
        <button type="button" className="ghost small" onClick={() => insert(newStep([], defaultHold))} title="Add a step with no lights: the look shows through">
          <Icon name="plus" size={14} /> Pause
        </button>
        <button type="button" className="ghost small" disabled={!st} onClick={() => st && insert({ ...st, id: newId("st"), lights: [...st.lights] })}>
          <Icon name="copy" size={14} /> Duplicate
        </button>
        <button type="button" className="ghost small" disabled={i <= 0} onClick={() => move(-1)} aria-label="Move step up" title="Move up">
          <Icon name="chevronUp" size={15} />
        </button>
        <button type="button" className="ghost small" disabled={i >= q.steps.length - 1} onClick={() => move(1)} aria-label="Move step down" title="Move down">
          <Icon name="chevronDown" size={15} />
        </button>
        <button type="button" className="ghost small danger" disabled={q.steps.length <= 1} onClick={() => setSteps(q.steps.filter((_, k) => k !== i), Math.max(0, i - 1))}>
          <Icon name="trash" size={14} /> Delete
        </button>
        <button type="button" className="ghost small seq-play" onClick={onPlay} title="Play the preview with this section's chasers starting right away">
          <Icon name="play" size={14} /> Play now
        </button>
      </div>

      {/* The steps, one row each as in QLC+'s chaser editor: times are edited right in the row. */}
      <div className="seq-table-wrap">
        <table className="seq-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Lights</th>
              <th scope="col">Fade in</th>
              <th scope="col">Hold</th>
              <th scope="col">Fade out</th>
              <th scope="col" title="When the step ends, from the start of the chaser">Ends at</th>
            </tr>
          </thead>
          <tbody
            onKeyDown={(e) => {
              if ((e.target as HTMLElement).tagName === "INPUT") return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(0, Math.min(q.steps.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
              }
            }}
          >
            {delay > 0 && (
              <tr className="seq-wait-row">
                <td>–</td>
                <td colSpan={5}>In this section it waits {formatDuration(delay * 1000)} first (Starts after, above)</td>
              </tr>
            )}
            {q.steps.map((x, k) => {
              const ends = q.steps.slice(0, k + 1).reduce((t, y) => t + y.fadeIn + y.hold, 0);
              const time = (field: "fadeIn" | "hold" | "fadeOut", label: string) =>
                q.units === "ms" ? (
                  <DurationInput label={`Step ${k + 1} ${label}`} valueMs={x[field]} minMs={field === "hold" ? 1 : 0} maxMs={field === "hold" ? 600000 : 60000} stepMs={10} bare="ms" onChange={(v) => setSteps(q.steps.map((y, j) => (j === k ? { ...y, [field]: v } : y)))} />
                ) : (
                  <NumberInput label={`Step ${k + 1} ${label}`} value={x[field]} min={field === "hold" ? 0.05 : 0} max={field === "hold" ? 256 : 64} step={0.25} suffix="beats" onChange={(v) => setSteps(q.steps.map((y, j) => (j === k ? { ...y, [field]: v } : y)))} />
                );
              return (
                <tr
                  key={x.id}
                  className={`${k === i ? "on" : ""}${isPause(x) ? " pause" : ""}`}
                  aria-selected={k === i}
                  tabIndex={k === i ? 0 : -1}
                  onClick={() => setSel(k)}
                  onFocusCapture={() => k !== i && setSel(k)}
                >
                  <td className="seq-n">{k + 1}</td>
                  <td className="seq-lights">
                    <span>
                      {[...new Set(x.lights.map((id) => stepLightColor(x, id)))].slice(0, 3).map((c) => (
                        <i key={c} className="seq-swatch" style={{ "--c": c === "white" ? "#ffffff" : cssColor(c) } as CSSProperties} aria-hidden="true" />
                      ))}
                      {isPause(x) && <i className="seq-swatch" aria-hidden="true" />}
                      {isPause(x) ? "Pause" : `${x.lights.length} light${x.lights.length === 1 ? "" : "s"}`}
                    </span>
                  </td>
                  <td>{time("fadeIn", "fade in")}</td>
                  <td>{time("hold", "hold")}</td>
                  <td>{time("fadeOut", "fade out")}</td>
                  <td className="seq-ends">{q.units === "ms" ? formatDuration(ends) : `${Math.round(ends * 100) / 100} b`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {st && (
        <div className="seq-step-editor">
          <h4 className="subhead">
            Step {i + 1}: {isPause(st) ? "pause" : `${st.lights.length} light${st.lights.length === 1 ? "" : "s"}`}, color and brightness
          </h4>
          <div className="seq-step-grid">
            <div>
              <MiniStage
                lights={lights}
                set={lightSet}
                usable={(l) => l.role !== "ignore"}
                onToggle={(l) => toggle(l)}
                onHover={() => undefined}
                lensColors={lensColors}
                selected={selected}
                describe={(l) => (st.lights.includes(l.id) ? `${colorName(stepLightColor(st, l.id))}${(st.level ?? 1) < 1 ? ` at ${Math.round((st.level ?? 1) * 100)}%` : ""}` : "off in this step")}
              />
              {stepKey.length > 0 && (
                <ul className="seq-key" aria-label="Colors in this step">
                  {stepKey.map(({ c, ids }) => (
                    <li key={c}>
                      <button type="button" className="seq-key-item" onClick={() => setSelected(new Set(ids))} title={`Select the lights in ${colorName(c)}: ${ids.map(nameOfLight).join(", ")}`}>
                        <i style={{ background: c === "white" ? "#ffffff" : cssColor(c) }} aria-hidden="true" />
                        <span>{colorName(c)}</span>
                        <small>
                          {ids.length} {ids.length === 1 ? "light" : "lights"}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="seq-quick">
                <span>Select</span>
                <button type="button" className="chip" onClick={() => setSelected(new Set(lights.map((l) => l.id)))}>
                  All
                </button>
                {byRole("backdrop").length > 0 && (
                  <button type="button" className="chip" onClick={() => setSelected(new Set(byRole("backdrop")))}>
                    Backdrop
                  </button>
                )}
                {byRole("side").length > 0 && (
                  <button type="button" className="chip" onClick={() => setSelected(new Set(byRole("side")))}>
                    Wash lights
                  </button>
                )}
                {byRole("mover").length > 0 && (
                  <button type="button" className="chip" onClick={() => setSelected(new Set(byRole("mover")))}>
                    Moving heads
                  </button>
                )}
                <button type="button" className="chip" onClick={() => setSelected(new Set(st?.lights ?? []))}>
                  Lit ones
                </button>
                {selected.size > 0 && (
                  <button type="button" className="chip" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                )}
              </div>
              <div className="seq-quick">
                <span>{selected.size ? `${selected.size} selected` : "Nothing selected"}</span>
                <button type="button" className="chip" disabled={!selected.size || ![...selected].some((id) => lightSet.has(id))} onClick={turnOff}>
                  Turn off
                </button>
                <button type="button" className="chip" disabled={!st?.lights.length} onClick={() => st && paint([], () => "white")} title="Turn every light in this step off: the look shows through">
                  Make it a pause
                </button>
              </div>
            </div>
            <div className="seq-step-fields">
              <Field label={selected.size ? `Color for the ${selected.size} selected` : "Color for the whole step"} hint="Click lights on the plan to select them (lit or not), then pick a color: they come on in it. With nothing selected, a color changes every light in the step.">
                <div className="seq-colors" role="radiogroup" aria-label="Step color">
                  {colorChoices.map((c) => {
                    const on = shown === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? "seq-color on" : "seq-color"}
                        style={{ background: c === "white" ? "#ffffff" : cssColor(c) }}
                        title={colorName(c)}
                        aria-label={colorName(c)}
                        onClick={() => pickColor(c)}
                      />
                    );
                  })}
                  <AddColor compact label="More colors: gels or any color" title="More colors: gels or any color" chosen={colorChoices} full={false} onAdd={(c) => pickColor(c)} />
                </div>
              </Field>
              <Field label={`Brightness ${Math.round((st.level ?? 1) * 100)}%`}>
                <input type="range" min={5} max={100} value={Math.round((st.level ?? 1) * 100)} aria-label="Step brightness" onChange={(e) => patch({ level: +e.target.value >= 100 ? undefined : +e.target.value / 100 })} />
              </Field>
              <p className="hint">
                {q.units === "beats" ? `At this section's ${bpm} BPM, a beat is ${Math.round(60000 / bpm)} ms. ` : ""}Changes apply everywhere this chaser is used. Times are set in the table above. Pop out the preview to keep it beside you while you edit.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * When a chaser starts and ends against the section's length, in words, with
 * a button to fit the section to it (rounded up to whole bars).
 */
function ChaserTiming({ q, delay, s, onFit }: { q: Sequence; delay: number; s: Section; onFit: (bars: number) => void }) {
  const fit = chaserFit(q, delay, s);
  const t = (ms: number) => formatDuration(Math.round(ms));
  const bad = fit.overMs > 0 || fit.earlyMs > 2000;
  const fitMs = (fit.fitBars * 60000 * s.beatsPerBar) / s.bpm;
  return (
    <div className={bad ? "seq-timing warn" : "seq-timing"}>
      <span>
        Starts at {t(fit.startMs)}, {fit.repeats ? "first run ends" : "ends"} at {t(fit.endMs)} · the section is {t(fit.sectionMs)}.{" "}
        {fit.overMs > 0
          ? fit.repeats
            ? `Its first run is ${t(fit.overMs)} longer than the section.`
            : `It runs ${t(fit.overMs)} past the end of the section, so the end is cut off.`
          : fit.earlyMs > 2000
            ? `It finishes ${t(fit.earlyMs)} before the section ends; the look shows after that.`
            : fit.repeats
              ? "It repeats until the section ends."
              : ""}
      </span>
      {fit.fitBars !== s.bars && (
        <button type="button" className="ghost small" onClick={() => onFit(fit.fitBars)} title={`Set the section to ${fit.fitBars} bars (${t(fitMs)}), ${t(fitMs - fit.endMs)} longer than the chaser: sections are whole bars`}>
          <Icon name="fit" size={14} /> Fit the section to it ({fit.fitBars} bars)
        </button>
      )}
    </div>
  );
}
