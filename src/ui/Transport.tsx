/**
 * The transport above the timeline, in the manner of a DAW's control bar:
 * back to start and play, then a display of where the song is in bars,
 * beats and sixteenths and in time, the section playing, its tempo and time
 * signature, and the song's length. Click the bar number to go to a bar.
 */
import { useState } from "react";
import { msForBar, musicalPosition, sectionJump, sectionMs as sectionMsOf, type Section } from "../core";
import { TapTempo } from "./controls";
import { Icon } from "./icons";

/** The song's time signature: the one most of its sections use (4/4 when it has none). */
export function songSignature(sections: Pick<Section, "beatsPerBar">[]): number {
  const count = new Map<number, number>();
  for (const s of sections) count.set(s.beatsPerBar, (count.get(s.beatsPerBar) ?? 0) + 1);
  let best = 4;
  let most = 0;
  for (const [b, n] of count) if (n > most) [best, most] = [b, n];
  return best;
}

/**
 * A number on the display you can edit: click it (or Tab to it and press
 * Return), type, and press Return; Escape cancels; the up and down arrows step it.
 */
function LcdNumber({ value, min, max, label, format = String, onChange, wide }: { value: number; min: number; max: number; label: string; format?: (v: number) => string; onChange: (v: number) => void; wide?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && draft.trim() !== "" && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n * 10) / 10)));
    setDraft(null);
  };
  if (draft !== null)
    return (
      <input
        className={wide ? "lcd-edit wide" : "lcd-edit"}
        autoFocus
        inputMode="decimal"
        aria-label={label}
        value={draft}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        onBlur={commit}
      />
    );
  return (
    <button
      type="button"
      className="lcd-value"
      onClick={() => setDraft(String(value))}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(min, Math.min(max, value + (e.key === "ArrowUp" ? 1 : -1))));
        }
      }}
      aria-label={`${label}: ${format(value)}. Click to change, or use the arrow keys`}
      title="Click to change (or use the arrow keys)"
    >
      {format(value)}
    </button>
  );
}

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
  onTempo,
  onSignature,
}: {
  /** Set the song's tempo (sections that follow it change with it). */
  onTempo: (bpm: number) => void;
  /** Set the song's time signature (beats per bar) on the sections that follow it. */
  onSignature: (beatsPerBar: number) => void;
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
  const toMarker = (dir: -1 | 1) => {
    const ms = sectionJump(sections, posMs, dir);
    if (ms !== null) onSeek(ms);
  };
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
        <button type="button" className="transport-btn" onClick={() => toMarker(-1)} disabled={sectionJump(sections, posMs, -1) === null} aria-label="Previous section" title="Previous section: the start of this one, or the one before (Left arrow)">
          <Icon name="chevronLeft" size={18} />
        </button>
        <button type="button" className={playing ? "transport-btn play on" : "transport-btn play"} onClick={onPlay} disabled={!sections.length} aria-label={playing ? "Pause" : "Play the song"} title={playing ? "Pause (Space)" : "Play the song (Space)"}>
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <button type="button" className="transport-btn" onClick={() => toMarker(1)} disabled={sectionJump(sections, posMs, 1) === null} aria-label="Next section" title="Next section (Right arrow)">
          <Icon name="chevronRight" size={18} />
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
        <div className="lcd-cell lcd-small lcd-tempo">
          <span className="lcd-row">
            <LcdNumber value={songBpm} min={30} max={300} label="Song tempo in BPM" onChange={onTempo} />
            <TapTempo label="Song tempo" onTempo={onTempo} />
          </span>
          <span className="lcd-label" title={section && section.bpm !== songBpm ? `The song's tempo; ${section.name} has its own, ${section.bpm} BPM` : undefined}>
            {section && section.bpm !== songBpm ? `BPM (this section ${Math.round(section.bpm * 10) / 10})` : "BPM"}
          </span>
        </div>
        <div className="lcd-cell lcd-small">
          <LcdNumber value={songSignature(sections)} min={1} max={15} label="Beats per bar" format={(v) => `${v}/4`} onChange={onSignature} />
          <span className="lcd-label" title={section && section.beatsPerBar !== songSignature(sections) ? `${section.name} has its own: ${section.beatsPerBar}/4` : undefined}>
            {section && section.beatsPerBar !== songSignature(sections) ? `Time sig. (this ${section.beatsPerBar}/4)` : "Time sig."}
          </span>
        </div>
        <div className="lcd-cell lcd-small">
          <strong>{clock(totalMs).replace(/\.\d$/, "")}</strong>
          <span className="lcd-label">Length</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A small transport for under the pinned preview: back to the previous
 * section, play/pause, on to the next, where you are, and a bar to seek on.
 */
export function MiniTransport({ sections, posMs, totalMs, playing, onPlay, onSeek }: { sections: Section[]; posMs: number; totalMs: number; playing: boolean; onPlay: () => void; onSeek: (ms: number) => void }) {
  const p = musicalPosition(sections, posMs, 120);
  const section = sections[p.section];
  const toMarker = (dir: -1 | 1) => {
    const ms = sectionJump(sections, posMs, dir);
    if (ms !== null) onSeek(ms);
  };
  const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  // Each section's share of the bar, so the sections show as segments.
  let at = 0;
  const marks = sections.map((x) => {
    const start = at;
    at += sectionMsOf(x);
    return start;
  });
  return (
    <div className="mini-transport" role="group" aria-label="Transport">
      <div className="mini-buttons">
        <button type="button" className="transport-btn" onClick={() => toMarker(-1)} aria-label="Previous section" title="Previous section">
          <Icon name="chevronLeft" size={17} />
        </button>
        <button type="button" className={playing ? "transport-btn play on" : "transport-btn play"} onClick={onPlay} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause (Space)" : "Play (Space)"}>
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <button type="button" className="transport-btn" onClick={() => toMarker(1)} aria-label="Next section" title="Next section">
          <Icon name="chevronRight" size={17} />
        </button>
      </div>
      <div className="mini-where">
        <strong>{section?.name ?? ""}</strong>
        <span>
          {clock(posMs)} / {clock(totalMs)}
        </span>
      </div>
      <div
        className="mini-bar"
        role="slider"
        tabIndex={0}
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-valuenow={Math.round(posMs / 1000)}
        aria-valuetext={`${clock(posMs)}, ${section?.name ?? ""}`}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * totalMs);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(totalMs, posMs + 5000));
          else if (e.key === "ArrowLeft") onSeek(Math.max(0, posMs - 5000));
          else return;
          e.preventDefault();
        }}
      >
        {marks.map((m, i) => (i ? <i key={i} className="mini-mark" style={{ left: `${(m / Math.max(1, totalMs)) * 100}%` }} /> : null))}
        <span className="mini-fill" style={{ width: `${(posMs / Math.max(1, totalMs)) * 100}%` }} />
      </div>
    </div>
  );
}
