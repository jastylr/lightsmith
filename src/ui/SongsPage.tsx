import { createPortal } from "react-dom";
import { forwardRef, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  fadeInMs,
  sectionJump,
  barsForLength,
  type Snap,
  clampOffset,
  recordingMs,
  timelineMs,
  applyLook,
  copyLook,
  moverTiming,
  COLOR_JOBS,
  jobPalette,
  switchesColors,
  openGobo,
  strobeRange,
  type BeamSettings,
  type ColorChange,
  type FixtureProfile,
  type LookPreset,
  type MoverShape,
  EFX_MAX,
  DEFAULT_PAN_RANGE,
  DEFAULT_TILT_RANGE,
  emptyShowControl,
  triggerFor,
  type ShowControl,
  UPRIGHT_TILT,
  aimOf,
  type Sequence,
  type StrobeSpeed,
  type Workspace,
  isBlackout,
  lengthLabel,
  sectionTypeById,
  sectionsFromTemplate,
  chaserFit,
  formatDuration,
  effectTargets,
  MATRIX_EFFECTS,
  stageOrder,
  focusLights,
  patternTargets,
  colorById,
  energyOf,
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
import { AddColor, cssColor, MAX_COLORS, PaletteEditor } from "./ColorPicker";
import { makePosition, PositionEditor, unusedSuggestions } from "./PositionsCard";
import { SequencesCard } from "./Sequences";
import { atLeast, useLevel, type Level } from "./level";
import { CopyLook, PresetBar } from "./PresetBar";
import { TriggerField, triggerText } from "./TriggerField";

/**
 * Restarting the preview: `skip` starts sequences at once; `at` starts the
 * animations that many seconds into `section` (playing the song from the middle).
 */
const reduceMotionPref = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Replay = { n: number; skip: boolean; at?: number; section?: string };
import { ChoiceCards, Dropdown, DurationInput, EnergyMeter, Field, NumberInput, Segmented, TapTempo, Toggle, useDismiss, type Option } from "./controls";
import { Icon, type IconName } from "./icons";
import { askConfirm } from "./ConfirmDialog";
import { IndividualLights } from "./IndividualLights";
import { LightPicker, type Light } from "./LightPicker";
import { PreviewWindow } from "./PreviewWindow";
import { RecordingControls, WaveLane } from "./Recording";
import { songSignature, TransportBar } from "./Transport";
import { loadAudioFile, useSongAudio, type AudioTrack } from "./songAudio";
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
  // While the song plays, the section under the playhead. Only the timeline's
  // highlight and the preview follow it: switching the whole settings panel at
  // every section change rebuilds hundreds of elements and stalls the
  // playback for a moment. When playback stops, that section is selected.
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingRef = useRef<string | null>(null);
  // While the preview fills the screen, the section being edited can't change: the
  // settings panel would be rebuilt, preview and all, and that ends full screen. So the
  // timeline's choices (stopping, jumping between sections) only move what the preview
  // shows, and the section is selected once you leave full screen.
  const [stageId, setStageId] = useState<string | null>(null);
  const stageRef = useRef<string | null>(null);
  stageRef.current = stageId;
  const choose = (id: string) => {
    if (document.fullscreenElement) setStageId(id);
    else setSelected(id);
  };
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) return;
      const id = playingRef.current ?? stageRef.current;
      if (stageRef.current) setStageId(null);
      if (id && !playingRef.current) setSelected(id);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const onPlaying = (id: string | null) => {
    // Stopping selects the section you stopped in.
    if (id === null && playingRef.current) choose(playingRef.current);
    playingRef.current = id;
    setPlayingId(id);
  };
  const [popped, setPopped] = useState(false);
  const [pview, setPviewState] = useState<PreviewView>(rememberedView);
  const setPview = (v: PreviewView) => {
    setPviewState(v);
    rememberView(v);
  };
  // Which sections use each chaser, across every song: for "shared with" notes.
  const chaserUses = useMemo(() => {
    const m = new Map<string, { song: string; section: string; sectionId: string }[]>();
    for (const sg of store.project.songs) for (const x of sg.sections) for (const u of x.sequences ?? []) m.set(u.id, [...(m.get(u.id) ?? []), { song: sg.title || "Untitled song", section: x.name, sectionId: x.id }]);
    return m;
  }, [store.project.songs]);
  const fixtureNames = useMemo(() => new Map((store.showFile?.fixtures ?? []).map((f) => [f.id, f.name])), [store.showFile]);
  // Replaying the preview restarts its animations; "skip" starts sequences at once.
  const [replay, setReplay] = useState<Replay>({ n: 0, skip: false });
  // The song's recording: kept in the browser, played with the lights.
  const [muted, setMuted] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const track = useSongAudio(song?.audio, muted, audioVersion);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const filePick = useRef<HTMLInputElement>(null);
  // Where the timeline puts its transport: above it, beside the song's tempo.
  const [transportSlot, setTransportSlot] = useState<HTMLDivElement | null>(null);
  // A second place for the transport: floating over the preview when it fills the screen.
  const [stageTransportSlot, setStageTransportSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => setAudioError(null), [song?.id]);

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
  /** The song's tempo: sections at the old song tempo follow it; ones with their own keep theirs. */
  const setTempo = (bpm: number) => set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) });
  /** The song's time signature: sections in the old one change; ones with their own keep theirs. */
  const setSignature = (beatsPerBar: number) => {
    const was = songSignature(song.sections);
    set({ sections: song.sections.map((s) => (s.beatsPerBar === was ? { ...s, beatsPerBar } : s)) });
  };
  const setSection = (id: string, patch: Partial<Section>) => set({ sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (from: number, to: number) => set({ sections: moveItem(song.sections, from, to) });
  const add = (type: string) => {
    const s = newSection(type, song.bpm);
    set({ sections: [...song.sections, s] });
    setSelected(s.id);
  };
  const addFromPreset = (p: LookPreset) => {
    const s = applyLook(newSection(p.type, song.bpm), p);
    set({ sections: [...song.sections, s] });
    setSelected(s.id);
  };
  const duplicate = (s: Section) => {
    const i = song.sections.findIndex((x) => x.id === s.id);
    // A copy doesn't take the section's own MIDI trigger: two sections can't answer one pad.
    const copy: Section = { ...s, id: newId("sec"), name: `${s.name} copy`, effects: { ...s.effects }, colors: [...s.colors], trigger: undefined };
    set({ sections: [...song.sections.slice(0, i + 1), copy, ...song.sections.slice(i + 1)] });
    setSelected(copy.id);
  };
  /**
   * Split a section into two linked halves: the same look, the first going
   * straight into the second, so the cue that started the whole section
   * still plays both. Chasers and lightning stay with the first half, since
   * they're timed from the start; the second half can then get its own look.
   */
  const split = (s: Section) => {
    const i = song.sections.findIndex((x) => x.id === s.id);
    const half = s.bars / 2;
    const base = s.name.replace(/ \(1 of 2\)$/, "");
    const first: Section = { ...s, bars: half, name: `${base} (1 of 2)`, autoAdvance: true };
    const second: Section = { ...s, id: newId("sec"), bars: half, name: `${base} (2 of 2)`, trigger: undefined, sequences: [], effects: { ...s.effects, lightning: false }, colors: [...s.colors], transition: "snap", autoAdvance: s.autoAdvance };
    set({ sections: [...song.sections.slice(0, i), first, second, ...song.sections.slice(i + 1)] });
    setSelected(second.id);
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

  /** Read a sound file into the song. Loading a different file than the one the project names asks first. */
  const attachAudio = async (file: File) => {
    setAudioError(null);
    setAudioBusy(true);
    try {
      const a = await loadAudioFile(file);
      const was = song.audio;
      if (was && was.key !== a.key && track.status === "missing") {
        const ok = await askConfirm({
          title: "Use a different recording?",
          message: (
            <>
              This song was laid out against <strong>{was.name}</strong> ({fmt(was.durationMs)}). <strong>{file.name}</strong> ({fmt(a.durationMs)}) isn't the same file, so the sections may not line up with it. Where the recording starts on the timeline is kept.
            </>
          ),
          confirmLabel: "Use this file",
        });
        if (!ok) return;
      }
      set({ audio: { key: a.key, name: a.name, durationMs: a.durationMs, offsetMs: clampOffset(was?.offsetMs ?? 0, a) } });
      setAudioVersion((v) => v + 1);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "That file couldn't be read.");
    } finally {
      setAudioBusy(false);
    }
  };
  const setOffset = (offsetMs: number) => song.audio && set({ audio: { ...song.audio, offsetMs } });

  const names = new Map(store.fixtures.map((f) => [f.id, f.name]));
  const lights: Light[] = store.project.rig.fixtures
    .filter((f) => f.role !== "ignore" && store.profiles.has(f.fixtureId))
    .sort(stageOrder)
    .map((f) => ({ id: f.fixtureId, name: names.get(f.fixtureId) ?? `Fixture ${f.fixtureId}`, role: f.role, hasRgb: store.profiles.get(f.fixtureId)!.hasRgb, pos: f.pos ?? { x: 0.5, y: 0.5 } }));
  const current = song.sections.find((s) => s.id === selected);

  return (
    <section className="page songs">
      <header className="song-head">
        <div className="song-line">
          {/* The title is typed in place; the arrow beside it switches songs (the same list as the sidebar's). */}
          <div className="song-name">
            {/* The hidden copy of the title sizes the box to the text. */}
            <span className="song-title-wrap" data-value={song.title || "Song title"}>
              <input className="song-title" aria-label="Song title" value={song.title} onChange={(e) => set({ title: e.target.value })} placeholder="Song title" size={1} />
            </span>
            {songs.length > 1 && (
              <Dropdown
                arrowOnly
                label="Switch to another song"
                value={song.id}
                options={songs.map((s) => ({ value: s.id, label: s.title || "Untitled song", description: songLength(s) }))}
                onChange={setSongId}
                className="song-switch"
              />
            )}
          </div>
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
          {/* The transport sits here, drawn by the timeline (or, before a song has sections, by the page). */}
          <div className="transport-slot" ref={setTransportSlot}>
            {song.sections.length === 0 && <TransportBar sections={[]} songBpm={song.bpm} posMs={0} totalMs={0} playing={false} onPlay={() => undefined} onSeek={() => undefined} onTempo={setTempo} onSignature={setSignature} />}
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
          <input
            ref={filePick}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void attachAudio(f);
            }}
          />
          <Timeline
            transportSlot={transportSlot}
            stageTransportSlot={stageTransportSlot}
            onTempo={setTempo}
            onSignature={setSignature}
            audioTrack={track}
            onOffset={setOffset}
            onPickAudio={() => filePick.current?.click()}
            onDropAudio={(f) => void attachAudio(f)}
            recording={(ctx) => <RecordingControls {...ctx} audio={song.audio} track={track} muted={muted} onMute={setMuted} onPick={() => filePick.current?.click()} onOffset={setOffset} onRemove={() => set({ audio: undefined })} busy={audioBusy} error={audioError} />}
            sequences={store.project.sequences ?? []}
            song={song} selected={playingId ?? stageId ?? selected} onSelect={choose} onPlaying={onPlaying} onPlayFrom={(section, at) => setReplay((r) => ({ n: r.n + 1, skip: false, at, section }))} onMove={move} onResize={(id, bars) => setSection(id, { bars })} onLink={(id, on) => setSection(id, { autoAdvance: on })} onDelete={remove} addButton={<AddSectionMenu onAdd={add} presets={store.project.presets ?? []} onAddPreset={addFromPreset} />} gesture={gesture} />
          <div className="songs-body">
            <div className="cue-panel">
              <div className="cue-panel-head">
                <h2>Sections</h2>
                <span>Drag to reorder</span>
              </div>
              <CueList song={song} selected={selected} onSelect={setSelected} onMove={move} onDuplicate={duplicate} onSplit={split} onDelete={remove} gesture={gesture} />
            </div>
            {current && (
              <LookEditor key={current.id} stageTransportRef={setStageTransportSlot} others={song.sections.filter((x) => x.id !== current.id && !isBlackout(x))} onCopyLookTo={(ids) => set({ sections: song.sections.map((x) => (ids.includes(x.id) ? copyLook(current, x) : x)) })} previewSection={playingId || stageId ? song.sections.find((x) => x.id === (playingId ?? stageId)) : undefined} previewPlaying={!!playingId} profiles={store.profiles} onRigChange={store.setRig} sequences={store.project.sequences ?? []} onSequences={store.setSequences} presets={store.project.presets ?? []} onPresets={store.setPresets} control={store.project.control} onControl={store.setControl} view={pview} onView={setPview} names={fixtureNames} chaserUses={chaserUses} showFile={store.showFile} replay={replay} onReplay={(skip) => setReplay((r) => ({ n: r.n + 1, skip }))} s={current} songBpm={song.bpm} gesture={gesture} popped={popped} onPopOut={() => setPopped(true)} onPopIn={() => setPopped(false)} onCopyLights={(scope) => copyLights(current, scope)} rig={store.project.rig} lights={lights} onChange={(p) => setSection(current.id, p)} index={song.sections.indexOf(current)} prevSection={song.sections[song.sections.indexOf(current) - 1]} nextSection={song.sections[song.sections.indexOf(current) + 1]} />
            )}
            {popped && current && (
              <PreviewWindow title={current.name} onClose={() => setPopped(false)}>
                <SectionPreview s={(playingId && song.sections.find((x) => x.id === playingId)) || current} rig={store.project.rig} sequences={store.project.sequences} replay={replay} view={pview} names={fixtureNames} loop={rememberedLoop() && !playingId} follow={!!playingId} />
              </PreviewWindow>
            )}
          </div>
        </>
      )}

      <div className="page-actions">
        <button className="primary" onClick={onNext} disabled={song.sections.length === 0}>
          Continue to show control
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

function AddSectionMenu({ onAdd, presets = [], onAddPreset }: { onAdd: (type: string) => void; presets?: LookPreset[]; onAddPreset?: (p: LookPreset) => void }) {
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
          {presets.length > 0 && onAddPreset && (
            <>
              <span className="menu-group">Your presets</span>
              {presets.map((p) => (
                <button
                  key={p.id}
                  role="menuitem"
                  onClick={() => {
                    onAddPreset(p);
                    setOpen(false);
                  }}
                >
                  <span className="swatch-row">
                    {(p.look.colors?.length ? p.look.colors : moodById(p.look.mood ?? "dark").colors).slice(0, 4).map((c, i) => (
                      <i key={`${c}-${i}`} style={{ background: cssColor(c) }} />
                    ))}
                  </span>
                  {p.name}
                  <small>{sectionTypeById(p.type).label}</small>
                </button>
              ))}
            </>
          )}
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
  onPlaying,
  onMove,
  onResize,
  onLink,
  onDelete,
  addButton,
  gesture,
  onPlayFrom,
  sequences,
  audioTrack,
  onOffset,
  onPickAudio,
  onDropAudio,
  recording,
  transportSlot,
  stageTransportSlot,
  onTempo,
  onSignature,
}: {
  onTempo: (bpm: number) => void;
  onSignature: (beatsPerBar: number) => void;
  /** Where the transport bar goes (above the timeline, in the song's header). */
  transportSlot: HTMLElement | null;
  /** Inside the preview: the transport shows there too while the preview fills the screen. */
  stageTransportSlot: HTMLElement | null;
  /** The song's recording, if it has one: drawn under the blocks and played with the lights. */
  audioTrack: AudioTrack;
  onOffset: (ms: number) => void;
  onPickAudio: () => void;
  onDropAudio: (f: File) => void;
  /** The recording's controls, shown under the timeline. */
  recording: (ctx: { playheadMs: number; tall: boolean; onTall: (t: boolean) => void }) => ReactNode;
  sequences: Sequence[];
  /** Playback started (or jumped) to `at` seconds into a section: restart the preview there. */
  onPlayFrom: (section: string, at: number) => void;
  song: Song;
  selected: string | null;
  onSelect: (id: string) => void;
  /** During playback, the section under the playhead; null when playback stops. */
  onPlaying: (id: string | null) => void;
  onMove: (a: number, b: number) => void;
  onResize: (id: string, bars: number) => void;
  /** Link a section to the next (it goes straight into it, so one cue plays both), or unlink it. */
  onLink: (id: string, on: boolean) => void;
  onDelete: (s: Section) => void;
  addButton: ReactNode;
  gesture: Gesture;
}) {
  // Whether the preview fills the screen (then the transport floats over it too).
  const [stageFullScreen, setStageFullScreen] = useState(false);
  useEffect(() => {
    const onChange = () => setStageFullScreen(!!stageTransportSlot && !!document.fullscreenElement?.contains(stageTransportSlot));
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [stageTransportSlot]);
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle, wasDrag } = useSortable(keys, onMove, "x", gesture);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [scale, setScaleNow] = useState(10); // pixels per second
  const [tall, setTallNow] = useState(rememberedTall);
  const setTall = (t: boolean) => {
    setTallNow(t);
    rememberTall(t);
  };
  // Zooming keeps one moment in the same place on screen: where the pointer is, or the playhead.
  const zoomAnchor = useRef<{ sec: number; x: number } | null>(null);
  const zoom = (next: number, clientX?: number) => {
    const box = scroller.current;
    const tr = track.current;
    const v = Math.max(1, Math.min(MAX_SCALE, next));
    if (box && tr) {
      const b = box.getBoundingClientRect();
      const t0 = tr.getBoundingClientRect().left;
      const head = (posRef.current / 1000) * scale + t0;
      // The pointer, else the playhead if it's in view, else the middle.
      const x = clientX ?? (head >= b.left && head <= b.right ? head : b.left + b.width / 2);
      zoomAnchor.current = { sec: (x - t0) / scale, x: x - b.left };
    }
    fitted.current = false;
    setScaleNow(v);
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const box = scroller.current;
    const tr = track.current;
    if (!a || !box || !tr) return;
    zoomAnchor.current = null;
    box.scrollLeft += tr.getBoundingClientRect().left + a.sec * scale - (box.getBoundingClientRect().left + a.x);
  }, [scale]);
  // Ctrl or Cmd and the wheel (or a trackpad pinch) zooms around the pointer.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current(latest.current.scale * Math.exp(-e.deltaY * 0.004), e.clientX);
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => box.removeEventListener("wheel", wheel);
  }, []);
  const [resizing, setResizing] = useState<{ id: string; snap: Snap } | null>(null);
  // How lengths snap: whole bars, beats, or freely (songs not recorded to a click).
  const [snap, setSnapNow] = useState<Snap>(rememberedSnap);
  const setSnap = (v: Snap) => {
    setSnapNow(v);
    rememberSnap(v);
  };
  const audio = song.audio;
  // The recording can run on past the last section: the timeline shows all of it.
  const totalSec = timelineMs(song.sections.reduce((t, s) => t + sectionMs(s), 0), audio) / 1000;
  const el = audioTrack.status === "ready" ? audioTrack.el : null;
  const latest = useRef({ song, onResize, scale, snap, totalSec });
  latest.current = { song, onResize, scale, snap, totalSec };

  // Fit the song to the strip when it's first shown (and when switching songs).
  // While the song is fitted (not zoomed by hand), it stays fitted when the strip changes width,
  // for example when the sidebar folds away.
  const fitted = useRef(true);
  const fit = () => {
    const w = (scroller.current?.clientWidth ?? 800) - 24;
    fitted.current = true;
    setScaleNow(Math.max(2, Math.min(40, w / Math.max(latest.current.totalSec, 10))));
  };
  useLayoutEffect(fit, [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    const box = scroller.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let last = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === last) return;
      last = box.clientWidth;
      if (fitted.current) fitRef.current();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

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
    if (el && audio && !el.paused) {
      const r = recordingMs(t, audio);
      // Before the recording comes in or after it ends: silence, and the music waits (or stops).
      if (r === null || r < 0) el.pause();
      else el.currentTime = r / 1000;
    }
    // While playing, the frame loop moves the highlight; stopped, the section you land in is selected.
    const s = sectionAt(t);
    if (s && s.id !== selected && !playing) onSelect(s.id);
  };
  const latestPlay = useRef({ song, selected, onSelect: onPlaying, totalMs, scale, el });
  latestPlay.current = { song, selected, onSelect: onPlaying, totalMs, scale, el };
  // When playback stops, hand the section under the playhead to the page to select.
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  useEffect(() => {
    if (!playing) onPlayingRef.current(null);
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const { song: sg, selected: sel, onSelect: pick, totalMs: total, scale: sc, el: music } = latestPlay.current;
      let t = posRef.current + (now - last);
      last = now;
      // With a recording, the music is the clock: the playhead follows it, so lights and sound can't drift apart.
      const a = sg.audio;
      if (music && a) {
        if (!music.paused && !music.ended) t = music.currentTime * 1000 - a.offsetMs;
        else if (music.paused) {
          const r = recordingMs(t, a);
          if (r !== null && r >= 0) {
            music.currentTime = r / 1000;
            void music.play().catch(() => undefined);
          }
        }
      }
      if (t >= total) {
        posRef.current = total;
        setPos(total);
        setPlaying(false);
        music?.pause();
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
    return () => {
      cancelAnimationFrame(raf);
      latestPlay.current.el?.pause();
    };
  }, [playing]);
  const togglePlay = () => {
    if (!playing) {
      const from = posRef.current >= totalMs - 1 ? 0 : posRef.current;
      seek(from);
      // Start the preview's clock at the playhead, so sequences and patterns line up with the song.
      let start = 0;
      const s = song.sections.find((x) => (start += sectionMs(x)) > from) ?? song.sections[0];
      if (s) {
        onPlayFrom(s.id, Math.max(0, (from - (start - sectionMs(s))) / 1000));
        onPlaying(s.id);
      }
    }
    setPlaying((p) => !p);
  };
  // Dragging the playhead, or along the ruler, moves through the song (and the music with it).
  const [scrubbing, setScrubbing] = useState(false);
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const sectionsRef = useRef(song.sections);
  sectionsRef.current = song.sections;
  const scrub = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const at = (clientX: number) => {
      const t = track.current;
      return t ? ((clientX - t.getBoundingClientRect().left) / latest.current.scale) * 1000 : 0;
    };
    seek(at(e.clientX));
    setScrubbing(true);
    document.body.classList.add("is-scrubbing");
    const move = (ev: PointerEvent) => seekRef.current(at(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("is-scrubbing");
      setScrubbing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Space plays and pauses, unless you're typing or on a control.
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Space plays and pauses; Return goes back to the start, as in most DAWs;
      // the left and right arrows step between sections, like markers.
      const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if ((e.code !== "Space" && e.key !== "Enter" && !arrow) || (e.repeat && !arrow) || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      // The transport's and the preview's own buttons keep the arrows working after a click.
      const playerButton = arrow && t.closest(".transport-bar button, .preview-tools button, .preview-views button");
      if (!playerButton && t.closest("input, textarea, select, button, [contenteditable], [role=radio], [role=checkbox], .lights-pop")) return;
      // Arrows also move between tabs, blocks and other focused things: leave those alone.
      if (arrow) {
        if (!playerButton && t.closest("[tabindex], [role=listitem], [role=tab], [role=slider], [role=listbox], [role=option]")) return;
        const ms = sectionJump(sectionsRef.current, posRef.current, e.key === "ArrowLeft" ? -1 : 1);
        if (ms !== null) {
          e.preventDefault();
          seekRef.current(ms);
        }
        return;
      }
      // Return also opens a focused section, link or tab: leave those alone.
      if (e.key === "Enter" && t.closest("a, [tabindex], [role=listitem], [role=tab]")) return;
      e.preventDefault();
      if (e.key === "Enter") seekRef.current(0);
      else toggleRef.current();
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

  // Keep the selected section in view in the timeline (for example one just
  // added at the end). Only the timeline scrolls sideways: the page stays put,
  // so picking a section while you're deep in its settings doesn't jump you up.
  useEffect(() => {
    const box = scroller.current;
    const el = selected ? box?.querySelector<HTMLElement>(`[data-id="${selected}"]`) : null;
    if (playing || !box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const by = r.left < b.left ? r.left - b.left - 16 : r.right > b.right ? r.right - b.right + 16 : 0;
    if (by) box.scrollBy({ left: by, behavior: reduceMotionPref() ? "auto" : "smooth" });
  }, [selected, song.sections.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const block = (e.currentTarget as HTMLElement).parentElement!;
    gesture.begin(); // the whole drag is one undo step
    const left = block.offsetLeft;
    // Where on the handle it was grabbed, so the edge doesn't jump to the pointer (it shows when not snapping).
    const grab = block.getBoundingClientRect().right - e.clientX;
    let clientX = e.clientX;
    // Option (Alt) snaps one step finer; Option and Shift together don't snap at all.
    let alt = e.altKey;
    let shift = e.shiftKey;
    const mode = () => finerSnap(latest.current.snap, alt, shift);
    let raf = 0;
    setResizing({ id, snap: mode() });
    const update = () => {
      const { song: sg, onResize: resize, scale: sc } = latest.current;
      const s = sg.sections.find((x) => x.id === id);
      const t = track.current;
      if (!s || !t) return;
      const x = clientX + grab - t.getBoundingClientRect().left - left;
      const bars = barsForLength((x / sc) * 1000, s, mode());
      if (Math.abs(bars - s.bars) > 1e-9) resize(id, bars);
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
      alt = ev.altKey;
      shift = ev.shiftKey;
      setResizing({ id, snap: mode() });
      update();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Alt" && ev.key !== "Shift") return;
      alt = ev.altKey;
      shift = ev.shiftKey;
      setResizing({ id, snap: mode() });
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

  // Shift + arrows: a bar longer or shorter; with Alt, a beat. With snapping off, 50 ms (with Alt, 10 ms).
  const resizeKey = (e: ReactKeyboardEvent, s: Section) => {
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const ms = sectionMs(s);
    const beatMs = 60000 / s.bpm;
    const barMs = beatMs * s.beatsPerBar;
    if (snap === "off") return onResize(s.id, barsForLength(ms + dir * (e.altKey ? 10 : 50), s, "off"));
    const unit = e.altKey || snap === "beat" ? beatMs : barMs;
    // Step to the next line of the grid, so a length between lines lands on one.
    const at = ms / unit;
    const next = (dir > 0 ? Math.floor(at + 1e-6) + 1 : Math.ceil(at - 1e-6) - 1) * unit;
    onResize(s.id, barsForLength(next, s, unit === barMs ? "bar" : "beat"));
  };

  const step = tickStep(scale);
  const width = totalSec * scale;
  return (
    <div
      className="timeline-wrap"
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file" && i.type.startsWith("audio/"))) e.preventDefault();
      }}
      onDrop={(e) => {
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("audio/"));
        if (!f) return;
        e.preventDefault();
        onDropAudio(f);
      }}
    >
      <div className={audio ? `timeline-row with-audio${tall ? " tall" : ""}` : "timeline-row"}>
        <div className="timeline" ref={scroller}>
          <div className="timeline-track" ref={track} style={{ width: width + 16 }}>
            <div className="ruler" title="Click or drag to move the playhead" onPointerDown={scrub}>
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
                    {/* Where each chaser runs in the section: solid for the first run, faint where it repeats. */}
                    {(s.sequences ?? []).map((u, k) => {
                      const q = sequences.find((x) => x.id === u.id);
                      if (!q) return null;
                      const fit = chaserFit(q, u.delay, s);
                      const pct = (v: number) => `${Math.min(100, (v / Math.max(1, fit.sectionMs)) * 100)}%`;
                      return (
                        <span key={u.id} className={fit.overMs > 0 ? "block-chaser over" : "block-chaser"} style={{ left: pct(fit.startMs), width: `calc(${pct(fit.repeats ? fit.sectionMs : fit.endMs)} - ${pct(fit.startMs)})`, bottom: `${3 + k * 5}px` }} title={`${q.name}: ${formatDuration(fit.startMs)} to ${formatDuration(fit.endMs)}${fit.repeats ? ", repeating" : ""}`}>
                          <i style={{ width: fit.repeats ? `${Math.min(100, (fit.runMs / Math.max(1, fit.sectionMs - fit.startMs)) * 100)}%` : "100%" }} />
                        </span>
                      );
                    })}
                    <span className="block-text">
                      <strong>{s.name}</strong>
                      <small>{fmt(ms)}</small>
                    </span>
                    <span className="block-resize" title="Drag to change the length (hold Alt / Option for single beats)" onPointerDown={(e) => startResize(e, s.id)} />
                  </div>
                );
              })}
            </div>
            {/* Links between sections: a linked section goes straight into the next, so one cue plays both. */}
            <div className="links">
              {song.sections.slice(0, -1).map((s, i) => {
                let x = 0;
                for (let k = 0; k <= i; k++) x += (sectionMs(song.sections[k]!) / 1000) * scale;
                const next = song.sections[i + 1]!;
                const on = !!s.autoAdvance;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={on ? "link-toggle on" : "link-toggle"}
                    style={{ left: x - 1.5 }}
                    aria-pressed={on}
                    aria-label={on ? `${s.name} goes straight into ${next.name}. Unlink them` : `Link ${s.name} to ${next.name}, so one cue plays both`}
                    title={on ? `Linked: ${next.name} starts straight after ${s.name}, so one cue plays both. Click to unlink.` : `Link ${s.name} to ${next.name}: one cue plays both, ${next.name} starting straight after.`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onLink(s.id, !on)}
                  >
                    <Icon name="link" size={12} />
                  </button>
                );
              })}
            </div>
            {audio && <WaveLane audio={audio} track={audioTrack} scale={scale} sections={song.sections} onSeek={seek} onOffset={onOffset} onPick={onPickAudio} gesture={gesture} />}
            <div className={scrubbing ? "playhead scrubbing" : "playhead"} style={{ left: (pos / 1000) * scale }}>
              <span className="playhead-grip" onPointerDown={scrub} title="Drag to move the playhead" aria-hidden="true" />
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
                      <strong>{lengthLabel(s)}</strong> · {resizing.snap === "off" ? formatDuration(sectionMs(s)) : fmt(sectionMs(s))}
                    </span>
                    <small>{SNAP_HINT[resizing.snap]}</small>
                  </div>
                );
              })()}
          </div>
        </div>
        {/* Outside the scrolling strip, so its menu isn't clipped. */}
        {addButton}
      </div>
      <div className="timeline-foot">
        {transportSlot && createPortal(<TransportBar sections={song.sections} songBpm={song.bpm} posMs={pos} totalMs={totalMs} playing={playing} onPlay={togglePlay} onSeek={seek} onTempo={onTempo} onSignature={onSignature} />, transportSlot)}
        {stageFullScreen && stageTransportSlot && createPortal(<TransportBar sections={song.sections} songBpm={song.bpm} posMs={pos} totalMs={totalMs} playing={playing} onPlay={togglePlay} onSeek={seek} onTempo={onTempo} onSignature={onSignature} />, stageTransportSlot)}
        {recording({ playheadMs: pos, tall, onTall: setTall })}
        {!audio && <p className="hint">Drag a block to reorder it, or its right edge to change its length. Select one and press Delete to remove it.</p>}
        <div className="snap-pick" title="How a section's length snaps when you drag its edge. Hold Option (Alt) for one step finer, or Option and Shift to not snap at all.">
          <span>Snap</span>
          <Segmented label="Snap section lengths to" value={snap} onChange={setSnap} options={[{ value: "bar", label: "Bars" }, { value: "beat", label: "Beats" }, { value: "off", label: "Off" }]} />
        </div>
        <div className="zoom" role="group" aria-label="Zoom the timeline">
          <button type="button" className="ghost small icon-only" onClick={() => zoom(scale / 1.5)} aria-label="Zoom out" title="Zoom out">
            <Icon name="minus" size={14} />
          </button>
          <button type="button" className="ghost small" onClick={fit} title="Fit the whole song">
            Fit
          </button>
          <button type="button" className="ghost small icon-only" onClick={() => zoom(scale * 1.5)} disabled={scale >= MAX_SCALE} aria-label="Zoom in" title="Zoom in">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CueList({ song, selected, onSelect, onMove, onDuplicate, onSplit, onDelete, gesture }: { song: Song; selected: string | null; onSelect: (id: string) => void; onMove: (a: number, b: number) => void; onDuplicate: (s: Section) => void; onSplit: (s: Section) => void; onDelete: (s: Section) => void; gesture: Gesture }) {
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
                {s.autoAdvance && i < song.sections.length - 1 && (
                  <span className="cue-linked" title={`Goes straight into ${song.sections[i + 1]!.name}: one cue plays both`}>
                    {" "}
                    <Icon name="link" size={11} /> linked
                  </span>
                )}
              </small>
            </span>
            <Icon name="chevronRight" size={16} className="cue-chevron" />
          </button>
          {/* Shown on hover and on the selected section. */}
          <span className="cue-actions">
            <button type="button" className="cue-action" onClick={() => onSplit(s)} aria-label={`Split ${s.name} into two linked parts`} title="Split into two linked halves: same look, one cue plays both">
              <Icon name="split" size={15} />
            </button>
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
/** Which settings cards are closed. Remembered across sections and visits. */
const CLOSED_KEY = "lightsmith.closedCards.v1";
function useClosedCards() {
  const [closed, setClosedState] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const setClosed = (next: Set<string>) => {
    setClosedState(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
    } catch {
      /* not remembered; fine */
    }
  };
  return [closed, setClosed] as const;
}

/**
 * A settings card. Click its header to close it: a closed card shows a
 * one-line summary of what's set, and "Changed" when it has settings of its
 * own beyond what the mood gives.
 */
function Group({
  icon,
  title,
  description,
  children,
  aside,
  card,
}: {
  icon: IconName;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  card?: { id: string; closed: boolean; onToggle?: () => void; summary: string; changed: boolean; hidden?: boolean };
}) {
  const bodyId = useId();
  if (card?.hidden) return null;
  const closed = !!card?.closed;
  const heading = (
    <>
      <span className="group-icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="group-titles">
        <h3>
          {title}
          {closed && card?.changed && (
            <span className="group-changed" title="This card has settings of its own">
              Changed
            </span>
          )}
        </h3>
        <p>{closed ? card!.summary : description}</p>
      </div>
    </>
  );
  return (
    <section className={closed ? "group closed" : "group"} id={card ? `card-${card.id}` : undefined} data-card={card?.id}>
      <header className="group-head">
        {card?.onToggle ? (
          <button type="button" className="group-toggle-head" aria-expanded={!closed} aria-controls={bodyId} onClick={card.onToggle} title={closed ? `Open ${title}` : `Close ${title}`}>
            {heading}
            <Icon name={closed ? "chevronDown" : "chevronUp"} size={18} />
          </button>
        ) : (
          heading
        )}
        {!closed && aside}
      </header>
      {!closed && (
        <div className="group-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
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
      <h4 className="subhead">Brightness</h4>
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

function ColorLayoutEditor({
  s,
  rig,
  palette,
  changing,
  onChange,
  onAddToJob,
}: {
  s: Section;
  rig: Store["project"]["rig"];
  palette: string[];
  changing: boolean;
  onChange: (p: Partial<Section>) => void;
  /** Add a color (new to the section or not) to just one kind of light. */
  onAddToJob: (job: ColorJob, color: string) => void;
}) {
  const jobs = COLOR_JOBS.filter((j) => rig.fixtures.some((f) => f.role === j));
  if (!jobs.length) return null;
  const layout = colorLayoutOf(s);
  const set = (job: ColorJob, t: ColorTarget) => onChange({ colorLayout: { ...(s.colorLayout ?? {}), [job]: t } });
  /** Click a color: from Mix or white, use just that color; otherwise add it or take it out (keeping at least one). */
  const toggle = (job: ColorJob, c: string) => {
    const v = layout[job];
    const now = v === "mix" || v === "white" ? [] : (jobPalette(v, palette) as string[]);
    if (!now.length) return set(job, [c]);
    const next = now.includes(c) ? now.filter((x) => x !== c) : [...now, c];
    if (next.length) set(job, palette.filter((x) => next.includes(x)));
  };
  /** Steady, with the section, or at this kind of light's own rate. */
  const setRate = (job: ColorJob, v: string) => {
    const rates = { ...(s.colorRates ?? {}) };
    delete rates[job];
    if (v !== "steady" && v !== "section") rates[job] = v as ColorChange;
    onChange({ colorSwitch: { ...(s.colorSwitch ?? {}), [job]: v !== "steady" }, colorRates: rates });
  };
  const sectionRate = COLOR_CHANGES.find((c) => c.id === (s.colorChange === "mood" ? moodById(s.mood).colorChange : s.colorChange));
  const rateOptions: Option<string>[] = [
    { value: "steady", label: "Steady", description: "These lights keep their colors" },
    { value: "section", label: "With the section", description: `Change when the section's colors do (${changing ? sectionRate?.label.toLowerCase() ?? "" : "they're steady now"})` },
    ...COLOR_CHANGES.filter((c) => c.id !== "hold").map((c) => ({ value: c.id, label: c.label, description: "Their own rate", group: "Their own rate" })),
  ];
  return (
    <div className="color-layout">
      <h4 className="subhead">Which lights get which color</h4>
      <p className="hint layout-hint">
        Mix spreads all your colors across those lights. Or click colors to pick just the ones they use: one color puts them all in it, several spread just those. Ringed colors are in use; faded ones are on offer. The last swatch is warm white.
 The menu at the end of each row sets how often those lights change color: steady, with the section, or at their own rate.
      </p>
      {jobs.map((job) => {
        const v = layout[job];
        const mode = v === "mix" ? "mix" : v === "white" ? "white" : "pick";
        const chosen = mode === "pick" ? (jobPalette(v, palette) as string[]) : [];
        const rateNow = !switchesColors(s, job) ? "steady" : s.colorRates?.[job] ?? "section";
        const several = mode === "mix" ? palette.length > 1 : chosen.length > 1;
        return (
          <div key={job} className="layout-row">
            <span className="layout-job">{JOB_LABEL[job]}</span>
            <div className="layout-options" role="group" aria-label={`Colors for ${JOB_LABEL[job]}`}>
              <button type="button" aria-pressed={mode === "mix"} className={mode === "mix" ? "lo on" : "lo"} onClick={() => set(job, "mix")} title="Spread all the colors across these lights">
                <span className="lo-mix" style={{ background: `conic-gradient(${palette.map(cssColor).join(", ")}, ${cssColor(palette[0]!)})` }} />
                Mix
              </button>
              {palette.map((c, i) => {
                const on = chosen.includes(c);
                return (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    aria-pressed={on}
                    className={on ? "lo on" : "lo"}
                    onClick={() => toggle(job, c)}
                    title={on ? `Stop using ${colorById(c).label.toLowerCase()} on ${JOB_LABEL[job].toLowerCase()}` : `Use ${colorById(c).label.toLowerCase()} on ${JOB_LABEL[job].toLowerCase()}`}
                  >
                    <span className="lo-swatch" style={{ background: cssColor(c) }} />
                    <span className="visually-hidden">{colorById(c).label}</span>
                  </button>
                );
              })}
              <button type="button" aria-pressed={mode === "white"} className={mode === "white" ? "lo on" : "lo"} onClick={() => set(job, "white")} title="Warm white">
                <span className="lo-swatch" style={{ background: "#ffd9a8" }} />
                <span className="visually-hidden">Warm white</span>
              </button>
              <AddColor
                compact
                label={`Add a color for ${JOB_LABEL[job].toLowerCase()}`}
                title={`Add a color just for ${JOB_LABEL[job].toLowerCase()}`}
                chosen={mode === "mix" ? palette : chosen}
                full={palette.length >= MAX_COLORS}
                onAdd={(c) => onAddToJob(job, c)}
              />
              {several && (
                <span className="lo-rate" title={`How often ${JOB_LABEL[job].toLowerCase()} change color`}>
                  <Dropdown label={`How often ${JOB_LABEL[job].toLowerCase()} change color`} value={rateNow} options={rateOptions} onChange={(v) => setRate(job, v)} />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The stage preview for a section, or the "All lights off" panel for a blackout. */
function SectionPreview(props: { s: Section; rig: Store["project"]["rig"]; sequences?: Sequence[]; replay?: Replay; compact?: boolean; view?: PreviewView; names?: Map<number, string>; loop?: boolean; follow?: boolean }) {
  const { s, follow } = props;
  // While the song plays (`follow`), a section that fades in fades over the one before,
  // as it will in QLC+. Two slots take turns: the outgoing picture stays where it is
  // (so it carries on moving rather than starting over) and the new one comes up over it.
  const [fade, setFade] = useState<{ front: "a" | "b"; back: Section | null; ms: number }>({ front: "a", back: null, ms: 0 });
  const last = useRef<{ s: Section; follow: boolean }>({ s, follow: !!follow });
  useLayoutEffect(() => {
    const was = last.current;
    last.current = { s, follow: !!follow };
    if (!follow) {
      setFade((f) => (f.back ? { ...f, back: null } : f));
      return;
    }
    if (!was.follow || was.s.id === s.id) return;
    const ms = isBlackout(s) || isBlackout(was.s) ? 0 : fadeInMs(s);
    if (!ms) {
      setFade((f) => (f.back ? { ...f, back: null } : f));
      return;
    }
    setFade((f) => ({ front: f.front === "a" ? "b" : "a", back: was.s, ms }));
    const t = window.setTimeout(() => setFade((f) => ({ ...f, back: null })), ms);
    return () => window.clearTimeout(t);
  }, [s, follow]);
  const slot = (k: "a" | "b") =>
    k === fade.front ? (
      <div key={k} className={fade.back ? "preview-over fading" : "preview-over"} style={fade.back ? { animationDuration: `${fade.ms}ms` } : undefined}>
        <SectionPicture {...props} />
      </div>
    ) : fade.back ? (
      <div key={k} className="preview-under" aria-hidden="true">
        <SectionPicture {...props} s={fade.back} />
      </div>
    ) : null;
  return (
    <div className="preview-crossfade">
      {slot("a")}
      {slot("b")}
    </div>
  );
}

function SectionPicture({ s, rig, sequences, replay, compact, view, names, loop }: { s: Section; rig: Store["project"]["rig"]; sequences?: Sequence[]; replay?: Replay; compact?: boolean; view?: PreviewView; names?: Map<number, string>; loop?: boolean }) {
  if (!isBlackout(s)) return <StagePreview key={`${replay?.n ?? 0}-${view ?? "front"}-${s.id}`} section={s} rig={rig} sequences={sequences} skipDelay={replay?.skip} startAt={replay?.section === s.id ? replay.at : 0} compact={compact} view={view} names={names} loop={loop} />;
  if (compact) return <div className="blackout-preview compact"><Icon name="moon" size={18} /></div>;
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
  profiles,
  onRigChange,
  sequences,
  onSequences,
  showFile,
  replay,
  onReplay,
  presets,
  onPresets,
  control,
  onControl,
  view,
  onView,
  names,
  chaserUses,
  prevSection,
  nextSection,
  previewSection,
  previewPlaying,
  stageTransportRef,
  others,
  onCopyLookTo,
}: {
  /** The song's other sections (not blackouts), to copy this look to. */
  others?: Section[];
  onCopyLookTo?: (ids: string[]) => void;
  /** Whether `previewSection` is there because the song is playing (or only picked in full screen). */
  previewPlaying?: boolean;
  /** Where the song's transport floats while the preview fills the screen. */
  stageTransportRef?: (el: HTMLDivElement | null) => void;
  /** While the song plays, the section to show in the preview (the one under the playhead). */
  previewSection?: Section;
  /** The sections either side, for linking (going straight into the next). */
  prevSection?: Section;
  nextSection?: Section;
  chaserUses: Map<string, { song: string; section: string; sectionId: string }[]>;
  view: PreviewView;
  onView: (v: PreviewView) => void;
  names: Map<number, string>;
  control: ShowControl | undefined;
  onControl: (c: ShowControl) => void;
  presets: LookPreset[];
  onPresets: (next: LookPreset[]) => void;
  sequences: Sequence[];
  onSequences: (next: Sequence[]) => void;
  showFile: Workspace | null;
  replay: Replay;
  onReplay: (skipDelay: boolean) => void;
  profiles: Map<number, FixtureProfile>;
  onRigChange: (rig: Store["project"]["rig"]) => void;
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
  const aimed = s.aim ? positions.find((p) => p.id === s.aim) : undefined;
  // A new color isn't handed to every light on "Mix": those keep the colors
  // they had, and the new one goes only where it's picked.
  const setColors = (colors: string[]) => {
    const added = colors.some((c) => !palette.includes(c));
    if (!added || !palette.length) return onChange({ colors });
    const layoutNow = colorLayoutOf(s);
    const kept = { ...(s.colorLayout ?? {}) };
    for (const j of COLOR_JOBS) if (layoutNow[j] === "mix") kept[j] = [...palette];
    onChange({ colors, colorLayout: kept });
  };
  /** A color for one kind of light only: added to the section's colors if it's new, and picked for that row. */
  const addToJob = (job: ColorJob, c: string) => {
    const layoutNow = colorLayoutOf(s);
    const v = layoutNow[job];
    const current = v === "white" ? [] : v === "mix" ? [...palette] : (jobPalette(v, palette) as string[]);
    if (current.includes(c)) return;
    const isNew = !palette.includes(c);
    if (isNew && palette.length >= MAX_COLORS) return;
    const colors = isNew ? [...palette, c] : palette;
    const next = { ...(s.colorLayout ?? {}) };
    // Rows on Mix keep the colors they had, so the new one goes only here.
    if (isNew) for (const j of COLOR_JOBS) if (j !== job && layoutNow[j] === "mix") next[j] = [...palette];
    next[job] = colors.filter((x) => current.includes(x) || x === c);
    onChange({ colors, colorLayout: next });
  };
  const moveDef = MOVEMENTS.find((m) => m.id === moveId);
  // What will really run: slowed down when the heads can't get round the shape in time.
  const timing = moverTiming(s, moveDef ?? { bars: 0, width: 0, height: 0 }, rig);
  const cycleBeats = timing.beats;
  const moverProfiles = rig.fixtures.filter((f) => f.role === "mover").flatMap((f) => (profiles.get(f.fixtureId) ? [profiles.get(f.fixtureId)!] : []));
  const nameOf = new Map(lights.map((l) => [l.id, l.name]));
  const focusOptions = (["SL", "C", "SR"] as Side[]).map((side) => ({ side, ids: focusLights({ fixtures: rig.fixtures.filter((f) => lights.some((l) => l.id === f.fixtureId)) }, side) }));
  const focusIds = s.focus === "all" ? [] : focusOptions.find((f) => f.side === s.focus)?.ids ?? [];
  const sideName: Record<Side, string> = { SL: "Stage left", C: "Center", SR: "Stage right" };
  const blackout = isBlackout(s);

  // ---- collapsible cards: what each one says when closed, and whether it has settings of its own
  const [closed, setClosed] = useClosedCards();
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const ownLights = Object.keys(s.lights ?? {}).length;
  const usedSequences = (s.sequences ?? []).flatMap((u) => sequences.filter((q) => q.id === u.id));
  // Playing from further down the page: bring the preview into view first, then play.
  const previewRef = useRef<HTMLElement>(null);
  const playInView = (skipDelay: boolean) => {
    const el = previewRef.current;
    if (!popped && el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: reduceMotionPref() ? "auto" : "smooth", block: "start" });
        window.setTimeout(() => onReplay(skipDelay), 450);
        return;
      }
    }
    onReplay(skipDelay);
  };
  const effectsOn = EFFECTS.filter((e) => s.effects[e.id]);
  const beamBits = [
    s.beam?.zoom !== undefined ? `${ZOOMS.reduce((a, b) => (Math.abs((b.zoom ?? 9) - s.beam!.zoom!) < Math.abs((a.zoom ?? 9) - s.beam!.zoom!) ? b : a)).label.toLowerCase()} zoom` : "",
    s.beam?.strobe ? `${s.beam.strobe} strobe` : "",
    s.beam?.gobo ? s.beam.gobo : "",
    s.beam?.prism ? "prism" : "",
  ].filter(Boolean);
  const typeDefault = sectionTypeById(s.type).transition;
  const transitionLabel = blackout ? (s.transition === "snap" ? "Cut to black" : "Fade to black") : s.transition === "snap" ? "Changes instantly" : `Fades in over ${fadeChoices(s).find((c) => c.beats === fadeBeatsOf(s))?.label.toLowerCase() ?? `${fadeBeatsOf(s)} beats`}`;
  const cards: Record<string, { summary: string; changed: boolean }> = {
    mood: { summary: `${mood.label}, ${lower(energyOf(s.energy).label)} energy${Object.keys(s.brightness ?? {}).length ? ", own brightness" : ""}`, changed: Object.keys(s.brightness ?? {}).length > 0 },
    colors: {
      summary: `${palette.map((c) => colorById(c).label).join(", ")} · ${lower(COLOR_CHANGES.find((c) => c.id === changeId)?.label ?? "")}`,
      changed: s.colors.length > 0 || Object.keys(s.colorLayout ?? {}).length > 0 || Object.keys(s.colorSwitch ?? {}).length > 0 || s.colorChange !== "mood" || s.colorFade,
    },
    // Lights: the focus (a spotlight on one player) and any lights with settings of their own.
    lights: {
      summary: [s.focus === "all" ? "" : `Spotlight on ${lower(sideName[s.focus])}`, ownLights ? `${ownLights} ${ownLights === 1 ? "light has" : "lights have"} settings of their own` : ""].filter(Boolean).join(" · ") || "No focus; every light follows the settings above",
      changed: ownLights > 0 || s.focus !== "all",
    },
    pattern: {
      summary: pattern.algorithm
        ? [`${pattern.label} on ${patternTargets(s, rig).length} lights`, s.patternSpeed ? (PATTERN_SPEEDS.find((x) => x.speed === s.patternSpeed)?.label.toLowerCase() ?? "") : ""].filter(Boolean).join(" · ")
        : pattern.label,
      changed: s.pattern !== "solid",
    },
    movers: {
      summary: hasMovers
        ? [aimed?.name ?? "Home position", MOVEMENTS.find((m) => m.id === moveId)?.label ?? "", moveId !== "static" && s.moverBeats ? `${MOVER_SPEEDS.find((m) => m.beats === s.moverBeats)?.label.toLowerCase() ?? `${s.moverBeats} beats`}` : "", ...beamBits].filter(Boolean).join(" · ")
        : "No moving heads on your stage",
      changed: !!s.aim || s.movement !== "mood" || s.moverSpread !== "together" || !!s.beam || !!s.moverBeats,
    },
    // Effects: the built-in effects and any chasers, both layered on top of the look.
    effects: {
      summary: [...effectsOn.map((e) => e.label), ...usedSequences.map((q) => q.name)].join(", ") || "None",
      changed: effectsOn.length > 0 || usedSequences.length > 0,
    },
    timing: {
      summary: `${transitionLabel} · ${s.autoAdvance && nextSection ? `goes straight into ${nextSection.name}` : prevSection?.autoAdvance ? `linked after ${prevSection.name}` : "waits for the next cue"}${control?.cueing === "step" ? (s.trigger ? ` · ${triggerText(s.trigger, control)}` : "") : triggerFor(control, s, index) ? ` · ${triggerText(triggerFor(control, s, index), control)}` : ""}`,
      changed: s.transition !== typeDefault || s.autoAdvance || !!s.trigger,
    },
  };
  const visibleCards = blackout ? ["timing"] : Object.keys(cards);
  // ---- Tabs: one card at a time, or "All" for the long page with every card.
  const [tab, setTabState] = useState<string>(rememberedTab);
  const [loop, setLoopState] = useState<boolean>(rememberedLoop);
  const setLoop = (on: boolean) => {
    setLoopState(on);
    rememberLoop(on);
  };
  const setTab = (id: string) => {
    setTabState(id);
    rememberTab(id);
  };
  const card = (id: string) => ({
    ...cards[id]!,
    id,
    hidden: tab !== "all" && id !== shownTab,
    closed: tab === "all" && closed.has(id),
    onToggle:
      tab === "all"
        ? () => {
            const next = new Set(closed);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setClosed(next);
          }
        : undefined,
  });
  const allClosed = visibleCards.every((id) => closed.has(id));

  // ---- Simple / Full: what shows. Hidden settings keep working;
  // a card says when it has some in use, and "More options" shows them here.
  const { level } = useLevel();
  const [peek, setPeek] = useState<Set<string>>(new Set());
  const sees = (id: string, min: Level) => atLeast(level, min) || peek.has(id);
  const more = (id: string, items: [Level, boolean][]) => {
    const hidden = items.filter(([min]) => !sees(id, min));
    if (!hidden.length) return null;
    const used = hidden.filter(([, set]) => set).length;
    return <MoreOptions used={used} onShow={() => setPeek(new Set(peek).add(id))} />;
  };
  const shape = s.moverShape ?? {};
  // A floor head at tilt 128 points straight up; pan then only turns the
  // beam round its own axis, so a sweep or circle shrinks to a small wobble.
  const pointsUp = rig.fixtures.filter((f) => f.role === "mover" && Math.abs(aimOf(s, rig, f).tilt + (shape.tiltNudge ?? 0) - 128) < UPRIGHT_TILT);
  const proShapeSet = shape.width !== undefined || shape.height !== undefined || !!shape.rotation || !!shape.panNudge || !!shape.tiltNudge || !!shape.fan;
  const setShape = (patch: Partial<MoverShape>) => {
    const next: MoverShape = { ...shape, ...patch };
    for (const k of Object.keys(next) as (keyof MoverShape)[]) if (next[k] === undefined) delete next[k];
    onChange({ moverShape: Object.keys(next).length ? next : undefined });
  };
  const showOwnLights = sees("lights", "full") || ownLights > 0;
  const showChasers = sees("sequences", "full") || (s.sequences ?? []).length > 0;

  // ---- the bar that stays at the top: jump to a card, see which one you're in,
  // and a small copy of the preview once the big one has scrolled away.
  const navIds = visibleCards;
  const navRef = useRef<HTMLDivElement>(null);
  // The tab you picked, or the first one this section has (a blackout has only Start and end).
  const shownTab = tab === "all" ? null : navIds.includes(tab) ? tab : (navIds[0] ?? null);
  const [previewGone, setPreviewGone] = useState(false);
  useEffect(() => {
    const el = previewRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPreviewGone(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPreviewGone(!!e && e.intersectionRatio < 0.35 && e.boundingClientRect.top < 0), { threshold: [0, 0.35, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [popped]);
  const pickTab = (id: string) => {
    setTab(id);
    // If you've scrolled down, bring the top of the new tab up under the bar.
    const host = navRef.current?.parentElement;
    if (host && host.getBoundingClientRect().top < 0) {
      requestAnimationFrame(() => window.scrollTo({ top: window.scrollY + host.getBoundingClientRect().top, behavior: "auto" }));
    }
  };

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
            <figure className="preview-figure" ref={previewRef}>
              <div className="preview-frame">
                {/* While the song plays it moves from section to section itself: looping a
                    section would start it over at its end, a moment before the next one takes over. */}
                <SectionPreview s={previewSection ?? s} rig={rig} sequences={sequences} replay={replay} view={view} names={names} loop={loop && !previewPlaying} follow={!!previewPlaying} />
                {previewSection && previewSection.id !== s.id && <span className="preview-playing">{previewPlaying ? "Playing" : "Showing"}: {previewSection.name}</span>}
                <div className="preview-views" role="radiogroup" aria-label="View the stage from">
                  {(
                    [
                      ["front", "Audience"],
                      ["above", "Above"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => onView(v)} title={v === "front" ? "The stage as the audience sees it" : "From above: where every light sits and where the moving heads point"}>
                      {label}
                    </button>
                  ))}
                  <button type="button" role="switch" aria-checked={loop} className={loop ? "on loop" : "loop"} onClick={() => setLoop(!loop)} title={loop ? "Starts the section over when it ends. Click to play it once." : "Plays the section once. Click to start it over each time it ends."}>
                    <Icon name="repeat" size={13} /> Loop
                  </button>
                </div>
                <div className="stage-transport" ref={stageTransportRef} />
                <div className="preview-tools">
                  <button
                    type="button"
                    className="preview-popout"
                    onClick={(e) => {
                      const frame = (e.currentTarget as HTMLElement).closest(".preview-frame") as HTMLElement | null;
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else void frame?.requestFullscreen?.();
                    }}
                    title="Fill the screen with the preview (Esc to come back)"
                  >
                    <Icon name="expand" size={15} /> Full screen
                  </button>
                  <button type="button" className="preview-popout" onClick={onPopOut} title="Open the preview in a floating window you can move and resize">
                    <Icon name="popout" size={15} /> Pop out
                  </button>
                </div>
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
            <Field label="Length" hint={lengthLabel(s).includes("+") ? lengthLabel(s).slice(lengthLabel(s).indexOf("+")) : undefined}>
              <NumberInput label="Length in whole bars" value={Math.max(1, Math.floor(s.bars + 1e-6))} min={1} max={256} suffix="bars" onChange={(bars) => onChange({ bars: Math.max(1, Math.round(bars)) + Math.max(0, s.bars - Math.floor(s.bars + 1e-6)) })} />
            </Field>
            <Field label="In time" hint="Like QLC+: 1m05s200ms. Kept exactly, to 10 ms.">
              <DurationInput label="Length as a time" valueMs={sectionMs(s)} minMs={100} maxMs={3_600_000} stepMs={(60000 / s.bpm) * s.beatsPerBar} onChange={(ms) => onChange({ bars: barsForLength(ms, s, "off") })} />
            </Field>
            <Field label="Beats per bar">
              <Dropdown label="Beats per bar" value={String(s.beatsPerBar)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} onChange={(v) => onChange({ beatsPerBar: +v })} />
            </Field>
          </div>
        </div>

        <div className="editor-controls">
          <CardNav
            ref={navRef}
            editing={
              <>
                <span className="card-nav-num">{index + 1}</span>
                <span className="card-nav-label">Editing</span>
                <strong className="card-nav-name">{s.name || "Untitled section"}</strong>
                <span className="swatch-row">{blackout ? <i className="hatch" /> : paletteOf(s).map((c, k) => <i key={k} style={{ background: c }} />)}</span>
              </>
            }
            items={[
              ...navIds.map((id) => ({ id, label: CARD_LABELS[id]?.label ?? id, icon: CARD_LABELS[id]?.icon ?? "list", changed: cards[id]!.changed, summary: cards[id]!.summary })),
              ...(navIds.length > 1 ? [{ id: "all", label: "All", icon: "stack" as IconName, changed: false, summary: "" }] : []),
            ]}
            active={shownTab ?? "all"}
            onJump={pickTab}
            mini={
              previewGone && !popped ? (
                <button type="button" className="card-nav-mini" onClick={() => previewRef.current?.scrollIntoView({ behavior: reduceMotionPref() ? "auto" : "smooth", block: "start" })} title="Back up to the full preview">
                  <SectionPreview s={s} rig={rig} sequences={sequences} replay={replay} compact view={view} names={names} />
                </button>
              ) : null
            }
            onPlay={previewGone || popped ? () => onReplay(false) : undefined}
            actions={!blackout && onCopyLookTo && others && others.length > 0 ? <CopyLook s={s} others={others} onCopy={onCopyLookTo} /> : null}
          />
          {/* Presets are whole looks, so they sit with the overall feel: on the Mood tab (and All). */}
          {!blackout && (tab === "all" || shownTab === "mood") && <PresetBar s={s} presets={presets} onSection={onChange} onPresets={onPresets} />}
          {tab === "all" && (
            <div className="cards-bar">
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  const next = new Set(closed);
                  for (const id of visibleCards) {
                    if (allClosed) next.delete(id);
                    else next.add(id);
                  }
                  setClosed(next);
                }}
              >
                <Icon name={allClosed ? "chevronDown" : "chevronUp"} size={16} />
                {allClosed ? "Expand all" : "Collapse all"}
              </button>
            </div>
          )}
          {!blackout && (
            <>
          <Group card={card("mood")} icon="sun" title="Mood and energy" description="The overall feel. The mood sets starting colors and movement, and suggests a pattern; energy sets brightness and speed. Fine-tune brightness for each kind of light below.">
            <Dropdown label="Mood" value={s.mood} options={moodOptions} onChange={(m) => onChange({ mood: m })} className="wide" />
            {(() => {
              // The mood is a starting point: each of these follows it until you set it in its tab.
              const parts = [
                { tab: "colors", label: "Colors", plain: "one warm white", follows: s.colors.length === 0 },
                { tab: "colors", label: "Color changes", plain: "steady", follows: s.colorChange === "mood" },
                { tab: "pattern", label: "Pattern", plain: "none", follows: s.pattern === "mood" },
                { tab: "movers", label: "Movement", plain: "still heads", follows: s.movement === "mood", hide: !hasMovers },
              ].filter((x) => !x.hide);
              const link = (x: (typeof parts)[number]) => (
                <button key={x.label} type="button" className="link small" onClick={() => pickTab(x.tab)}>
                  {x.label}
                </button>
              );
              const follow = parts.filter((x) => x.follows);
              const own = parts.filter((x) => !x.follows);
              const list = (xs: typeof parts) => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? " and " : ", ") : "", link(x)]);
              if (s.mood === "custom")
                return (
                  <p className="hint mood-parts">
                    {follow.length ? (
                      <>
                        Custom suggests nothing, so these stay plain until you set them: {follow.flatMap((x, i) => [i ? (i === follow.length - 1 ? " and " : ", ") : "", link(x), ` (${x.plain})`])}.{" "}
                      </>
                    ) : (
                      <>Every part of this look is your own. </>
                    )}
                    {own.length ? <>Your own: {list(own)}. </> : null}
                    Energy sets the brightness and pace.
                  </p>
                );
              return (
                <p className="hint mood-parts">
                  {follow.length ? <>From the mood: {list(follow)}. </> : <>Nothing follows the mood any more; it still sets brightness with the energy. </>}
                  {own.length ? <>Your own: {list(own)}. </> : null}
                  Set any of them in its tab to make it your own.
                </p>
              );
            })()}
            <EnergyMeter value={s.energy} onChange={(energy) => onChange({ energy })} labels={ENERGY} />
            {sees("mood", "full") && <BrightnessEditor s={s} rig={rig} onChange={onChange} gesture={gesture} />}
            {more("mood", [["full", Object.keys(s.brightness ?? {}).length > 0]])}
          </Group>

          <Group card={card("colors")} icon="palette" title="Colors" description={`The section's colors (up to ${MAX_COLORS}), then which ones each kind of light uses and whether they change over time. A + on a row adds a color for those lights only; the other rows show it faded, in case you want it there too.`}>
            <PaletteEditor colors={s.colors} fallback={mood.colors} onChange={setColors} />
            <div className="row">
              <Field label="Switch between colors" hint="For lights that change with the section. Each row below can also stay steady or have its own rate.">
                <Dropdown label="Color changes" value={s.colorChange} options={changeOptions} onChange={(v) => onChange({ colorChange: v as Section["colorChange"] })} />
              </Field>
              {changeId !== "hold" && sees("colors", "full") && <Toggle checked={s.colorFade} onChange={(colorFade) => onChange({ colorFade })} label="Crossfade" hint="Blend into the next color" />}
            </div>
            {sees("colors", "full") && <ColorLayoutEditor s={s} rig={rig} palette={palette} changing={changeId !== "hold"} onChange={onChange} onAddToJob={addToJob} />}
            {more("colors", [["full", s.colorFade || Object.keys(s.colorLayout ?? {}).length > 0 || Object.keys(s.colorSwitch ?? {}).length > 0 || Object.keys(s.colorRates ?? {}).length > 0]])}
          </Group>

          <Group card={card("lights")} icon="stage" title="Lights" description="Put one player in the spotlight, or give particular lights settings of their own. Everything else keeps following the mood and the settings above.">
            <h4 className="subhead">Focus</h4>
            <p className="hint">For a solo or a quiet verse: the lights on that side go warm white at full brightness, even if they have their own color; the other side, floor and moving-head lights dim to half.</p>
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
            {showOwnLights ? (
              <>
                <h4 className="subhead">Individual lights</h4>
                <p className="hint">Give particular lights their own color or brightness, or switch them off, for this section.</p>
                <IndividualLights s={s} rig={rig} lights={lights} palette={s.colors.length ? s.colors : mood.colors} onChange={onChange} onCopy={onCopyLights} gesture={gesture} />
              </>
            ) : (
              more("lights", [["full", ownLights > 0]])
            )}
          </Group>

          <Group card={card("pattern")} icon="backdrop" title="Pattern" description="An animated pattern, like waves or rain, that runs across a set of lights. It works best on bars or pixel lights.">
            <Dropdown label="Pattern" value={s.pattern} options={patternOptions} onChange={(p) => onChange({ pattern: p })} className="wide" />
            {pattern.algorithm && (
              <Field
                label="Speed"
                hint={
                  s.patternSpeed
                    ? `${PATTERN_SPEEDS.find((x) => x.speed === s.patternSpeed)?.hint ?? `${s.patternSpeed} times its usual pace`}, whatever the section's energy.`
                    : `Auto follows the section's energy: ${lower(energyOf(s.energy).label)} energy runs it at ${energyOf(s.energy).speed === 1 ? "its usual pace" : `${energyOf(s.energy).speed}× its usual pace`}.`
                }
              >
                <Segmented
                  label="Pattern speed"
                  value={s.patternSpeed ? String(s.patternSpeed) : "auto"}
                  onChange={(v) => onChange({ patternSpeed: v === "auto" ? undefined : Number(v) })}
                  options={[{ value: "auto", label: "Auto" }, ...PATTERN_SPEEDS.map((x) => ({ value: String(x.speed), label: x.label, title: x.hint }))]}
                />
              </Field>
            )}
            {pattern.algorithm && sees("pattern", "full") && (
              <div className="runs-on">
                <span>Runs on</span>
                <LightPicker title="Pattern runs on" chosen={patternTargets(s, rig)} custom={!!s.patternTargets} lights={lights} needsRgb onChange={(ids) => onChange({ patternTargets: ids })} />
              </div>
            )}
            {pattern.algorithm && patternTargets(s, rig).length === 0 && <p className="hint warn-text">Choose some lights for the pattern to run on; you have no backdrop lights.</p>}
            {pattern.algorithm && more("pattern", [["full", !!s.patternTargets]])}
          </Group>

          <Group card={card("movers")} icon="mover" title="Moving heads" description="Where the moving heads point in this section, and how they move. Any movement runs around the place they point.">
            {hasMovers ? (
              <>
                <Field label="Where they point">
                  <Dropdown
                    label="Where they point"
                    value={aimed ? aimed.id : "home"}
                    options={[
                      { value: "home", label: "Home position", description: "Where each head rests, set on the Stage page" },
                      ...positions.map((p) => ({ value: p.id, label: p.name, group: "Your positions" })),
                      ...unusedSuggestions(rig).map((n) => ({ value: `new:${n}`, label: n, description: "New: set it up below", group: "Add a position" })),
                      { value: "new:", label: "Other…", description: "A new position with its own name", group: "Add a position" },
                    ]}
                    onChange={(v) => {
                      if (v.startsWith("new:")) {
                        const p = makePosition(rig, v.slice(4) || `Position ${positions.length + 1}`);
                        onRigChange({ ...rig, positions: [...positions, p] });
                        onChange({ aim: p.id });
                      } else onChange({ aim: v === "home" ? undefined : v });
                    }}
                    className="wide"
                  />
                </Field>
                {aimed ? (
                  <div className="aim-editor">
                    <div className="position-title">
                      <input className="position-name" value={aimed.name} aria-label="Position name" onChange={(e) => onRigChange({ ...rig, positions: positions.map((x) => (x.id === aimed.id ? { ...x, name: e.target.value } : x)) })} />
                    </div>
                    <PositionEditor rig={rig} position={aimed} names={(f) => lights.find((l) => l.id === f.fixtureId)?.name ?? `Fixture ${f.fixtureId}`} onChange={(p) => onRigChange({ ...rig, positions: positions.map((x) => (x.id === p.id ? p : x)) })} />
                    <p className="hint">Changes here apply to every section that points the heads at "{aimed.name}". Find good values in QLC+'s Simple Desk; the preview only sketches the aim.</p>
                  </div>
                ) : (
                  <p className="hint">Each head rests where you set its home position on the Stage page. Pick or add a position to point them somewhere else in this section.</p>
                )}
                <Field label="Movement" hint={moveId === "static" ? "The heads hold still where they point." : "The shape the heads trace around where they point. Where they point (above) is the middle of the movement; the movement is how they move around it."}>
                  <Dropdown label="Movement" value={s.movement} options={moveOptions} onChange={(movement) => onChange({ movement })} className="wide" />
                </Field>
                {timing.slowed && (
                  <div className="notice warn">
                    <Icon name="info" />
                    <span>
                      Too fast for your heads: a {lower(moveDef?.label ?? "movement")} this size every {fmtBeats(timing.asked)} {timing.asked === 1 ? "beat" : "beats"} ({((timing.asked * 60) / s.bpm).toFixed(1)} s) needs about {(timing.minMs / 1000).toFixed(1)} s, so the motors would fall behind and the beams just twitch. It runs every {fmtBeats(timing.beats)} beats ({((timing.beats * 60) / s.bpm).toFixed(1)} s) instead, here and in QLC+.{" "}
                      {s.moverShape?.width !== undefined || s.moverShape?.height !== undefined
                        ? "This section's shape has its own width or height under Fine-tune the shape: set them back to Auto, or lower them, to move faster."
                        : "To move faster, make it smaller."} If your heads are quicker than Lightsmith thinks, set how fast they pan on the Stage page.
                    </span>
                  </div>
                )}
                {moveId !== "static" && pointsUp.length > 0 && (
                  <div className="notice warn">
                    <Icon name="info" />
                    <span>
                      {pointsUp.length === 1 ? "A head points" : "The heads point"} almost straight up here (tilt near 128), so this movement will mostly spin {pointsUp.length === 1 ? "its beam" : "the beams"} in place: a small circle, not a sweep. Pick a position aimed at the stage or the crowd above, or set {aimed ? "this position" : "the home position on the Stage page"} with a tilt well away from 128.
                    </span>
                  </div>
                )}
                {moveId !== "static" && (
                  <Field label="Size" hint={shape.width !== undefined || shape.height !== undefined ? "Width and height are set exactly below." : "How far the heads travel around the place they point."}>
                    <Segmented
                      label="Movement size"
                      value={String(shape.size ?? 1)}
                      onChange={(v: string) => setShape({ size: v === "1" ? undefined : Number(v) })}
                      options={MOVER_SIZES.map((m) => ({ value: String(m.size), label: m.label }))}
                    />
                  </Field>
                )}
                {moveId !== "static" && sees("movers", "full") && (
                  <Field label="How they move together">
                    <Segmented label="How heads move together" value={s.moverSpread} onChange={(v: MoverSpread) => onChange({ moverSpread: v })} options={SPREADS.map((x) => ({ value: x.id, label: x.label, title: x.description }))} />
                  </Field>
                )}
                {moveId !== "static" && sees("movers", "full") && (
                  <Field label="Speed" hint={`One full movement every ${fmtBeats(cycleBeats)} ${cycleBeats === 1 ? "beat" : "beats"} (${(cycleBeats * 60 / s.bpm).toFixed(1)} s at ${s.bpm} BPM)${timing.slowed ? ", slowed so the heads can keep up" : ""}.${s.moverBeats ? "" : " Auto follows the movement and the section's energy."}`}>
                    <Segmented
                      label="Movement speed"
                      value={s.moverBeats ? String(s.moverBeats) : "auto"}
                      onChange={(v: string) => onChange({ moverBeats: v === "auto" ? undefined : Number(v) })}
                      options={[{ value: "auto", label: "Auto" }, ...MOVER_SPEEDS.map((m) => ({ value: String(m.beats), label: m.label, title: `One movement every ${m.beats} beat${m.beats === 1 ? "" : "s"}` }))]}
                    />
                  </Field>
                )}
                {moveId !== "static" && sees("movers", "full") && (
                  // The exact shape is for fine-tuning, so it starts folded away (open when something in it is set).
                  <details className="fine-tune" open={proShapeSet || undefined}>
                    <summary>
                      <Icon name="chevronRight" size={14} /> Fine-tune the shape{proShapeSet ? " (in use)" : ""}
                    </summary>
                    <ShapeControls shape={shape} movement={MOVEMENTS.find((m) => m.id === moveId)!} spreadOffset={s.moverSpread === "offset"} onChange={setShape} />
                  </details>
                )}
                {sees("movers", "full") && <BeamControls beam={s.beam ?? {}} heads={moverProfiles} onChange={(beam) => onChange({ beam })} />}
                {more("movers", [
                  ["full", s.moverSpread !== "together" || !!s.moverBeats || !!s.beam],
                  ...(moveId !== "static" ? ([["full", proShapeSet]] as [Level, boolean][]) : []),
                ])}
              </>
            ) : (
              <p className="hint">You have no moving heads on your stage. Give a light the Moving head job on the Stage step to use these settings.</p>
            )}
          </Group>

          <Group card={card("effects")} icon="sparkle" title="Effects" description="Extras layered on top of the look and pattern: hits and flashes, then your chasers. Each effect runs on its usual lights; click the lights chip on an effect to choose others.">
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
                    {on && sees("effects", "full") && (
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
                            <DurationInput label="Lightning delay" valueMs={(s.effects.lightningDelaySec ?? 0) * 1000} maxMs={600_000} stepMs={500} onChange={(ms) => onChange({ effects: { ...s.effects, lightningDelaySec: ms / 1000 } })} />
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
            {effectsOn.length > 0 && more("effects", [["full", Object.keys(s.effectTargets ?? {}).length > 0 || !!s.effects.lightningDelaySec]])}
            {showChasers ? (
              <>
                <h4 className="subhead">Chasers</h4>
                <p className="hint">Step-by-step chasers you build or import from your show file. They run on top of this section's look, and become QLC+ chasers when you export.</p>
                <SequencesCard usedIn={chaserUses} s={s} sequences={sequences} rig={rig} profiles={profiles} lights={lights} showFile={showFile} palette={palette} onSection={onChange} onSequences={onSequences} onPlay={playInView} />
              </>
            ) : (
              more("sequences", [["full", usedSequences.length > 0]])
            )}
          </Group>

            </>
          )}

          <Group card={card("timing")} icon="play" title="Start and end" description="How the lights change when this section begins, and what moves the show on to the next section.">
            <h4 className="subhead">When this section starts, the lights…</h4>
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
              <>
                <ChoiceCards
                  label="How the lights change when this section starts"
                  value={s.transition === "snap" ? "snap" : "fade"}
                  onChange={(v) => onChange(v === "snap" ? { transition: "snap" } : { transition: "fade", fadeBeats: fadeBeatsOf(s) })}
                  options={[
                    { value: "snap", title: "Change instantly", text: "Best for hard hits, like a chorus that kicks in." },
                    { value: "fade", title: "Fade in", text: "Every light glides from the previous look to this one; what stays the same doesn't move. Slow fades suit a spotlight coming up, or a rise into the section." },
                  ]}
                />
                {s.transition !== "snap" && (
                  <Field label="Fade length" hint={fadeHint(s)}>
                    <Segmented
                      label="Fade length"
                      value={String(fadeBeatsOf(s))}
                      onChange={(v) => onChange({ transition: "fade", fadeBeats: +v })}
                      options={fadeChoices(s).map((c) => ({ value: String(c.beats), label: c.label }))}
                    />
                  </Field>
                )}
              </>
            )}
            <h4 className="subhead">When this section ends…</h4>
            {nextSection ? (
              <ChoiceCards
                label="What happens when this section ends"
                value={s.autoAdvance ? "auto" : "cue"}
                onChange={(v) => onChange({ autoAdvance: v === "auto" })}
                options={[
                  { value: "cue", title: "Wait for the next cue", text: blackout ? "The lights stay off until the next cue." : "The look holds until the next cue starts the next section. Best when the band doesn't play to a click." },
                  { value: "auto", title: `Go straight into ${nextSection.name}`, text: `Linked: ${nextSection.name} starts by itself after ${lengthLabel(s)} (about ${fmt(sectionMs(s))}), so one cue plays both. Use it to split a section into parts, or after a sample of fixed length.` },
                ]}
              />
            ) : (
              <p className="hint">This is the last section, so its look holds until the song ends.</p>
            )}
            <h4 className="subhead">What starts it on stage</h4>
            {prevSection?.autoAdvance && (
              <p className="hint linked-note">
                <Icon name="link" size={14} /> Linked: it starts straight after {prevSection.name}, so it needs no cue of its own. A trigger here only lets you jump straight to it.
              </p>
            )}
            {control?.cueing === "step" ? (
              <Field
                label="Its own cue (optional)"
                hint="This set steps through each song: the next cue (any of the cues on the Show control step) starts this section. Give it a cue of its own when something particular starts it, such as the sample pad that plays with it. That message then also moves the song on, so pick one nobody presses at other times."
              >
                <TriggerField
                  label={`${s.name}`}
                  value={s.trigger}
                  inherited={prevSection?.autoAdvance ? `Straight after ${prevSection.name}` : "The next cue"}
                  control={control ?? emptyShowControl()}
                  inputs={showFile?.inputs ?? []}
                  onChange={(t, withDevices) => {
                    if (withDevices) onControl(withDevices);
                    onChange({ trigger: t });
                  }}
                />
              </Field>
            ) : (
            <Field
                label="MIDI trigger"
                hint={
                  s.trigger
                    ? "This section's own trigger, instead of the one for its place in the song."
                    : control?.slots[index]
                      ? `The trigger for section ${index + 1} of every song, set on the Show control step. Learn one here to give this section its own.`
                      : "Set up pads and footswitches on the Show control step, or learn one just for this section."
                }
              >
                <TriggerField
                  label={`${s.name}`}
                  value={s.trigger}
                  inherited={control?.slots[index] ? `${triggerText(control.slots[index]!, control)} (section ${index + 1})` : "None yet"}
                  control={control ?? emptyShowControl()}
                  inputs={showFile?.inputs ?? []}
                  onChange={(t, withDevices) => {
                    if (withDevices) onControl(withDevices);
                    onChange({ trigger: t });
                  }}
                />
              </Field>
            )}
          </Group>
        </div>
      </div>
    </article>
  );
}

/** Pattern speeds: how many times its usual pace (Auto follows the section's energy). */
const PATTERN_SPEEDS = [
  { speed: 0.5, label: "Half", hint: "Half its usual pace" },
  { speed: 1, label: "Normal", hint: "Its usual pace" },
  { speed: 2, label: "Double", hint: "Twice its usual pace" },
  { speed: 4, label: "Very fast", hint: "Four times its usual pace" },
];

/** Moving-head speeds: beats for one full movement. */
const MOVER_SPEEDS = [
  { beats: 16, label: "Very slow" },
  { beats: 8, label: "Slow" },
  { beats: 4, label: "Medium" },
  { beats: 2, label: "Fast" },
  { beats: 1, label: "Very fast" },
];
const fmtBeats = (b: number) => String(Math.round(b * 10) / 10);

const ZOOMS: { value: string; label: string; zoom?: number }[] = [
  { value: "asis", label: "As set" },
  { value: "narrow", label: "Narrow", zoom: 0.1 },
  { value: "medium", label: "Medium", zoom: 0.5 },
  { value: "wide", label: "Wide", zoom: 0.9 },
];

/** Zoom, strobe, gobo and prism: only the ones the section's moving heads have. */
function BeamControls({ beam, heads, onChange }: { beam: BeamSettings; heads: FixtureProfile[]; onChange: (b: BeamSettings | undefined) => void }) {
  const zoom = heads.some((p) => p.zoom);
  const strobe = heads.some((p) => strobeRange(p));
  const goboHead = heads.find((p) => p.gobo);
  const prism = heads.some((p) => p.prism);
  if (!zoom && !strobe && !goboHead && !prism) return null;
  const set = (patch: Partial<BeamSettings>) => {
    const next: BeamSettings = { ...beam, ...patch };
    for (const k of Object.keys(next) as (keyof BeamSettings)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const open = goboHead?.gobo ? openGobo(goboHead.gobo.capabilities) : undefined;
  const gobos = goboHead?.gobo ? [...new Set(goboHead.gobo.capabilities.filter((c) => c !== open).map((c) => c.name.trim()))] : [];
  const zoomNow = beam.zoom === undefined ? "asis" : ZOOMS.reduce((a, b) => (Math.abs((b.zoom ?? 9) - beam.zoom!) < Math.abs((a.zoom ?? 9) - beam.zoom!) ? b : a)).value;
  return (
    <div className="beam-controls">
      <h4 className="subhead">Beam</h4>
      {zoom && (
        <Field label="Zoom" hint={zoomNow === "asis" ? "Left as the fixture has it." : undefined}>
          <Segmented label="Zoom" value={zoomNow} onChange={(v: string) => set({ zoom: ZOOMS.find((z) => z.value === v)!.zoom })} options={ZOOMS.map((z) => ({ value: z.value, label: z.label }))} />
        </Field>
      )}
      {strobe && (
        <Field label="Strobe">
          <Segmented
            label="Strobe"
            value={beam.strobe ?? "off"}
            onChange={(v: string) => set({ strobe: v === "off" ? undefined : (v as StrobeSpeed) })}
            options={[
              { value: "off", label: "Off" },
              { value: "slow", label: "Slow" },
              { value: "medium", label: "Medium" },
              { value: "fast", label: "Fast" },
            ]}
          />
        </Field>
      )}
      {goboHead && gobos.length > 0 && (
        <Field label="Gobo">
          <Dropdown label="Gobo" value={beam.gobo ?? "open"} options={[{ value: "open", label: open?.name.trim() || "Open" }, ...gobos.map((g) => ({ value: g, label: g }))]} onChange={(v) => set({ gobo: v === "open" ? undefined : v })} />
        </Field>
      )}
      {prism && <Toggle checked={!!beam.prism} onChange={(on) => set({ prism: on || undefined })} label="Prism" hint="Splits each beam into several." />}
    </div>
  );
}

const MOVER_SIZES = [
  { size: 0.5, label: "Small" },
  { size: 1, label: "Medium" },
  { size: 1.5, label: "Large" },
  { size: 2, label: "Huge" },
];

/** "More options": shows a card's controls hidden by the current level, and says when some are in use. */
function MoreOptions({ used, onShow }: { used: number; onShow: () => void }) {
  return (
    <button type="button" className={used ? "more-options used" : "more-options"} onClick={onShow}>
      <Icon name="chevronDown" size={14} />
      {used ? `${used === 1 ? "A hidden setting is" : `${used} hidden settings are`} in use here. Show ${used === 1 ? "it" : "them"}` : "More options"}
    </button>
  );
}

/** Fine-tuning: the movement's exact shape, with QLC+'s own names for each setting. */
function ShapeControls({ shape, movement, spreadOffset, onChange }: { shape: MoverShape; movement: { width: number; height: number }; spreadOffset: boolean; onChange: (p: Partial<MoverShape>) => void }) {
  const size = shape.size ?? 1;
  const row = (label: string, qlc: string, value: number | undefined, auto: number, min: number, max: number, set: (v: number | undefined) => void, unit = "") => (
    <div className="shape-row">
      <span className="shape-label">
        {label} <small>({qlc})</small>
      </span>
      <input type="range" min={min} max={max} value={value ?? auto} aria-label={label} onChange={(e) => set(+e.target.value)} />
      <NumberInput label={`${label} value`} value={value ?? auto} min={min} max={max} suffix={unit} onChange={(v) => set(Math.round(v))} />
      <button type="button" className="link small" disabled={value === undefined} onClick={() => set(undefined)}>
        Auto
      </button>
    </div>
  );
  return (
    <div className="shape-controls">
      <h4 className="subhead">Exact shape</h4>
      {row("Width", "EFX width", shape.width, Math.round(movement.width * size), 0, EFX_MAX, (width) => onChange({ width }))}
      {row("Height", "EFX height", shape.height, Math.round(movement.height * size), 0, EFX_MAX, (height) => onChange({ height }))}
      {row("Rotation", "EFX rotation", shape.rotation, 0, 0, 359, (rotation) => onChange({ rotation: rotation || undefined }), "°")}
      {row("Pan nudge", "X offset", shape.panNudge, 0, -64, 64, (panNudge) => onChange({ panNudge: panNudge || undefined }))}
      {row("Tilt nudge", "Y offset", shape.tiltNudge, 0, -64, 64, (tiltNudge) => onChange({ tiltNudge: tiltNudge || undefined }))}
      {spreadOffset && row("Fan", "start offset per head", shape.fan, 0, 0, 180, (fan) => onChange({ fan: fan || undefined }), "°")}
      <p className="hint">
        Width {shape.width ?? Math.round(movement.width * size)} is about ±{Math.round(((shape.width ?? movement.width * size) * DEFAULT_PAN_RANGE) / 255)}° of pan and height {shape.height ?? Math.round(movement.height * size)} about ±{Math.round(((shape.height ?? movement.height * size) * DEFAULT_TILT_RANGE) / 255)}° of tilt, on heads that pan 540° and tilt 270°. Width and height are QLC+'s numbers: how far the heads travel each way from where they point, up to 127, and never past the end of their range. {spreadOffset ? "Fan sets the degrees between one head and the next round the shape." : "Pick Offset under How they move together to set a fan."}
      </p>
    </div>
  );
}

/** Whether the preview starts a section over when it ends. On unless turned off; remembered in this browser. */
const SNAP_HINT: Record<Snap, string> = {
  bar: "Snapping to bars. Option for beats, Option+Shift for free",
  beat: "Snapping to beats. Option+Shift for free",
  off: "Not snapping",
};
/** One step finer than the timeline's snap while Option (and Shift) are held. */
const finerSnap = (base: Snap, alt: boolean, shift: boolean): Snap => (alt && shift ? "off" : alt ? (base === "bar" ? "beat" : "off") : base);
const SNAP_KEY = "lightsmith.snap.v1";
function rememberedSnap(): Snap {
  try {
    const v = localStorage.getItem(SNAP_KEY);
    return v === "beat" || v === "off" ? v : "bar";
  } catch {
    return "bar";
  }
}
function rememberSnap(v: Snap) {
  try {
    localStorage.setItem(SNAP_KEY, v);
  } catch {
    /* not remembered */
  }
}

/** The timeline's closest zoom: 400 pixels a second, so single beats are easy to place. */
const MAX_SCALE = 400;
const TALL_KEY = "lightsmith.waveTall.v1";
function rememberedTall(): boolean {
  try {
    return localStorage.getItem(TALL_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberTall(on: boolean) {
  try {
    localStorage.setItem(TALL_KEY, on ? "1" : "0");
  } catch {
    /* private mode: not remembered */
  }
}

const LOOP_KEY = "lightsmith.previewLoop.v1";
function rememberedLoop(): boolean {
  try {
    return localStorage.getItem(LOOP_KEY) !== "0";
  } catch {
    return true;
  }
}
function rememberLoop(on: boolean) {
  try {
    localStorage.setItem(LOOP_KEY, on ? "1" : "0");
  } catch {
    /* not remembered; fine */
  }
}

/** The stage preview's view: from the audience or from above. Remembered in this browser. */
type PreviewView = "front" | "above";
const VIEW_KEY = "lightsmith.previewView.v1";
function rememberedView(): PreviewView {
  try {
    return localStorage.getItem(VIEW_KEY) === "above" ? "above" : "front";
  } catch {
    return "front";
  }
}
function rememberView(v: PreviewView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* not remembered; fine */
  }
}

/** The settings tab last picked: every section opens on it. Remembered in this browser. */
const TAB_KEY = "lightsmith.tab.v1";
function rememberedTab(): string {
  try {
    // Focus and Chasers became parts of the Lights and Effects tabs.
    const t = localStorage.getItem(TAB_KEY) ?? "mood";
    return t === "focus" ? "lights" : t === "sequences" ? "effects" : t;
  } catch {
    return "mood";
  }
}
function rememberTab(id: string) {
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    /* not remembered; fine */
  }
}

/** Short names and icons for the settings cards, as the bar at the top shows them. */
const CARD_LABELS: Record<string, { label: string; icon: IconName }> = {
  mood: { label: "Mood", icon: "sun" },
  colors: { label: "Colors", icon: "palette" },
  lights: { label: "Lights", icon: "stage" },
  pattern: { label: "Pattern", icon: "backdrop" },
  movers: { label: "Moving heads", icon: "mover" },
  effects: { label: "Effects", icon: "sparkle" },
  timing: { label: "Start and end", icon: "play" },
};

/**
 * The bar that stays at the top of the settings while you scroll: one button
 * per card (a dot when it has settings of its own), the card you're in lit up,
 * and a small copy of the preview once the big one has scrolled out of view.
 */
const CardNav = forwardRef<
  HTMLDivElement,
  {
    items: { id: string; label: string; icon: IconName; changed: boolean; summary: string }[];
    active: string | null;
    onJump: (id: string) => void;
    mini: ReactNode;
    onPlay?: () => void;
    editing: ReactNode;
    /** Actions on the whole section, beside its name (such as copying its look). */
    actions?: ReactNode;
  }
>(function CardNav({ items, active, onJump, mini, onPlay, editing, actions }, ref) {
  return (
    <div className={mini ? "card-nav with-mini" : "card-nav"} ref={ref}>
      {mini && (
        <div className="card-nav-preview">
          {mini}
          {onPlay && (
            <button type="button" className="card-nav-play" onClick={onPlay} title="Play this section from the start">
              <Icon name="play" size={14} /> Play
            </button>
          )}
        </div>
      )}
      <div className="card-nav-main">
      <div className="card-nav-head">
        <div className="card-nav-editing" aria-live="polite">{editing}</div>
        {actions}
      </div>
      <div
        className="card-nav-links"
        role="tablist"
        aria-label="Settings"
        onKeyDown={(e) => {
          // Left and right arrows move between tabs, as tabs usually do.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
          const ids = items.map((it) => it.id);
          const at = Math.max(0, ids.indexOf(active ?? ""));
          const next = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
          e.preventDefault();
          onJump(ids[next]!);
          (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
        }}
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            data-card={it.id}
            className={active === it.id ? (it.id === "all" ? "card-link all on" : "card-link on") : it.id === "all" ? "card-link all" : "card-link"}
            aria-selected={active === it.id}
            tabIndex={active === it.id ? 0 : -1}
            onClick={() => onJump(it.id)}
            title={it.id === "all" ? "Every card on one page" : `${it.label}: ${it.summary}`}
          >
            <Icon name={it.icon} size={15} />
            <span>{it.label}</span>
            {it.changed && <span className="card-link-dot" aria-label="has settings of its own" />}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
});

/** A song's length as the sidebar shows it, such as 3:59. */
function songLength(song: Song): string {
  const sec = Math.round(song.sections.reduce((t, x) => t + sectionMs(x), 0) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** The fade length in beats: the one chosen, or what "fade" (a beat) and "build" (four bars) always meant. */
function fadeBeatsOf(s: Section): number {
  return s.fadeBeats ?? (s.transition === "build" ? 4 * s.beatsPerBar : 1);
}

/** Fade lengths to pick from, in this section's beats and bars. */
function fadeChoices(s: Section): { beats: number; label: string }[] {
  const bar = s.beatsPerBar;
  const out = [
    { beats: 1, label: "1 beat" },
    { beats: 2, label: "2 beats" },
    { beats: bar, label: "1 bar" },
    { beats: 2 * bar, label: "2 bars" },
    { beats: 4 * bar, label: "4 bars" },
    { beats: 8 * bar, label: "8 bars" },
  ].filter((c, i, all) => all.findIndex((d) => d.beats === c.beats) === i);
  // A length saved earlier that isn't one of these still shows.
  const own = fadeBeatsOf(s);
  if (!out.some((c) => c.beats === own)) out.push({ beats: own, label: `${own} beats` });
  return out.sort((a, b) => a.beats - b.beats);
}

function fadeHint(s: Section): string {
  const ms = fadeInMs(s);
  const whole = fadeBeatsOf(s) * (60000 / s.bpm) >= sectionMs(s);
  const sec = Math.round(ms / 100) / 10;
  return whole ? `Longer than the section, so the look keeps rising through all of it (${sec} s).` : `About ${sec} s at ${Math.round(s.bpm * 10) / 10} BPM.`;
}
