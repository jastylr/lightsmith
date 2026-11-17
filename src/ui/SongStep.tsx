import { useState, type CSSProperties } from "react";
import {
  COLORS,
  ENERGY,
  MOODS,
  MOVEMENTS,
  SECTION_TYPES,
  colorById,
  moodById,
  newSection,
  sectionMs,
  sectionTypeById,
  type Focus,
  type Section,
  type Song,
  type Transition,
} from "../core";
import type { Store } from "./store";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const css = (rgb: readonly number[]) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map((c) => css(colorById(c).rgb));

export function SongStep({ store, songId, setSongId, onNext }: { store: Store; songId: string; setSongId: (id: string) => void; onNext: () => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [open, setOpen] = useState<string | null>(null);

  if (!song) {
    return (
      <section className="panel">
        <h1>Songs</h1>
        <button className="primary" onClick={() => setSongId(store.addSong())}>
          Add your first song
        </button>
      </section>
    );
  }
  const set = (patch: Partial<Song>) => store.updateSong({ ...song, ...patch });
  const setSection = (id: string, patch: Partial<Section>) => set({ sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= song.sections.length) return;
    const list = [...song.sections];
    [list[i], list[j]] = [list[j]!, list[i]!];
    set({ sections: list });
  };
  const total = song.sections.reduce((t, s) => t + sectionMs(s), 0);

  return (
    <section className="panel">
      <div className="songbar">
        <label>
          Song
          <select value={song.id} onChange={(e) => setSongId(e.target.value)}>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setSongId(store.addSong())}>+ New song</button>
        {songs.length > 1 && (
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Delete "${song.title}"?`)) {
                store.deleteSong(song.id);
                setSongId(songs.find((s) => s.id !== song.id)!.id);
              }
            }}
          >
            Delete song
          </button>
        )}
      </div>

      <div className="songhead">
        <label className="grow">
          Title
          <input value={song.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Tempo (BPM)
          <input
            type="number"
            min={30}
            max={300}
            value={song.bpm}
            onChange={(e) => {
              const bpm = Math.max(30, Math.min(300, +e.target.value || 120));
              // Sections that followed the old song tempo follow the new one.
              set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) });
            }}
          />
        </label>
        <div className="total">
          Length <strong>{fmt(total)}</strong>
        </div>
      </div>

      <div className="timeline" aria-label="Song timeline">
        {song.sections.map((s) => {
          const pal = paletteOf(s);
          return (
            <button
              key={s.id}
              className={open === s.id ? "seg active" : "seg"}
              style={{ flexGrow: sectionMs(s), background: `linear-gradient(90deg, ${pal.join(", ")})`, opacity: 0.45 + 0.11 * s.energy }}
              onClick={() => setOpen(open === s.id ? null : s.id)}
              title={`${s.name} · ${s.bars} bars · ${fmt(sectionMs(s))}`}
            >
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>

      <ol className="sections">
        {song.sections.map((s, i) => (
          <li key={s.id} className={open === s.id ? "card open" : "card"}>
            <div className="cardhead" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="swatches">
                {paletteOf(s).map((c, k) => (
                  <i key={k} style={{ background: c }} />
                ))}
              </span>
              <strong>
                {i + 1}. {s.name}
              </strong>
              <span className="muted">
                {moodById(s.mood).label} · energy {s.energy} · {s.bars} bars @ {s.bpm} BPM · {fmt(sectionMs(s))}
                {s.effects.rain ? " · rain" : ""}
                {s.effects.lightning ? " · lightning" : ""}
              </span>
              <span className="spacer" />
              <button className="icon" aria-label="Move up" onClick={(e) => (e.stopPropagation(), moveSection(i, -1))}>
                ↑
              </button>
              <button className="icon" aria-label="Move down" onClick={(e) => (e.stopPropagation(), moveSection(i, 1))}>
                ↓
              </button>
              <button
                className="icon"
                aria-label="Duplicate"
                title="Duplicate"
                onClick={(e) => {
                  e.stopPropagation();
                  const copy = { ...s, id: `${s.id}c${Date.now() % 100000}`, effects: { ...s.effects }, colors: [...s.colors] };
                  set({ sections: [...song.sections.slice(0, i + 1), copy, ...song.sections.slice(i + 1)] });
                }}
              >
                ⧉
              </button>
              <button className="icon" aria-label="Delete section" title="Delete" onClick={(e) => (e.stopPropagation(), set({ sections: song.sections.filter((x) => x.id !== s.id) }))}>
                ✕
              </button>
            </div>
            {open === s.id && <SectionEditor s={s} onChange={(p) => setSection(s.id, p)} />}
          </li>
        ))}
      </ol>

      <div className="addrow">
        <span>Add a section:</span>
        {SECTION_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              const s = newSection(t.id, song.bpm);
              set({ sections: [...song.sections, s] });
              setOpen(s.id);
            }}
          >
            + {t.label}
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="primary" onClick={onNext}>
          Next: export to QLC+ →
        </button>
      </div>
    </section>
  );
}

function SectionEditor({ s, onChange }: { s: Section; onChange: (p: Partial<Section>) => void }) {
  const mood = moodById(s.mood);
  const toggleColor = (id: string) => {
    const has = s.colors.includes(id);
    const next = has ? s.colors.filter((c) => c !== id) : [...s.colors, id].slice(-4);
    onChange({ colors: next });
  };
  return (
    <div className="editor">
      <div className="row">
        <label>
          Section type
          <select
            value={s.type}
            onChange={(e) => {
              const t = sectionTypeById(e.target.value);
              const renamed = SECTION_TYPES.some((x) => x.label === s.name) || !s.name;
              onChange({ type: t.id, ...(renamed ? { name: t.label } : {}), mood: t.mood, energy: t.energy, transition: t.transition });
            }}
          >
            {SECTION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Name
          <input value={s.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label>
          BPM
          <input type="number" min={30} max={300} value={s.bpm} onChange={(e) => onChange({ bpm: Math.max(30, Math.min(300, +e.target.value || 120)) })} />
        </label>
        <label>
          Length (bars)
          <input type="number" min={1} max={256} value={s.bars} onChange={(e) => onChange({ bars: Math.max(1, Math.min(256, Math.round(+e.target.value) || 1)) })} />
        </label>
        <label>
          Beats per bar
          <select value={s.beatsPerBar} onChange={(e) => onChange({ beatsPerBar: +e.target.value })}>
            {[2, 3, 4, 6, 7].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Mood</legend>
        <div className="moods">
          {MOODS.map((m) => (
            <button key={m.id} className={m.id === s.mood ? "mood active" : "mood"} onClick={() => onChange({ mood: m.id })} title={m.description}>
              <span className="swatches">
                {m.colors.map((c) => (
                  <i key={c} style={{ background: css(colorById(c).rgb) }} />
                ))}
              </span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="muted small">{mood.description}</p>
      </fieldset>

      <div className="row">
        <label className="grow">
          <span>
            Energy: <strong>{ENERGY[s.energy - 1]?.label}</strong>
          </span>
          <input type="range" min={1} max={5} value={s.energy} onChange={(e) => onChange({ energy: +e.target.value })} />
        </label>
        <label>
          Movement (moving heads)
          <select value={s.movement} onChange={(e) => onChange({ movement: e.target.value })}>
            <option value="mood">Follow the mood ({MOVEMENTS.find((m) => m.id === mood.movement)?.label})</option>
            {MOVEMENTS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Focus
          <select value={s.focus} onChange={(e) => onChange({ focus: e.target.value as Focus })}>
            <option value="all">Whole stage</option>
            <option value="SL">Stage left player</option>
            <option value="C">Center player</option>
            <option value="SR">Stage right player</option>
          </select>
        </label>
        <label>
          Transition in
          <select value={s.transition} onChange={(e) => onChange({ transition: e.target.value as Transition })}>
            <option value="snap">Snap</option>
            <option value="fade">Fade (1 beat)</option>
            <option value="build">Build (up to 4 bars)</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend>
          Colours <span className="muted small">{s.colors.length ? "(your pick, up to 4)" : "(using the mood's colours; click to choose your own)"}</span>
        </legend>
        <div className="colors">
          {COLORS.map((c) => (
            <button
              key={c.id}
              className={s.colors.includes(c.id) ? "chip on" : "chip"}
              style={{ "--c": css(c.rgb) } as CSSProperties}
              onClick={() => toggleColor(c.id)}
              aria-pressed={s.colors.includes(c.id)}
            >
              <i />
              {c.label}
            </button>
          ))}
          {s.colors.length > 0 && (
            <button className="link" onClick={() => onChange({ colors: [] })}>
              Use mood colours
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Effects</legend>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={!!s.effects.rain} onChange={(e) => onChange({ effects: { ...s.effects, rain: e.target.checked } })} />
            Rain on the backdrop
          </label>
          <label className="check">
            <input type="checkbox" checked={!!s.effects.lightning} onChange={(e) => onChange({ effects: { ...s.effects, lightning: e.target.checked } })} />
            Lightning
          </label>
          {s.effects.lightning && (
            <label>
              Lightning after (seconds)
              <input type="number" min={0} max={600} step={0.5} value={s.effects.lightningDelaySec ?? 0} onChange={(e) => onChange({ effects: { ...s.effects, lightningDelaySec: Math.max(0, +e.target.value) } })} />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={!!s.effects.strobe} onChange={(e) => onChange({ effects: { ...s.effects, strobe: e.target.checked } })} />
            Strobe hits on the backdrop
          </label>
        </div>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={s.autoAdvance} onChange={(e) => onChange({ autoAdvance: e.target.checked })} />
        Go to the next section by itself after {s.bars} bars ({fmt(sectionMs(s))}). Leave off if the band doesn't play to a click.
      </label>
    </div>
  );
}
