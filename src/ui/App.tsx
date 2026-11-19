import { useEffect, useState } from "react";
import { REPO_URL } from "../config";
import { ConfirmHost } from "./ConfirmDialog";
import { LEVELS, useLevel, type Level } from "./level";
import { Logo } from "./Logo";
import { Icon, type IconName } from "./icons";
import { useLightsmith } from "./store";
import { sectionMs } from "../core";
import { ImportPage } from "./ImportPage";
import { StagePage } from "./StagePage";
import { SongsPage } from "./SongsPage";
import { ExportPage } from "./ExportPage";

type StepId = "import" | "stage" | "songs" | "export";

export function App() {
  const store = useLightsmith();
  const ready = store.fixtures.length > 0;
  const [step, setStep] = useState<StepId>(ready ? "songs" : "import");
  const [songId, setSongId] = useState<string>(store.project.songs[0]?.id ?? "");

  // Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z or Ctrl+Y redoes.
  const { undo, redo } = store;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo]);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘" : "Ctrl+";

  const placed = store.project.rig.fixtures.filter((f) => f.role !== "ignore").length;
  const steps: { id: StepId; label: string; icon: IconName; status: string }[] = [
    {
      id: "import",
      label: "Show file",
      icon: "file",
      status: store.workspace ? `${store.fixtures.length} fixtures${store.missing.length ? `, ${store.missing.length} need definitions` : ""}` : "Load your QLC+ workspace",
    },
    { id: "stage", label: "Stage", icon: "stage", status: ready ? `${placed} lights in use` : "Place your lights" },
    { id: "songs", label: "Songs", icon: "music", status: `${store.project.songs.length} ${store.project.songs.length === 1 ? "song" : "songs"}` },
    { id: "export", label: "Export", icon: "download", status: "Build the QLC+ file" },
  ];

  return (
    <div className="shell">
      <aside className="rail">
        <Logo />
        <p className="rail-tag">Light shows for QLC+, one song at a time</p>
        <div className="undo-bar" role="group" aria-label="Undo and redo">
          <button type="button" className="undo-button" onClick={undo} disabled={!store.canUndo} title={`Undo (${mod}Z)`}>
            <Icon name="undo" size={15} /> Undo
          </button>
          <button type="button" className="undo-button" onClick={redo} disabled={!store.canRedo} title={`Redo (${mac ? "⇧⌘Z" : "Ctrl+Y"})`}>
            <Icon name="redo" size={15} /> Redo
          </button>
        </div>
        <LevelSwitch />
        <nav aria-label="Steps">
          <ol className="rail-steps">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button className={step === s.id ? "rail-step on" : "rail-step"} onClick={() => setStep(s.id)} disabled={s.id !== "import" && !ready} aria-current={step === s.id ? "step" : undefined}>
                  <span className="rail-num">{i + 1}</span>
                  <span className="rail-text">
                    <span className="rail-label">
                      <Icon name={s.icon} size={16} /> {s.label}
                    </span>
                    <small>{s.status}</small>
                  </span>
                </button>
                {s.id === "songs" && ready && store.project.songs.length > 0 && (
                  <ul className="rail-songs" aria-label="Songs">
                    {store.project.songs.map((song) => {
                      const current = song.id === (store.project.songs.some((x) => x.id === songId) ? songId : store.project.songs[0]!.id);
                      const ms = song.sections.reduce((t, x) => t + sectionMs(x), 0);
                      const sec = Math.round(ms / 1000);
                      return (
                        <li key={song.id}>
                          <button
                            className={current && step === "songs" ? "rail-song on" : current ? "rail-song current" : "rail-song"}
                            onClick={() => {
                              setSongId(song.id);
                              setStep("songs");
                            }}
                            aria-current={current ? "true" : undefined}
                            title={song.title || "Untitled song"}
                          >
                            <Icon name="music" size={13} />
                            <span>{song.title || "Untitled song"}</span>
                            <small>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="rail-foot">
          <p>Free and open source. Your files stay in this browser.</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source code and help
          </a>
        </div>
      </aside>

      <main className="main">
        {store.error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{store.error}</span>
            <button className="ghost small" onClick={() => store.setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {step === "import" && <ImportPage store={store} onNext={() => setStep("stage")} />}
        {step === "stage" && <StagePage store={store} onNext={() => setStep("songs")} />}
        {step === "songs" && <SongsPage store={store} songId={songId} setSongId={setSongId} onNext={() => setStep("export")} />}
        {step === "export" && <ExportPage store={store} songId={songId} setSongId={setSongId} />}
      </main>
      <ConfirmHost />
    </div>
  );
}

/** How much of the app shows: Simple, Standard or Pro. Only hides controls; the show never changes. */
function LevelSwitch() {
  const { level, setLevel } = useLevel();
  return (
    <div className="level-switch" role="radiogroup" aria-label="How much to show">
      <span className="level-label">Show</span>
      <div className="level-options">
        {LEVELS.map((l) => (
          <button key={l.value} type="button" role="radio" aria-checked={level === l.value} className={level === l.value ? "on" : ""} title={l.title} onClick={() => setLevel(l.value as Level)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
