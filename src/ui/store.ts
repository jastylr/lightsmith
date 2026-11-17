/**
 * App state: the loaded workspace, fixture definitions and the saved project.
 * Everything is kept in the browser (localStorage); nothing is uploaded.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fixtureKey,
  guessRig,
  matchProfiles,
  newSong,
  parseFixtureDef,
  parseWorkspace,
  type FixtureDef,
  type Project,
  type Rig,
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

const emptyProject = (): Project => ({ version: 1, rig: { fixtures: [] }, songs: [newSong("My first song", 120)] });

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
  const [project, setProject] = useState<Project>(() => load(KEY_PROJECT, emptyProject()));
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
    setProject((p) => {
      const next = guessRig(fixtures, profiles, p.rig);
      const same = JSON.stringify(next) === JSON.stringify(p.rig);
      return same ? p : { ...p, rig: next };
    });
  }, [fixtures, profiles]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      try {
        if (lower.endsWith(".qxw")) {
          parseWorkspace(text); // validate
          setWorkspace({ name: file.name, xml: text });
        } else if (lower.endsWith(".qxf")) {
          const def = parseFixtureDef(text);
          setDefs((prev) => new Map(prev).set(fixtureKey(def.manufacturer, def.model), { def, source: "added", xml: text }));
        } else if (lower.endsWith(".json")) {
          const p = JSON.parse(text) as Project;
          if (p.version !== 1 || !Array.isArray(p.songs)) throw new Error("Not a Lightsmith project file");
          setProject(p);
        } else {
          setError(`"${file.name}" isn't a .qxw, .qxf or Lightsmith .json file.`);
        }
      } catch (e) {
        setError(`Couldn't read "${file.name}": ${(e as Error).message}`);
      }
    }
  }, []);

  const removeDef = useCallback((key: string) => {
    setDefs((prev) => {
      const m = new Map(prev);
      m.delete(key);
      return m;
    });
  }, []);

  const setRig = useCallback((rig: Rig) => setProject((p) => ({ ...p, rig })), []);
  const updateSong = useCallback((song: Song) => setProject((p) => ({ ...p, songs: p.songs.map((s) => (s.id === song.id ? song : s)) })), []);
  const addSong = useCallback(() => {
    const s = newSong(`Song ${Date.now() % 1000}`, 120);
    setProject((p) => ({ ...p, songs: [...p.songs, s] }));
    return s.id;
  }, []);
  const deleteSong = useCallback((id: string) => setProject((p) => ({ ...p, songs: p.songs.filter((s) => s.id !== id) })), []);
  const resetAll = useCallback(() => {
    setProject(emptyProject());
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
    removeDef,
    setRig,
    updateSong,
    addSong,
    deleteSong,
    resetAll,
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
