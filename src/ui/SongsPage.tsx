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
  barsForSeconds,
  sectionBeats,
  isBlackout,
  lengthLabel,
  sectionTypeById,
  sectionsFromTemplate,
  effectTargets,
  MATRIX_EFFECTS,
  stageOrder,
  focusLights,
  patternTargets,
  colorById,
  colorLayoutOf,
  lightLevels,
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
import { Dropdown, EnergyMeter, Field, NumberInput, Segmented, TapTempo, Toggle, useDismiss, type Option } from "./controls";
import { Icon, type IconName } from "./icons";
import { askConfirm } from "./ConfirmDialog";
import { IndividualLights } from "./IndividualLights";
import { LightPicker, type Light } from "./LightPicker";
import { PreviewWindow } from "./PreviewWindow";
import { StagePreview } from "./StagePreview";
import type { Store } from "./store";
import { moveItem, useSortable } from "./useSortable";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor);
const cssVars = (v: Record<string, string>) => v as CSSProperties;
/** Start and end of a drag, so the whole drag is one undo step. */
type Gesture = { begin: () => void; end: () => void };

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
  const [popped, setPopped] = useState(false);

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
  const gesture: Gesture = { begin: store.beginGesture, end: store.endGesture };
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
  /** Copy a section's individual light settings to every section of its type, or the whole song. */
  const copyLights = (from: Section, scope: "type" | "song") => {
    const own = from.lights ?? {};
    set({
      sections: song.sections.map((x) =>
        x.id === from.id || (scope === "type" && x.type !== from.type) || isBlackout(x)
          ? x
          : { ...x, lights: { ...(x.lights ?? {}), ...Object.fromEntries(Object.entries(own).map(([k, v]) => [k, { ...v }])) } },
      ),
    });
  };

  /** Delete a section after asking, then select its neighbour. */
  const remove = async (s: Section) => {
    const ok = await askConfirm({
      title: "Delete this section?",
      message: (
        <>
          <strong>{s.name}</strong> ({lengthLabel(s)}) will be removed from <strong>{song.title || "this song"}</strong>. You can bring it back with Undo.
        </>
      ),
      confirmLabel: "Delete section",
      danger: true,
    });
    if (!ok) return;
    const i = song.sections.findIndex((x) => x.id === s.id);
    const rest = song.sections.filter((x) => x.id !== s.id);
    set({ sections: rest });
    setSelected(rest[Math.min(i, rest.length - 1)]?.id ?? null);
  };
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
        <div className="song-pick song-switch-narrow">
          <Dropdown label="Song" value={song.id} options={songs.map((s) => ({ value: s.id, label: s.title || "Untitled song" }))} onChange={setSongId} className="song-switch" />
        </div>
        <div className="song-line">
          {/* The hidden copy of the title sizes the box to the text. */}
          <span className="song-title-wrap" data-value={song.title || "Song title"}>
            <input className="song-title" aria-label="Song title" value={song.title} onChange={(e) => set({ title: e.target.value })} placeholder="Song title" size={1} />
          </span>
          <div className="song-actions">
            <button type="button" className="icon-button" onClick={() => setSongId(store.addSong())} aria-label="Add a song" title="Add a song">
              <Icon name="plus" size={17} />
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Delete the song "${song.title || "Untitled song"}"`}
              title="Delete this song"
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Delete this song?",
                  message: (
                    <>
                      <strong>{song.title || "Untitled song"}</strong> and its {song.sections.length} {song.sections.length === 1 ? "section" : "sections"} will be removed. You can bring it back with Undo.
                    </>
                  ),
                  confirmLabel: "Delete song",
                  danger: true,
                });
                if (ok) {
                  const next = songs.find((s) => s.id !== song.id);
                  store.deleteSong(song.id);
                  setSongId(next?.id ?? "");
                }
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div className="song-meta">
            <label className="stat stat-input">
              <span>Song tempo</span>
              <NumberInput
                label="Song tempo in BPM"
                value={song.bpm}
                min={30}
                max={300}
                suffix="BPM"
                onChange={(bpm) => set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) })}
              />
            </label>
            <TapTempo label="Song tempo" onTempo={(bpm) => set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) })} />
            <div className="stat">
              <span>Length</span>
              <strong>{fmt(total)}</strong>
            </div>
            <div className="stat">
              <span>Sections</span>
              <strong>{song.sections.length}</strong>
            </div>
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
          <Timeline song={song} selected={selected} onSelect={setSelected} onMove={move} onResize={(id, bars) => setSection(id, { bars })} onDelete={remove} addButton={<AddSectionMenu onAdd={add} />} gesture={gesture} />
          <div className="songs-body">
            <div className="cue-panel">
              <div className="cue-panel-head">
                <h2>Sections</h2>
                <span>Drag to reorder</span>
              </div>
              <CueList song={song} selected={selected} onSelect={setSelected} onMove={move} onDuplicate={duplicate} onDelete={remove} gesture={gesture} />
            </div>
            {current && (
              <LookEditor key={current.id} s={current} songBpm={song.bpm} gesture={gesture} popped={popped} onPopOut={() => setPopped(true)} onPopIn={() => setPopped(false)} onCopyLights={(scope) => copyLights(current, scope)} rig={store.project.rig} lights={lights} onChange={(p) => setSection(current.id, p)} index={song.sections.indexOf(current)} />
            )}
            {popped && current && (
              <PreviewWindow title={current.name} onClose={() => setPopped(false)}>
                <SectionPreview s={current} rig={store.project.rig} />
              </PreviewWindow>
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
          {[...SECTION_TYPES.filter((t) => t.id === "blackout"), ...SECTION_TYPES.filter((t) => t.id !== "blackout")].map((t) => (
            <button
              key={t.id}
              role="menuitem"
              className={t.id === "blackout" ? "menu-blackout" : undefined}
              onClick={() => {
                onAdd(t.id);
                setOpen(false);
              }}
            >
              <span className="swatch-row">
                {t.id === "blackout" ? (
                  <i className="hatch" />
                ) : (
                  moodById(t.mood).colors.map((c) => <i key={c} style={{ background: cssColor(c) }} />)
                )}
              </span>
              {t.label}
              <small>{t.id === "blackout" ? "All lights off" : moodById(t.mood).label}</small>
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
  onDelete,
  addButton,
  gesture,
}: {
  song: Song;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (a: number, b: number) => void;
  onResize: (id: string, bars: number) => void;
  onDelete: (s: Section) => void;
  addButton: ReactNode;
  gesture: Gesture;
}) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle, wasDrag } = useSortable(keys, onMove, "x", gesture);
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

  // ---- Playback: a playhead runs through the song at each section's length,
  // selecting each section as it starts so the preview shows it.
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // ms from the start of the song
  const posRef = useRef(0);
  const totalMs = totalSec * 1000;
  const sectionAt = (ms: number) => {
    let t = 0;
    for (const s of song.sections) {
      t += sectionMs(s);
      if (ms < t) return s;
    }
    return song.sections[song.sections.length - 1];
  };
  const seek = (ms: number) => {
    const t = Math.max(0, Math.min(totalMs, ms));
    posRef.current = t;
    setPos(t);
    const s = sectionAt(t);
    if (s && s.id !== selected) onSelect(s.id);
  };
  const latestPlay = useRef({ song, selected, onSelect, totalMs, scale });
  latestPlay.current = { song, selected, onSelect, totalMs, scale };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const { song: sg, selected: sel, onSelect: pick, totalMs: total, scale: sc } = latestPlay.current;
      const t = posRef.current + (now - last);
      last = now;
      if (t >= total) {
        posRef.current = total;
        setPos(total);
        setPlaying(false);
        return;
      }
      posRef.current = t;
      setPos(t);
      // Select the section under the playhead.
      let acc = 0;
      const cur = sg.sections.find((s) => (acc += sectionMs(s)) > t);
      if (cur && cur.id !== sel) pick(cur.id);
      // Keep the playhead in view.
      const el = scroller.current;
      const x = (t / 1000) * sc;
      if (el && (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft)) el.scrollLeft = Math.max(0, x - 80);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const togglePlay = () => {
    if (!playing) seek(posRef.current >= totalMs - 1 ? 0 : posRef.current);
    setPlaying((p) => !p);
  };
  // Space plays and pauses, unless you're typing or on a control.
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, [contenteditable], [role=radio], [role=checkbox], .lights-pop")) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // Stop when switching songs.
  useEffect(() => {
    setPlaying(false);
    posRef.current = 0;
    setPos(0);
  }, [song.id]);

  // Keep the selected section in view (for example one just added at the end).
  useEffect(() => {
    const el = selected ? scroller.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`) : null;
    if (!playing) el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected, song.sections.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const block = (e.currentTarget as HTMLElement).parentElement!;
    gesture.begin(); // the whole drag is one undo step
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
      gesture.end();
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
          <div className="timeline-track" ref={track} style={{ width: width + 16 }}>
            <div
              className="ruler"
              title="Click to play from here"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - r.left) / scale) * 1000);
              }}
            >
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
                    data-id={s.id}
                    ref={itemRef(s.id)}
                    className={`block${isBlackout(s) ? " blackout" : ""}${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}${resizing?.id === s.id ? " resizing" : ""}`}
                    style={{ width: w, ...cssVars({ "--h": `${38 + s.energy * 12}%`, "--g": `linear-gradient(90deg, ${pal.join(", ")})` }) }}
                    tabIndex={0}
                    aria-label={`${s.name}, ${lengthLabel(s)}, ${fmt(ms)}. Enter to edit, Alt and arrows to move, Shift and arrows to change the length, Delete to remove.`}
                    onPointerDown={h.onPointerDown}
                    onKeyDown={(e) => {
                      if (e.key === "Delete" || e.key === "Backspace") {
                        e.preventDefault();
                        onDelete(s);
                      } else if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
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
            {(playing || pos > 0) && <div className="playhead" style={{ left: (pos / 1000) * scale }} aria-hidden="true" />}
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
        <div className="transport" role="group" aria-label="Play the song">
          <button type="button" className={playing ? "play-button on" : "play-button"} onClick={togglePlay} disabled={!song.sections.length} aria-label={playing ? "Pause" : "Play the song"} title={playing ? "Pause (Space)" : "Play the song (Space)"}>
            <Icon name={playing ? "pause" : "play"} size={15} />
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="ghost small" onClick={() => seek(0)} disabled={pos === 0} aria-label="Back to the start" title="Back to the start">
            <Icon name="skipBack" size={14} />
          </button>
          <span className="transport-time">
            {fmt(pos)} / {fmt(totalMs)}
          </span>
        </div>
        <p className="hint">Drag a block to reorder it, or its right edge to change its length. Select one and press Delete to remove it.</p>
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

function CueList({ song, selected, onSelect, onMove, onDuplicate, onDelete, gesture }: { song: Song; selected: string | null; onSelect: (id: string) => void; onMove: (a: number, b: number) => void; onDuplicate: (s: Section) => void; onDelete: (s: Section) => void; gesture: Gesture }) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle } = useSortable(keys, onMove, "y", gesture);
  return (
    <ol className="cues" aria-label="Sections in order">
      {song.sections.map((s, i) => (
        <li key={s.id} ref={itemRef(s.id)} className={`cue${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}`}>
          <span className="cue-grip" aria-label={`Drag to move ${s.name}`} title="Drag to reorder (or Alt + arrow keys)" tabIndex={0} {...handle(s.id)}>
            <Icon name="grip" size={16} />
          </span>
          <button
            className="cue-main"
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                onDelete(s);
              }
            }}
            aria-pressed={selected === s.id}
          >
            <span className="cue-num">{i + 1}</span>
            <span className="swatch-row">
              {isBlackout(s) ? <i className="hatch" /> : paletteOf(s).map((c, k) => <i key={k} style={{ background: c }} />)}
            </span>
            <span className="cue-text">
              <strong>{s.name}</strong>
              <small>
                {isBlackout(s) ? "All lights off" : moodById(s.mood).label}, {fmt(sectionMs(s))}
              </small>
            </span>
            <Icon name="chevronRight" size={16} className="cue-chevron" />
          </button>
          {/* Shown on hover and on the selected section. */}
          <span className="cue-actions">
            <button type="button" className="cue-action" onClick={() => onDuplicate(s)} aria-label={`Duplicate ${s.name}`} title="Duplicate this section">
              <Icon name="copy" size={15} />
            </button>
            <button type="button" className="cue-action danger" onClick={() => onDelete(s)} aria-label={`Delete ${s.name}`} title="Delete this section (or press Delete)">
              <Icon name="trash" size={15} />
            </button>
          </span>
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

const JOB_LABEL: Record<ColorJob, string> = { backdrop: "Backdrop", side: "Wash lights", mover: "Moving heads", front: "Front" };

/** For each kind of light on the stage: mix the palette across them, or pick one color. */
/**
 * Brightness per kind of light. Each starts on Auto (from the mood and
 * energy); moving a slider sets that kind's own level for this section.
 */
function BrightnessEditor({ s, rig, onChange, gesture }: { s: Section; rig: Store["project"]["rig"]; onChange: (p: Partial<Section>) => void; gesture: Gesture }) {
  const jobs = (["backdrop", "side", "mover", "front"] as ColorJob[]).filter((j) => rig.fixtures.some((f) => f.role === j));
  if (!jobs.length) return null;
  const levels = lightLevels(s);
  const set = (job: ColorJob, v: number | undefined) => {
    const next = { ...(s.brightness ?? {}) };
    if (v === undefined) delete next[job];
    else next[job] = v;
    onChange({ brightness: next });
  };
  return (
    <div className="light-brightness">
      <span className="light-picker-label">Brightness</span>
      {jobs.map((job) => {
        const { level, auto } = levels[job];
        const pct = Math.round(level * 100);
        return (
          <div key={job} className={auto ? "bright-row auto" : "bright-row"}>
            <span className="layout-job">{JOB_LABEL[job]}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              style={{ "--pct": `${pct}%` } as CSSProperties}
              aria-label={`${JOB_LABEL[job]} brightness`}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) => set(job, Number(e.target.value) / 100)}
            />
            <span className="bright-value">{pct}%</span>
            {auto ? (
              <span className="bright-auto" title="Set by the mood and energy. Move the slider to choose your own.">
                Auto
              </span>
            ) : (
              <button type="button" className="link small bright-reset" onClick={() => set(job, undefined)} title="Go back to the mood and energy's brightness (Auto)">
                Reset
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ColorLayoutEditor({ s, rig, palette, onChange }: { s: Section; rig: Store["project"]["rig"]; palette: string[]; onChange: (p: Partial<Section>) => void }) {
  const jobs = (["backdrop", "side", "mover", "front"] as ColorJob[]).filter((j) => rig.fixtures.some((f) => f.role === j));
  if (!jobs.length) return null;
  const layout = colorLayoutOf(s);
  const set = (job: ColorJob, t: ColorTarget) => onChange({ colorLayout: { ...(s.colorLayout ?? {}), [job]: t } });
  return (
    <div className="color-layout">
      <span className="light-picker-label">Which lights get which color</span>
      <p className="hint layout-hint">Mix spreads all your colors across those lights; a swatch puts them all in that one color; the last swatch is warm white.</p>
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

/** The stage preview for a section, or the "All lights off" panel for a blackout. */
function SectionPreview({ s, rig }: { s: Section; rig: Store["project"]["rig"] }) {
  if (!isBlackout(s)) return <StagePreview section={s} rig={rig} />;
  return (
    <div className="blackout-preview">
      <Icon name="moon" size={26} />
      <strong>All lights off</strong>
      <span>
        {s.transition === "snap" ? "The lights cut to black" : "The lights fade to black over one bar"} for {lengthLabel(s)}.
      </span>
    </div>
  );
}

function LookEditor({
  s,
  songBpm,
  rig,
  lights,
  index,
  onChange,
  gesture,
  popped,
  onPopOut,
  onPopIn,
  onCopyLights,
}: {
  s: Section;
  songBpm: number;
  rig: Store["project"]["rig"];
  lights: Light[];
  index: number;
  onChange: (p: Partial<Section>) => void;
  gesture: Gesture;
  popped: boolean;
  onPopOut: () => void;
  onPopIn: () => void;
  onCopyLights: (scope: "type" | "song") => void;
}) {
  const mood = moodById(s.mood);
  const moodPattern = patternById(mood.pattern);
  const moodMove = MOVEMENTS.find((m) => m.id === mood.movement)!;
  const moodChange = COLOR_CHANGES.find((c) => c.id === mood.colorChange)!;
  const moveId = s.movement === "mood" ? mood.movement : s.movement;
  const changeId = s.colorChange === "mood" ? mood.colorChange : s.colorChange;
  const palette = s.colors.length ? s.colors : mood.colors;
  const pattern = patternById(s.pattern === "mood" ? mood.pattern : s.pattern);

  const moodOptions: Option<string>[] = MOODS.map((m) => ({ value: m.id, label: m.label, description: m.description, swatches: m.colors.map(cssColor), group: m.group ?? "Moods" }));
  const patternOptions: Option<string>[] = [
    { value: "mood", label: `The mood's pattern (${moodPattern.label})`, description: `${moodPattern.description}, the pattern the ${mood.label} mood suggests` },
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
  const positions = rig.positions ?? [];
  const nameOf = new Map(lights.map((l) => [l.id, l.name]));
  const focusOptions = (["SL", "C", "SR"] as Side[]).map((side) => ({ side, ids: focusLights({ fixtures: rig.fixtures.filter((f) => lights.some((l) => l.id === f.fixtureId)) }, side) }));
  const focusIds = s.focus === "all" ? [] : focusOptions.find((f) => f.side === s.focus)?.ids ?? [];
  const sideName: Record<Side, string> = { SL: "Stage left", C: "Center", SR: "Stage right" };
  const blackout = isBlackout(s);

  return (
    <article className="editor" aria-label={`Editing ${s.name}`}>
      <header className="editor-head">
        <span className="editor-num">{index + 1}</span>
        <input className="editor-name" aria-label="Section name" value={s.name} onChange={(e) => onChange({ name: e.target.value })} />
      </header>

      <div className="editor-grid">
        <div className="editor-preview">
          {popped ? (
            <div className="preview-docked">
              <Icon name="popout" size={16} />
              <span>The stage preview is in its own window.</span>
              <button type="button" className="link small" onClick={onPopIn}>
                Put it back here
              </button>
            </div>
          ) : (
            <figure className="preview-figure">
              <div className="preview-frame">
                <SectionPreview s={s} rig={rig} />
                <button type="button" className="preview-popout" onClick={onPopOut} title="Open the preview in a floating window you can move and resize">
                  <Icon name="popout" size={15} /> Pop out
                </button>
              </div>
              <figcaption className="hint">{blackout ? "A blackout: a gap, a pause or a dramatic stop with no lights." : "A sketch of this section on your stage, at its tempo."}</figcaption>
            </figure>
          )}
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
            <Field label="Section tempo" hint={s.bpm === songBpm ? "Same as the song" : undefined}>
              <span className="tempo-pair">
                <NumberInput label="Section tempo in BPM" value={s.bpm} min={30} max={300} onChange={(bpm) => onChange({ bpm })} />
                <TapTempo label="Section tempo" onTempo={(bpm) => onChange({ bpm })} />
              </span>
              {s.bpm !== songBpm && (
                <button type="button" className="link small tempo-reset" onClick={() => onChange({ bpm: songBpm })} title="Use the song tempo for this section">
                  Reset to {songBpm}
                </button>
              )}
            </Field>
            <Field label="Length" hint={sectionBeats(s) % s.beatsPerBar ? `+ ${sectionBeats(s) % s.beatsPerBar} beat${sectionBeats(s) % s.beatsPerBar === 1 ? "" : "s"}` : undefined}>
              <NumberInput label="Length in bars" value={Math.floor(sectionBeats(s) / s.beatsPerBar)} min={1} max={256} suffix="bars" onChange={(bars) => onChange({ bars: Math.max(1, Math.round(bars)) + (sectionBeats(s) % s.beatsPerBar) / s.beatsPerBar })} />
            </Field>
            <Field label="In seconds" hint="Rounds to whole bars">
              <NumberInput
                label="Length in seconds"
                value={Math.round(sectionMs(s) / 100) / 10}
                min={0.1}
                max={3600}
                step={0.1}
                suffix="sec"
                onChange={(sec) => onChange({ bars: barsForSeconds(sec, s.bpm, s.beatsPerBar) })}
              />
            </Field>
            <Field label="Beats per bar">
              <Dropdown label="Beats per bar" value={String(s.beatsPerBar)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} onChange={(v) => onChange({ beatsPerBar: +v })} />
            </Field>
          </div>
        </div>

        <div className="editor-controls">
          {!blackout && (
            <>
          <Group icon="sun" title="Mood and energy" description="The overall feel. The mood sets starting colors and movement, and suggests a pattern; energy sets brightness and speed. Fine-tune brightness for each kind of light below.">
            <Dropdown label="Mood" value={s.mood} options={moodOptions} onChange={(m) => onChange({ mood: m })} className="wide" />
            <EnergyMeter value={s.energy} onChange={(energy) => onChange({ energy })} labels={ENERGY} />
            <BrightnessEditor s={s} rig={rig} onChange={onChange} gesture={gesture} />
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

          <Group icon="stage" title="Individual lights" description="Give particular lights their own color or brightness, or switch them off, for this section. Everything else keeps following the mood and the settings above.">
            <IndividualLights s={s} rig={rig} lights={lights} palette={s.colors.length ? s.colors : mood.colors} onChange={onChange} onCopy={onCopyLights} gesture={gesture} />
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

          <Group icon="mover" title="Moving heads" description="Where the moving heads point and how they move. Movements run around the place they point. Name places on the Stage step.">
            {hasMovers ? (
              <>
                <Field label="Where they point" hint={positions.length ? undefined : "Name places like \"X over the drums\" on the Stage step to pick them here."}>
                  <Dropdown
                    label="Where they point"
                    value={s.aim && positions.some((p) => p.id === s.aim) ? s.aim : "home"}
                    options={[{ value: "home", label: "Home position", description: "Each head's home, set on the Stage step" }, ...positions.map((p) => ({ value: p.id, label: p.name }))]}
                    onChange={(v) => onChange({ aim: v === "home" ? undefined : v })}
                    className="wide"
                  />
                </Field>
                <Field label="Movement">
                  <Dropdown label="Movement" value={s.movement} options={moveOptions} onChange={(movement) => onChange({ movement })} className="wide" />
                </Field>
                {moveId !== "static" && <Segmented label="How heads move together" value={s.moverSpread} onChange={(v: MoverSpread) => onChange({ moverSpread: v })} options={SPREADS.map((x) => ({ value: x.id, label: x.label, title: x.description }))} />}
              </>
            ) : (
              <p className="hint">You have no moving heads on your stage. Put a light in the Moving heads lane on the Stage step to use these settings.</p>
            )}
          </Group>

          <Group icon="focus" title="Focus" description="Put one player in the spotlight, for a solo or a quiet verse. The lights on their side go warm white at full brightness, even if they have their own color; the other side, floor and moving-head lights dim to half.">
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
                ? "Stage left and right are the performers' left and right, so stage left is on the right as the audience sees it."
                : focusIds.length
                  ? `Spotlight from: ${focusIds.map((id) => nameOf.get(id)).join(", ")}. Lights you've switched off stay off.`
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

            </>
          )}

          <Group icon="play" title="Start and end" description="How the lights change when this section begins, and what moves the show on to the next section.">
            <span className="light-picker-label">When this section starts, the lights…</span>
            {blackout ? (
              <ChoiceCards
                label="How the lights go out"
                value={s.transition === "snap" ? "snap" : "fade"}
                onChange={(transition: Transition) => onChange({ transition })}
                options={[
                  { value: "snap", title: "Cut to black", text: "Every light goes out at once. Best for a hard stop." },
                  { value: "fade", title: "Fade to black", text: "The previous look fades out over one bar." },
                ]}
              />
            ) : (
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
            )}
            <span className="light-picker-label">When this section ends…</span>
            <ChoiceCards
              label="What happens when this section ends"
              value={s.autoAdvance ? "auto" : "cue"}
              onChange={(v) => onChange({ autoAdvance: v === "auto" })}
              options={[
                { value: "cue", title: "Wait for my cue", text: blackout ? "The lights stay off until you press the next button or footswitch." : "The look holds until you press the next button or footswitch. Best when the band doesn't play to a click." },
                { value: "auto", title: `Move on after ${lengthLabel(s)}`, text: `The next section starts by itself after about ${fmt(sectionMs(s))}. Only use this when the timing is fixed, like a backing track or sample.` },
              ]}
            />
          </Group>
        </div>
      </div>
    </article>
  );
}
