/**
 * App state: the loaded workspace, fixture definitions and the saved project.
 * Everything is kept in the browser (localStorage); nothing is uploaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fixtureKey,
  guessRig,
  matchProfiles,
  newSong,
  normalizeProject,
  setlistsOf,
  bundleProject,
  projectFileName,
  readProjectFile,
  PROJECT_EXT,
  parseFixtureDef,
  parseWorkspace,
  UndoHistory,
  type FixtureDef,
  type Project,
  type Rig,
  type Sequence,
  type LookPreset,
  type Setlist,
  type ShowControl,
  type Song,
  type WsFixture,
} from "../core";

const KEY_PROJECT = "lightsmith.project.v1";
const KEY_DEFS = "lightsmith.customDefs.v1";
const KEY_WS = "lightsmith.workspace.v1";

export interface LoadedDef {
  def: FixtureDef;
  source: "library" | "added";
  xml: string;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works for this visit */
  }
}

export const emptyProject = (): Project => ({ version: 1, rig: { fixtures: [] }, songs: [newSong("My first song", 120)] });

// ---------------------------------------------------------------- fixture library

interface LibraryIndex {
  source: string;
  fixtures: Record<string, string>; // fixtureKey -> path under fixtures/
}
let libraryIndex: Promise<LibraryIndex | null> | null = null;
function getLibraryIndex(): Promise<LibraryIndex | null> {
  libraryIndex ??= fetch("fixtures/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<LibraryIndex>) : null))
    .catch(() => null);
  return libraryIndex;
}

async function fetchLibraryDef(f: WsFixture): Promise<LoadedDef | null> {
  const idx = await getLibraryIndex();
  const path = idx?.fixtures[fixtureKey(f.manufacturer, f.model)];
  if (!path) return null;
  try {
    const r = await fetch(`fixtures/${path}`);
    if (!r.ok) return null;
    const xml = await r.text();
    return { def: parseFixtureDef(xml), source: "library", xml };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- hook

export function useLightsmith() {
  const [project, setProjectState] = useState<Project>(() => normalizeProject(load(KEY_PROJECT, emptyProject())));
  // Every project change goes through change(), which keeps the undo history.
  const current = useRef(project);
  const history = useRef(new UndoHistory<Project>(50));
  const [, setHistoryTick] = useState(0);
  const change = useCallback((fn: (p: Project) => Project, record = true) => {
    const before = current.current;
    const next = fn(before);
    if (next === before) return;
    if (record) history.current.record(before);
    current.current = next;
    setProjectState(next);
    if (record) setHistoryTick((t) => t + 1);
  }, []);
  const setProject = useCallback((p: Project) => change(() => p), [change]);
  const step = useCallback((dir: "undo" | "redo") => {
    const h = history.current;
    const target = dir === "undo" ? h.undo(current.current) : h.redo(current.current);
    if (!target) return;
    current.current = target;
    setProjectState(target);
    setHistoryTick((t) => t + 1);
  }, []);
  const undo = useCallback(() => step("undo"), [step]);
  /** Wrap a drag in these so the whole drag is one undo step. */
  const beginGesture = useCallback(() => history.current.begin(), []);
  const endGesture = useCallback(() => history.current.end(), []);
  const redo = useCallback(() => step("redo"), [step]);
  const [workspace, setWorkspace] = useState<{ name: string; xml: string } | null>(() => load(KEY_WS, null));
  const [defs, setDefs] = useState<Map<string, LoadedDef>>(() => {
    const m = new Map<string, LoadedDef>();
    for (const xml of load<string[]>(KEY_DEFS, [])) {
      try {
        const def = parseFixtureDef(xml);
        m.set(fixtureKey(def.manufacturer, def.model), { def, source: "added", xml });
      } catch {
        /* skip a broken saved file */
      }
    }
    return m;
  });
  const [libraryStatus, setLibraryStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => save(KEY_PROJECT, project), [project]);
  useEffect(() => save(KEY_WS, workspace), [workspace]);
  useEffect(
    () => save(KEY_DEFS, [...defs.values()].filter((d) => d.source === "added").map((d) => d.xml)),
    [defs],
  );

  const parsed = useMemo(() => {
    if (!workspace) return null;
    try {
      return parseWorkspace(workspace.xml);
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [workspace]);
  const fixtures: WsFixture[] = parsed && !("error" in parsed) ? parsed.fixtures : [];
  const stage = parsed && !("error" in parsed) ? parsed.stage : undefined;

  const defMap = useMemo(() => new Map([...defs].map(([k, v]) => [k, v.def])), [defs]);
  const { profiles, missing } = useMemo(() => matchProfiles(fixtures, defMap), [fixtures, defMap]);

  // Look up missing definitions in the bundled QLC+ library.
  useEffect(() => {
    const need = fixtures.filter((f) => !defs.has(fixtureKey(f.manufacturer, f.model)));
    if (!need.length) return;
    let cancelled = false;
    setLibraryStatus("loading");
    Promise.all(need.map(fetchLibraryDef)).then((found) => {
      if (cancelled) return;
      setLibraryStatus("done");
      const add = found.filter((x): x is LoadedDef => !!x);
      if (!add.length) return;
      setDefs((prev) => {
        const m = new Map(prev);
        for (const d of add) {
          const k = fixtureKey(d.def.manufacturer, d.def.model);
          if (!m.has(k)) m.set(k, d);
        }
        return m;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

  // Keep the rig in step with the workspace's fixtures.
  useEffect(() => {
    if (!fixtures.length) return;
    // Automatic, so it isn't an undo step of its own.
    change((p) => {
      const next = guessRig(fixtures, profiles, p.rig, stage);
      const same = JSON.stringify(next) === JSON.stringify(p.rig);
      return same ? p : { ...p, rig: next };
    }, false);
    // Re-run when the rig changes too, so a loaded project gets stage positions.
  }, [fixtures, profiles, project.rig, stage]);

  /** Open a .lightsmith file's contents: it brings its show file and added fixture definitions with it. */
  const openProject = useCallback(
    (text: string) => {
      const read = readProjectFile(text);
      setProject(read.project);
      if (read.showFile) {
        parseWorkspace(read.showFile.xml); // validate
        setWorkspace(read.showFile);
      }
      for (const d of read.fixtureDefinitions) {
        const def = parseFixtureDef(d.xml);
        setDefs((prev) => new Map(prev).set(fixtureKey(def.manufacturer, def.model), { def, source: "added", xml: d.xml }));
      }
    },
    [setProject],
  );
  /** Open the demo: a typical small band rig from QLC+'s own library, with three songs ready to play. */
  const openDemo = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("demo.lightsmith");
      if (!r.ok) throw new Error(`the server said ${r.status}`);
      openProject(await r.text());
      return true;
    } catch (e) {
      setError(`Couldn't open the demo: ${(e as Error).message}`);
      return false;
    }
  }, [openProject]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      try {
        if (lower.endsWith(".qxw")) {
          parseWorkspace(text); // validate
          setWorkspace({ name: file.name, xml: text });
          // A newly loaded show file is the truth about where lights are:
          // forget positions changed here, so QLC+'s 3D view wins.
          change((p) => (p.rig.fixtures.some((f) => f.moved) ? { ...p, rig: { ...p.rig, fixtures: p.rig.fixtures.map(({ moved: _moved, ...f }) => f) } } : p), false);
          // Your own show file: the project isn't the demo any more.
          change((p) => {
            if (!p.demo) return p;
            const { demo: _demo, ...rest } = p;
            return rest;
          }, false);
        } else if (lower.endsWith(".qxf")) {
          const def = parseFixtureDef(text);
          setDefs((prev) => new Map(prev).set(fixtureKey(def.manufacturer, def.model), { def, source: "added", xml: text }));
        } else if (lower.endsWith(PROJECT_EXT) || lower.endsWith(".json")) {
          openProject(text);
        } else {
          setError(`"${file.name}" isn't a .qxw, .qxf or ${PROJECT_EXT} file.`);
        }
      } catch (e) {
        setError(`Couldn't read "${file.name}": ${(e as Error).message}`);
      }
    }
  }, [openProject]);

  const removeDef = useCallback((key: string) => {
    setDefs((prev) => {
      const m = new Map(prev);
      m.delete(key);
      return m;
    });
  }, []);

  const setRig = useCallback((rig: Rig) => change((p) => ({ ...p, rig })), [change]);
  const setSequences = useCallback((sequences: Sequence[]) => change((p) => ({ ...p, sequences })), [change]);
  const setPresets = useCallback((presets: LookPreset[]) => change((p) => ({ ...p, presets })), [change]);
  /** Save a set (a new one is added), and make it the one being worked on. */
  const saveSet = useCallback(
    (set: Setlist) =>
      change((p) => {
        const { sets } = setlistsOf(p);
        const next = sets.some((x) => x.id === set.id) ? sets.map((x) => (x.id === set.id ? set : x)) : [...sets, set];
        const { setlist: _old, ...rest } = p;
        return { ...rest, setlists: next, currentSet: set.id };
      }),
    [change],
  );
  const chooseSet = useCallback((id: string) => change((p) => ({ ...p, currentSet: id }), false), [change]);
  /** Remove a set; the project always keeps one. */
  const deleteSet = useCallback(
    (id: string) =>
      change((p) => {
        const { sets } = setlistsOf(p);
        if (sets.length < 2) return p;
        const next = sets.filter((x) => x.id !== id);
        return { ...p, setlists: next, currentSet: p.currentSet === id ? next[0]!.id : p.currentSet };
      }),
    [change],
  );
  const setControl = useCallback((control: ShowControl) => change((p) => ({ ...p, control })), [change]);
  const updateSong = useCallback((song: Song) => change((p) => ({ ...p, songs: p.songs.map((s) => (s.id === song.id ? song : s)) })), [change]);
  const addSong = useCallback(() => {
    const s = newSong("Untitled song", 120);
    change((p) => ({ ...p, songs: [...p.songs, s] }));
    return s.id;
  }, [change]);
  const deleteSong = useCallback((id: string) => change((p) => ({ ...p, songs: p.songs.filter((s) => s.id !== id) })), [change]);
  /** The whole project as a .lightsmith file: its name and contents. */
  const projectFile = useCallback(() => {
    const added = [...defs.values()].filter((d) => d.source === "added").map((d) => ({ name: `${d.def.manufacturer}-${d.def.model}.qxf`.replace(/[\\/:*?"<>|]/g, "-"), xml: d.xml }));
    return { name: projectFileName(workspace?.name), text: bundleProject(project, workspace, added) };
  }, [defs, project, workspace]);
  /** A new, empty project. Undo history goes too: undoing back into the old project without its show file would only confuse. */
  const resetAll = useCallback(() => {
    const fresh = emptyProject();
    history.current = new UndoHistory<Project>(50);
    current.current = fresh;
    setProjectState(fresh);
    setHistoryTick((t) => t + 1);
    setWorkspace(null);
    setDefs(new Map());
  }, []);

  return {
    project,
    workspace,
    workspaceError: parsed && "error" in parsed ? parsed.error : null,
    fixtures,
    defs,
    profiles,
    missing,
    libraryStatus,
    error,
    setError,
    addFiles,
    openDemo,
    removeDef,
    setRig,
    setSequences,
    setPresets,
    saveSet,
    chooseSet,
    deleteSet,
    setControl,
    projectFile,
    /** The loaded show file, read-only (for importing chasers). */
    showFile: parsed && !("error" in parsed) ? parsed : null,
    updateSong,
    addSong,
    deleteSong,
    resetAll,
    undo,
    redo,
    beginGesture,
    endGesture,
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
  };
}

export type Store = ReturnType<typeof useLightsmith>;

export function download(name: string, content: string, type = "application/xml") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
