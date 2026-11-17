import { useState } from "react";
import { REPO_URL } from "../config";
import { Logo } from "./Logo";
import { Icon, type IconName } from "./icons";
import { useLightsmith } from "./store";
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
    </div>
  );
}
