import { useRef, useState } from "react";
import { applyLook, LOOK_KEYS, lookOf, moodById, newId, sectionTypeById, type LookPreset, type Section } from "../core";
import { askConfirm } from "./ConfirmDialog";
import { Dropdown, useDismiss } from "./controls";
import { Icon } from "./icons";

/** The changes that turn a section into one with a preset's look (clearing what the preset doesn't set). */
export function presetPatch(s: Section, p: LookPreset): Partial<Section> {
  const applied = applyLook(s, p) as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = { preset: p.id };
  for (const k of LOOK_KEYS) patch[k] = applied[k];
  return patch as Partial<Section>;
}

/**
 * Your own presets: save a section's whole look under a name, and start any
 * section (in any song) from one. A section remembers which preset it came
 * from, so the preset can be updated from it.
 */
export function PresetBar({
  s,
  presets,
  onSection,
  onPresets,
  others = [],
  onCopyTo,
}: {
  s: Section;
  presets: LookPreset[];
  onSection: (p: Partial<Section>) => void;
  onPresets: (next: LookPreset[]) => void;
  /** The song's other sections this look can be copied to. */
  others?: Section[];
  onCopyTo?: (ids: string[]) => void;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const from = s.preset ? presets.find((p) => p.id === s.preset) : undefined;
  const save = () => {
    const name = (naming ?? "").trim();
    if (!name) return;
    const p: LookPreset = { id: newId("pre"), name, type: s.type, look: lookOf(s) };
    onPresets([...presets, p]);
    onSection({ preset: p.id });
    setNaming(null);
  };
  const update = async (p: LookPreset) => {
    const ok = await askConfirm({ title: `Update "${p.name}"?`, message: "The preset takes this section's look. Sections already made from it keep the look they have.", confirmLabel: "Update preset" });
    if (ok) onPresets(presets.map((x) => (x.id === p.id ? { ...x, look: lookOf(s) } : x)));
  };
  const remove = async (p: LookPreset) => {
    const ok = await askConfirm({ title: `Delete "${p.name}"?`, message: "Sections made from it keep their look.", confirmLabel: "Delete preset", danger: true });
    if (ok) onPresets(presets.filter((x) => x.id !== p.id));
  };

  return (
    <div className="preset-bar">
      <span className="preset-label">
        <Icon name="palette" size={15} /> Your presets
      </span>
      {presets.length > 0 && (
        <Dropdown
          label="Start from a preset"
          value=""
          placeholder="Start from a preset…"
          options={presets.map((p) => ({ value: p.id, label: p.name, description: `${moodById(p.look.mood ?? "dark").label} · saved from a ${sectionTypeById(p.type).label.toLowerCase()}` }))}
          onChange={(id) => {
            const p = presets.find((x) => x.id === id);
            if (p) onSection(presetPatch(s, p));
          }}
        />
      )}
      {naming === null ? (
        <button type="button" className="ghost small" onClick={() => setNaming(`${s.name} look`)}>
          <Icon name="plus" size={14} /> Save this look
        </button>
      ) : (
        <span className="preset-name">
          <input
            autoFocus
            value={naming}
            aria-label="Preset name"
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setNaming(null);
            }}
          />
          <button type="button" className="primary small" onClick={save} disabled={!naming.trim()}>
            Save
          </button>
          <button type="button" className="ghost small" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </span>
      )}
      {onCopyTo && others.length > 0 && naming === null && <CopyLook s={s} others={others} onCopy={onCopyTo} />}
      {from && naming === null && (
        <span className="preset-from">
          From <strong>{from.name}</strong>
          <button type="button" className="link small" onClick={() => update(from)} title={`Save this section's look into "${from.name}"`}>
            Update it
          </button>
          <button type="button" className="link small danger" onClick={() => remove(from)}>
            Delete it
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * Copy this section's whole look onto other sections of the song, chosen from a
 * list. It asks first, since their own settings are replaced (undo brings them back).
 */
function CopyLook({ s, others, onCopy }: { s: Section; others: Section[]; onCopy: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), root);
  // Sections with the same name start ticked: "Chorus" and "Chorus 2", say.
  const base = (n: string) => n.toLowerCase().replace(/\s*(\d+|copy)$/g, "").trim();
  const start = () => {
    setPicked(others.filter((o) => base(o.name) === base(s.name)).map((o) => o.id));
    setOpen(true);
  };
  const go = async () => {
    const names = others.filter((o) => picked.includes(o.id)).map((o) => `"${o.name}"`);
    const list = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const ok = await askConfirm({
      title: names.length === 1 ? `Replace the look of ${list}?` : `Replace the look of ${names.length} sections?`,
      message:
        names.length === 1
          ? `${list} will take this section's whole look: mood, colors, pattern, lights, moving heads, effects, chasers and how it starts. Its own look is replaced. Its name, length, tempo and cue stay, and Undo brings its old look back.`
          : `${list} will take this section's whole look: mood, colors, pattern, lights, moving heads, effects, chasers and how it starts. Their own looks are replaced. Their names, lengths, tempo and cues stay, and Undo brings their old looks back.`,
      confirmLabel: names.length === 1 ? "Replace look" : `Replace ${names.length} looks`,
      danger: true,
    });
    if (!ok) return;
    onCopy(picked);
    setOpen(false);
  };
  return (
    <div className="copy-look" ref={root}>
      <button type="button" className="ghost small" aria-expanded={open} onClick={() => (open ? setOpen(false) : start())}>
        <Icon name="copy" size={14} /> Copy this look to…
      </button>
      {open && (
        <div className="copy-look-pop" role="dialog" aria-label={`Copy the look of ${s.name}`}>
          <p className="copy-look-title">Copy the look of <strong>{s.name}</strong> to</p>
          <ul>
            {others.map((o) => (
              <li key={o.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} />
                  {o.name}
                </label>
              </li>
            ))}
          </ul>
          <div className="copy-look-actions">
            <button type="button" className="link small" onClick={() => setPicked(picked.length === others.length ? [] : others.map((o) => o.id))}>
              {picked.length === others.length ? "None" : "All"}
            </button>
            <button type="button" className="primary small" disabled={!picked.length} onClick={() => void go()}>
              Copy to {picked.length || ""} {picked.length === 1 ? "section" : "sections"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
