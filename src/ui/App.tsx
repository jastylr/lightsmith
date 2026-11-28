import { useEffect, useState } from "react";
import { REPO_URL } from "../config";
import { ConfirmHost } from "./ConfirmDialog";
import { LEVELS, useLevel, type Level } from "./level";
import { Logo } from "./Logo";
import { Icon, type IconName } from "./icons";
import { download, useLightsmith } from "./store";
import { sectionMs } from "../core";
import { Welcome } from "./ShowFile";
import { StagePage } from "./StagePage";
import { SongsPage } from "./SongsPage";
import { ExportPage } from "./ExportPage";
import { ShowControlPage } from "./ShowControlPage";
import { hasWork, startNewProject } from "./newProject";
import { CommandPalette, ShortcutsSheet, sectionItems, type PaletteItem } from "./Palette";
import { sendCommand } from "./commands";
import { ToastHost } from "./Toast";

type StepId = "stage" | "songs" | "control" | "export";

export function App() {
  const store = useLightsmith();
  const ready = store.fixtures.length > 0;
  const [step, setStep] = useState<StepId>(ready ? "songs" : "stage");
  // The song you were on, so a refresh comes back to it.
  const [songId, setSongIdState] = useState<string>(() => {
    try {
      const last = localStorage.getItem(SONG_KEY);
      if (last && store.project.songs.some((x) => x.id === last)) return last;
    } catch {
      /* fine */
    }
    return store.project.songs[0]?.id ?? "";
  });
  const setSongId = (id: string) => {
    setSongIdState(id);
    try {
      localStorage.setItem(SONG_KEY, id);
    } catch {
      /* not remembered; fine */
    }
  };
  // Without a show file only the first step is open (after starting a new project, say).
  useEffect(() => {
    if (!ready && step !== "stage") setStep("stage");
  }, [ready, step]);

  // The sidebar folds down to a strip of icons, for more room on the page. Remembered.
  const [collapsed, setCollapsedNow] = useState(rememberedRail);
  const setCollapsed = (c: boolean) => {
    setCollapsedNow(c);
    rememberRail(c);
  };
  // Cmd/Ctrl+\ folds and unfolds it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsedNow((c) => {
          rememberRail(!c);
          return !c;
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

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

  // The command palette (Cmd/Ctrl+K) and the shortcuts sheet (?).
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcuts(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const { level, setLevel } = useLevel();

  const placed = store.project.rig.fixtures.filter((f) => f.role !== "ignore").length;
  const devices = store.project.control?.devices.length ?? 0;
  const controlStatus = devices ? `${devices} MIDI ${devices === 1 ? "device" : "devices"}` : "Pads and footswitches";
  const steps: { id: StepId; label: string; icon: IconName; status: string }[] = [
    {
      id: "stage",
      label: "Stage",
      icon: "stage",
      status: !store.workspace ? "Load your QLC+ show" : store.project.demo ? "The demo rig" : store.missing.length ? `${store.missing.length} ${store.missing.length === 1 ? "light needs" : "lights need"} a definition` : `${placed} lights in use`,
    },
    { id: "songs", label: "Songs", icon: "music", status: `${store.project.songs.length} ${store.project.songs.length === 1 ? "song" : "songs"}` },
    { id: "control", label: "Show control", icon: "midi", status: controlStatus },
    { id: "export", label: "Export", icon: "download", status: "Build the QLC+ file" },
  ];

  const currentSong = store.project.songs.find((x) => x.id === songId) ?? store.project.songs[0];
  /** Go to a section: the Songs page, its song, then pick it once the page is there. */
  const goToSection = (song: string, section: string) => {
    setSongId(song);
    setStep("songs");
    window.setTimeout(() => sendCommand({ type: "select-section", id: section }), 30);
  };
  const onSongs = (then: () => void) => {
    setStep("songs");
    window.setTimeout(then, 30);
  };
  const paletteItems: PaletteItem[] = !ready
    ? [{ id: "help", group: "Help", label: "Open the user manual", icon: "book", run: () => window.open("manual.html", "_blank") }]
    : [
        ...steps.map((st) => ({ id: `go-${st.id}`, group: "Go to", label: st.label, hint: st.status, icon: st.icon, keywords: "page step", run: () => setStep(st.id) })),
        ...store.project.songs.map((song) => ({ id: `song-${song.id}`, group: "Songs", label: song.title || "Untitled song", hint: `${song.sections.length} sections`, icon: "music" as IconName, keywords: "song open", run: () => { setSongId(song.id); setStep("songs"); } })),
        ...(currentSong
          ? [
              { id: "builder", group: "Actions", label: "Song Builder", hint: `for ${currentSong.title || "this song"}`, icon: "sparkle" as IconName, keywords: "wizard guide build", run: () => onSongs(() => sendCommand({ type: "open-builder" })) },
              { id: "library", group: "Actions", label: "Look library", hint: "for the section you're editing", icon: "stack" as IconName, keywords: "looks genre presets", run: () => onSongs(() => sendCommand({ type: "open-library" })) },
              { id: "variations", group: "Actions", label: "Try variations", hint: "on the section you're editing", icon: "sparkle" as IconName, keywords: "ideas alternatives", run: () => onSongs(() => sendCommand({ type: "open-variations" })) },
            ]
          : []),
        { id: "new-song", group: "Actions", label: "Add a song", icon: "plus", run: () => { setSongId(store.addSong()); setStep("songs"); } },
        { id: "save", group: "Actions", label: "Save project", hint: "a .lightsmith file", icon: "download", keywords: "backup export file", run: () => { const f = store.projectFile(); download(f.name, f.text, "application/json"); } },
        { id: "undo", group: "Actions", label: "Undo", icon: "undo", shortcut: `${mod}Z`, run: undo },
        { id: "redo", group: "Actions", label: "Redo", icon: "redo", shortcut: mac ? "⇧⌘Z" : "Ctrl+Y", run: redo },
        { id: "level", group: "View", label: level === "simple" ? "Show every setting (Full)" : "Show the essentials (Simple)", icon: "list", keywords: "simple full mode level", run: () => setLevel(level === "simple" ? "full" : "simple") },
        { id: "rail", group: "View", label: collapsed ? "Expand the sidebar" : "Collapse the sidebar", icon: collapsed ? "chevronsRight" : "chevronsLeft", shortcut: `${mod}\\`, run: () => setCollapsed(!collapsed) },
        { id: "keys", group: "Help", label: "Keyboard shortcuts", icon: "keyboard", shortcut: "?", run: () => setShortcuts(true) },
        { id: "manual", group: "Help", label: "Open the user manual", icon: "book", run: () => window.open("manual.html", "_blank") },
        ...sectionItems(store.project.songs, currentSong?.id ?? "", goToSection),
      ];

  return (
    <div className={collapsed ? "shell rail-collapsed" : "shell"}>
      {/* Keyed on folding, so its contents fade in again each time. */}
      <aside className="rail" key={collapsed ? "folded" : "open"}>
        <div className="rail-head">
          <Logo />
        </div>
        <p className="rail-tag">Light shows for QLC+, built from your songs</p>
        <div className="undo-bar" role="group" aria-label="Undo and redo">
          <button type="button" className="undo-button" onClick={undo} disabled={!store.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
            <Icon name="undo" size={15} /> <span className="rail-hide">Undo</span>
          </button>
          <button type="button" className="undo-button" onClick={redo} disabled={!store.canRedo} title={`Redo (${mac ? "⇧⌘Z" : "Ctrl+Y"})`} aria-label="Redo">
            <Icon name="redo" size={15} /> <span className="rail-hide">Redo</span>
          </button>
          <button
            type="button"
            className="undo-button new-button"
            onClick={() => void startNewProject(store)}
            disabled={!hasWork(store)}
            title="Start a new, empty project (you can save this one first)"
            aria-label="New project"
          >
            <Icon name="plus" size={15} /> <span className="rail-hide">New project</span>
          </button>
          <button
            type="button"
            className="undo-button save-button"
            onClick={() => {
              const f = store.projectFile();
              download(f.name, f.text, "application/json");
            }}
            disabled={!store.workspace && store.project.songs.length === 0}
            title="Save everything in one .lightsmith file, to back it up or open it on another computer"
            aria-label="Save project"
          >
            <Icon name="download" size={15} /> <span className="rail-hide">Save project</span>
          </button>
        </div>
        <button type="button" className="rail-search" onClick={() => setPalette(true)} title={`Find a song, section or action (${mod}K)`}>
          <Icon name="search" size={15} />
          <span className="rail-hide">Search and commands</span>
          <kbd className="rail-hide">{mod}K</kbd>
        </button>
        <LevelSwitch />
        <nav aria-label="Steps">
          <ol className="rail-steps">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button className={step === s.id ? "rail-step on" : "rail-step"} onClick={() => setStep(s.id)} disabled={s.id !== "stage" && !ready} aria-current={step === s.id ? "step" : undefined} aria-label={`${i + 1}. ${s.label}: ${s.status}`} title={collapsed ? `${s.label}: ${s.status}` : undefined}>
                  <span className="rail-num">
                    <span className="rail-num-n">{i + 1}</span>
                    {/* The folded sidebar shows each step's icon instead of its number. */}
                    <span className="rail-num-icon">
                      <Icon name={s.icon} size={16} />
                    </span>
                  </span>
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
        <button type="button" className="rail-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} title={`${collapsed ? "Expand the sidebar" : "Collapse the sidebar to icons, for more room"} (${mod}\\)`}>
          <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} size={16} />
          <span className="rail-hide">Collapse sidebar</span>
        </button>
        <div className="rail-foot">
          <p>Free and open source. Your files stay in this browser.</p>
          <a href="manual.html" target="_blank" rel="noreferrer">
            User manual
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
      </aside>
      {/* A handle on the sidebar's edge, always in view, that folds and unfolds it. */}
      <button type="button" className="rail-edge" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} title={`${collapsed ? "Expand the sidebar" : "Collapse the sidebar"} (${mod}\\)`}>
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
      </button>

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
        {step === "stage" && (ready ? <StagePage store={store} onNext={() => setStep("songs")} /> : <Welcome
              store={store}
              onDemo={() => {
                setSongId("demo-song-1");
                setStep("songs");
              }}
            />)}
        {step === "songs" && <SongsPage store={store} songId={songId} setSongId={setSongId} onNext={() => setStep("control")} />}
        {step === "control" && <ShowControlPage store={store} onNext={() => setStep("export")} />}
        {step === "export" && <ExportPage store={store} songId={songId} setSongId={setSongId} />}
      </main>
      <ConfirmHost />
      <ToastHost onUndo={undo} />
      {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />}
      {shortcuts && <ShortcutsSheet mod={mod} onClose={() => setShortcuts(false)} />}
    </div>
  );
}

const RAIL_KEY = "lightsmith.railCollapsed.v1";
function rememberedRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberRail(c: boolean) {
  try {
    localStorage.setItem(RAIL_KEY, c ? "1" : "0");
  } catch {
    /* not remembered */
  }
}

/** How much of the app shows: Simple or Full. Only hides controls; the show never changes. */
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

const SONG_KEY = "lightsmith.song.v1";
