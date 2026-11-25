/**
 * A song's recording, used as a reference while laying out its sections:
 * a waveform under the timeline and the music playing with the lights.
 *
 * The project keeps only a note of the file (its name, length, fingerprint
 * and where the song starts in it). The sound itself stays in the browser on
 * this computer, so project files stay small and nothing is uploaded.
 */

export interface SongAudio {
  /** Fingerprint of the file's bytes: finds it again, and tells a different file from the same one. */
  key: string;
  /** The file's name, to ask for it on another computer. */
  name: string;
  durationMs: number;
  /** How far into the recording the first section starts (skips a count-in or silence). */
  offsetMs: number;
}

/** Waveform resolution: one loudness value per 20 ms. */
export const PEAKS_PER_SECOND = 50;

/**
 * Loudness over time, one value (0-255) per bucket: the RMS of all channels
 * in the bucket, scaled so the loudest bucket is 255. RMS rather than the
 * highest sample, because a loud rock master hits its ceiling almost
 * everywhere: RMS still shows the verse dropping and the chorus lifting.
 */
export function computePeaks(channels: ArrayLike<number>[], sampleRate: number, perSecond = PEAKS_PER_SECOND): Uint8Array {
  const length = channels[0]?.length ?? 0;
  const size = Math.max(1, Math.round(sampleRate / perSecond));
  const n = Math.ceil(length / size);
  const rms = new Float32Array(n);
  let top = 0;
  for (let b = 0; b < n; b++) {
    const from = b * size;
    const to = Math.min(length, from + size);
    let sum = 0;
    for (const ch of channels) for (let i = from; i < to; i++) { const v = ch[i]!; sum += v * v; }
    const v = Math.sqrt(sum / Math.max(1, (to - from) * channels.length));
    rms[b] = v;
    if (v > top) top = v;
  }
  const out = new Uint8Array(n);
  if (top > 0) for (let b = 0; b < n; b++) out[b] = Math.round((rms[b]! / top) * 255);
  return out;
}

/**
 * The waveform as one SVG path, drawn in a box `peaks.length` wide and 2
 * high with the middle at 1: the top edge out, the mirrored bottom back.
 * Drawn once; zooming only stretches the SVG.
 */
export function peaksPath(peaks: ArrayLike<number>): string {
  const n = peaks.length;
  if (!n) return "";
  const y = (i: number) => (peaks[i]! / 255) * 0.96;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = y(i);
    top.push(`${i} ${(1 - v).toFixed(3)}`);
    bottom.push(`${n - 1 - i} ${(1 + y(n - 1 - i)).toFixed(3)}`);
  }
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

/** How long the timeline is: the sections, or the rest of the recording after the song starts, whichever is longer. */
export function timelineMs(sectionsMs: number, audio?: SongAudio): number {
  return Math.max(sectionsMs, audio ? audio.durationMs - audio.offsetMs : 0);
}

/** Where a moment in the song falls in the recording, or null if the recording has ended by then. */
export function recordingMs(songMs: number, audio: SongAudio): number | null {
  const r = songMs + audio.offsetMs;
  return r < audio.durationMs ? r : null;
}

/** The song start kept within the recording. */
export function clampOffset(ms: number, audio: Pick<SongAudio, "durationMs">): number {
  return Math.max(0, Math.min(Math.max(0, audio.durationMs - 1000), Math.round(ms)));
}

/** A saved note of a recording, checked when a project is loaded; anything broken is dropped. */
export function normalizeAudio(a: unknown): SongAudio | undefined {
  if (!a || typeof a !== "object") return undefined;
  const x = a as Partial<SongAudio>;
  if (typeof x.key !== "string" || !x.key || typeof x.durationMs !== "number" || !(x.durationMs > 0)) return undefined;
  const offset = typeof x.offsetMs === "number" && Number.isFinite(x.offsetMs) ? x.offsetMs : 0;
  return { key: x.key, name: typeof x.name === "string" ? x.name : "Recording", durationMs: x.durationMs, offsetMs: clampOffset(offset, { durationMs: x.durationMs }) };
}

/** Fingerprint of a file: the first 16 hex digits of its SHA-256. */
export async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
