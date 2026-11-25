/**
 * Recordings kept in the browser (IndexedDB), and a hook that gets a song's
 * recording ready to draw and play.
 *
 * localStorage holds only a few megabytes of text, so the sound goes in
 * IndexedDB, which stores files (Blobs) and is meant for this. Each file is
 * kept under its fingerprint, with its waveform worked out once.
 */
import { useEffect, useState } from "react";
import { computePeaks, fingerprint, type SongAudio } from "../core";

export interface StoredAudio {
  key: string;
  name: string;
  durationMs: number;
  blob: Blob;
  peaks: Uint8Array;
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
  if (known) return { ...known, name: file.name };
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  let decoded: AudioBuffer;
  try {
    // decodeAudioData takes the buffer over, so give it a copy.
    decoded = await new Ctx(1, 1, 44100).decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error(`"${file.name}" isn't a sound file this browser can play. Try an MP3, WAV, M4A or OGG file.`);
  }
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  const stored: StoredAudio = {
    key,
    name: file.name,
    durationMs: Math.round(decoded.duration * 1000),
    blob: new Blob([bytes], { type: file.type || "audio/mpeg" }),
    peaks: computePeaks(channels, decoded.sampleRate),
  };
  await putAudio(stored);
  return stored;
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
    getAudio(key)
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
