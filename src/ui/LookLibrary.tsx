import { useEffect, useRef, useState } from "react";
import { GENRES, applyLibraryLook, libraryFor, moodById, patternById, MOVEMENTS, sectionTypeById, type LibraryLook, type Rig, type Section, type Sequence } from "../core";
import { cssColor } from "./ColorPicker";
import { Icon } from "./icons";
import { StagePreview } from "./StagePreview";

const GENRE_KEY = "lightsmith.libraryGenre.v1";

/**
 * The look library: ready-made looks by genre, filtered to the kind of section
 * you're editing (or every kind). Pick one to see it on your stage, with this
 * section's lights and length; "Use this look" makes it the section's look.
 */
export function LookLibraryDialog({ s, rig, sequences, onApply, onClose }: { s: Section; rig: Rig; sequences: Sequence[]; onApply: (next: Section, lookName: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [genre, setGenreState] = useState<string>(() => {
    try {
      return localStorage.getItem(GENRE_KEY) ?? "any";
    } catch {
      return "any";
    }
  });
  const setGenre = (g: string) => {
    setGenreState(g);
    setPicked(null);
    try {
      localStorage.setItem(GENRE_KEY, g);
    } catch {
      /* fine */
    }
  };
  // A custom section isn't any particular kind, so every look suits it.
  const anyKind = s.type === "custom";
  const [onlyKind, setOnlyKind] = useState(!anyKind);
  const [picked, setPicked] = useState<LibraryLook | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const kind = sectionTypeById(s.type).label;
  const all = libraryFor(genre === "classic" ? undefined : genre, onlyKind ? s.type : undefined).filter((l) => genre !== "classic" || l.genres.includes("classic"));
  const suits = (l: LibraryLook) => l.roles.includes(s.type) || (s.type === "prechorus" && l.roles.includes("bridge")) || (s.type === "breakdown" && l.roles.includes("bridge"));
  const filtered = onlyKind ? all.filter(suits) : all;
  // Nothing made for this kind in this genre: show the genre's others rather than an empty page.
  const fellBack = onlyKind && filtered.length === 0;
  const shown = fellBack ? libraryFor(genre === "classic" ? undefined : genre).filter((l) => genre !== "classic" || l.genres.includes("classic")) : filtered;
  const preview = picked ? applyLibraryLook(s, picked) : s;

  return (
    <dialog ref={ref} className="library" aria-labelledby="library-title" onClose={onClose} onClick={(e) => e.target === e.currentTarget && ref.current?.close()}>
      <div className="library-box">
        <header className="variations-head">
          <div>
            <h2 id="library-title">Look library</h2>
            <p className="hint">Ready-made looks to start {s.name} from. Pick one to see it on your stage; your lights, chasers and cues stay as they are.</p>
          </div>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="library-filters">
          <div className="genre-chips" role="radiogroup" aria-label="Genre">
            {[{ id: "any", label: "Any genre" }, { id: "classic", label: "Classics" }, ...GENRES].map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={genre === g.id} className={genre === g.id ? "chip on" : "chip"} onClick={() => setGenre(g.id)} title={"description" in g ? g.description : undefined}>
                {g.label}
              </button>
            ))}
          </div>
          {anyKind ? (
            <p className="library-kind">A custom section can take any look, so every look is shown. Give the section a type (intro, verse, chorus…) to see the ones made for it first.</p>
          ) : (
            <label className="library-kind">
              <input type="checkbox" checked={onlyKind} onChange={(e) => setOnlyKind(e.target.checked)} />
              Only looks that suit a {kind.toLowerCase()}
            </label>
          )}
        </div>
        <div className="library-body">
          <div className="library-grid" role="listbox" aria-label="Looks">
            {fellBack && (
              <p className="library-note">
                <Icon name="info" size={15} /> No {genre === "any" ? "" : `${GENRES.find((g) => g.id === genre)?.label ?? ""} `}looks are made for a {kind.toLowerCase()}, so here are all of them.
              </p>
            )}
            {shown.map((l) => {
              const on = picked?.id === l.id;
              const move = MOVEMENTS.find((m) => m.id === l.look.movement);
              return (
                <button key={l.id} type="button" role="option" aria-selected={on} className={on ? "look-card on" : "look-card"} onClick={() => setPicked(l)} onDoubleClick={() => { onApply(applyLibraryLook(s, l), l.name); ref.current?.close(); }}>
                  <span className="look-swatch" style={{ background: `linear-gradient(90deg, ${(l.look.colors ?? []).map(cssColor).join(", ")})` }} aria-hidden="true" />
                  <strong>{l.name}</strong>
                  <span className="look-desc">{l.description}</span>
                  <small>
                    {GENRES.find((g) => g.id === l.genres[0])?.label ?? "Classic"} · {moodById(l.look.mood ?? "").label}, energy {l.look.energy} · {patternById(l.look.pattern ?? "solid").label}
                    {move && move.id !== "static" ? `, ${move.label.toLowerCase()}` : ""}
                  </small>
                </button>
              );
            })}
          </div>
          <aside className="library-side">
            <div className="builder-stage">
              <StagePreview key={picked?.id ?? "current"} section={preview} rig={rig} sequences={sequences} loop />
            </div>
            <p className="builder-stage-caption">{picked ? <><strong>{picked.name}</strong> on {s.name}</> : <>{s.name} as it is now. Pick a look to see it here.</>}</p>
            <button
              type="button"
              className="primary"
              disabled={!picked}
              onClick={() => {
                if (!picked) return;
                onApply(applyLibraryLook(s, picked), picked.name);
                ref.current?.close();
              }}
            >
              <Icon name="check" size={16} /> Use this look
            </button>
            <p className="hint">Undo brings the section's own look back. Every setting stays yours to change.</p>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
