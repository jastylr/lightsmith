import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  COLOR_CHANGES,
  EFFECTS,
  ENERGY,
  MOODS,
  MOVEMENTS,
  PATTERNS,
  SECTION_TYPES,
  SPREADS,
  moodById,
  newId,
  newSection,
  patternById,
  sectionMs,
  sectionTypeById,
  type EffectId,
  type Focus,
  type MoverSpread,
  type Section,
  type Song,
  type Transition,
} from "../core";
import { cssColor, PaletteEditor } from "./ColorPicker";
import { Dropdown, EnergyMeter, Field, NumberInput, Segmented, Toggle, useDismiss, type Option } from "./controls";
import { Icon, type IconName } from "./icons";
import { StagePreview } from "./StagePreview";
import type { Store } from "./store";
import { moveItem, useSortable } from "./useSortable";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const paletteOf = (s: Section) => (s.colors.length ? s.colors : moodById(s.mood).colors).map(cssColor);
const cssVars = (v: Record<string, string>) => v as CSSProperties;

const PATTERN_GROUP: Record<string, string> = {
  solid: "Steady",
  drift: "Moving",
  slowWaves: "Moving",
  waves: "Moving",
  stripes: "Moving",
  sineWave: "Moving",
  fillUp: "Moving",
  fillCenter: "Moving",
  circles: "Moving",
  alternate: "Moving",
  marquee: "Moving",
  sparkle: "Atmosphere",
  rainfall: "Atmosphere",
  snow: "Atmosphere",
  bubbles: "Atmosphere",
  starfield: "Atmosphere",
  balls: "Party",
  plasma: "Party",
  fireworks: "Party",
  rainbow: "Party",
  strobe: "Party",
};
const EFFECT_ICON: Record<EffectId, IconName> = { rain: "rain", lightning: "bolt", blinder: "sun", beatPulse: "pulse", sparkle: "sparkle", strobe: "strobe" };

export function SongsPage({ store, songId, setSongId, onNext }: { store: Store; songId: string; setSongId: (id: string) => void; onNext: () => void }) {
  const songs = store.project.songs;
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [selected, setSelected] = useState<string | null>(song?.sections[0]?.id ?? null);

  useEffect(() => {
    if (song && !song.sections.some((s) => s.id === selected)) setSelected(song.sections[0]?.id ?? null);
  }, [song, selected]);

  if (!song) {
    return (
      <section className="page">
        <header className="page-head">
          <h1>Songs</h1>
        </header>
        <div className="empty">
          <p>Add a song to start building its looks.</p>
          <button className="primary" onClick={() => setSongId(store.addSong())}>
            <Icon name="plus" /> Add a song
          </button>
        </div>
      </section>
    );
  }

  const set = (patch: Partial<Song>) => store.updateSong({ ...song, ...patch });
  const setSection = (id: string, patch: Partial<Section>) => set({ sections: song.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (from: number, to: number) => set({ sections: moveItem(song.sections, from, to) });
  const add = (type: string) => {
    const s = newSection(type, song.bpm);
    set({ sections: [...song.sections, s] });
    setSelected(s.id);
  };
  const duplicate = (s: Section) => {
    const i = song.sections.findIndex((x) => x.id === s.id);
    const copy: Section = { ...s, id: newId("sec"), name: `${s.name} copy`, effects: { ...s.effects }, colors: [...s.colors] };
    set({ sections: [...song.sections.slice(0, i + 1), copy, ...song.sections.slice(i + 1)] });
    setSelected(copy.id);
  };
  const remove = (s: Section) => set({ sections: song.sections.filter((x) => x.id !== s.id) });
  const total = song.sections.reduce((t, s) => t + sectionMs(s), 0);
  const current = song.sections.find((s) => s.id === selected);

  return (
    <section className="page songs">
      <header className="song-head">
        <div className="song-pick">
          <Dropdown label="Song" value={song.id} options={songs.map((s) => ({ value: s.id, label: s.title || "Untitled song" }))} onChange={setSongId} className="song-switch" />
          <button className="ghost small" onClick={() => setSongId(store.addSong())}>
            <Icon name="plus" size={15} /> New song
          </button>
        </div>
        <input className="song-title" aria-label="Song title" value={song.title} onChange={(e) => set({ title: e.target.value })} placeholder="Song title" />
        <div className="song-meta">
          <Field label="Tempo">
            <NumberInput
              label="Song tempo in BPM"
              value={song.bpm}
              min={30}
              max={300}
              suffix="BPM"
              onChange={(bpm) => set({ bpm, sections: song.sections.map((s) => (s.bpm === song.bpm ? { ...s, bpm } : s)) })}
            />
          </Field>
          <div className="stat">
            <span>Length</span>
            <strong>{fmt(total)}</strong>
          </div>
          <div className="stat">
            <span>Sections</span>
            <strong>{song.sections.length}</strong>
          </div>
          {songs.length > 1 && (
            <button
              className="ghost small danger"
              onClick={() => {
                if (confirm(`Delete "${song.title}"? This can't be undone.`)) {
                  store.deleteSong(song.id);
                  setSongId(songs.find((s) => s.id !== song.id)!.id);
                }
              }}
            >
              <Icon name="trash" size={15} /> Delete song
            </button>
          )}
        </div>
      </header>

      <Timeline song={song} selected={selected} onSelect={setSelected} onMove={move} onAdd={add} />

      <div className="songs-body">
        <CueList song={song} selected={selected} onSelect={setSelected} onMove={move} />
        {current ? (
          <LookEditor key={current.id} s={current} rig={store.project.rig} onChange={(p) => setSection(current.id, p)} onDuplicate={() => duplicate(current)} onRemove={() => remove(current)} index={song.sections.indexOf(current)} />
        ) : (
          <div className="empty">
            <p>This song has no sections yet. Add one from the timeline.</p>
          </div>
        )}
      </div>

      <div className="page-actions">
        <button className="primary" onClick={onNext}>
          Continue to export
        </button>
      </div>
    </section>
  );
}

function AddSectionMenu({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div className="popover-anchor" ref={ref}>
      <button className="timeline-add" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Add a section">
        <Icon name="plus" />
        <span>Add</span>
      </button>
      {open && (
        <div className="popover add-menu" role="menu">
          {SECTION_TYPES.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => {
                onAdd(t.id);
                setOpen(false);
              }}
            >
              <span className="swatch-row">
                {moodById(t.mood).colors.map((c) => (
                  <i key={c} style={{ background: cssColor(c) }} />
                ))}
              </span>
              {t.label}
              <small>{moodById(t.mood).label}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The song as a strip of blocks: width = length, height = energy. Drag to reorder. */
function Timeline({ song, selected, onSelect, onMove, onAdd }: { song: Song; selected: string | null; onSelect: (id: string) => void; onMove: (a: number, b: number) => void; onAdd: (t: string) => void }) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle, wasDrag } = useSortable(keys, onMove, "x");
  return (
    <div className="timeline-wrap">
      <div className="timeline" role="list" aria-label="Song timeline. Drag sections to reorder.">
        {song.sections.map((s) => {
          const pal = paletteOf(s);
          return (
            <div
              key={s.id}
              role="listitem"
              ref={itemRef(s.id)}
              className={`block${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}`}
              style={{ flexGrow: sectionMs(s), ...cssVars({ "--h": `${38 + s.energy * 12}%`, "--g": `linear-gradient(90deg, ${pal.join(", ")})` }) }}
              tabIndex={0}
              aria-label={`${s.name}, ${fmt(sectionMs(s))}. Press Enter to edit, Alt and arrow keys to move.`}
              {...handle(s.id)}
              onClick={() => !wasDrag() && onSelect(s.id)}
              onKeyDownCapture={(e) => e.key === "Enter" && onSelect(s.id)}
            >
              <span className="block-light" />
              <span className="block-text">
                <strong>{s.name}</strong>
                <small>{fmt(sectionMs(s))}</small>
              </span>
            </div>
          );
        })}
        <AddSectionMenu onAdd={onAdd} />
      </div>
      <p className="hint">Drag blocks to reorder. Taller blocks have more energy.</p>
    </div>
  );
}

function CueList({ song, selected, onSelect, onMove }: { song: Song; selected: string | null; onSelect: (id: string) => void; onMove: (a: number, b: number) => void }) {
  const keys = song.sections.map((s) => s.id);
  const { dragging, itemRef, handle } = useSortable(keys, onMove, "y");
  return (
    <ol className="cues" aria-label="Sections in order">
      {song.sections.map((s, i) => (
        <li key={s.id} ref={itemRef(s.id)} className={`cue${selected === s.id ? " on" : ""}${dragging === s.id ? " dragging" : ""}`}>
          <span className="cue-grip" aria-label={`Drag to move ${s.name}`} title="Drag to reorder (or Alt + arrow keys)" tabIndex={0} {...handle(s.id)}>
            <Icon name="grip" size={16} />
          </span>
          <button className="cue-main" onClick={() => onSelect(s.id)} aria-pressed={selected === s.id}>
            <span className="cue-num">{i + 1}</span>
            <span className="swatch-row">
              {paletteOf(s).map((c, k) => (
                <i key={k} style={{ background: c }} />
              ))}
            </span>
            <span className="cue-text">
              <strong>{s.name}</strong>
              <small>
                {moodById(s.mood).label}, {fmt(sectionMs(s))}
              </small>
            </span>
            <Icon name="chevronRight" size={16} className="cue-chevron" />
          </button>
        </li>
      ))}
    </ol>
  );
}

function LookEditor({ s, rig, index, onChange, onDuplicate, onRemove }: { s: Section; rig: Store["project"]["rig"]; index: number; onChange: (p: Partial<Section>) => void; onDuplicate: () => void; onRemove: () => void }) {
  const mood = moodById(s.mood);
  const moodPattern = patternById(mood.pattern);
  const moodMove = MOVEMENTS.find((m) => m.id === mood.movement)!;
  const moodChange = COLOR_CHANGES.find((c) => c.id === mood.colorChange)!;
  const moveId = s.movement === "mood" ? mood.movement : s.movement;
  const changeId = s.colorChange === "mood" ? mood.colorChange : s.colorChange;

  const moodOptions: Option<string>[] = MOODS.map((m) => ({ value: m.id, label: m.label, description: m.description, swatches: m.colors.map(cssColor) }));
  const patternOptions: Option<string>[] = [
    { value: "mood", label: `Follow the mood (${moodPattern.label})`, description: moodPattern.description },
    ...PATTERNS.map((p) => ({ value: p.id, label: p.label, description: p.description, group: PATTERN_GROUP[p.id] ?? "More" })),
  ];
  const moveIcon = (path: string) => (
    <svg className="opt-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const moveOptions: Option<string>[] = [
    { value: "mood", label: `Follow the mood (${moodMove.label})`, description: moodMove.description, icon: moveIcon(moodMove.icon) },
    ...MOVEMENTS.map((m) => ({ value: m.id, label: m.label, description: m.description, icon: moveIcon(m.icon) })),
  ];
  const changeOptions: Option<string>[] = [{ value: "mood", label: `Follow the mood (${moodChange.label.toLowerCase()})` }, ...COLOR_CHANGES.map((c) => ({ value: c.id, label: c.label }))];
  const hasMovers = rig.fixtures.some((f) => f.role === "mover");

  return (
    <article className="editor" aria-label={`Editing ${s.name}`}>
      <header className="editor-head">
        <span className="editor-num">{index + 1}</span>
        <input className="editor-name" aria-label="Section name" value={s.name} onChange={(e) => onChange({ name: e.target.value })} />
        <div className="editor-actions">
          <button className="ghost small" onClick={onDuplicate}>
            <Icon name="copy" size={15} /> Duplicate
          </button>
          <button className="ghost small danger" onClick={onRemove}>
            <Icon name="trash" size={15} /> Delete
          </button>
        </div>
      </header>

      <div className="editor-grid">
        <div className="editor-preview">
          <StagePreview section={s} rig={rig} />
          <div className="timing-row">
            <Field label="Type">
              <Dropdown
                label="Section type"
                value={s.type}
                options={SECTION_TYPES.map((t) => ({ value: t.id, label: t.label }))}
                onChange={(type) => {
                  const t = sectionTypeById(type);
                  const renamed = SECTION_TYPES.some((x) => x.label === s.name) || !s.name;
                  onChange({ type: t.id, ...(renamed ? { name: t.label } : {}), mood: t.mood, energy: t.energy, transition: t.transition });
                }}
              />
            </Field>
            <Field label="Tempo">
              <NumberInput label="Section tempo" value={s.bpm} min={30} max={300} suffix="BPM" onChange={(bpm) => onChange({ bpm })} />
            </Field>
            <Field label="Length" hint={fmt(sectionMs(s))}>
              <NumberInput label="Length in bars" value={s.bars} min={1} max={256} suffix="bars" onChange={(bars) => onChange({ bars: Math.round(bars) })} />
            </Field>
            <Field label="Beats per bar">
              <Dropdown label="Beats per bar" value={String(s.beatsPerBar)} options={["2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} onChange={(v) => onChange({ beatsPerBar: +v })} />
            </Field>
          </div>
        </div>

        <div className="editor-controls">
          <section className="group">
            <h3>Mood and energy</h3>
            <Dropdown label="Mood" value={s.mood} options={moodOptions} onChange={(m) => onChange({ mood: m })} className="wide" />
            <EnergyMeter value={s.energy} onChange={(energy) => onChange({ energy })} labels={ENERGY} />
          </section>

          <section className="group">
            <h3>Colours</h3>
            <PaletteEditor colors={s.colors} fallback={mood.colors} onChange={(colors) => onChange({ colors })} />
            <div className="row">
              <Field label="Switch between colours">
                <Dropdown label="Colour changes" value={s.colorChange} options={changeOptions} onChange={(v) => onChange({ colorChange: v as Section["colorChange"] })} />
              </Field>
              {changeId !== "hold" && <Toggle checked={s.colorFade} onChange={(colorFade) => onChange({ colorFade })} label="Crossfade" hint="Blend into the next colour" />}
            </div>
          </section>

          <section className="group">
            <h3>Backdrop pattern</h3>
            <Dropdown label="Backdrop pattern" value={s.pattern} options={patternOptions} onChange={(pattern) => onChange({ pattern })} className="wide" />
          </section>

          <section className={hasMovers ? "group" : "group muted-group"}>
            <h3>Moving heads</h3>
            <Dropdown label="Movement" value={s.movement} options={moveOptions} onChange={(movement) => onChange({ movement })} className="wide" />
            {moveId !== "static" && <Segmented label="How heads move together" value={s.moverSpread} onChange={(v: MoverSpread) => onChange({ moverSpread: v })} options={SPREADS.map((x) => ({ value: x.id, label: x.label, title: x.description }))} />}
            {!hasMovers && <p className="hint">No moving heads on your stage yet.</p>}
          </section>

          <section className="group">
            <h3>Focus</h3>
            <Segmented
              label="Who to light"
              value={s.focus}
              onChange={(focus: Focus) => onChange({ focus })}
              options={[
                { value: "all", label: "Whole stage" },
                { value: "SL", label: "Stage left" },
                { value: "C", label: "Centre" },
                { value: "SR", label: "Stage right" },
              ]}
            />
            <p className="hint">Focus lights one player in warm white and dims the rest. Stage left is the performers' left.</p>
          </section>

          <section className="group">
            <h3>Effects</h3>
            <div className="effects">
              {EFFECTS.map((e) => {
                const on = !!s.effects[e.id];
                return (
                  <div key={e.id} className={on ? "effect on" : "effect"}>
                    <button type="button" aria-pressed={on} onClick={() => onChange({ effects: { ...s.effects, [e.id]: !on } })}>
                      <Icon name={EFFECT_ICON[e.id]} size={20} />
                      <span>
                        <strong>{e.label}</strong>
                        <small>{e.description}</small>
                      </span>
                    </button>
                    {e.id === "lightning" && on && (
                      <label className="effect-extra">
                        Starts after
                        <NumberInput label="Lightning delay in seconds" value={s.effects.lightningDelaySec ?? 0} min={0} max={600} step={0.5} suffix="s" onChange={(v) => onChange({ effects: { ...s.effects, lightningDelaySec: v } })} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="group">
            <h3>Getting in and out</h3>
            <Segmented
              label="Transition into this section"
              value={s.transition}
              onChange={(transition: Transition) => onChange({ transition })}
              options={[
                { value: "snap", label: "Snap" },
                { value: "fade", label: "Fade (1 beat)" },
                { value: "build", label: "Build (up to 4 bars)" },
              ]}
            />
            <Toggle checked={s.autoAdvance} onChange={(autoAdvance) => onChange({ autoAdvance })} label={`Move on by itself after ${s.bars} bars`} hint="Leave off if the band doesn't play to a click; you'll trigger the next section yourself." />
          </section>
        </div>
      </div>
    </article>
  );
}
