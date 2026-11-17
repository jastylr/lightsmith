import { useMemo, useState } from "react";
import { APP_NAME } from "../config";
import { checkWorkspace, generateSong, parseWorkspace, serializeWorkspace, songPathFor, type GenerateSummary, type Issue } from "../core";
import { download, type Store } from "./store";

export function ExportStep({ store, songId, setSongId }: { store: Store; songId: string; setSongId: (id: string) => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [result, setResult] = useState<{ xml: string; summary: GenerateSummary; issues: Issue[]; songTitle: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const unusable = useMemo(
    () => store.project.rig.fixtures.filter((f) => f.role !== "ignore" && !store.profiles.has(f.fixtureId)).length,
    [store.project.rig, store.profiles],
  );

  const run = () => {
    if (!store.workspace || !song) return;
    setFailure(null);
    try {
      const ws = parseWorkspace(store.workspace.xml);
      const summary = generateSong({ ws, profiles: store.profiles, rig: store.project.rig, song });
      const xml = serializeWorkspace(ws);
      const issues = checkWorkspace(parseWorkspace(xml), store.profiles, songPathFor(song.title));
      setResult({ xml, summary, issues, songTitle: song.title });
    } catch (e) {
      setFailure((e as Error).message);
      setResult(null);
    }
  };

  const baseName = (store.workspace?.name ?? "show.qxw").replace(/\.qxw$/i, "");
  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <section className="panel">
      <h1>Export to QLC+</h1>
      <p className="lead">
        {APP_NAME} adds the song to a copy of your workspace. Everything else in your show stays as it was. Exporting the
        same song again replaces its previous version.
      </p>

      <div className="songbar">
        <label>
          Song
          <select value={song?.id} onChange={(e) => (setSongId(e.target.value), setResult(null))}>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={run} disabled={!song?.sections.length}>
          Build the show
        </button>
      </div>

      {unusable > 0 && <div className="banner warn">{unusable} fixture(s) have no definition yet and will be left out. Add them in step 1.</div>}
      {failure && <div className="banner error">Something went wrong: {failure}</div>}

      {result && (
        <div className="result">
          <h2>{errors.length ? "Not ready yet" : "Ready"}</h2>
          <p>
            Made <strong>{result.summary.functions}</strong> QLC+ functions for <strong>{result.summary.sections}</strong> sections, plus a
            song cue list and a Virtual Console frame called <strong>“{result.summary.buttonsFrame}”</strong> with a button per
            section.
            {result.summary.removedPrevious > 0 && " The previous export of this song was replaced."}
          </p>
          {errors.length > 0 && <IssueList title="Problems to fix" items={errors} kind="error" />}
          {warnings.length > 0 && <IssueList title="Worth checking" items={warnings} kind="warn" />}
          {!result.issues.length && <p className="good">✓ All checks passed.</p>}
          <div className="actions left">
            <button className="primary" disabled={errors.length > 0} onClick={() => download(`${baseName} - ${result.songTitle}.qxw`, result.xml)}>
              Download workspace
            </button>
          </div>
          <details className="help" open>
            <summary>Next steps in QLC+</summary>
            <ol>
              <li>Close the workspace in QLC+ if it's open, then open the downloaded file.</li>
              <li>
                In the Virtual Console, find <strong>“{result.summary.buttonsFrame}”</strong>. Each button starts a section and stops
                the one before it.
              </li>
              <li>
                Want one footswitch to step through the song? Add a Cue List widget and choose the chaser
                <strong> “{result.songTitle} — song cues”</strong>. Then map your MIDI controller in QLC+.
              </li>
              <li>Check moving-head positions with the real rig, then tweak home pan/tilt in step 2 and export again.</li>
            </ol>
          </details>
        </div>
      )}

      <hr />
      <h2>Back up your work</h2>
      <p className="muted">Your stage setup and songs are saved in this browser. Download a project file to keep a copy or move to another computer.</p>
      <div className="actions left">
        <button onClick={() => download("lightsmith-project.json", JSON.stringify(store.project, null, 2), "application/json")}>Download project file</button>
        <button
          className="danger"
          onClick={() => {
            if (confirm("Clear everything stored in this browser? Download a project file first if you want to keep it.")) store.resetAll();
          }}
        >
          Start over
        </button>
      </div>
    </section>
  );
}

function IssueList({ title, items, kind }: { title: string; items: Issue[]; kind: "error" | "warn" }) {
  return (
    <div className={`banner ${kind}`}>
      <strong>{title}</strong>
      <ul>
        {items.map((i, k) => (
          <li key={k}>{i.message}</li>
        ))}
      </ul>
    </div>
  );
}
