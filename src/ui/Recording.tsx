/**
 * The song's recording on the timeline: its waveform under the section
 * blocks, with bar lines to line them up against, and the controls to add,
 * slide, mute or remove it.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampOffset, formatDuration, peaksPath, sectionMs, type Section, type SongAudio } from "../core";
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
  const path = useMemo(() => (peaks ? peaksPath(peaks) : ""), [peaks]);
  const [sliding, setSliding] = useState(false);
  const latest = useRef({ audio, scale, onOffset });
  latest.current = { audio, scale, onOffset };

  // Bar lines under the blocks, strongest where a section starts. Skipped when bars are too close to see.
  const bars = useMemo(() => {
    const out: { x: number; start: boolean }[] = [];
    let t = 0;
    for (const s of sections) {
      const barMs = (60000 / s.bpm) * s.beatsPerBar;
      if ((barMs / 1000) * scale >= 6) for (let b = 0; b < s.bars; b++) out.push({ x: ((t + b * barMs) / 1000) * scale, start: b === 0 });
      else out.push({ x: (t / 1000) * scale, start: true });
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
        <span key={i} className={b.start ? "bar-line start" : "bar-line"} style={{ left: b.x }} />
      ))}
      {track.status === "ready" && (
        <svg className="wave" viewBox={`0 0 ${Math.max(1, track.peaks.length)} 2`} preserveAspectRatio="none" style={{ left: (-audio.offsetMs / 1000) * scale, width: (audio.durationMs / 1000) * scale }} aria-hidden="true">
          <path d={path} />
        </svg>
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
}: {
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
      <label className="recording-start" title="How far into the recording the first section starts. You can also drag the waveform.">
        <span>Song starts at</span>
        <DurationInput label="Where the song starts in the recording" valueMs={audio.offsetMs} maxMs={Math.max(0, audio.durationMs - 1000)} onChange={(ms) => onOffset(clampOffset(ms, audio))} />
      </label>
      <button type="button" className="ghost small icon-only" onClick={() => onMute(!muted)} disabled={track.status !== "ready"} aria-pressed={muted} aria-label={muted ? "Unmute the recording" : "Mute the recording"} title={muted ? "Unmute the recording" : "Mute the recording"}>
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
