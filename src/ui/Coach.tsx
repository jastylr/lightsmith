import { useEffect, useRef, useState } from "react";
import { coachSong, variationsOf, type CoachTip, type Rig, type Section, type Sequence, type Song } from "../core";
import { Icon } from "./icons";
import { StagePreview } from "./StagePreview";
import { toast } from "./Toast";

const DISMISSED_KEY = "lightsmith.coachDismissed.v1";
const OPEN_KEY = "lightsmith.coachOpen.v1";

function readDismissed(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}
function writeDismissed(all: Record<string, string[]>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
  } catch {
    /* not remembered; fine */
  }
}

/**
 * The show coach: a few specific suggestions for the song (a chorus that
 * doesn't lift, no ending, heads that never move), each with a one-click fix
 * where there is one. Dismissed tips stay dismissed for that song in this browser.
 */
export function CoachPanel({ song, hasMovers, onSong, onSelect, onVariations }: { song: Song; hasMovers: boolean; onSong: (next: Song) => void; onSelect: (sectionId: string) => void; onVariations: (sectionId: string) => void }) {
  const [dismissed, setDismissed] = useState<Record<string, string[]>>(readDismissed);
  const [open, setOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setOpen = (on: boolean) => {
    setOpenState(on);
    try {
      localStorage.setItem(OPEN_KEY, on ? "1" : "0");
    } catch {
      /* fine */
    }
  };
  const mine = dismissed[song.id] ?? [];
  const all = coachSong(song, { hasMovers });
  const tips = all.filter((t) => !mine.includes(t.id));
  const hidden = all.length - tips.length;
  const dismiss = (t: CoachTip) => {
    const next = { ...dismissed, [song.id]: [...mine, t.id] };
    setDismissed(next);
    writeDismissed(next);
  };
  const restore = () => {
    const next = { ...dismissed };
    delete next[song.id];
    setDismissed(next);
    writeDismissed(next);
  };
  const nameOf = (id?: string) => song.sections.find((s) => s.id === id)?.name;

  return (
    <section className={tips.length ? "coach has-tips" : "coach"} aria-label="Show coach">
      <button type="button" className="coach-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="sparkle" size={16} />
        <strong>Show coach</strong>
        <span className="coach-count">{tips.length ? `${tips.length} ${tips.length === 1 ? "idea" : "ideas"} for this song` : "Looking good"}</span>
        <Icon name={open ? "chevronUp" : "chevronDown"} size={16} />
      </button>
      {open && (
        <div className="coach-body">
          {tips.length === 0 ? (
            <p className="hint">No suggestions for {song.title || "this song"}: it rises and falls, and it has an ending.</p>
          ) : (
            <ul className="coach-tips">
              {tips.map((t) => (
                <li key={t.id} className="coach-tip">
                  <strong>{t.title}</strong>
                  <p>{t.detail}</p>
                  <div className="coach-actions">
                    {t.fix && (
                      <button
                        type="button"
                        className="primary small"
                        onClick={() => {
                          onSong(t.fix!.apply(song));
                          toast(`Done: ${t.fix!.label}`);
                        }}
                      >
                        {t.fix.label}
                      </button>
                    )}
                    {t.action === "variations" && t.sectionId && (
                      <button type="button" className="ghost small" onClick={() => onVariations(t.sectionId!)}>
                        <Icon name="sparkle" size={14} /> Try variations
                      </button>
                    )}
                    {t.sectionId && (
                      <button type="button" className="link small" onClick={() => onSelect(t.sectionId!)}>
                        Go to {nameOf(t.sectionId)}
                      </button>
                    )}
                    <button type="button" className="link small coach-dismiss" onClick={() => dismiss(t)} title="Hide this suggestion for this song">
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <button type="button" className="link small" onClick={restore}>
              Show {hidden} dismissed {hidden === 1 ? "suggestion" : "suggestions"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Three alternative looks for a section, each a small live preview, in a
 * modal. "Use this" applies one (Undo takes it back); Shuffle deals three more.
 */
export function VariationsDialog({ s, rig, sequences, hasMovers, onApply, onClose }: { s: Section; rig: Rig; sequences: Sequence[]; hasMovers: boolean; onApply: (patch: Partial<Section>, label: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const options = variationsOf(s, seed, { hasMovers });
  return (
    <dialog
      ref={ref}
      className="variations"
      aria-labelledby="variations-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (outside the box) closes it.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="variations-box">
        <header className="variations-head">
          <div>
            <h2 id="variations-title">Variations on {s.name}</h2>
            <p className="hint">Three other ways this section could look. Use one to make it this section's look; Undo brings yours back.</p>
          </div>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="variations-grid">
          <figure className="variation current">
            <div className="variation-stage">
              <StagePreview section={s} rig={rig} sequences={sequences} compact loop />
            </div>
            <figcaption>
              <strong>Yours now</strong>
              <span>As it is</span>
            </figcaption>
          </figure>
          {options.map((v) => (
            <figure key={`${seed}-${v.id}`} className="variation">
              <div className="variation-stage">
                <StagePreview section={{ ...s, ...v.patch }} rig={rig} sequences={sequences} compact loop />
              </div>
              <figcaption>
                <strong>{v.label}</strong>
                <span>{v.description}</span>
              </figcaption>
              <button
                type="button"
                className="primary small"
                onClick={() => {
                  onApply(v.patch, v.label);
                  ref.current?.close();
                }}
              >
                Use this
              </button>
            </figure>
          ))}
        </div>
        <footer className="variations-foot">
          <button type="button" className="ghost" onClick={() => setSeed((n) => n + 1)}>
            <Icon name="repeat" size={15} /> Shuffle
          </button>
          <button type="button" className="ghost" onClick={() => ref.current?.close()}>
            Keep mine
          </button>
        </footer>
      </div>
    </dialog>
  );
}
