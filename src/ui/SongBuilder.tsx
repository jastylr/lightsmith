import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARCS,
  COLORS,
  DEFAULT_MOMENTS,
  MOMENT_GROUPS,
  GENRES,
  genreLookFor,
  MOMENTS,
  SECTION_TYPES,
  SONG_TEMPLATES,
  VIBES,
  buildSong,
  isBlackout,
  momentMarks,
  moodById,
  planFromMarks,
  planFromSong,
  planFromTemplate,
  renumber,
  sectionMs,
  sectionTypeById,
  type PlannedSection,
  type Rig,
  type Section,
  type Sequence,
  type BuildStyle,
  type ShowControl,
  type Song,
} from "../core";
import { cssColor } from "./ColorPicker";
import { Dropdown, DurationInput, Field, NumberInput, Segmented, TapTempo } from "./controls";
import { Icon } from "./icons";
import { StagePreview } from "./StagePreview";

const STEPS = ["The song", "Structure", "Style", "Energy", "Moments", "On stage", "Your show"] as const;
const SHOW = STEPS.length - 1;

/** How the lights will be run on stage, which sets up the Show control page. */
type Playback = "track" | "step" | "jump" | "laptop" | "skip";

/** What the builder hands back. */
export interface BuilderResult {
  patch: Pick<Song, "title" | "bpm" | "sections" | "build">;
  recording?: File;
  offsetMs?: number;
  /** How sections are cued, when the user chose one on the On stage step. */
  cueing?: "jump" | "step";
  bandColors: string[];
  /** Make another song straight after this one. */
  another: boolean;
}

/** The last answers, so the next song starts from them. */
const LAST_KEY = "lightsmith.builderLast.v1";
function rememberedStyle(): BuildStyle | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as BuildStyle | null;
    return v && typeof v.vibe === "string" && typeof v.arc === "string" && Array.isArray(v.moments) ? v : null;
  } catch {
    return null;
  }
}
function rememberStyle(v: BuildStyle) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    /* not remembered */
  }
}

const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** A recording in the builder: a new file, or the song's own (already stored). */
interface BuilderRecording {
  url: string;
  durationMs: number;
  name: string;
  /** Set when it's a new file, to store with the song. */
  file?: File;
}

/** What a section looks like, in words: for the caption under the stage. */
function describe(s: Section): string {
  if (isBlackout(s)) return "all lights off";
  const bits = [moodById(s.mood).label, `energy ${s.energy}`];
  if (s.transition === "snap") bits.push("cuts in on the downbeat");
  if (s.movement === "sweep") bits.push("heads sweep the crowd");
  if (s.effects.blinder) bits.push("blinder hit");
  if (s.effects.strobe) bits.push("strobe");
  return bits.join(", ");
}

/** The parts of a section a choice in the builder can change, to spot what a choice did. */
const lookKey = (s: Section) => JSON.stringify([s.mood, s.colors, s.energy, s.pattern, s.transition, s.fadeBeats, s.movement, s.effects, s.colorChange]);

/**
 * The Song Builder: a few questions with big visual choices (the song,
 * its structure, a style, an energy arc, some signature moments), a live
 * stage that follows every choice and can play the whole song, and the
 * finished song at the end. Every section it makes can be edited afterwards.
 */
export function SongBuilder({
  song,
  rig,
  sequences,
  hasMovers,
  existingRecording,
  songs,
  bandColors: savedBand,
  control,
  onDone,
  onClose,
}: {
  song: Song;
  rig: Rig;
  sequences: Sequence[];
  hasMovers: boolean;
  /** The song's own recording, when it has one loaded: to mark sections against and play along with. */
  existingRecording?: { url: string; durationMs: number; name: string; offsetMs: number };
  /** The project's other songs, for "Same style as…". */
  songs: Song[];
  /** The band's colors, saved with the project. */
  bandColors?: string[];
  /** How the show is run now, to start the On stage step from it. */
  control?: ShowControl;
  onDone: (result: BuilderResult) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const restyle = useMemo(() => (song.sections.length ? planFromSong(song.sections, song.bpm) : null), [song]);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(song.title === "New song" || song.title === "Untitled song" ? "" : song.title);
  const [bpm, setBpm] = useState(song.bpm);
  const [beatsPerBar, setBeatsPerBar] = useState(song.sections[0]?.beatsPerBar ?? 4);
  const [mode, setMode] = useState<"keep" | "template" | "marks" | "scratch">(restyle?.sections.length ? "keep" : "template");
  const [template, setTemplate] = useState("short");
  const [sections, setSections] = useState<PlannedSection[]>(() => (restyle?.sections.length ? restyle.sections : planFromTemplate("short")));
  // A song made here before starts from its own answers; a new one from the last song's.
  const start = song.build ?? rememberedStyle();
  const [route, setRoute] = useState<"genre" | "vibe">(start?.route ?? "genre");
  const [vibe, setVibe] = useState(start?.vibe ?? "rock");
  const [genre, setGenre] = useState(start?.genre ?? "rock");
  const [arc, setArc] = useState(start?.arc ?? "punch");
  const [moments, setMoments] = useState<string[]>(() => start?.moments ?? (restyle && !restyle.endsInBlackout ? DEFAULT_MOMENTS.filter((m) => m !== "ending") : DEFAULT_MOMENTS));
  const [band, setBand] = useState<string[]>(savedBand ?? start?.bandColors ?? []);
  const [shuffle, setShuffle] = useState(0);
  const devicesSet = !!control?.devices.length;
  const [playback, setPlayback] = useState<Playback>(devicesSet ? (control?.cueing === "step" ? "step" : "jump") : "skip");
  const [recording, setRecording] = useState<BuilderRecording | null>(existingRecording ? { url: existingRecording.url, durationMs: existingRecording.durationMs, name: existingRecording.name } : null);
  // Where the song starts in the recording: a count-in or silence to skip.
  const [offsetMs, setOffsetMsNow] = useState(Math.max(0, existingRecording?.offsetMs ?? 0));
  // Only a start the user set here (or a new file's) is saved: a recording that comes in after a live sample keeps its timeline setting.
  const [offsetTouched, setOffsetTouched] = useState(false);
  const setOffsetMs = (ms: number) => {
    setOffsetMsNow(ms);
    setOffsetTouched(true);
  };
  const lateRecording = !!existingRecording && existingRecording.offsetMs < 0 && !offsetTouched;
  const [marks, setMarks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => () => (recording?.file ? URL.revokeObjectURL(recording.url) : undefined), [recording]);

  const plan = { bpm, beatsPerBar, sections, vibe, arc, moments, genre: route === "genre" ? genre : undefined, bandColors: band, shuffle };
  const built = useMemo(() => buildSong(plan, { hasMovers }), [bpm, beatsPerBar, sections, vibe, genre, route, arc, moments, band, shuffle, hasMovers]); // eslint-disable-line react-hooks/exhaustive-deps
  const style: BuildStyle = { route, ...(route === "genre" ? { genre } : {}), vibe, arc, moments, ...(band.length ? { bandColors: band } : {}) };
  const madeBefore = songs.filter((x) => x.id !== song.id && x.build);
  const useStyleOf = (id: string) => {
    const b = songs.find((x) => x.id === id)?.build;
    if (!b) return;
    setRoute(b.route);
    if (b.genre) setGenre(b.genre);
    setVibe(b.vibe);
    setArc(b.arc);
    setMoments(b.moments);
    if (b.bandColors) setBand(b.bandColors);
    setShuffle(0);
  };
  const marksOn = useMemo(() => momentMarks(built), [built]);
  const totalMs = built.reduce((t, s) => t + sectionMs(s), 0);

  // Playing the whole song on the stage (with the recording, when there is one).
  const player = useSongPlayer(built, recording, lateRecording ? existingRecording!.offsetMs : offsetMs);
  const playing = player.at !== null;

  // The section the stage shows: the one playing, else the one picked, else the first chorus, else the biggest.
  const lit = built.filter((s) => !isBlackout(s));
  const focusIndex = playing ? player.at!.index : picked !== null && built[picked] ? picked : (() => {
    const c = built.findIndex((s) => s.type === "chorus");
    if (c >= 0) return c;
    const top = lit.reduce<Section | undefined>((a, b) => (!a || b.energy > a.energy ? b : a), undefined);
    return top ? built.indexOf(top) : -1;
  })();
  const focus = built[focusIndex];

  // When a style, energy or moment choice changes the song, show the section it changed most, and say so.
  const before = useRef<Section[] | null>(null);
  useEffect(() => {
    const prev = before.current;
    before.current = built;
    if (!prev || step < 2 || (step > 4 && step !== SHOW) || prev.length !== built.length) return;
    const changed = built.map((s, i) => (lookKey(s) !== lookKey(prev[i]!) ? i : -1)).filter((i) => i >= 0);
    if (!changed.length) return;
    const best = changed.reduce((a, b) => (built[b]!.type === "chorus" && built[a]!.type !== "chorus" ? b : built[b]!.energy > built[a]!.energy && built[a]!.type !== "chorus" ? b : a));
    if (!playing) setPicked(best);
    setNote(changed.length === built.length ? "That changed every section." : `That changed ${changed.length} of ${built.length} sections${playing ? "" : `. Showing ${built[best]!.name}`}.`);
  }, [built]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setNote(null), [step]);

  const canNext = step === 0 ? bpm >= 30 : step === 1 ? sections.length > 0 : true;
  const finish = (another: boolean) => {
    player.stop();
    rememberStyle(style);
    onDone({
      patch: { title: title.trim() || "Untitled song", bpm, sections: built, build: style },
      recording: recording?.file,
      offsetMs: recording && (recording.file || offsetTouched) ? offsetMs : undefined,
      cueing: playback === "step" ? "step" : playback === "jump" || playback === "laptop" ? "jump" : undefined,
      bandColors: band,
      another,
    });
    ref.current?.close();
  };
  const go = (next: number) => {
    setStep(next);
    // The last step is the show: start it.
    if (next === SHOW && !playing) player.play(0);
  };
  const remark = (m: number[], rec: BuilderRecording, offset: number) =>
    setSections(planFromMarks(m.filter((x) => x > offset).map((x) => x - offset), rec.durationMs - offset, bpm, beatsPerBar));

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.addEventListener("loadedmetadata", () => {
      setRecording({ url, durationMs: probe.duration * 1000, name: file.name, file });
      setOffsetMsNow(0);
      setMarks([]);
    });
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };
  // Genre looks cover most kinds of section; anything a genre has none for uses the vibe.
  const uncovered = route === "genre" ? [...new Set(sections.map((x) => x.type))].filter((t) => !genreLookFor(genre, t)) : [];

  return (
    <dialog ref={ref} className="builder" aria-labelledby="builder-title" onClose={() => { player.stop(); onClose(); }}>
      <div className="builder-box">
        <header className="builder-head">
          <div>
            <h2 id="builder-title">
              <Icon name="sparkle" size={20} /> Song Builder
            </h2>
            <p className="hint">A few quick questions, then a finished light show for your song. Watch the stage on the right: it follows every answer.</p>
          </div>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close without making the song">
            <Icon name="x" size={16} />
          </button>
        </header>

        <ol className="builder-steps" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button type="button" className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined} onClick={() => (i <= step || canNext ? go(i) : undefined)} disabled={i > step + 1 || (i > step && !canNext)}>
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
                <h3>Let's light a song</h3>
                <p className="hint">Start with the basics. The tempo matters most: patterns, chases and color changes all move with it.</p>
                <Field label="Song title">
                  <input className="builder-title-input" value={title} placeholder="What's it called?" onChange={(e) => setTitle(e.target.value)} autoFocus />
                </Field>
                <div className="builder-row">
                  <Field label="Tempo" hint="Type it, or tap along with the song">
                    <span className="tempo-pair">
                      <span className="tempo-pulse" style={{ animationDuration: `${60 / Math.max(30, bpm)}s` }} aria-hidden="true" title="Flashes on the beat" />
                      <NumberInput label="Tempo in BPM" value={bpm} min={30} max={300} suffix="BPM" onChange={setBpm} />
                      <TapTempo label="Tempo" onTempo={setBpm} />
                    </span>
                  </Field>
                  <Field label="Beats per bar" hint="4 for most songs, 3 for a waltz, 6 for 6/8">
                    <Segmented label="Beats per bar" value={String(beatsPerBar)} onChange={(v) => setBeatsPerBar(+v)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} />
                  </Field>
                </div>

                <div className={recording ? "builder-recording has" : "builder-recording"}>
                  <label
                    className="builder-drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      pickFile(e.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                      onChange={(e) => {
                        pickFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <span className="builder-drop-icon" aria-hidden="true">
                      <Icon name="music" size={20} />
                    </span>
                    {recording ? (
                      <span>
                        <span className="builder-drop-line">
                          <strong>{recording.name}</strong> <em className="optional">{clock(recording.durationMs)}</em>
                        </span>
                        <small>{recording.file ? "Ready. Choose another file to swap it." : "This song's recording. Choose another file to swap it."}</small>
                      </span>
                    ) : (
                      <span>
                        <span className="builder-drop-line">
                          <strong>Add the recording</strong> <em className="optional">optional</em>
                        </span>
                        <small>Drop an audio file here, or click to choose one. MP3, WAV, M4A and more.</small>
                      </span>
                    )}
                  </label>
                  {recording && lateRecording ? (
                    <p className="hint builder-offset">This recording comes in after the song starts (after a sample you play live, say). That's kept as it is; change it on the timeline.</p>
                  ) : recording ? (
                    <div className="builder-offset">
                      <Field label="Where does the song start?" hint="Skip a count-in or silence at the start of the recording. 0 if the song starts right away.">
                        <DurationInput label="Where the song starts in the recording" valueMs={offsetMs} minMs={0} maxMs={Math.max(0, recording.durationMs - 1000)} onChange={(ms) => { setOffsetMs(ms); if (marks.length) remark(marks, recording, ms); }} />
                      </Field>
                    </div>
                  ) : (
                    <ul className="builder-perks">
                      <li>
                        <Icon name="ear" size={16} />
                        <span>
                          <strong>A guide to build around.</strong> Mark each part as the song plays, then see the waveform under your sections.
                        </span>
                      </li>
                      <li>
                        <Icon name="play" size={16} />
                        <span>
                          <strong>A backing or click track.</strong> QLC+ can play it with the lights, every section right on time.
                        </span>
                      </li>
                      <li className="muted">No recording? No problem. Skip it and cue the lights live; you can add one any time.</li>
                    </ul>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="builder-page">
                <h3>How does the song go?</h3>
                <p className="hint">Lay out its parts in order. Pick a way to start below; however you start, you can change, add, move and remove parts in the list.</p>
                <div className={restyle?.sections.length ? "builder-choices ways four" : "builder-choices ways"} role="radiogroup" aria-label="How to lay out the sections">
                  {restyle?.sections.length ? (
                    <WayCard on={mode === "keep"} icon="repeat" title="Keep this song's parts" text={`Restyle its ${restyle.sections.length} sections without touching the layout.`} onClick={() => { setMode("keep"); setSections(restyle.sections); setPicked(null); }} />
                  ) : null}
                  <WayCard on={mode === "template"} icon="stack" title="Start from a common shape" text="Pick the shape closest to the song, then adjust it." onClick={() => { setMode("template"); setSections(planFromTemplate(template)); setPicked(null); }} />
                  <WayCard
                    on={mode === "marks"}
                    icon="ear"
                    title="Mark it while it plays"
                    text={recording ? "Play the recording and press M each time a new part starts. Your taps become sections of the right length." : "Play the recording and tap M at each new part; your taps become sections. Add a recording on step 1 to use this."}
                    disabled={!recording}
                    onClick={() => setMode("marks")}
                  />
                  <WayCard on={mode === "scratch"} icon="plus" title="Start from scratch" text="An empty list: add the parts one at a time." onClick={() => { setMode("scratch"); setSections([]); setPicked(null); }} />
                </div>
                {mode === "template" && (
                  <>
                    <h4 className="builder-subhead">Starting points</h4>
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
                  </>
                )}
                {mode === "marks" && recording && <Marker recording={recording} marks={marks} onMarks={(m) => { setMarks(m); remark(m, recording, offsetMs); setPicked(null); }} />}
                {mode === "scratch" && (
                  <div className="builder-quick-add" role="group" aria-label="Add a part">
                    {SECTION_TYPES.filter((t) => t.id !== "blackout").map((t) => (
                      <button key={t.id} type="button" className="chip" onClick={() => setSections(renumber([...sections, { type: t.id, name: t.label, bars: t.bars }]))}>
                        <i style={{ background: cssColor(moodById(t.mood).colors[0]!) }} aria-hidden="true" />+ {t.label}
                      </button>
                    ))}
                  </div>
                )}
                <PlanList sections={sections} bpm={bpm} beatsPerBar={beatsPerBar} recordingMs={recording ? recording.durationMs - offsetMs : undefined} onChange={(next) => { setSections(next); setPicked(null); }} />
              </div>
            )}

            {step === 2 && (
              <div className="builder-page">
                <h3>What should it look like?</h3>
                <p className="hint">Choose how Lightsmith dresses the whole song. Your pick styles every section; click any section under the stage to see how it lands there.</p>
                {madeBefore.length > 0 && (
                  <div className="builder-same">
                    <Icon name="copy" size={15} />
                    <span>Match another song?</span>
                    <Dropdown label="Same style as" value="" placeholder="Same style as…" options={madeBefore.map((x) => ({ value: x.id, label: x.title || "Untitled song" }))} onChange={useStyleOf} />
                  </div>
                )}
                <div className="builder-choices two route" role="radiogroup" aria-label="Style the song by">
                  <button type="button" role="radio" aria-checked={route === "genre"} className={route === "genre" ? "choice on" : "choice"} onClick={() => setRoute("genre")}>
                    <strong>By genre</strong>
                    <span>Hand-picked looks from the look library for each kind of part, so verses, choruses and solos each get their own look. The most designed result.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={route === "vibe"} className={route === "vibe" ? "choice on" : "choice"} onClick={() => setRoute("vibe")}>
                    <strong>By vibe</strong>
                    <span>One color family and feeling across the whole song, shifting a little from verse to chorus. Simple and cohesive, for songs that don't fit a genre.</span>
                  </button>
                </div>
                {route === "genre" ? (
                  <>
                    <h4 className="builder-subhead">Pick a genre</h4>
                    <div className="builder-choices genre-choices" role="radiogroup" aria-label="Genre">
                      {GENRES.map((g) => {
                        const looks = ["verse", "chorus", "solo"].map((r) => genreLookFor(g.id, r)).filter(Boolean);
                        return (
                          <button key={g.id} type="button" role="radio" aria-checked={genre === g.id} className={genre === g.id ? "choice vibe on" : "choice vibe"} onClick={() => setGenre(g.id)}>
                            <span className="genre-strip" aria-hidden="true">
                              {looks.map((l, k) => (
                                <i key={k} style={{ background: `linear-gradient(90deg, ${(l!.look.colors ?? []).map(cssColor).join(", ")})` }} />
                              ))}
                            </span>
                            <strong>{g.label}</strong>
                            <span>{g.description}</span>
                          </button>
                        );
                      })}
                    </div>
                    {uncovered.length > 0 && (
                      <p className="builder-fill">
                        {GENRES.find((g) => g.id === genre)?.label ?? "This genre"} has no look for {listOf(uncovered.map((t) => sectionTypeById(t).label.toLowerCase()))}, so {uncovered.length === 1 ? "it uses" : "they use"} the
                        <Dropdown label="Vibe for the rest" value={vibe} options={VIBES.map((v) => ({ value: v.id, label: v.label }))} onChange={setVibe} />
                        vibe.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h4 className="builder-subhead">Pick a vibe</h4>
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
                  </>
                )}
                <BandColors value={band} onChange={setBand} />
              </div>
            )}

            {step === 3 && (
              <div className="builder-page">
                <h3>How should the energy move?</h3>
                <p className="hint">Energy is how bright and busy each part is. Each shape is drawn here for your song's own parts; you can drag any section up or down on the timeline later.</p>
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
                <p className="hint">The touches that make a show feel designed. Tick any you like: the stage jumps to the part each one changes, and a marker appears on it in the strip.</p>
                {MOMENT_GROUPS.map((g) => {
                  const here = MOMENTS.filter((m) => m.group === g.id && (!m.needsMovers || hasMovers));
                  const missing = (id: string) => (id === "spotlightSolo" && !sections.some((x) => x.type === "solo")) || (id === "darkBridge" && !sections.some((x) => x.type === "bridge" || x.type === "breakdown")) || ((id === "fadeIntro" || id === "darkIntro" || id === "lightningIntro") && sections[0]?.type !== "intro") || (id === "buildLastChorus" && sections.map((x) => x.type).lastIndexOf("chorus") < 1);
                  return (
                    <div key={g.id} className="moment-group">
                      <h4 className="builder-subhead">{g.label}</h4>
                      <div className="builder-moments">
                        {here.map((m) => {
                          const on = moments.includes(m.id);
                          const idle = missing(m.id);
                          return (
                            <label key={m.id} className={`${on ? "moment on" : "moment"}${idle ? " idle" : ""}`} title={idle ? "Your song doesn't have the part this changes; it'll apply if you add one." : undefined}>
                              <input type="checkbox" checked={on} onChange={() => setMoments(on ? moments.filter((x) => x !== m.id) : [...moments, m.id])} />
                              <span className="moment-box" aria-hidden="true">
                                {on && <Icon name="check" size={14} />}
                              </span>
                              <span>
                                <strong>{m.label}</strong>
                                <small>{idle ? `${m.description}. (Your song has no part for this yet.)` : m.description}</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 5 && (
              <div className="builder-page">
                <h3>How will you run it on stage?</h3>
                <p className="hint">This sets up the Show control page for you, as a starting point. It's for the whole show, not just this song, and you can change it there any time.</p>
                <div className="builder-choices playback" role="radiogroup" aria-label="How you'll run the lights">
                  <PlaybackCard on={playback === "track"} value="track" onPick={setPlayback} icon="play" title="QLC+ plays it with the recording" text={recording ? "Hands-free: press ▶ With recording in QLC+ and the lights follow the track, every section on time. Great with a click or backing track." : "Hands-free, following the recording. Add a recording on step 1 to use this."} disabled={!recording} />
                  <PlaybackCard on={playback === "step"} value="step" onPick={setPlayback} icon="midi" title="One footswitch steps through" text="Each press moves the song on to its next section. Ideal for a guitarist with a spare switch, or an amp modeler sending a message on each scene." />
                  <PlaybackCard on={playback === "jump"} value="jump" onPick={setPlayback} icon="stack" title="A pad or button per section" text="Section 1, 2, 3… each on its own pad or switch, so you can jump anywhere. Great for drum pads and pad controllers." />
                  <PlaybackCard on={playback === "laptop"} value="laptop" onPick={setPlayback} icon="keyboard" title="Clicking in QLC+" text="Someone runs the laptop and clicks the section buttons. Nothing to set up." />
                  <PlaybackCard on={playback === "skip"} value="skip" onPick={setPlayback} icon="clock" title="Skip for now" text="Decide later on the Show control page." />
                </div>
                <p className="builder-playback-next">
                  <Icon name="info" size={14} />
                  {playback === "track"
                    ? "The export adds a ▶ With recording button to the song; just put the recording beside the show file. Sections can still be cued by hand too."
                    : playback === "step"
                      ? "Next, on Show control: add your footswitch or amp modeler and press Learn on Next section. One message moves every song on."
                      : playback === "jump"
                        ? "Next, on Show control: add your pads or switches and Learn a message for section 1, 2, 3 and so on. They work for every song."
                        : playback === "laptop"
                          ? "The export gives each song a frame of section buttons in QLC+'s Virtual Console. Click one to start it."
                          : devicesSet
                            ? "Your current Show control settings stay as they are."
                            : "No problem: the show works from QLC+'s buttons until you set something up."}
                </p>
              </div>
            )}

            {step === SHOW && (
              <div className="builder-page">
                <h3>Here's your show</h3>
                <p className="hint">
                  {playing ? "It's playing on the stage now" : "Press play on the stage to watch it"}
                  {recording ? ", with your recording." : "."} Click any part to look closer. When you make it, everything here becomes yours to tweak{song.sections.length ? " (it replaces the song's current sections; Undo brings them back)" : ""}.
                </p>
                <div className="builder-shuffle">
                  <button type="button" className="ghost" onClick={() => setShuffle((n) => n + 1)} title="A different take on the looks, keeping every answer you gave">
                    <Icon name="sparkle" size={15} /> Shuffle the looks
                  </button>
                  {shuffle > 0 && (
                    <button type="button" className="link small" onClick={() => setShuffle(0)}>
                      Back to the first take
                    </button>
                  )}
                  <span className="muted">{shuffle > 0 ? `Take ${shuffle + 1}. Same choices, new looks.` : "Not quite it? Get a fresh take with the same choices."}</span>
                </div>
                <ol className="builder-review">
                  {built.map((s, i) => (
                    <li key={i}>
                      <button type="button" className={focusIndex === i ? "on" : ""} onClick={() => (playing ? player.play(startOf(built, i)) : setPicked(i))}>
                        <span className="swatch-row">{isBlackout(s) ? <i className="hatch" /> : paletteOf(s).map((c, k) => <i key={k} style={{ background: c }} />)}</span>
                        <strong>{s.name}</strong>
                        <small>{describe(s)}</small>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <aside className="builder-side" aria-label="Your show">
            <div className="builder-side-head">
              <button type="button" className={playing ? "transport-btn play on" : "transport-btn play"} onClick={() => (playing ? player.stop() : player.play(picked !== null && !playing ? startOf(built, focusIndex) : 0))} disabled={!built.length} aria-label={playing ? "Stop" : "Play the whole song"}>
                <Icon name={playing ? "pause" : "play"} size={16} />
              </button>
              <div>
                <strong>{playing ? "Playing your song" : "Your show"}</strong>
                <small>{playing ? `${clock(player.at!.ms)} / ${clock(totalMs)}${recording ? ", with the recording" : ""}` : `Press play to watch the whole song${recording ? " with the recording" : ""}`}</small>
              </div>
            </div>
            <div className="builder-stage">
              {focus ? (
                <StagePreview
                  key={playing ? `play-${player.token}-${focusIndex}` : `${focusIndex}-${lookKey(focus)}`}
                  section={focus}
                  rig={rig}
                  sequences={sequences}
                  loop={!playing}
                  startAt={playing ? Math.max(0, (player.at!.ms - startOf(built, focusIndex)) / 1000) : 0}
                />
              ) : (
                <p className="hint">Add a part to see it here.</p>
              )}
            </div>
            {focus && (
              <p className="builder-stage-caption">
                <strong>{focus.name}</strong> <span>{describe(focus)}</span>
              </p>
            )}
            {note && !playing && (
              <p className="builder-note" role="status" key={note}>
                <Icon name="sparkle" size={14} /> {note}
              </p>
            )}
            <SongStrip sections={built} focusIndex={focusIndex} marks={step >= 4 ? marksOn : undefined} playFraction={playing ? player.at!.ms / Math.max(1, totalMs) : undefined} onPick={(i) => (playing ? player.play(startOf(built, i)) : setPicked(i))} />
            <p className="builder-strip-help">
              <Icon name="info" size={13} /> Your whole song, part by part. Every answer applies to all of it; click a part to see how it looks there.
            </p>
          </aside>
        </div>

        <footer className="builder-foot">
          <button type="button" className="ghost" onClick={() => (step ? go(step - 1) : ref.current?.close())}>
            {step ? "Back" : "Cancel"}
          </button>
          {step < SHOW ? (
            <button type="button" className="primary" disabled={!canNext} onClick={() => go(step + 1)}>
              Next: {STEPS[step + 1]}
            </button>
          ) : (
            <span className="builder-finish">
              <button type="button" className="ghost" onClick={() => finish(true)} title="Make this song, then start the next one with the same style">
                <Icon name="plus" size={15} /> Make it and start another
              </button>
              <button type="button" className="primary big" onClick={() => finish(false)}>
                <Icon name="check" size={16} /> Make the song
              </button>
            </span>
          )}
        </footer>
      </div>
    </dialog>
  );
}

/** One way to run the lights on stage. */
function PlaybackCard({ on, value, onPick, icon, title, text, disabled }: { on: boolean; value: Playback; onPick: (v: Playback) => void; icon: "play" | "midi" | "stack" | "keyboard" | "clock"; title: string; text: string; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? "choice way on" : "choice way"} disabled={disabled} onClick={() => onPick(value)}>
      <span className="way-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

/** Up to three of the band's own colors: every look leans toward them. */
function BandColors({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const choices = COLORS.filter((c) => c.id !== "warmWhite" && c.id !== "white" && c.id !== "black");
  return (
    <div className="band-colors">
      <div className="band-colors-head">
        <h4 className="builder-subhead">Your band's colors <em className="optional">optional</em></h4>
        {value.length > 0 && (
          <button type="button" className="link small" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      <p className="hint">Got a logo or a stage look? Pick up to three colors and every look leans toward them, so your whole set feels like one show. Lightsmith remembers them for every song.</p>
      <div className="band-swatches" role="group" aria-label="Your band's colors">
        {choices.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              className={on ? "band-swatch on" : "band-swatch"}
              style={{ background: cssColor(c.id) }}
              title={c.label}
              aria-label={c.label}
              disabled={!on && value.length >= 3}
              onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
            >
              {on && <Icon name="check" size={14} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One way to lay out the structure. */
function WayCard({ on, icon, title, text, disabled, onClick }: { on: boolean; icon: "repeat" | "stack" | "ear" | "plus"; title: string; text: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? "choice way on" : "choice way"} disabled={disabled} onClick={onClick}>
      <span className="way-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);
const startOf = (sections: Section[], i: number) => sections.slice(0, Math.max(0, i)).reduce((t, s) => t + sectionMs(s), 0);

/**
 * Plays the built song through: which section is on and how far in, from the
 * recording's own clock when there is one (so the lights follow the music),
 * else from the wall clock.
 */
function useSongPlayer(sections: Section[], recording: BuilderRecording | null, offsetMs: number) {
  const [at, setAt] = useState<{ index: number; ms: number } | null>(null);
  const [token, setToken] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const latest = useRef({ sections, offsetMs });
  latest.current = { sections, offsetMs };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    audio.current?.pause();
    audio.current = null;
    setAt(null);
  };
  const play = (fromMs: number) => {
    stop();
    setToken((t) => t + 1);
    const t0 = performance.now() - fromMs;
    let a: HTMLAudioElement | null = null;
    if (recording) {
      const el = new Audio(recording.url);
      a = el;
      audio.current = el;
      // Seek once the browser knows the file; until it plays, the wall clock keeps time.
      const start = () => {
        if (audio.current !== el) return;
        const pos = latest.current.offsetMs + (performance.now() - t0);
        // A recording that comes in after the song starts waits for its moment.
        if (pos < 0) {
          window.setTimeout(start, -pos);
          return;
        }
        el.currentTime = pos / 1000;
        void el.play().catch(() => undefined);
      };
      if (el.readyState >= 1) start();
      else el.addEventListener("loadedmetadata", start, { once: true });
    }
    const tick = () => {
      const { sections: xs, offsetMs: off } = latest.current;
      const ms = a && !a.paused ? a.currentTime * 1000 - off : performance.now() - t0;
      let start = 0;
      let index = -1;
      for (let i = 0; i < xs.length; i++) {
        const len = sectionMs(xs[i]!);
        if (ms < start + len) {
          index = i;
          break;
        }
        start += len;
      }
      if (index < 0) {
        stop();
        return;
      }
      setAt((prev) => (prev && prev.index === index && Math.abs(prev.ms - ms) < 100 ? prev : { index, ms }));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { at, token, play, stop };
}

/** The whole song in small: a block per section, width by length, height by energy, with moment markers and the playhead. */
function SongStrip({ sections, focusIndex, marks, playFraction, onPick }: { sections: Section[]; focusIndex: number; marks?: { id: string; label: string }[][]; playFraction?: number; onPick: (i: number) => void }) {
  const total = sections.reduce((n, s) => n + sectionMs(s), 0) || 1;
  return (
    <div className="builder-strip" role="list" aria-label="The song, part by part">
      {sections.map((s, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          className={focusIndex === i ? "on" : ""}
          style={{ flexGrow: sectionMs(s) / total, height: `${isBlackout(s) ? 18 : 26 + s.energy * 14.8}%`, background: isBlackout(s) ? undefined : `linear-gradient(90deg, ${paletteOf(s).join(", ")})` }}
          title={`${s.name}: ${describe(s)}${marks?.[i]?.length ? ` (${marks[i]!.map((m) => m.label.toLowerCase()).join(", ")})` : ""}`}
          aria-label={`${s.name}: ${describe(s)}`}
          onClick={() => onPick(i)}
        >
          {marks?.[i]?.length ? (
            <span className="strip-marks" aria-hidden="true">
              {marks[i]!.map((m) => (
                <i key={m.id} className={`strip-mark ${m.id}`} />
              ))}
            </span>
          ) : null}
        </button>
      ))}
      {playFraction !== undefined && <span className="strip-playhead" style={{ left: `${playFraction * 100}%` }} aria-hidden="true" />}
    </div>
  );
}

/** The structure as an editable list: kind, name, length; reorder, add, remove. */
function PlanList({ sections, bpm, beatsPerBar, recordingMs, onChange }: { sections: PlannedSection[]; bpm: number; beatsPerBar: number; recordingMs?: number; onChange: (next: PlannedSection[]) => void }) {
  const types = SECTION_TYPES.filter((t) => t.id !== "blackout");
  const set = (i: number, patch: Partial<PlannedSection>) => onChange(renumber(sections.map((s, k) => (k === i ? { ...s, ...patch } : s))));
  const move = (i: number, d: number) => {
    const next = [...sections];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(renumber(next));
  };
  const totalMs = sections.reduce((n, s) => n + (s.bars * beatsPerBar * 60000) / (s.bpm ?? bpm), 0);
  const gap = recordingMs !== undefined ? recordingMs - totalMs : 0;
  return (
    <div className="plan-list">
      <div className="plan-list-head">
        <h4>The sections</h4>
        <span className="muted">
          {sections.length} {sections.length === 1 ? "part" : "parts"}, {clock(totalMs)}
          {recordingMs !== undefined && sections.length > 0 && (Math.abs(gap) < 2000 ? ", the same as the recording" : gap > 0 ? `, ${clock(gap)} shorter than the recording` : `, ${clock(-gap)} longer than the recording`)}
        </span>
      </div>
      {!sections.length && <p className="plan-empty">No parts yet. Add them in order with the buttons above, or with Add a section below.</p>}
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
