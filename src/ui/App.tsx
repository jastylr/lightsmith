import { useState } from "react";
import { APP_NAME } from "../config";
import { useLightsmith } from "./store";
import { ImportStep } from "./ImportStep";
import { RigStep } from "./RigStep";
import { SongStep } from "./SongStep";
import { ExportStep } from "./ExportStep";

const STEPS = [
  { id: "import", label: "1. Show file", hint: "Load your QLC+ workspace" },
  { id: "rig", label: "2. Stage", hint: "Tell us what each light does" },
  { id: "songs", label: "3. Songs", hint: "Build sections and pick looks" },
  { id: "export", label: "4. Export", hint: "Download for QLC+" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

export function App() {
  const store = useLightsmith();
  const [step, setStep] = useState<StepId>(store.workspace ? "songs" : "import");
  const [songId, setSongId] = useState<string>(store.project.songs[0]?.id ?? "");
  const ready = store.fixtures.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          {APP_NAME}
          <span className="tag">Light shows for QLC+, one song at a time</span>
        </div>
        <nav className="steps" aria-label="Steps">
          {STEPS.map((s) => (
            <button
              key={s.id}
              className={step === s.id ? "step active" : "step"}
              onClick={() => setStep(s.id)}
              disabled={s.id !== "import" && !ready}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {store.error && (
        <div className="banner error" role="alert">
          {store.error}
          <button className="link" onClick={() => store.setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main>
        {step === "import" && <ImportStep store={store} onNext={() => setStep("rig")} />}
        {step === "rig" && <RigStep store={store} onNext={() => setStep("songs")} />}
        {step === "songs" && <SongStep store={store} songId={songId} setSongId={setSongId} onNext={() => setStep("export")} />}
        {step === "export" && <ExportStep store={store} songId={songId} setSongId={setSongId} />}
      </main>

      <footer>
        {APP_NAME} is free and open source. It writes QLC+ files; QLC+ does everything else. Your files never leave this
        browser.
      </footer>
    </div>
  );
}
