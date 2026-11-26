/**
 * The song's recording on the timeline: its waveform under the section
 * blocks, with bar lines to line them up against, and the controls to add,
 * slide, mute or remove it.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampOffset, formatDuration, recordingStartMs, sectionMs, type Section, type SongAudio } from "../core";
import { DurationInput } from "./controls";
import { Icon } from "./icons";
import type { AudioTrack } from "./songAudio";

type Gesture = { begin: () => void; end: () => void };

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The waveform lane. Click to play from there; drag sideways to slide the
 * recording under the sections (changing where the song starts in it).
 */
export function WaveLane({
  audio,
  track,
  scale,
  sections,
  onSeek,
  onOffset,
  onPick,
  gesture,
}: {
  audio: SongAudio;
  track: AudioTrack;
  /** Pixels per second. */
  scale: number;
  sections: Section[];
  onSeek: (ms: number) => void;
  onOffset: (ms: number) => void;
  onPick: () => void;
  gesture: Gesture;
}) {
  const peaks = track.status === "ready" ? track.peaks : null;
  // The waveform is drawn once into a canvas, a picture the browser can redraw almost
  // for free. As an SVG path (two points for every 10 ms of the song) it had to be
  // traced again whenever something near it changed, such as the highlight moving to
  // the next section during playback, which froze the playhead for a moment.
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks || !peaks.length) return;
    const n = peaks.length;
    const w = Math.min(n, 16384); // one column per peak, as wide as a canvas safely goes
    const h = 128;
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#8fb7c9";
    for (let x = 0; x < w; x++) {
      // The loudest moment in this column, when several peaks share it.
      let v = 0;
      for (let i = Math.floor((x * n) / w), end = Math.max(i + 1, Math.floor(((x + 1) * n) / w)); i < end; i++) v = Math.max(v, peaks[i]!);
      const half = (v / 255) * 0.96 * (h / 2);
      g.fillRect(x, h / 2 - half, 1, Math.max(1, half * 2));
    }
  }, [peaks]);
  const [sliding, setSliding] = useState(false);
  const latest = useRef({ audio, scale, onOffset });
  latest.current = { audio, scale, onOffset };

  // Lines under the blocks: strongest where a section starts, then bars, then beats once
  // zoomed in far enough to see them. Lines too close together to see are left out.
  const bars = useMemo(() => {
    const out: { x: number; kind: "start" | "bar" | "beat" }[] = [];
    let t = 0;
    for (const s of sections) {
      const beatMs = 60000 / s.bpm;
      const beatPx = (beatMs / 1000) * scale;
      const beats = s.bars * s.beatsPerBar;
      for (let b = 0; b < beats; b++) {
        const kind = b === 0 ? "start" : b % s.beatsPerBar === 0 ? "bar" : "beat";
        if (kind === "start" || (kind === "bar" && beatPx * s.beatsPerBar >= 6) || (kind === "beat" && beatPx >= 12)) out.push({ x: ((t + b * beatMs) / 1000) * scale, kind });
      }
      t += sectionMs(s);
    }
    return out;
  }, [sections, scale]);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || track.status !== "ready") return;
    const lane = e.currentTarget;
    const x0 = e.clientX;
    const from = latest.current.audio.offsetMs;
    let slid = false;
    lane.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!slid && Math.abs(dx) < 4) return;
      if (!slid) {
        slid = true;
        gesture.begin(); // the whole slide is one undo step
        setSliding(true);
      }
      const { audio: a, scale: sc, onOffset: set } = latest.current;
      // Dragging the waveform right moves the music later, so the song starts earlier in it.
      set(clampOffset(from - (dx / sc) * 1000, a));
    };
    const up = (ev: PointerEvent) => {
      lane.removeEventListener("pointermove", move);
      lane.removeEventListener("pointerup", up);
      lane.removeEventListener("pointercancel", up);
      if (slid) {
        gesture.end();
        setSliding(false);
      } else {
        const r = lane.getBoundingClientRect();
        onSeek(((ev.clientX - r.left) / latest.current.scale) * 1000);
      }
    };
    lane.addEventListener("pointermove", move);
    lane.addEventListener("pointerup", up);
    lane.addEventListener("pointercancel", up);
  };

  return (
    <div className={`wave-lane${sliding ? " sliding" : ""}`} onPointerDown={down} title={track.status === "ready" ? "Click to play from here. Drag sideways to line the recording up with the sections." : undefined}>
      {bars.map((b, i) => (
        <span key={i} className={`bar-line ${b.kind}`} style={{ left: b.x }} />
      ))}
      {track.status === "ready" && (
        <canvas ref={canvas} className="wave" style={{ left: (-audio.offsetMs / 1000) * scale, width: (audio.durationMs / 1000) * scale }} aria-hidden="true" />
      )}
      {track.status === "loading" && <span className="wave-note">Loading the recording…</span>}
      {track.status === "missing" && (
        <span className="wave-note">
          <span>
            This song's recording, <strong>{audio.name}</strong> ({fmt(audio.durationMs)}), isn't on this computer yet.
          </span>
          <button type="button" className="ghost small" onPointerDown={(e) => e.stopPropagation()} onClick={onPick}>
            <Icon name="music" size={14} /> Load it
          </button>
        </span>
      )}
    </div>
  );
}

/** Under the timeline: add a recording, or name it, set where the song starts in it, mute or remove it. */
export function RecordingControls({
  audio,
  track,
  muted,
  onMute,
  onPick,
  onOffset,
  onRemove,
  busy,
  error,
  playheadMs,
  tall,
  onTall,
}: {
  /** Where the playhead is, for "Start at the playhead". */
  playheadMs: number;
  tall: boolean;
  onTall: (t: boolean) => void;
  audio?: SongAudio;
  track: AudioTrack;
  muted: boolean;
  onMute: (m: boolean) => void;
  onPick: () => void;
  onOffset: (ms: number) => void;
  onRemove: () => void;
  busy: boolean;
  error: string | null;
}) {
  if (!audio)
    return (
      <div className="recording">
        <button type="button" className="ghost small" onClick={onPick} disabled={busy} title="Add the song's recording to line the sections up with the music and hear it with the lights. It stays on this computer.">
          <Icon name="music" size={14} /> {busy ? "Reading the file…" : "Add a recording"}
        </button>
        {error && (
          <span className="recording-error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  return (
    <div className="recording" role="group" aria-label="The song's recording">
      <button type="button" className="recording-name" onClick={onPick} disabled={busy} title={`${audio.name}, ${formatDuration(audio.durationMs)}. Click to use a different file.`}>
        <Icon name="music" size={14} />
        <span>{busy ? "Reading the file…" : audio.name}</span>
      </button>
      <label className="recording-start" title="Where the recording begins on the timeline. 13s: the music comes in 13 seconds into the song, after a sample you play live. A minus time such as -4s skips the first 4 seconds of the recording, such as a count-in. You can also drag the waveform.">
        <span>Starts at</span>
        <DurationInput signed label="Where the recording starts on the song's timeline" valueMs={recordingStartMs(audio)} minMs={-Math.max(0, audio.durationMs - 1000)} maxMs={600_000} onChange={(ms) => onOffset(clampOffset(-ms, audio))} />
      </label>
      <button type="button" className="ghost small" onClick={() => onOffset(clampOffset(-Math.round(playheadMs), audio))} title="Start the recording where the playhead is: drag the playhead to where the music should come in, then click this.">
        Use playhead
      </button>
      <button type="button" className="ghost small icon-only" onClick={() => onTall(!tall)} aria-pressed={tall} aria-label={tall ? "Make the waveform shorter" : "Make the waveform taller"} title={tall ? "Make the waveform shorter" : "Make the waveform taller"}>
        <Icon name="expand" size={15} />
      </button>
      <button type="button" className={muted ? "ghost small icon-only mute-on" : "ghost small icon-only"} onClick={() => onMute(!muted)} disabled={track.status !== "ready"} aria-pressed={muted} aria-label={muted ? "Unmute the recording" : "Mute the recording"} title={muted ? "Unmute the recording" : "Mute the recording"}>
        <Icon name={muted ? "volumeOff" : "volume"} size={15} />
      </button>
      <button type="button" className="ghost small icon-only" onClick={onRemove} aria-label="Remove the recording from this song" title="Remove the recording from this song">
        <Icon name="x" size={15} />
      </button>
      {error && (
        <span className="recording-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
