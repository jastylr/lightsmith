import { useMemo, useState, type CSSProperties } from "react";
import {
  chasersIn,
  colorById,
  formatDuration,
  importChaser,
  isPause,
  newId,
  newStep,
  QUICK_STARTS,
  quickStart,
  sequenceMs,
  toMs,
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
import { cssColor } from "./ColorPicker";
import { askConfirm } from "./ConfirmDialog";
import { Dropdown, DurationInput, Field, NumberInput, Segmented, type Option } from "./controls";
import { Icon } from "./icons";
import { MiniStage, type Light } from "./LightPicker";

const secs = (ms: number) => (ms >= 10000 ? `${Math.round(ms / 100) / 10} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2).replace(/0$/, "")} s` : `${Math.round(ms)} ms`);
const stepColor = (st: SequenceStep) => (st.color ? cssColor(st.color) : "#ffffff");

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
}: {
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

  const attach = (q: Sequence, delay = 0, also: Sequence[] = []) => {
    if (also.length) onSequences([...sequences, ...also]);
    onSection({ sequences: [...(s.sequences ?? []), { id: q.id, delay }] });
    setOpen(q.id);
  };
  const addOptions: Option<string>[] = [
    ...sequences.filter((q) => !uses.some((u) => u.id === q.id)).map((q) => ({ value: `use:${q.id}`, label: q.name, description: `${q.steps.length} steps`, group: "Your sequences" })),
    ...QUICK_STARTS.map((q) => ({ value: `quick:${q.id}`, label: q.label, description: q.description, group: "Start from" })),
    { value: "blank", label: "Empty sequence", description: "Add steps yourself", group: "Start from" },
    ...chasers.map((c) => ({ value: `import:${c.id}`, label: c.name, description: `${c.path ? `${c.path} · ` : ""}${c.steps} steps`, group: "Import a chaser from your show file" })),
  ];
  const add = (v: string) => {
    setNotes([]);
    if (v.startsWith("use:")) {
      const q = sequences.find((x) => x.id === v.slice(4));
      if (q) attach(q);
    } else if (v.startsWith("quick:")) {
      const q = quickStart(v.slice(6) as QuickStartId, rig, profiles);
      attach(q, 0, [q]);
    } else if (v === "blank") {
      const q: Sequence = { id: newId("seq"), name: `Sequence ${sequences.length + 1}`, units: "beats", order: "loop", steps: [newStep([], 1)] };
      attach(q, 0, [q]);
    } else if (v.startsWith("import:") && showFile) {
      try {
        const r = importChaser(showFile, Number(v.slice(7)), profiles);
        attach(r.sequence, r.delay, [r.sequence]);
        setNotes([`Imported "${r.sequence.name}": ${r.sequence.steps.length} steps${r.delay ? `, starting ${r.delay} s into the section` : ""}.`, ...r.notes]);
      } catch (e) {
        setNotes([(e as Error).message]);
      }
    }
  };
  const remove = (id: string) => onSection({ sequences: (s.sequences ?? []).filter((u) => u.id !== id) });
  const setDelay = (id: string, delay: number) => onSection({ sequences: (s.sequences ?? []).map((u) => (u.id === id ? { ...u, delay } : u)) });
  const replace = (q: Sequence) => onSequences(sequences.map((x) => (x.id === q.id ? q : x)));
  const destroy = async (q: Sequence) => {
    const elsewhere = "It's removed from every section that uses it.";
    if (!(await askConfirm({ title: `Delete "${q.name}"?`, message: elsewhere, confirmLabel: "Delete sequence", danger: true }))) return;
    onSequences(sequences.filter((x) => x.id !== q.id));
    remove(q.id);
  };

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
              <button type="button" className="cue-action danger" onClick={() => remove(u.id)} title="Take this sequence out of the section (it stays in your sequences)" aria-label={`Remove ${q.name} from this section`}>
                <Icon name="x" size={15} />
              </button>
            </div>
            {isOpen && <SequenceEditor q={q} delay={u.delay} bpm={s.bpm} lights={lights} palette={palette} onChange={replace} onDelete={() => destroy(q)} onPlay={() => onPlay(true)} />}
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
      <Field label={uses.length ? "Add another sequence" : "Add a sequence"} hint={showFile ? undefined : "Load your show file on the Show file page to import its chasers."}>
        <Dropdown label="Add a sequence" value="" placeholder="Choose…" options={addOptions} onChange={add} className="wide" />
      </Field>
    </div>
  );
}

/** Edit one sequence: its timing units and run order, and each step. */
function SequenceEditor({ q, delay, bpm, lights, palette, onChange, onDelete, onPlay }: { q: Sequence; delay: number; bpm: number; lights: Light[]; palette: string[]; onChange: (q: Sequence) => void; onDelete: () => void; onPlay: () => void }) {
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, q.steps.length - 1);
  const st = q.steps[i];
  const unit = q.units === "ms" ? "ms" : "beats";
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
  const toggle = (l: Light) => patch({ lights: lightSet.has(l.id) ? st!.lights.filter((x) => x !== l.id) : [...st!.lights, l.id] });
  const byRole = (role: string) => lights.filter((l) => l.role === role).map((l) => l.id);
  const colorChoices = ["white", ...palette.filter((c, k) => c !== "white" && palette.indexOf(c) === k)];
  const defaultHold = q.units === "ms" ? 100 : 1;

  return (
    <div className="seq-editor">
      <div className="seq-top">
        <input className="position-name" value={q.name} aria-label="Sequence name" onChange={(e) => onChange({ ...q, name: e.target.value })} />
        <button type="button" className="cue-action danger" onClick={onDelete} title="Delete this sequence everywhere" aria-label={`Delete ${q.name}`}>
          <Icon name="trash" size={15} />
        </button>
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

      <div className="seq-strip" role="listbox" aria-label="Steps">
        {delay > 0 && (
          <div className="seq-step seq-wait" title={`In this section, the sequence starts ${delay} s in. Change it with "Starts after" above; the export puts it back as a first step.`}>
            <span className="seq-step-n">Wait</span>
            <i aria-hidden="true" />
            <small>{delay} s</small>
          </div>
        )}
        {q.steps.map((x, k) => (
          <button
            key={x.id}
            type="button"
            role="option"
            aria-selected={k === i}
            className={`seq-step${k === i ? " on" : ""}${isPause(x) ? " pause" : ""}`}
            style={{ "--c": stepColor(x), "--w": `${Math.max(2.4, Math.min(7, 1.6 + Math.log2(1 + toMs(x.fadeIn + x.hold, q.units, bpm) / 40)))}rem` } as CSSProperties}
            onClick={() => setSel(k)}
            title={isPause(x) ? "Pause" : `${x.lights.length} light${x.lights.length === 1 ? "" : "s"}`}
          >
            <span className="seq-step-n">{k + 1}</span>
            <i aria-hidden="true" />
            <small>{q.units === "ms" ? formatDuration(x.fadeIn + x.hold) : Math.round((x.fadeIn + x.hold) * 100) / 100}</small>
          </button>
        ))}
      </div>
      <div className="seq-tools">
        <button type="button" className="ghost small" onClick={() => insert(newStep(st?.lights ?? [], defaultHold, { color: st?.color }))}>
          <Icon name="plus" size={14} /> Step
        </button>
        <button type="button" className="ghost small" onClick={() => insert(newStep([], defaultHold))}>
          <Icon name="plus" size={14} /> Pause
        </button>
        <button type="button" className="ghost small" disabled={!st} onClick={() => st && insert({ ...st, id: newId("st"), lights: [...st.lights] })}>
          <Icon name="copy" size={14} /> Duplicate
        </button>
        <button type="button" className="ghost small" disabled={i <= 0} onClick={() => move(-1)} aria-label="Move step earlier">
          ← Earlier
        </button>
        <button type="button" className="ghost small" disabled={i >= q.steps.length - 1} onClick={() => move(1)} aria-label="Move step later">
          Later →
        </button>
        <button type="button" className="ghost small danger" disabled={q.steps.length <= 1} onClick={() => setSteps(q.steps.filter((_, k) => k !== i), Math.max(0, i - 1))}>
          <Icon name="trash" size={14} /> Delete step
        </button>
        <button type="button" className="ghost small seq-play" onClick={onPlay} title="Play the preview with this section's sequences starting right away">
          <Icon name="play" size={14} /> Play now
        </button>
      </div>

      {st && (
        <div className="seq-step-editor">
          <h4 className="subhead">
            Step {i + 1} {isPause(st) ? "· pause" : `· ${st.lights.length} light${st.lights.length === 1 ? "" : "s"}`}
          </h4>
          <div className="seq-step-grid">
            <div>
              <MiniStage lights={lights} set={lightSet} usable={(l) => l.role !== "ignore"} onToggle={(l) => toggle(l)} onHover={() => undefined} />
              <div className="seq-quick">
                <span>Lights</span>
                <button type="button" className="chip" onClick={() => patch({ lights: lights.map((l) => l.id) })}>
                  All
                </button>
                {byRole("backdrop").length > 0 && (
                  <button type="button" className="chip" onClick={() => patch({ lights: byRole("backdrop") })}>
                    Backdrop
                  </button>
                )}
                {byRole("side").length > 0 && (
                  <button type="button" className="chip" onClick={() => patch({ lights: byRole("side") })}>
                    Wash lights
                  </button>
                )}
                {byRole("mover").length > 0 && (
                  <button type="button" className="chip" onClick={() => patch({ lights: byRole("mover") })}>
                    Moving heads
                  </button>
                )}
                <button type="button" className="chip" onClick={() => patch({ lights: [] })}>
                  None (pause)
                </button>
              </div>
            </div>
            <div className="seq-step-fields">
              <Field label="Color">
                <div className="seq-colors" role="radiogroup" aria-label="Step color">
                  {colorChoices.map((c) => {
                    const on = c === "white" ? !st.color : st.color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? "seq-color on" : "seq-color"}
                        style={{ background: c === "white" ? "#ffffff" : cssColor(c) }}
                        title={c === "white" ? "White" : colorById(c).label}
                        onClick={() => patch({ color: c === "white" ? undefined : c })}
                      />
                    );
                  })}
                  <label className="seq-color custom" title="Any color">
                    <input type="color" value={st.color?.startsWith("#") ? st.color : "#ffffff"} onChange={(e) => patch({ color: e.target.value })} aria-label="Any color" />
                  </label>
                </div>
              </Field>
              <Field label={`Brightness ${Math.round((st.level ?? 1) * 100)}%`}>
                <input type="range" min={5} max={100} value={Math.round((st.level ?? 1) * 100)} aria-label="Step brightness" onChange={(e) => patch({ level: +e.target.value >= 100 ? undefined : +e.target.value / 100 })} />
              </Field>
              <div className="seq-times">
                <Field label="Fade in">
                  {q.units === "ms" ? (
                    <DurationInput label="Fade in" valueMs={st.fadeIn} maxMs={60000} stepMs={10} bare="ms" onChange={(fadeIn) => patch({ fadeIn })} />
                  ) : (
                    <NumberInput label="Fade in" value={st.fadeIn} min={0} max={64} step={0.25} suffix={unit} onChange={(fadeIn) => patch({ fadeIn })} />
                  )}
                </Field>
                <Field label="Hold">
                  {q.units === "ms" ? (
                    <DurationInput label="Hold" valueMs={st.hold} minMs={1} maxMs={600000} stepMs={10} bare="ms" onChange={(hold) => patch({ hold })} />
                  ) : (
                    <NumberInput label="Hold" value={st.hold} min={0.05} max={256} step={0.25} suffix={unit} onChange={(hold) => patch({ hold })} />
                  )}
                </Field>
                <Field label="Fade out">
                  {q.units === "ms" ? (
                    <DurationInput label="Fade out" valueMs={st.fadeOut} maxMs={60000} stepMs={10} bare="ms" onChange={(fadeOut) => patch({ fadeOut })} />
                  ) : (
                    <NumberInput label="Fade out" value={st.fadeOut} min={0} max={64} step={0.25} suffix={unit} onChange={(fadeOut) => patch({ fadeOut })} />
                  )}
                </Field>
              </div>
              <p className="hint">
                {q.units === "beats" ? `At this section's ${bpm} BPM, a beat is ${Math.round(60000 / bpm)} ms. ` : ""}Changes apply everywhere this sequence is used. Pop out the preview to keep it beside you while you edit.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
