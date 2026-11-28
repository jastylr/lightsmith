import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARCS,
  DEFAULT_MOMENTS,
  MOMENTS,
  SECTION_TYPES,
  SONG_TEMPLATES,
  VIBES,
  buildSong,
  isBlackout,
  moodById,
  planFromMarks,
  planFromTemplate,
  renumber,
  sectionMs,
  sectionTypeById,
  type PlannedSection,
  type Rig,
  type Section,
  type Sequence,
  type Song,
} from "../core";
import { cssColor } from "./ColorPicker";
import { Dropdown, Field, NumberInput, TapTempo } from "./controls";
import { Icon } from "./icons";
import { StagePreview } from "./StagePreview";

const STEPS = ["The song", "Structure", "Vibe", "Energy", "Moments", "Review"] as const;

const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/**
 * "Build a song with me": a few questions with big visual choices (the song,
 * its structure, a vibe, an energy arc, some signature moments), a live
 * preview that follows every choice, and the finished song at the end. Every
 * section it makes can be edited afterwards like any other.
 */
export function SongBuilder({ song, rig, sequences, hasMovers, onDone, onClose }: { song: Song; rig: Rig; sequences: Sequence[]; hasMovers: boolean; onDone: (patch: Pick<Song, "title" | "bpm" | "sections">, recording?: File) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(song.title === "New song" || song.title === "Untitled song" ? "" : song.title);
  const [bpm, setBpm] = useState(song.bpm);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [mode, setMode] = useState<"template" | "marks">("template");
  const [template, setTemplate] = useState("short");
  const [sections, setSections] = useState<PlannedSection[]>(() => planFromTemplate("short"));
  const [vibe, setVibe] = useState("rock");
  const [arc, setArc] = useState("punch");
  const [moments, setMoments] = useState<string[]>(DEFAULT_MOMENTS);
  const [recording, setRecording] = useState<{ file: File; url: string; durationMs: number } | null>(null);
  const [marks, setMarks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => () => (recording ? URL.revokeObjectURL(recording.url) : undefined), [recording]);

  const plan = { bpm, beatsPerBar, sections, vibe, arc, moments };
  const built = useMemo(() => buildSong(plan, { hasMovers }), [bpm, beatsPerBar, sections, vibe, arc, moments, hasMovers]);
  // The section the preview shows: the one picked, else the first chorus, else the biggest.
  const lit = built.filter((s) => !isBlackout(s));
  const focus = (picked !== null ? built[picked] : undefined) ?? lit.find((s) => s.type === "chorus") ?? lit.reduce<Section | undefined>((a, b) => (!a || b.energy > a.energy ? b : a), undefined);

  const canNext = step === 0 ? bpm >= 30 : step === 1 ? sections.length > 0 : true;
  const finish = () => {
    onDone({ title: title.trim() || "Untitled song", bpm, sections: built.map((s) => ({ ...s, bpm })) }, recording?.file);
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="builder" aria-labelledby="builder-title" onClose={onClose}>
      <div className="builder-box">
        <header className="builder-head">
          <div>
            <h2 id="builder-title">Build a song with me</h2>
            <p className="hint">A few questions, then a finished song you can fine-tune. The preview follows every choice.</p>
          </div>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close without making the song">
            <Icon name="x" size={16} />
          </button>
        </header>

        <ol className="builder-steps" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button type="button" className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => (i <= step || canNext ? setStep(i) : undefined)} disabled={i > step + 1 || (i > step && !canNext)}>
                <span className="builder-step-num">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <div className="builder-body">
          <div className="builder-main">
            {step === 0 && (
              <div className="builder-page">
                <h3>What are we lighting?</h3>
                <Field label="Song title">
                  <input className="builder-title-input" value={title} placeholder="Song title" onChange={(e) => setTitle(e.target.value)} autoFocus />
                </Field>
                <div className="builder-row">
                  <Field label="Tempo" hint="Tap along to find it">
                    <span className="tempo-pair">
                      <NumberInput label="Tempo in BPM" value={bpm} min={30} max={300} suffix="BPM" onChange={setBpm} />
                      <TapTempo label="Tempo" onTempo={setBpm} />
                    </span>
                  </Field>
                  <Field label="Beats per bar">
                    <Dropdown label="Beats per bar" value={String(beatsPerBar)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} onChange={(v) => setBeatsPerBar(+v)} />
                  </Field>
                </div>
                <Field label="The recording (optional)" hint="Lets you mark the sections while it plays, and lays the song out against the music.">
                  <label className="builder-file">
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        const probe = new Audio(url);
                        probe.addEventListener("loadedmetadata", () => {
                          setRecording({ file, url, durationMs: probe.duration * 1000 });
                          setMarks([]);
                        });
                        if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
                      }}
                    />
                    <Icon name="music" size={16} />
                    {recording ? (
                      <span>
                        <strong>{recording.file.name}</strong> ({clock(recording.durationMs)})
                      </span>
                    ) : (
                      <span>Choose an audio file</span>
                    )}
                  </label>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="builder-page">
                <h3>How does the song go?</h3>
                <div className="builder-choices two" role="radiogroup" aria-label="How to lay out the sections">
                  <button type="button" role="radio" aria-checked={mode === "template"} className={mode === "template" ? "choice on" : "choice"} onClick={() => { setMode("template"); setSections(planFromTemplate(template)); }}>
                    <strong>A common structure</strong>
                    <span>Pick the shape closest to the song, then adjust the parts and lengths.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={mode === "marks"} className={mode === "marks" ? "choice on" : "choice"} disabled={!recording} onClick={() => setMode("marks")} title={recording ? undefined : "Add the recording on the first step to mark sections while it plays"}>
                    <strong>Mark it while it plays</strong>
                    <span>{recording ? "Play the recording and press M (or the button) each time a new section starts." : "Needs the recording, from the first step."}</span>
                  </button>
                </div>
                {mode === "template" ? (
                  <div className="builder-templates">
                    {SONG_TEMPLATES.map((t) => (
                      <button key={t.id} type="button" className={template === t.id ? "template on" : "template"} aria-pressed={template === t.id} onClick={() => { setTemplate(t.id); setSections(planFromTemplate(t.id)); setPicked(null); }}>
                        <span className="template-strip" aria-hidden="true">
                          {t.sections.map((type, i) => (
                            <i key={i} style={{ height: `${30 + sectionTypeById(type).energy * 14}%`, background: cssColor(moodById(sectionTypeById(type).mood).colors[0]!) }} />
                          ))}
                        </span>
                        <strong>{t.label}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  recording && <Marker recording={recording} marks={marks} onMarks={(m) => { setMarks(m); setSections(planFromMarks(m, recording.durationMs, bpm, beatsPerBar)); setPicked(null); }} />
                )}
                <PlanList sections={sections} bpm={bpm} beatsPerBar={beatsPerBar} onChange={(next) => { setSections(next); setPicked(null); }} />
              </div>
            )}

            {step === 2 && (
              <div className="builder-page">
                <h3>What's the vibe?</h3>
                <p className="hint">Sets the mood for each kind of section. You can change any section's mood afterwards.</p>
                <div className="builder-choices" role="radiogroup" aria-label="Vibe">
                  {VIBES.map((v) => (
                    <button key={v.id} type="button" role="radio" aria-checked={vibe === v.id} className={vibe === v.id ? "choice vibe on" : "choice vibe"} onClick={() => setVibe(v.id)}>
                      <span className="vibe-swatches" aria-hidden="true">
                        {["verse", "chorus", "bridge"].map((type) => (
                          <span key={type}>
                            {moodById(v.moods[type] ?? v.moods.default!).colors.slice(0, 3).map((c) => (
                              <i key={c} style={{ background: cssColor(c) }} />
                            ))}
                          </span>
                        ))}
                      </span>
                      <strong>{v.label}</strong>
                      <span>{v.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="builder-page">
                <h3>How should the energy move?</h3>
                <p className="hint">Energy sets how bright and busy each section is. Drawn here for your song's sections; you can drag any of them up or down on the timeline later.</p>
                <div className="builder-choices" role="radiogroup" aria-label="Energy arc">
                  {ARCS.map((a) => {
                    const e = a.energies(sections);
                    const w = 200;
                    const pts = e.map((v, i) => `${(i + 0.5) * (w / Math.max(1, e.length))},${54 - v * 9}`).join(" ");
                    return (
                      <button key={a.id} type="button" role="radio" aria-checked={arc === a.id} className={arc === a.id ? "choice arc on" : "choice arc"} onClick={() => setArc(a.id)}>
                        <svg viewBox={`0 0 ${w} 56`} className="arc-curve" aria-hidden="true">
                          {e.map((v, i) => (
                            <rect key={i} x={i * (w / e.length) + 1.5} y={54 - v * 9} width={w / e.length - 3} height={v * 9} rx="2" />
                          ))}
                          <polyline points={pts} />
                        </svg>
                        <strong>{a.label}</strong>
                        <span>{a.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="builder-page">
                <h3>Any signature moments?</h3>
                <p className="hint">The touches that make a show feel designed. Tick any you want.</p>
                <div className="builder-moments">
                  {MOMENTS.filter((m) => !m.needsMovers || hasMovers).map((m) => {
                    const on = moments.includes(m.id);
                    return (
                      <label key={m.id} className={on ? "moment on" : "moment"}>
                        <input type="checkbox" checked={on} onChange={() => setMoments(on ? moments.filter((x) => x !== m.id) : [...moments, m.id])} />
                        <span className="moment-box" aria-hidden="true">
                          {on && <Icon name="check" size={14} />}
                        </span>
                        <span>
                          <strong>{m.label}</strong>
                          <small>{m.description}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="builder-page">
                <h3>Here's your song</h3>
                <p className="hint">Click a section to see it on the stage. After you make it, every section can be changed like any other, and the show coach will have ideas if it spots any.</p>
                <ol className="builder-review">
                  {built.map((s, i) => (
                    <li key={i}>
                      <button type="button" className={focus === s ? "on" : ""} onClick={() => setPicked(i)}>
                        <span className="swatch-row">{isBlackout(s) ? <i className="hatch" /> : paletteOf(s).map((c, k) => <i key={k} style={{ background: c }} />)}</span>
                        <strong>{s.name}</strong>
                        <small>
                          {isBlackout(s) ? "Blackout" : `${moodById(s.mood).label}, energy ${s.energy}`}
                          {s.transition === "snap" && !isBlackout(s) ? ", cuts in" : ""}
                          {s.movement === "sweep" ? ", heads sweep" : ""}
                          {s.effects.blinder ? ", blinder" : ""}
                          {s.effects.strobe ? ", strobe" : ""}
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <aside className="builder-side" aria-label="Preview">
            <div className="builder-stage">
              {focus ? <StagePreview key={`${focus.name}-${focus.mood}-${focus.energy}-${focus.movement}`} section={{ ...focus, bpm }} rig={rig} sequences={sequences} loop /> : <p className="hint">Add a section to see it here.</p>}
            </div>
            {focus && (
              <p className="builder-stage-caption">
                <strong>{focus.name}</strong> {isBlackout(focus) ? "(all lights off)" : `(${moodById(focus.mood).label}, energy ${focus.energy})`}
              </p>
            )}
            <SongStrip sections={built} focus={focus} onPick={(i) => setPicked(i)} />
          </aside>
        </div>

        <footer className="builder-foot">
          <button type="button" className="ghost" onClick={() => (step ? setStep(step - 1) : ref.current?.close())}>
            {step ? "Back" : "Cancel"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next: {STEPS[step + 1]}
            </button>
          ) : (
            <button type="button" className="primary" onClick={finish}>
              <Icon name="check" size={16} /> Make the song
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

/** The whole song in small: a block per section, width by length, height by energy. */
function SongStrip({ sections, focus, onPick }: { sections: Section[]; focus?: Section; onPick: (i: number) => void }) {
  const total = sections.reduce((n, s) => n + sectionMs(s), 0) || 1;
  return (
    <div className="builder-strip" role="list" aria-label="The song">
      {sections.map((s, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          className={focus === s ? "on" : ""}
          style={{ flexGrow: sectionMs(s) / total, height: `${isBlackout(s) ? 18 : 26 + s.energy * 14.8}%`, background: isBlackout(s) ? undefined : `linear-gradient(90deg, ${paletteOf(s).join(", ")})` }}
          title={`${s.name}${isBlackout(s) ? ", blackout" : `, energy ${s.energy}`}`}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  );
}

/** The structure as an editable list: kind, name, length; reorder, add, remove. */
function PlanList({ sections, bpm, beatsPerBar, onChange }: { sections: PlannedSection[]; bpm: number; beatsPerBar: number; onChange: (next: PlannedSection[]) => void }) {
  const types = SECTION_TYPES.filter((t) => t.id !== "blackout");
  const set = (i: number, patch: Partial<PlannedSection>) => onChange(renumber(sections.map((s, k) => (k === i ? { ...s, ...patch } : s))));
  const move = (i: number, d: number) => {
    const next = [...sections];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(renumber(next));
  };
  const totalMs = sections.reduce((n, s) => n + (s.bars * beatsPerBar * 60000) / bpm, 0);
  return (
    <div className="plan-list">
      <div className="plan-list-head">
        <h4>The sections</h4>
        <span className="muted">
          {sections.length} sections, {clock(totalMs)}
        </span>
      </div>
      <ol>
        {sections.map((s, i) => (
          <li key={i} className="plan-row">
            <span className="plan-num">{i + 1}</span>
            <Dropdown label={`Kind of section ${i + 1}`} value={s.type} options={types.map((t) => ({ value: t.id, label: t.label }))} onChange={(type) => set(i, { type, name: sectionTypeById(type).label })} />
            <input aria-label={`Name of section ${i + 1}`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
            <NumberInput label={`Length of ${s.name} in bars`} value={Math.round(s.bars * 100) / 100} min={0.25} max={256} step={1} suffix="bars" onChange={(bars) => set(i, { bars })} />
            <span className="plan-tools">
              <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.name} earlier`}>
                <Icon name="chevronUp" size={14} />
              </button>
              <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label={`Move ${s.name} later`}>
                <Icon name="chevronDown" size={14} />
              </button>
              <button type="button" className="icon-button danger" onClick={() => onChange(renumber(sections.filter((_, k) => k !== i)))} aria-label={`Remove ${s.name}`}>
                <Icon name="x" size={14} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <Dropdown
        label="Add a section"
        value=""
        placeholder="Add a section…"
        options={types.map((t) => ({ value: t.id, label: t.label }))}
        onChange={(type) => onChange(renumber([...sections, { type, name: sectionTypeById(type).label, bars: sectionTypeById(type).bars }]))}
      />
    </div>
  );
}

/** Play the recording and mark where each new section starts (the M key, or the button). */
function Marker({ recording, marks, onMarks }: { recording: { url: string; durationMs: number }; marks: number[]; onMarks: (m: number[]) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  useEffect(() => {
    const a = new Audio(recording.url);
    audio.current = a;
    let raf = 0;
    const tick = () => {
      setPos(a.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onStop = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setPos(a.currentTime * 1000);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.pause();
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
    };
  }, [recording.url]);
  const mark = () => {
    const a = audio.current;
    if (a) onMarks([...marksRef.current, a.currentTime * 1000].sort((x, y) => x - y));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === "m" || e.key === "M") && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        mark();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="marker">
      <div className="marker-controls">
        <button type="button" className={playing ? "transport-btn play on" : "transport-btn play"} onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())} aria-label={playing ? "Pause" : "Play the recording"}>
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className="marker-time">
          {clock(pos)} / {clock(recording.durationMs)}
        </span>
        <button type="button" className="primary" onClick={mark} disabled={!playing && pos === 0}>
          <Icon name="plus" size={15} /> New section here <kbd>M</kbd>
        </button>
        <button type="button" className="ghost small" onClick={() => onMarks(marks.slice(0, -1))} disabled={!marks.length}>
          Undo last mark
        </button>
        <button
          type="button"
          className="link small"
          onClick={() => {
            onMarks([]);
            if (audio.current) audio.current.currentTime = 0;
            setPos(0);
          }}
          disabled={!marks.length && pos === 0}
        >
          Start over
        </button>
      </div>
      <div
        className="marker-bar"
        onPointerDown={(e) => {
          const a = audio.current;
          if (!a) return;
          const r = e.currentTarget.getBoundingClientRect();
          a.currentTime = (Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * recording.durationMs) / 1000;
          setPos(a.currentTime * 1000);
        }}
      >
        <span className="marker-fill" style={{ width: `${(pos / recording.durationMs) * 100}%` }} />
        {marks.map((m, i) => (
          <i key={i} className="marker-mark" style={{ left: `${(m / recording.durationMs) * 100}%` }} title={clock(m)} />
        ))}
      </div>
      <p className="hint">
        {marks.length ? `${marks.length} ${marks.length === 1 ? "mark" : "marks"}: ${marks.length + 1} sections. Their kinds are a first guess; set each one below.` : "Press play, then M at the start of each new section (the first section starts at 0:00)."}
      </p>
    </div>
  );
}
