/**
 * Recordings kept in the browser (IndexedDB), and a hook that gets a song's
 * recording ready to draw and play.
 *
 * localStorage holds only a few megabytes of text, so the sound goes in
 * IndexedDB, which stores files (Blobs) and is meant for this. Each file is
 * kept under its fingerprint, with its waveform worked out once.
 */
import { useEffect, useState } from "react";
import { computePeaks, fingerprint, PEAKS_PER_SECOND, type SongAudio } from "../core";

export interface StoredAudio {
  key: string;
  name: string;
  durationMs: number;
  blob: Blob;
  peaks: Uint8Array;
  /** The waveform's resolution when it was worked out: an older, coarser one is worked out again. */
  perSecond?: number;
}

const DB = "lightsmith-audio";
const STORE = "recordings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const getAudio = (key: string) => run<StoredAudio | undefined>("readonly", (s) => s.get(key));
const putAudio = (a: StoredAudio) => run("readwrite", (s) => s.put(a));

/**
 * Read a sound file the user picked: fingerprint it, decode it once to draw
 * its waveform, keep it in the browser, and return the note for the project.
 * The decoded sound (about 20 MB a minute) is let go as soon as the waveform
 * is worked out; playing uses the compressed file.
 */
export async function loadAudioFile(file: File): Promise<StoredAudio> {
  const bytes = await file.arrayBuffer();
  const key = await fingerprint(bytes);
  const known = await getAudio(key).catch(() => undefined);
  if (known && known.perSecond === PEAKS_PER_SECOND) return { ...known, name: file.name };
  const stored = await analyse(key, file.name, new Blob([bytes], { type: file.type || "audio/mpeg" }));
  await putAudio(stored);
  return stored;
}

/** Decode a recording once to work out its length and waveform. */
async function analyse(key: string, name: string, blob: Blob): Promise<StoredAudio> {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  let decoded: AudioBuffer;
  try {
    decoded = await new Ctx(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error(`"${name}" isn't a sound file this browser can play. Try an MP3, WAV, M4A or OGG file.`);
  }
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  return { key, name, durationMs: Math.round(decoded.duration * 1000), blob, peaks: computePeaks(channels, decoded.sampleRate), perSecond: PEAKS_PER_SECOND };
}

/** A recording from the store, its waveform worked out again if it was saved at an older, coarser resolution. */
async function getCurrent(key: string): Promise<StoredAudio | undefined> {
  const a = await getAudio(key);
  if (!a || a.perSecond === PEAKS_PER_SECOND) return a;
  const fresh = await analyse(a.key, a.name, a.blob).catch(() => a);
  if (fresh !== a) await putAudio(fresh).catch(() => undefined);
  return fresh;
}

export type AudioTrack =
  | { status: "none" }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; peaks: Uint8Array; el: HTMLAudioElement };

/** A song's recording from the browser's store: its waveform, and an audio element to play it. */
export function useSongAudio(audio: SongAudio | undefined, muted: boolean): AudioTrack {
  const key = audio?.key;
  const [track, setTrack] = useState<AudioTrack>({ status: key ? "loading" : "none" });
  useEffect(() => {
    if (!key) {
      setTrack({ status: "none" });
      return;
    }
    let live = true;
    let url = "";
    let el: HTMLAudioElement | null = null;
    setTrack({ status: "loading" });
    getCurrent(key)
      .then((a) => {
        if (!live) return;
        if (!a) return setTrack({ status: "missing" });
        url = URL.createObjectURL(a.blob);
        el = new Audio(url);
        el.preload = "auto";
        setTrack({ status: "ready", peaks: a.peaks, el });
      })
      .catch(() => live && setTrack({ status: "missing" }));
    return () => {
      live = false;
      el?.pause();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);
  useEffect(() => {
    if (track.status === "ready") track.el.muted = muted;
  }, [track, muted]);
  return track;
}
