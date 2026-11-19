import { useState } from "react";
import { applyLook, LOOK_KEYS, lookOf, moodById, newId, sectionTypeById, type LookPreset, type Section } from "../core";
import { askConfirm } from "./ConfirmDialog";
import { Dropdown } from "./controls";
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
export function PresetBar({ s, presets, onSection, onPresets }: { s: Section; presets: LookPreset[]; onSection: (p: Partial<Section>) => void; onPresets: (next: LookPreset[]) => void }) {
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
