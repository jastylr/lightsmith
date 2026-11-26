/**
 * The transport above the timeline, in the manner of a DAW's control bar:
 * back to start and play, then a display of where the song is in bars,
 * beats and sixteenths and in time, the section playing, its tempo and time
 * signature, and the song's length. Click the bar number to go to a bar.
 */
import { useState } from "react";
import { msForBar, musicalPosition, type Section } from "../core";
import { Icon } from "./icons";

/** 83400 → "1:23.4" */
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${t % 10}`;
};

export function TransportBar({
  sections,
  songBpm,
  posMs,
  totalMs,
  playing,
  onPlay,
  onSeek,
}: {
  sections: Section[];
  songBpm: number;
  posMs: number;
  totalMs: number;
  playing: boolean;
  onPlay: () => void;
  onSeek: (ms: number) => void;
}) {
  const p = musicalPosition(sections, posMs, songBpm);
  const section = sections[p.section];
  const [goTo, setGoTo] = useState<string | null>(null);
  const jump = () => {
    const n = Number(goTo);
    if (Number.isFinite(n) && n >= 1) onSeek(Math.min(totalMs, msForBar(sections, n, songBpm)));
    setGoTo(null);
  };
  return (
    <div className="transport-bar" role="group" aria-label="Transport">
      <div className="transport-buttons">
        <button type="button" className="transport-btn" onClick={() => onSeek(0)} disabled={posMs === 0} aria-label="Back to the start" title="Back to the start (Return)">
          <Icon name="skipBack" size={16} />
        </button>
        <button type="button" className={playing ? "transport-btn play on" : "transport-btn play"} onClick={onPlay} disabled={!sections.length} aria-label={playing ? "Pause" : "Play the song"} title={playing ? "Pause (Space)" : "Play the song (Space)"}>
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
      </div>
      <div className="lcd">
        <div className="lcd-cell lcd-pos">
          {goTo !== null ? (
            <input
              className="lcd-goto"
              autoFocus
              inputMode="numeric"
              aria-label="Go to bar"
              value={goTo}
              onChange={(e) => setGoTo(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") jump();
                if (e.key === "Escape") setGoTo(null);
              }}
              onBlur={() => setGoTo(null)}
            />
          ) : (
            <button type="button" className="lcd-digits" onClick={() => setGoTo("")} title="Go to a bar: click, type its number, press Return">
              <span>{p.bar}</span>
              <i>.</i>
              <span>{p.beat}</span>
              <i>.</i>
              <span>{p.sixteenth}</span>
            </button>
          )}
          <span className="lcd-label">{goTo !== null ? "Go to bar, then Return" : "Bar, beat, sixteenth"}</span>
        </div>
        <div className="lcd-cell lcd-time">
          <strong>{clock(posMs)}</strong>
          <span className="lcd-label">Time</span>
        </div>
        <div className="lcd-cell lcd-section">
          <strong title={section?.name}>{section?.name ?? "No sections"}</strong>
          <span className="lcd-label">{section ? `Section ${p.section + 1} of ${sections.length}` : "Section"}</span>
        </div>
        <div className="lcd-cell lcd-small">
          <strong>{Math.round(p.bpm * 10) / 10}</strong>
          <span className="lcd-label">BPM</span>
        </div>
        <div className="lcd-cell lcd-small">
          <strong>
            {p.beatsPerBar}/4
          </strong>
          <span className="lcd-label">Time sig.</span>
        </div>
        <div className="lcd-cell lcd-small">
          <strong>{clock(totalMs).replace(/\.\d$/, "")}</strong>
          <span className="lcd-label">Length</span>
        </div>
      </div>
    </div>
  );
}
