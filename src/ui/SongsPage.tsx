import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  COLOR_CHANGES,
  EFFECTS,
  ENERGY,
  MOODS,
  MOVEMENTS,
  PATTERNS,
  SECTION_TYPES,
  SONG_TEMPLATES,
  SPREADS,
  moodById,
  newId,
  newSection,
  patternById,
  sectionMs,
  sectionBeats,
  lengthLabel,
  sectionTypeById,
  sectionsFromTemplate,
  effectTargets,
  MATRIX_EFFECTS,
  stageOrder,
  focusLights,
  patternTargets,
  colorById,
  DEFAULT_COLOR_LAYOUT,
  type ColorJob,
  type ColorTarget,
  type Side,
  type EffectId,
  type Focus,
  type MoverSpread,
  type Section,
  type Song,
  type Transition,
} from "../core";
import { cssColor, PaletteEditor } from "./ColorPicker";
import { Dropdown, EnergyMeter, Field, NumberInput, Segmented, Toggle, useDismiss, type Option } from "./controls";
import { Icon, type IconName } from "./icons";
import { LightPicker, type Light } from "./LightPicker";
import { StagePreview } from "./StagePreview";
import type { Store } from "./store";
import { moveItem, useSortable } from "./useSortable";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor);
const cssVars = (v: Record<string, string>) => v as CSSProperties;

const PATTERN_GROUP: Record<string, string> = {
  solid: "Steady",
  drift: "Moving",
  slowWaves: "Moving",
  waves: "Moving",
  stripes: "Moving",
  sineWave: "Moving",
  fillUp: "Moving",
  fillCenter: "Moving",
  circles: "Moving",
  alternate: "Moving",
  marquee: "Moving",
  sparkle: "Atmosphere",
  rainfall: "Atmosphere",
  drizzle: "Atmosphere",
  snow: "Atmosphere",
  bubbles: "Atmosphere",
  starfield: "Atmosphere",
  balls: "Party",
  plasma: "Party",
  fireworks: "Party",
  rainbow: "Party",
  strobe: "Party",
};
const EFFECT_ICON: Record<EffectId, IconName> = { lightning: "bolt", blinder: "sun", beatPulse: "pulse", sparkle: "sparkle", strobe: "strobe" };

export function SongsPage({ store, songId, setSongId, onNext }: { store: Store; songId: string; setSongId: (id: string) => void; onNext: () => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [selected, setSelected] = useState<string | null>(song?.sections[0]?.id ?? null);

  useEffect(() => {
    if (song && !song.sections.some((s) => s.id === selected)) setSelected(song.sections[0]?.id ?? null);
  }, [song, selected]);

  if (!song) {
    return (
      <section className="page">
        <header className="page-head">
          <h1>Songs</h1>
        </header>
        <div className="empty">
          <p>Add a song to start building its looks.</p>
          <button className="primary" onClick={() => setSongId(store.addSong())}>
            <Icon name="plus" /> Add a song
          </button>
        </div>
      </section>
    );
  }

  const set = (patch: Partial<Song>) => store.updateSong({ ...song, ...patch });
  const setSection = (id: string, patch: Partial<Section>) => set({ sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (from: number, to: number) => set({ sections: moveItem(song.sections, from, to) });
  const add = (type: string) => {
    const s = newSection(type, song.bpm);
    set({ sections: [...song.sections, s] });
    setSelected(s.id);
  };
  const duplicate = (s: Section) => {
    const i = song.sections.findIndex((x) => x.id === s.id);
    const copy: Section = { ...s, id: newId("sec"), name: `${s.name} copy`, effects: { ...s.effects }, colors: [...s.colors] };
    set({ sections: [...song.sections.slice(0, i + 1), copy, ...song.sections.slice(i + 1)] });
    setSelected(copy.id);
  };
  const remove = (s: Section) => set({ sections: song.sections.filter((x) => x.id !== s.id) });
  const total = song.sections.reduce((t, s) => t + sectionMs(s), 0);
  const names = new Map(store.fixtures.map((f) => [f.id, f.name]));
  const lights: Light[] = store.project.rig.fixtures
    .filter((f) => f.role !== "ignore" && store.profiles.has(f.fixtureId))
    .sort(stageOrder)
    .map((f) => ({ id: f.fixtureId, name: names.get(f.fixtureId) ?? `Fixture ${f.fixtureId}`, role: f.role, hasRgb: store.profiles.get(f.fixtureId)!.hasRgb, pos: f.pos ?? { x: 0.5, y: 0.5 } }));
  const current = song.sections.find((s) => s.id === selected);

  return (
    <section className="page songs">
      <header className="song-head">
        <div className="song-pick">
          <Dropdown label="Song" value={song.id} options={songs.map((s) => ({ value: s.id, label: s.title || "Untitled song" }))} onChange={setSongId} className="song-switch" />
          <button className="ghost small" onClick={() => setSongId(store.addSong())}>
            <Icon name="plus" size={15} /> New song
          </button>
        </div>
        <div className="song-line">
          <input className="song-title" aria-label="Song title" value={song.title} onChange={(e) => set({ title: e.target.value })} placeholder="Song title" />
          <div className="song-meta">
            <label className="stat stat-input">
              <span>Tempo</span>
              <NumberInput
                label="Song tempo in BPM"
                value={song.bpm}
                min={30}
                max={300}
                suffix="BPM"
                onChange={(bpm) => set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) })}
              />
            </label>
            <div className="stat">
              <span>Length</span>
              <strong>{fmt(total)}</strong>
            </div>
            <div className="stat">
              <span>Sections</span>
              <strong>{song.sections.length}</strong>
            </div>
            {songs.length > 1 && (
              <button
                className="ghost small danger"
                onClick={() => {
                  if (confirm(`Delete "${song.title}"? This can't be undone.`)) {
                    store.deleteSong(song.id);
                    setSongId(songs.find((s) => s.id !== song.id)!.id);
                  }
                }}
              >
                <Icon name="trash" size={15} /> Delete song
              </button>
            )}
          </div>
        </div>
      </header>

      {song.sections.length === 0 ? (
        <SongStarter
          onAdd={add}
          onTemplate={(id) => {
            const sections = sectionsFromTemplate(id, song.bpm);
            set({ sections });
            setSelected(sections[0]?.id ?? null);
          }}
        />
      ) : (
        <>
          <Timeline song={song} selected={selected} onSelect={setSelected} onMove={move} onResize={(id, bars) => setSection(id, { bars })} addButton={<AddSectionMenu onAdd={add} />} />
          <div className="songs-body">
            <div className="cue-panel">
              <div className="cue-panel-head">
                <h2>Sections</h2>
                <span>Drag to reorder</span>
              </div>
              <CueList song={song} selected={selected} onSelect={setSelected} onMove={move} />
            </div>
            {current && (
              <LookEditor key={current.id} s={current} rig={store.project.rig} lights={lights} onChange={(p) => setSection(current.id, p)} onDuplicate={() => duplicate(current)} onRemove={() => remove(current)} index={song.sections.indexOf(current)} />
            )}
          </div>
        </>
      )}

      <div className="page-actions">
        <button className="primary" onClick={onNext} disabled={song.sections.length === 0}>
          Continue to export
        </button>
      </div>
    </section>
  );
}

/** What an empty song shows: add sections one by one, or start from a common structure. */
function SongStarter({ onAdd, onTemplate }: { onAdd: (type: string) => void; onTemplate: (id: string) => void }) {
  return (
    <div className="starter">
      <div className="starter-head">
        <h2>Build the song's structure</h2>
        <p className="muted">Add sections in the order the band plays them. You can rename, reorder and adjust them afterwards.</p>
      </div>
      <div className="starter-types">
        {SECTION_TYPES.map((t) => (
          <button key={t.id} onClick={() => onAdd(t.id)}>
            <span className="swatch-row">
              {moodById(t.mood).colors.map((c) => (
                <i key={c} style={{ background: cssColor(c) }} />
              ))}
            </span>
            <Icon name="plus" size={14} />
            {t.label}
          </button>
        ))}
      </div>
      <h3>Or start from a common structure</h3>
      <div className="starter-templates">
        {SONG_TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => onTemplate(t.id)}>
            <span className="template-strip" aria-hidden="true">
              {t.sections.map((type, i) => (
                <i key={i} style={{ height: `${30 + sectionTypeById(type).energy * 14}%`, background: cssColor(moodById(sectionTypeById(type).mood).colors[0]!) }} />
              ))}
            </span>
            <strong>{t.label}</strong>
            <small>{t.sections.map((type) => sectionTypeById(type).label).join(", ")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function AddSectionMenu({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div className="popover-anchor" ref={ref}>
      <button className="timeline-add" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Add a section">
        <Icon name="plus" />
        <span>Add</span>
      </button>
      {open && (
        <div className="popover add-menu" role="menu">
          {SECTION_TYPES.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => {
                onAdd(t.id);
                setOpen(false);
              }}
            >
              <span className="swatch-row">
                {moodById(t.mood).colors.map((c) => (
                  <i key={c} style={{ background: cssColor(c) }} />
                ))}
              </span>
              {t.label}
              <small>{moodById(t.mood).label}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The song as a strip of blocks: width = length, height = energy. Drag to reorder. */
/** Seconds between ruler ticks, so labels are at least ~64px apart. */
const tickStep = (scale: number) => [1, 2, 5, 10, 15, 30, 60, 120, 300].find((t) => t * scale >= 64) ?? 600;

/**
 * The song as a strip of blocks on a time scale. Drag a block to reorder it;
 * drag its right edge to change its length (whole bars, or beats with Alt).
 */
function Timeline({
  song,
  selected,
  onSelect,
  onMove,
  onResize,
  addButton,
}: {
  song: Song;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (a: number, b: number) => void;
  onResize: (id: string, bars: number) => void;
  addButton: ReactNode;
}) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle, wasDrag } = useSortable(keys, onMove, "x");
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(10); // pixels per second
  const [resizing, setResizing] = useState<{ id: string; fine: boolean } | null>(null);
  const totalSec = song.sections.reduce((t, s) => t + sectionMs(s), 0) / 1000;
  const latest = useRef({ song, onResize, scale });
  latest.current = { song, onResize, scale };

  // Fit the song to the strip when it's first shown (and when switching songs).
  const fit = () => {
    const w = (scroller.current?.clientWidth ?? 800) - 24;
    setScale(Math.max(2, Math.min(40, w / Math.max(totalSec, 10))));
  };
  useLayoutEffect(fit, [song.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const block = (e.currentTarget as HTMLElement).parentElement!;
    const left = block.offsetLeft;
    let clientX = e.clientX;
    let fine = e.altKey;
    let raf = 0;
    setResizing({ id, fine });
    const update = () => {
      const { song: sg, onResize: resize, scale: sc } = latest.current;
      const s = sg.sections.find((x) => x.id === id);
      const t = track.current;
      if (!s || !t) return;
      const x = clientX - t.getBoundingClientRect().left - left;
      const beatSec = 60 / s.bpm;
      const raw = x / sc / beatSec;
      const beats = fine ? Math.max(1, Math.round(raw)) : Math.max(1, Math.round(raw / s.beatsPerBar)) * s.beatsPerBar;
      if (beats !== sectionBeats(s)) resize(id, beats / s.beatsPerBar);
    };
    // Scroll the strip when dragging near its ends.
    const tick = () => {
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        // Faster the further into the edge zone, up to 6px a frame.
        const into = clientX > r.right - 48 ? clientX - (r.right - 48) : clientX < r.left + 48 ? clientX - (r.left + 48) : 0;
        const step = Math.sign(into) * Math.ceil(Math.min(48, Math.abs(into)) / 8);
        if (step) {
          el.scrollLeft += step;
          update();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev: PointerEvent) => {
      clientX = ev.clientX;
      fine = ev.altKey;
      setResizing({ id, fine });
      update();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Alt") return;
      fine = ev.type === "keydown";
      setResizing({ id, fine });
      update();
    };
    const end = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      document.body.classList.remove("is-resizing");
      setResizing(null);
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
  };

  // Shift + arrows: a bar longer or shorter; with Alt, a beat.
  const resizeKey = (e: ReactKeyboardEvent, s: Section) => {
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const beats = sectionBeats(s);
    const bpb = s.beatsPerBar;
    const next = e.altKey ? beats + dir : dir > 0 ? Math.floor(beats / bpb) * bpb + bpb : Math.ceil(beats / bpb) * bpb - bpb;
    onResize(s.id, Math.max(1, next) / bpb);
  };

  const step = tickStep(scale);
  const width = totalSec * scale;
  return (
    <div className="timeline-wrap">
      <div className="timeline-row">
        <div className="timeline" ref={scroller}>
          <div className="timeline-track" ref={track} style={{ width: width + 2 }}>
            <div className="ruler" aria-hidden="true">
              {Array.from({ length: Math.floor(totalSec / step) + 1 }, (_, i) => (
                <span key={i} style={{ left: i * step * scale }}>
                  {fmt(i * step * 1000)}
                </span>
              ))}
            </div>
            <div className="blocks" role="list" aria-label="Song timeline. Drag sections to reorder, or drag a section's right edge to change its length.">
              {song.sections.map((s) => {
                const pal = paletteOf(s);
                const ms = sectionMs(s);
                const w = (ms / 1000) * scale;
                const h = handle(s.id);
                return (
                  <div
                    key={s.id}
                    role="listitem"
                    ref={itemRef(s.id)}
                    className={`block${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}${resizing?.id === s.id ? " resizing" : ""}`}
                    style={{ width: w, ...cssVars({ "--h": `${38 + s.energy * 12}%`, "--g": `linear-gradient(90deg, ${pal.join(", ")})` }) }}
                    tabIndex={0}
                    aria-label={`${s.name}, ${lengthLabel(s)}, ${fmt(ms)}. Enter to edit, Alt and arrows to move, Shift and arrows to change the length.`}
                    onPointerDown={h.onPointerDown}
                    onKeyDown={(e) => {
                      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                        e.preventDefault();
                        resizeKey(e, s);
                      } else h.onKeyDown(e);
                    }}
                    onClick={() => !wasDrag() && onSelect(s.id)}
                    onKeyDownCapture={(e) => e.key === "Enter" && onSelect(s.id)}
                  >
                    <span className="block-light" />
                    <span className="block-text">
                      <strong>{s.name}</strong>
                      <small>{fmt(ms)}</small>
                    </span>
                    <span className="block-resize" title="Drag to change the length (hold Alt / Option for single beats)" onPointerDown={(e) => startResize(e, s.id)} />
                  </div>
                );
              })}
            </div>
            {resizing &&
              (() => {
                const s = song.sections.find((v) => v.id === resizing.id);
                if (!s) return null;
                let right = 0;
                for (const v of song.sections) {
                  right += (sectionMs(v) / 1000) * scale;
                  if (v.id === s.id) break;
                }
                return (
                  <div className="resize-bubble" style={{ left: right }}>
                    <span>
                      <strong>{lengthLabel(s)}</strong> · {fmt(sectionMs(s))}
                    </span>
                    <small>{resizing.fine ? "Snapping to beats" : "Hold Alt for beats"}</small>
                  </div>
                );
              })()}
          </div>
        </div>
        {/* Outside the scrolling strip, so its menu isn't clipped. */}
        {addButton}
      </div>
      <div className="timeline-foot">
        <p className="hint">Drag a block to reorder it, or drag its right edge to change its length. Taller blocks have more energy.</p>
        <div className="zoom" role="group" aria-label="Zoom the timeline">
          <button type="button" className="ghost small icon-only" onClick={() => setScale((v) => Math.max(1, v / 1.5))} aria-label="Zoom out" title="Zoom out">
            <Icon name="minus" size={14} />
          </button>
          <button type="button" className="ghost small" onClick={fit} title="Fit the whole song">
            Fit
          </button>
          <button type="button" className="ghost small icon-only" onClick={() => setScale((v) => Math.min(80, v * 1.5))} aria-label="Zoom in" title="Zoom in">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CueList({ song, selected, onSelect, onMove }: { song: Song; selected: string | null; onSelect: (id: string) => void; onMove: (a: number, b: number) => void }) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle } = useSortable(keys, onMove, "y");
  return (
    <ol className="cues" aria-label="Sections in order">
      {song.sections.map((s, i) => (
        <li key={s.id} ref={itemRef(s.id)} className={`cue${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}`}>
          <span className="cue-grip" aria-label={`Drag to move ${s.name}`} title="Drag to reorder (or Alt + arrow keys)" tabIndex={0} {...handle(s.id)}>
            <Icon name="grip" size={16} />
          </span>
          <button className="cue-main" onClick={() => onSelect(s.id)} aria-pressed={selected === s.id}>
            <span className="cue-num">{i + 1}</span>
            <span className="swatch-row">
              {paletteOf(s).map((c, k) => (
                <i key={k} style={{ background: c }} />
              ))}
            </span>
            <span className="cue-text">
              <strong>{s.name}</strong>
              <small>
                {moodById(s.mood).label}, {fmt(sectionMs(s))}
              </small>
            </span>
            <Icon name="chevronRight" size={16} className="cue-chevron" />
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A titled block of settings with a one-line explanation. */
function Group({ icon, title, description, children, aside }: { icon: IconName; title: string; description: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="group">
      <header className="group-head">
        <span className="group-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {aside}
      </header>
      <div className="group-body">{children}</div>
    </section>
  );
}

/** Large radio choices with a title and a sentence each. */
function ChoiceCards<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; title: string; text: string }[]; onChange: (v: T) => void; label: string }) {
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

const JOB_LABEL: Record<ColorJob, string> = { backdrop: "Backdrop", side: "Side and floor", mover: "Moving heads", front: "Front" };

/** For each kind of light on the stage: mix the palette across them, or pick one color. */
function ColorLayoutEditor({ s, rig, palette, onChange }: { s: Section; rig: Store["project"]["rig"]; palette: string[]; onChange: (p: Partial<Section>) => void }) {
  const jobs = (["backdrop", "side", "mover", "front"] as ColorJob[]).filter((j) => rig.fixtures.some((f) => f.role === j));
  if (!jobs.length) return null;
  const layout = { ...DEFAULT_COLOR_LAYOUT, ...(s.colorLayout ?? {}) };
  const set = (job: ColorJob, t: ColorTarget) => onChange({ colorLayout: { ...(s.colorLayout ?? {}), [job]: t } });
  return (
    <div className="color-layout">
      <span className="light-picker-label">Which lights get which color</span>
      {jobs.map((job) => {
        const v = layout[job];
        const current = typeof v === "number" ? v % palette.length : v;
        return (
          <div key={job} className="layout-row">
            <span className="layout-job">{JOB_LABEL[job]}</span>
            <div className="layout-options" role="radiogroup" aria-label={`Color for ${JOB_LABEL[job]}`}>
              <button type="button" role="radio" aria-checked={current === "mix"} className={current === "mix" ? "lo on" : "lo"} onClick={() => set(job, "mix")} title="Spread all the colors across these lights">
                <span className="lo-mix" style={{ background: `conic-gradient(${palette.map(cssColor).join(", ")}, ${cssColor(palette[0]!)})` }} />
                Mix
              </button>
              {palette.map((c, i) => (
                <button key={`${c}-${i}`} type="button" role="radio" aria-checked={current === i} className={current === i ? "lo on" : "lo"} onClick={() => set(job, i)} title={`All ${JOB_LABEL[job].toLowerCase()} lights in ${colorById(c).label.toLowerCase()}`}>
                  <span className="lo-swatch" style={{ background: cssColor(c) }} />
                  <span className="visually-hidden">{colorById(c).label}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={current === "white"} className={current === "white" ? "lo on" : "lo"} onClick={() => set(job, "white")} title="Warm white">
                <span className="lo-swatch" style={{ background: "#ffd9a8" }} />
                <span className="visually-hidden">Warm white</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LookEditor({ s, rig, lights, index, onChange, onDuplicate, onRemove }: { s: Section; rig: Store["project"]["rig"]; lights: Light[]; index: number; onChange: (p: Partial<Section>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const mood = moodById(s.mood);
  const moodPattern = patternById(mood.pattern);
  const moodMove = MOVEMENTS.find((m) => m.id === mood.movement)!;
  const moodChange = COLOR_CHANGES.find((c) => c.id === mood.colorChange)!;
  const moveId = s.movement === "mood" ? mood.movement : s.movement;
  const changeId = s.colorChange === "mood" ? mood.colorChange : s.colorChange;
  const palette = s.colors.length ? s.colors : mood.colors;
  const pattern = patternById(s.pattern === "mood" ? mood.pattern : s.pattern);

  const moodOptions: Option<string>[] = MOODS.map((m) => ({ value: m.id, label: m.label, description: m.description, swatches: m.colors.map(cssColor) }));
  const patternOptions: Option<string>[] = [
    { value: "mood", label: `Follow the mood (${moodPattern.label})`, description: moodPattern.description },
    ...PATTERNS.map((p) => ({ value: p.id, label: p.label, description: p.description, group: PATTERN_GROUP[p.id] ?? "More" })),
  ];
  const moveIcon = (path: string) => (
    <svg className="opt-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const moveOptions: Option<string>[] = [
    { value: "mood", label: `Follow the mood (${moodMove.label})`, description: moodMove.description, icon: moveIcon(moodMove.icon) },
    ...MOVEMENTS.map((m) => ({ value: m.id, label: m.label, description: m.description, icon: moveIcon(m.icon) })),
  ];
  const changeOptions: Option<string>[] = [{ value: "mood", label: `Follow the mood (${moodChange.label.toLowerCase()})` }, ...COLOR_CHANGES.map((c) => ({ value: c.id, label: c.label }))];
  const hasMovers = rig.fixtures.some((f) => f.role === "mover");
  const nameOf = new Map(lights.map((l) => [l.id, l.name]));
  const focusOptions = (["SL", "C", "SR"] as Side[]).map((side) => ({ side, ids: focusLights({ fixtures: rig.fixtures.filter((f) => lights.some((l) => l.id === f.fixtureId)) }, side) }));
  const focusIds = s.focus === "all" ? [] : focusOptions.find((f) => f.side === s.focus)?.ids ?? [];
  const sideName: Record<Side, string> = { SL: "Stage left", C: "Center", SR: "Stage right" };

  return (
    <article className="editor" aria-label={`Editing ${s.name}`}>
      <header className="editor-head">
        <span className="editor-num">{index + 1}</span>
        <input className="editor-name" aria-label="Section name" value={s.name} onChange={(e) => onChange({ name: e.target.value })} />
        <div className="editor-actions">
          <button className="ghost small" onClick={onDuplicate}>
            <Icon name="copy" size={15} /> Duplicate
          </button>
          <button className="ghost small danger" onClick={onRemove}>
            <Icon name="trash" size={15} /> Delete
          </button>
        </div>
      </header>

      <div className="editor-grid">
        <div className="editor-preview">
          <figure className="preview-figure">
            <StagePreview section={s} rig={rig} />
            <figcaption className="hint">A sketch of this section on your stage, at its tempo.</figcaption>
          </figure>
          <div className="timing-row">
            <Field label="Section type">
              <Dropdown
                label="Section type"
                value={s.type}
                options={SECTION_TYPES.map((t) => ({ value: t.id, label: t.label }))}
                onChange={(type) => {
                  const t = sectionTypeById(type);
                  const renamed = SECTION_TYPES.some((x) => x.label === s.name) || !s.name;
                  onChange({ type: t.id, ...(renamed ? { name: t.label } : {}), mood: t.mood, energy: t.energy, transition: t.transition });
                }}
              />
            </Field>
            <Field label="Tempo">
              <NumberInput label="Section tempo" value={s.bpm} min={30} max={300} suffix="BPM" onChange={(bpm) => onChange({ bpm })} />
            </Field>
            <Field label="Length" hint={`${sectionBeats(s) % s.beatsPerBar ? `+ ${sectionBeats(s) % s.beatsPerBar} beat${sectionBeats(s) % s.beatsPerBar === 1 ? "" : "s"}, a` : "A"}bout ${fmt(sectionMs(s))}`}>
              <NumberInput label="Length in bars" value={Math.floor(sectionBeats(s) / s.beatsPerBar)} min={1} max={256} suffix="bars" onChange={(bars) => onChange({ bars: Math.max(1, Math.round(bars)) + (sectionBeats(s) % s.beatsPerBar) / s.beatsPerBar })} />
            </Field>
            <Field label="Beats per bar">
              <Dropdown label="Beats per bar" value={String(s.beatsPerBar)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} onChange={(v) => onChange({ beatsPerBar: +v })} />
            </Field>
          </div>
        </div>

        <div className="editor-controls">
          <Group icon="sun" title="Mood and energy" description="The overall feel. The mood sets starting colors, a pattern and movement; energy sets brightness and speed.">
            <Dropdown label="Mood" value={s.mood} options={moodOptions} onChange={(m) => onChange({ mood: m })} className="wide" />
            <EnergyMeter value={s.energy} onChange={(energy) => onChange({ energy })} labels={ENERGY} />
          </Group>

          <Group icon="palette" title="Colors" description="Pick up to 6 colors, then choose which lights use them and whether they change over time.">
            <PaletteEditor colors={s.colors} fallback={mood.colors} onChange={(colors) => onChange({ colors })} />
            <ColorLayoutEditor s={s} rig={rig} palette={palette} onChange={onChange} />
            <div className="row">
              <Field label="Switch between colors">
                <Dropdown label="Color changes" value={s.colorChange} options={changeOptions} onChange={(v) => onChange({ colorChange: v as Section["colorChange"] })} />
              </Field>
              {changeId !== "hold" && <Toggle checked={s.colorFade} onChange={(colorFade) => onChange({ colorFade })} label="Crossfade" hint="Blend into the next color" />}
            </div>
          </Group>

          <Group icon="backdrop" title="Pattern" description="An animated pattern, like waves or rain, that runs across a set of lights. It works best on bars or pixel lights.">
            <Dropdown label="Pattern" value={s.pattern} options={patternOptions} onChange={(p) => onChange({ pattern: p })} className="wide" />
            {pattern.algorithm && (
              <div className="runs-on">
                <span>Runs on</span>
                <LightPicker title="Pattern runs on" chosen={patternTargets(s, rig)} custom={!!s.patternTargets} lights={lights} needsRgb onChange={(ids) => onChange({ patternTargets: ids })} />
              </div>
            )}
            {pattern.algorithm && patternTargets(s, rig).length === 0 && <p className="hint warn-text">Choose some lights for the pattern to run on; you have no backdrop lights.</p>}
          </Group>

          <Group icon="mover" title="Moving heads" description="How moving heads move during this section. They all move around their home position, set on the Stage step.">
            {hasMovers ? (
              <>
                <Dropdown label="Movement" value={s.movement} options={moveOptions} onChange={(movement) => onChange({ movement })} className="wide" />
                {moveId !== "static" && <Segmented label="How heads move together" value={s.moverSpread} onChange={(v: MoverSpread) => onChange({ moverSpread: v })} options={SPREADS.map((x) => ({ value: x.id, label: x.label, title: x.description }))} />}
              </>
            ) : (
              <p className="hint">You have no moving heads on your stage. Put a light in the Moving heads lane on the Stage step to use these settings.</p>
            )}
          </Group>

          <Group icon="focus" title="Focus" description="Put one player in the spotlight, for a solo or a quiet verse. Their lights go warm white; the rest dim.">
            <Segmented
              label="Who to light"
              value={s.focus}
              onChange={(focus: Focus) => onChange({ focus })}
              options={[
                { value: "all", label: "No focus" },
                ...focusOptions.map((f) => ({ value: f.side, label: sideName[f.side], disabled: f.ids.length === 0, title: f.ids.length ? undefined : `No lights on ${sideName[f.side].toLowerCase()}` })),
              ]}
            />
            <p className="hint">
              {s.focus === "all"
                ? "Stage left and right are the performers' left and right."
                : focusIds.length
                  ? `Spotlight from: ${focusIds.map((id) => nameOf.get(id)).join(", ")}.`
                  : `No lights on ${sideName[s.focus].toLowerCase()} can do this.`}
            </p>
          </Group>

          <Group icon="sparkle" title="Effects" description="Extras layered on top of the look and pattern. Each runs on its usual lights; click the lights chip on an effect to choose others.">
            <div className="effects">
              {EFFECTS.map((e) => {
                const on = !!s.effects[e.id];
                const needsRgb = MATRIX_EFFECTS.includes(e.id);
                const possible = lights.filter((l) => !needsRgb || l.hasRgb);
                return (
                  <div key={e.id} className={on ? "effect on" : "effect"}>
                    <button type="button" aria-pressed={on} disabled={!possible.length} title={possible.length ? undefined : "None of your lights can show this effect"} onClick={() => onChange({ effects: { ...s.effects, [e.id]: !on } })}>
                      <Icon name={EFFECT_ICON[e.id]} size={20} />
                      <span>
                        <strong>{e.label}</strong>
                        <small>{e.description}</small>
                      </span>
                      <span className="effect-state">{on ? "On" : "Off"}</span>
                    </button>
                    {on && (
                      <div className="effect-extra">
                        <LightPicker
                          title={`${e.label} runs on`}
                          chosen={effectTargets(s, e.id, rig)}
                          custom={!!s.effectTargets?.[e.id]}
                          lights={lights}
                          needsRgb={needsRgb}
                          onChange={(ids) => {
                            const next = { ...(s.effectTargets ?? {}) };
                            if (ids) next[e.id] = ids;
                            else delete next[e.id];
                            onChange({ effectTargets: next });
                          }}
                        />
                        {e.id === "lightning" && (
                          <label className="inline-field compact" title="Start the lightning this many seconds into the section">
                            <Icon name="clock" size={14} />
                            <NumberInput label="Lightning delay in seconds" value={s.effects.lightningDelaySec ?? 0} min={0} max={600} step={0.5} suffix="s" onChange={(v) => onChange({ effects: { ...s.effects, lightningDelaySec: v } })} />
                          </label>
                        )}
                      </div>
                    )}
                    {!on && (
                      <button type="button" className="effect-extra effect-off" disabled={!possible.length} onClick={() => onChange({ effects: { ...s.effects, [e.id]: true } })}>
                        {possible.length ? "Click to turn on" : "No lights can show this"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Group>

          <Group icon="play" title="Start and end" description="How the lights change when this section begins, and what moves the show on to the next section.">
            <span className="light-picker-label">When this section starts, the lights…</span>
            <ChoiceCards
              label="How the lights change when this section starts"
              value={s.transition}
              onChange={(transition: Transition) => onChange({ transition })}
              options={[
                { value: "snap", title: "Change instantly", text: "Best for hard hits, like a chorus that kicks in." },
                { value: "fade", title: "Fade over one beat", text: "A quick, smooth change." },
                { value: "build", title: "Build up gradually", text: "Ramps in over up to 4 bars, for a slow rise into the section." },
              ]}
            />
            <span className="light-picker-label">When this section ends…</span>
            <ChoiceCards
              label="What happens when this section ends"
              value={s.autoAdvance ? "auto" : "cue"}
              onChange={(v) => onChange({ autoAdvance: v === "auto" })}
              options={[
                { value: "cue", title: "Wait for my cue", text: "The look holds until you press the next button or footswitch. Best when the band doesn't play to a click." },
                { value: "auto", title: `Move on after ${lengthLabel(s)}`, text: `The next section starts by itself after about ${fmt(sectionMs(s))}. Only use this when the timing is fixed, like a backing track or sample.` },
              ]}
            />
          </Group>
        </div>
      </div>
    </article>
  );
}
