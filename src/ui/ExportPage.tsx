import { useMemo, useState } from "react";
import { checkWorkspace, formatClock, generateSet, generateSong, moodById, newId, parseWorkspace, PATH_ROOT, sectionMs, serializeWorkspace, setlistsOf, setMs, setOrder, songMs, songPathFor, type Setlist, type GenerateSummary, type Issue, type SetSummary, type Song } from "../core";
import { cssColor } from "./ColorPicker";
import { Dropdown, Segmented, Toggle } from "./controls";
import { startNewProject } from "./newProject";
import { Icon } from "./icons";
import { download, type Store } from "./store";

type Mode = "set" | "song";
type Built =
  | { mode: "song"; xml: string; summary: GenerateSummary; issues: Issue[]; title: string }
  | { mode: "set"; xml: string; summary: SetSummary; issues: Issue[]; title: string };

export function ExportPage({ store, songId, setSongId }: { store: Store; songId: string; setSongId: (id: string) => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [mode, setMode] = useState<Mode>(songs.length > 1 ? "set" : "song");
  const [result, setResult] = useState<Built | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Songs with a recording can also get a timeline that plays along with it.
  const [withRecording, setWithRecording] = useState(true);
  const unusable = useMemo(() => store.project.rig.fixtures.filter((f) => f.role !== "ignore" && !store.profiles.has(f.fixtureId)).length, [store.project.rig, store.profiles]);

  const { sets, current: set } = setlistsOf(store.project);
  const order = setOrder(store.project, set);
  const inSet = order.filter((o) => o.included && o.song.sections.length > 0).map((o) => o.song);
  const saveSet = (changes: Partial<Setlist>) => {
    store.saveSet({ ...set, ...changes });
    setResult(null);
  };
  const saveOrder = (next: { song: Song; included: boolean }[]) => saveSet({ order: next.map((o) => o.song.id), skip: next.filter((o) => !o.included).map((o) => o.song.id) });
  const newSet = () => {
    let n = sets.length + 1;
    while (sets.some((x) => x.name === `Set ${n}`)) n++;
    // A copy of this set, to trim or reorder: most short sets are a full set with songs taken out.
    store.saveSet({ ...set, id: newId("set"), name: `Set ${n}` });
    setResult(null);
  };
  const moveSong = (i: number, by: number) => {
    const next = [...order];
    const [o] = next.splice(i, 1);
    next.splice(i + by, 0, o!);
    saveOrder(next);
  };

  const build = () => {
    if (!store.workspace) return;
    setFailure(null);
    try {
      const ws = parseWorkspace(store.workspace.xml);
      if (mode === "set") {
        const summary = generateSet({ ws, profiles: store.profiles, rig: store.project.rig, songs: inSet, sequences: store.project.sequences, control: store.project.control, withRecording });
        const xml = serializeWorkspace(ws);
        const issues = checkWorkspace(parseWorkspace(xml), store.profiles, PATH_ROOT);
        setResult({ mode, xml, summary, issues, title: set.name || "Set" });
      } else if (song) {
        const summary = generateSong({ ws, profiles: store.profiles, rig: store.project.rig, song, sequences: store.project.sequences, control: store.project.control, neighbours: store.project.songs, withRecording });
        const xml = serializeWorkspace(ws);
        const issues = checkWorkspace(parseWorkspace(xml), store.profiles, songPathFor(song.title));
        setResult({ mode, xml, summary, issues, title: song.title });
      }
    } catch (e) {
      setFailure((e as Error).message);
      setResult(null);
    }
  };

  const baseName = (store.workspace?.name ?? "show.qxw").replace(/\.qxw$/i, "");
  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = [...(result?.issues.filter((i) => i.level === "warning") ?? []), ...(result?.summary.controlNotes ?? []).map((message): Issue => ({ level: "warning", message }))];
  const fileName = result ? `${baseName} - ${result.title}.qxw` : "";
  const canBuild = mode === "set" ? inSet.length > 0 : !!song?.sections.length;
  const recorded = (mode === "set" ? inSet : song ? [song] : []).filter((x) => x.audio).length;
  const recordings = result ? (result.mode === "set" ? result.summary.recordings : result.summary.recording ? [result.summary.recording] : []) : [];

  return (
    <section className="page">
      <header className="page-head">
        <h1>Export to QLC+</h1>
        <p className="lead">The moment of truth. Lightsmith adds your songs to a copy of your QLC+ show: everything else in it stays exactly as it was, and exporting again simply replaces what Lightsmith made last time.</p>
      </header>

      <Segmented
        label="What to export"
        value={mode}
        options={[
          { value: "set", label: "The whole set" },
          { value: "song", label: "One song" },
        ]}
        onChange={(m: Mode) => {
          setMode(m);
          setResult(null);
        }}
      />

      {mode === "set" ? (
        <div className="export-card set">
          <div className="export-pick">
            <SetPicker store={store} sets={sets} set={set} onSave={saveSet} onNew={newSet} onPicked={() => setResult(null)} />
            <p className="hint">Songs in the order you play them. Each one gets a page of section buttons in QLC+, in this order. Untick a song to leave it out of this set.</p>
            <ol className="set-list" aria-label="Songs in the set">
              {order.map((o, i) => (
                <li key={o.song.id} className={o.included ? "set-song" : "set-song out"}>
                  <span className="set-num">{o.included ? inSet.indexOf(o.song) + 1 || "–" : "–"}</span>
                  <label className="set-check">
                    <input type="checkbox" checked={o.included} onChange={(e) => saveOrder(order.map((x, k) => (k === i ? { ...x, included: e.target.checked } : x)))} aria-label={`Include ${o.song.title || "Untitled song"} in the set`} />
                    <span className="set-title">{o.song.title || "Untitled song"}</span>
                  </label>
                  <span className="set-meta">{o.song.sections.length ? `${o.song.sections.length} sections, ${formatClock(songMs(o.song))}` : "No sections yet"}</span>
                  <SongStrip song={o.song} />
                  <span className="set-move">
                    <button type="button" className="icon-btn" onClick={() => moveSong(i, -1)} disabled={i === 0} aria-label={`Move ${o.song.title} earlier`} title="Earlier in the set">
                      <Icon name="chevronUp" size={16} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => moveSong(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${o.song.title} later`} title="Later in the set">
                      <Icon name="chevronDown" size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <button className="primary large" onClick={build} disabled={!canBuild}>
            <Icon name="play" /> Build show file
          </button>
        </div>
      ) : (
        <div className="export-card">
          <div className="export-pick">
            <Dropdown
              label="Song to export"
              value={song?.id ?? ""}
              options={songs.map((s) => ({ value: s.id, label: s.title || "Untitled song" }))}
              onChange={(id) => {
                setSongId(id);
                setResult(null);
              }}
              className="wide"
            />
            {song && <SongStrip song={song} />}
          </div>
          <button className="primary large" onClick={build} disabled={!canBuild}>
            <Icon name="play" /> Build show file
          </button>
        </div>
      )}

      {recorded > 0 && (
        <div className="export-option">
          <Toggle
            checked={withRecording}
            onChange={(v) => {
              setWithRecording(v);
              setResult(null);
            }}
            label="Play along with the recording"
            hint={`For ${recorded === 1 && mode === "song" ? "this song" : recorded === 1 ? "the 1 song with a recording" : `the ${recorded} songs with a recording`}: a timeline in QLC+'s Show Manager that plays the recording and every section in time with it, with a "▶ With recording" button to start it. Handy for songs played to a click or backing track.`}
          />
        </div>
      )}

      {unusable > 0 && (
        <div className="notice warn">
          <Icon name="info" />
          <span>
            {unusable} {unusable === 1 ? "light has" : "lights have"} no definition yet and will be left out. Add the definitions in the show file bar on the Stage page.
          </span>
        </div>
      )}
      {failure && (
        <div className="notice error">
          <Icon name="alert" />
          <span>The show couldn't be built: {failure}</span>
        </div>
      )}

      {result && (
        <div className="result">
          <div className={errors.length ? "result-head bad" : "result-head good"}>
            <Icon name={errors.length ? "alert" : "check"} size={26} />
            <div>
              <h2>{errors.length ? "A few things need fixing" : result.mode === "set" ? "Your set is ready" : `${result.title} is ready`}</h2>
              {result.mode === "set" ? (
                <p>
                  {result.summary.songs.length} {result.summary.songs.length === 1 ? "song" : "songs"} and {result.summary.functions} QLC+ functions, with one frame of section buttons named “{result.summary.buttonsFrame}”, {result.summary.buttonsWhere}. It has a page for each song.
                  {result.summary.removedPrevious > 0 && " What Lightsmith made before was replaced."}
                </p>
              ) : (
                <p>
                  {result.summary.functions} QLC+ functions for {result.summary.sections} sections, a song cue list, and a frame of section buttons named “{result.summary.buttonsFrame}”, {result.summary.buttonsWhere}.
                  {result.summary.removedPrevious > 0 && " The earlier export of this song was replaced."}
                </p>
              )}
            </div>
            <button className="primary" disabled={errors.length > 0} onClick={() => download(fileName, result.xml)}>
              <Icon name="download" /> Download
            </button>
          </div>
          {errors.length > 0 && <IssueList title="Fix before downloading" items={errors} kind="error" />}
          {warnings.length > 0 && <IssueList title="Worth checking" items={warnings} kind="warn" />}

          <h3>In QLC+</h3>
          {result.mode === "set" ? (
            <ol className="next-steps">
              <li>Close the show in QLC+ if it's open, then open the downloaded file.</li>
              <li>
                In the Virtual Console, the frame “{result.summary.buttonsFrame}” is {result.summary.buttonsWhere}. It has one page per song, named with its place in the set ({result.summary.songs.map((x, i) => `${i + 1}. ${x.title}`).slice(0, 3).join(", ")}{result.summary.songs.length > 3 ? " …" : ""}). Use the arrows in the frame's header to change song.
              </li>
              <li>Each button starts its section and stops whatever was running, even from the song before. Section 1 sits in the same spot on every page, as do section 2 and the rest, so a pad or footswitch can be set up once per spot.</li>
              <li>Every page also has Safe look (stops everything and brings up the steady wash you chose on the Show control page) and Blackout.</li>
              <li>{store.project.control?.devices.length ? "Your pads, switches and presets from Show control are already mapped to the buttons, the song arrows and the song pages. Keep the devices patched to the same universes in QLC+'s Inputs/Outputs." : "To start sections from pads and footswitches, set them up on the Show control step and export again."}</li>
              {recordings.length > 0 && <RecordingSteps files={recordings} />}
              <li>If you exported single songs before, their own frames are replaced by the set. Songs you left out keep what they had.</li>
              <li>Check moving-head positions on the real rig, adjust them on the Stage step, and export again. The frame stays where you put it.</li>
            </ol>
          ) : (
            <ol className="next-steps">
              <li>Close the show in QLC+ if it's open, then open the downloaded file.</li>
              <li>
                In the Virtual Console, the buttons are in the frame “{result.summary.buttonsFrame}”, {result.summary.buttonsWhere}. Each button starts a section and stops the one before it. You can move the frame anywhere; exporting again keeps it where you put it.
              </li>
              <li>
                To step through the song with one footswitch, add a Cue List widget and pick the chaser “{result.title} — song cues”. Then map your MIDI controller to it in QLC+.
              </li>
              {recordings.length > 0 && <RecordingSteps files={recordings} />}
              <li>Check moving-head positions on the real rig, adjust their home positions on the Stage step, and export again.</li>
            </ol>
          )}
        </div>
      )}

      <section className="backup">
        <h2>Keep a copy of your work</h2>
        <p className="hint">Your work is kept in this browser as you go. To back it up or move it to another computer, save a project file (.lightsmith): it holds your stage, songs, set and show control, plus the QLC+ show file and the fixture definitions you added. Drop it on the show file bar on the Stage page (or the first page, for a new project) to open it.</p>
        <div className="row">
          <button
            className="ghost"
            onClick={() => {
              const f = store.projectFile();
              download(f.name, f.text, "application/json");
            }}
          >
            <Icon name="download" size={16} /> Save project file
          </button>
          <button
            className="ghost"
            onClick={() => void startNewProject(store)}
          >
            <Icon name="plus" size={16} /> New project
          </button>
        </div>
      </section>
    </section>
  );
}

/** Where the recordings go, and how to play a song along with one. */
function RecordingSteps({ files }: { files: string[] }) {
  return (
    <>
      <li>
        Put {files.length === 1 ? "the recording" : "the recordings"} in the same folder as the downloaded show file, with {files.length === 1 ? "its" : "their"} name{files.length === 1 ? "" : "s"} unchanged: {files.map((f, i) => (
          <span key={f}>
            {i ? ", " : ""}
            <code>{f}</code>
          </span>
        ))}
        . QLC+ looks for {files.length === 1 ? "it" : "them"} there (your browser can't tell QLC+ where the file{files.length === 1 ? " is" : "s are"} on your computer).
      </li>
      <li>
        <strong>▶ With recording</strong> plays the song from the top: the recording, and every section at its place on the timeline. Press it again to stop. The same timeline is in QLC+'s Show Manager, named “… — with the recording”, if you'd like to see it or nudge it there (exporting again replaces it).
      </li>
    </>
  );
}

function IssueList({ title, items, kind }: { title: string; items: Issue[]; kind: "error" | "warn" }) {
  return (
    <div className={`notice ${kind} stacked`}>
      <strong>{title}</strong>
      <ul>
        {items.map((i, k) => (
          <li key={k}>{i.message}</li>
        ))}
      </ul>
    </div>
  );
}

/** A song's sections as a strip of their colors, sized by length. */
function SongStrip({ song }: { song: Song }) {
  return (
    <div className="export-strip" aria-hidden="true">
      {song.sections.map((s) => (
        <span key={s.id} style={{ flexGrow: sectionMs(s), background: `linear-gradient(90deg, ${(s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor).join(",")})` }} title={s.name} />
      ))}
    </div>
  );
}

/**
 * Which set: a gig with a 30-minute slot gets its own set with fewer songs,
 * and the running time says whether it fits.
 */
function SetPicker({ store, sets, set, onSave, onNew, onPicked }: { store: Store; sets: Setlist[]; set: Setlist; onSave: (c: Partial<Setlist>) => void; onNew: () => void; onPicked: () => void }) {
  const ms = setMs(store.project, set);
  const songs = setOrder(store.project, set).filter((o) => o.included).length;
  const slotMs = set.minutes ? set.minutes * 60_000 : 0;
  const spare = slotMs - ms;
  return (
    <div className="set-picker">
      <div className="set-picker-row">
        {sets.length > 1 && (
          <label className="field">
            <span className="field-label">Set</span>
            <Dropdown
              label="Which set"
              value={set.id}
              options={sets.map((x) => ({ value: x.id, label: x.name, description: formatClock(setMs(store.project, x)) }))}
              onChange={(id) => {
                store.chooseSet(id);
                onPicked();
              }}
            />
          </label>
        )}
        <label className="field set-name">
          <span className="field-label">Name</span>
          <input value={set.name} onChange={(e) => onSave({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && onSave({ name: "Untitled set" })} aria-label="Name of this set" />
        </label>
        <label className="field set-slot">
          <span className="field-label">Slot length</span>
          <span className="set-slot-input">
            <input
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              placeholder="None"
              value={set.minutes ?? ""}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                onSave({ minutes: e.target.value && v > 0 ? v : undefined });
              }}
              aria-label="Slot length in minutes"
            />
            <span>min</span>
          </span>
        </label>
        <span className="set-picker-actions">
          <button type="button" className="ghost small" onClick={onNew} title="A copy of this set, to trim or reorder for another gig">
            <Icon name="plus" size={14} /> New set
          </button>
          {sets.length > 1 && (
            <button type="button" className="ghost small danger" onClick={() => store.deleteSet(set.id)} title="Delete this set (the songs stay)">
              <Icon name="trash" size={14} /> Delete set
            </button>
          )}
        </span>
      </div>
      <p className={slotMs && spare < 0 ? "set-time over" : "set-time"}>
        <strong>
          {songs} {songs === 1 ? "song" : "songs"}, {formatClock(ms)}
        </strong>{" "}
        of music
        {slotMs > 0 && (spare >= 0 ? <>: {formatClock(spare)} to spare in a {set.minutes}-minute slot, for talking, tuning and applause.</> : <>: {formatClock(-spare)} over a {set.minutes}-minute slot. Untick a song or two.</>)}
        {!slotMs && "."}
      </p>
    </div>
  );
}
