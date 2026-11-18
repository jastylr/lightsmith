import { useMemo, useState } from "react";
import { checkWorkspace, generateSong, moodById, parseWorkspace, sectionMs, serializeWorkspace, songPathFor, type GenerateSummary, type Issue } from "../core";
import { cssColor } from "./ColorPicker";
import { Dropdown } from "./controls";
import { askConfirm } from "./ConfirmDialog";
import { Icon } from "./icons";
import { download, type Store } from "./store";

export function ExportPage({ store, songId, setSongId }: { store: Store; songId: string; setSongId: (id: string) => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [result, setResult] = useState<{ xml: string; summary: GenerateSummary; issues: Issue[]; songTitle: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const unusable = useMemo(() => store.project.rig.fixtures.filter((f) => f.role !== "ignore" && !store.profiles.has(f.fixtureId)).length, [store.project.rig, store.profiles]);

  const build = () => {
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
  const fileName = result ? `${baseName} - ${result.songTitle}.qxw` : "";

  return (
    <section className="page">
      <header className="page-head">
        <h1>Export to QLC+</h1>
        <p className="lead">Lightsmith adds the song to a copy of your workspace. The rest of your show stays as it was, and exporting the same song again replaces its earlier version.</p>
      </header>

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
          {song && (
            <div className="export-strip" aria-hidden="true">
              {song.sections.map((s) => (
                <span key={s.id} style={{ flexGrow: sectionMs(s), background: `linear-gradient(90deg, ${(s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor).join(",")})` }} title={s.name} />
              ))}
            </div>
          )}
        </div>
        <button className="primary large" onClick={build} disabled={!song?.sections.length}>
          <Icon name="play" /> Build show file
        </button>
      </div>

      {unusable > 0 && (
        <div className="notice warn">
          <Icon name="info" />
          <span>
            {unusable} {unusable === 1 ? "light has" : "lights have"} no definition yet and will be left out. Add the definitions on the Show file step.
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
              <h2>{errors.length ? "A few things need fixing" : `${result.songTitle} is ready`}</h2>
              <p>
                {result.summary.functions} QLC+ functions for {result.summary.sections} sections, a song cue list, and a frame of section buttons named “{result.summary.buttonsFrame}”, {result.summary.buttonsWhere}.
                {result.summary.removedPrevious > 0 && " The earlier export of this song was replaced."}
              </p>
            </div>
            <button className="primary" disabled={errors.length > 0} onClick={() => download(fileName, result.xml)}>
              <Icon name="download" /> Download
            </button>
          </div>
          {errors.length > 0 && <IssueList title="Fix before downloading" items={errors} kind="error" />}
          {warnings.length > 0 && <IssueList title="Worth checking" items={warnings} kind="warn" />}

          <h3>In QLC+</h3>
          <ol className="next-steps">
            <li>Close the show in QLC+ if it's open, then open the downloaded file.</li>
            <li>
              In the Virtual Console, the buttons are in the frame “{result.summary.buttonsFrame}”, {result.summary.buttonsWhere}. Each button starts a section and stops the one before it. You can move the frame anywhere; exporting again keeps it where you put it.
            </li>
            <li>
              To step through the song with one footswitch, add a Cue List widget and pick the chaser “{result.songTitle} — song cues”. Then map your MIDI controller to it in QLC+.
            </li>
            <li>Check moving-head positions on the real rig, adjust their home positions on the Stage step, and export again.</li>
          </ol>
        </div>
      )}

      <section className="backup">
        <h2>Keep a copy of your work</h2>
        <p className="hint">Your stage and songs are saved in this browser. Download a project file to back them up or move them to another computer, then drop it on the Show file step to load it.</p>
        <div className="row">
          <button className="ghost" onClick={() => download("lightsmith-project.json", JSON.stringify(store.project, null, 2), "application/json")}>
            <Icon name="download" size={16} /> Download project file
          </button>
          <button
            className="ghost danger"
            onClick={() => {
              void askConfirm({
                title: "Clear everything?",
                message: "Your show file, fixture definitions, stage and songs will be removed from this browser. This can't be undone, so download a project file first if you want to keep it.",
                confirmLabel: "Clear everything",
                danger: true,
              }).then((ok) => ok && store.resetAll());
            }}
          >
            <Icon name="reset" size={16} /> Start over
          </button>
        </div>
      </section>
    </section>
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
