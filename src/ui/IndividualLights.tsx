import { useState, type CSSProperties } from "react";
import { COLORS, lightLevels, lightSetting, moodById, patternById, sectionTypeById, type ColorJob, type LightSetting, type Rig, type Section } from "../core";
import { cssColor } from "./ColorPicker";
import { Toggle } from "./controls";
import { Icon } from "./icons";
import { MiniStage, ROLE_LABEL, type Light } from "./LightPicker";

/** Which settings a group of selected lights share: the value, or "mixed". */
function shared<T>(values: T[]): T | "mixed" | undefined {
  if (!values.length) return undefined;
  return values.every((v) => v === values[0]) ? values[0] : "mixed";
}

const JOB_OF: Record<string, ColorJob> = { backdrop: "backdrop", side: "side", mover: "mover", front: "front" };

/**
 * "Individual lights": give particular lights their own color or brightness,
 * or switch them off, for this section. Everything else keeps following the
 * mood, energy and the settings for each kind of light.
 */
export function IndividualLights({
  s,
  rig,
  lights,
  palette,
  onChange,
  onCopy,
  gesture,
}: {
  s: Section;
  rig: Rig;
  lights: Light[];
  /** The section's colors, as color IDs or "#hex". */
  palette: string[];
  onChange: (p: Partial<Section>) => void;
  /** Copy this section's individual light settings to other sections. */
  onCopy: (scope: "type" | "song") => void;
  gesture: { begin: () => void; end: () => void };
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<Light | null>(null);
  const [moreColors, setMoreColors] = useState(false);
  const own = (id: number) => lightSetting(s, id);
  const sel = lights.filter((l) => selected.has(l.id));
  const ownCount = lights.filter((l) => own(l.id)).length;

  /** Change (or with `null`, clear) settings for the selected lights. */
  const update = (patch: Partial<LightSetting> | null, ids = [...selected]) => {
    const next: Record<string, LightSetting> = { ...(s.lights ?? {}) };
    for (const id of ids) {
      const key = String(id);
      const merged: LightSetting = patch === null ? {} : { ...next[key], ...patch };
      for (const k of Object.keys(merged) as (keyof LightSetting)[]) if (merged[k] === undefined || merged[k] === false) delete merged[k];
      if (merged.color === undefined && merged.level === undefined && !merged.off) delete next[key];
      else next[key] = merged;
    }
    onChange({ lights: next });
  };

  const toggleLight = (l: Light, add: boolean) => {
    setSelected((cur) => {
      if (!add) return cur.size === 1 && cur.has(l.id) ? new Set() : new Set([l.id]);
      const next = new Set(cur);
      if (next.has(l.id)) next.delete(l.id);
      else next.add(l.id);
      return next;
    });
  };

  // Dots on the mini stage for lights with their own settings.
  const marks = new Map<number, string>();
  for (const l of lights) {
    const o = own(l.id);
    if (!o) continue;
    marks.set(l.id, o.off ? "off" : o.color ? cssColor(o.color) : "set");
  }

  const auto = lightLevels(s);
  const colorNow = shared(sel.map((l) => own(l.id)?.color));
  const levelNow = shared(sel.map((l) => own(l.id)?.level));
  const offNow = shared(sel.map((l) => !!own(l.id)?.off));
  const keepNow = shared(sel.map((l) => !!own(l.id)?.keepPattern));
  // The automatic brightness, for the slider's starting point (of the first selected light's kind).
  const autoLevel = sel[0] ? auto[JOB_OF[sel[0].role] ?? "side"].level : 0.5;
  const pct = Math.round((levelNow === "mixed" || levelNow === undefined ? autoLevel : levelNow) * 100);
  // "Keep in pattern" only matters for lights the pattern would normally run on.
  const pattern = patternById(s.pattern === "mood" ? moodById(s.mood).pattern : s.pattern);
  const patternIds = new Set(s.patternTargets ?? rig.fixtures.filter((f) => f.role === "backdrop").map((f) => f.fixtureId));
  const showKeep = !!pattern.algorithm && sel.some((l) => patternIds.has(l.id) && own(l.id)?.color);
  const quickColors = [...new Set([...palette, "warmWhite"])];

  return (
    <div className="individual">
      <div className="individual-stage">
        <MiniStage lights={lights} set={selected} usable={() => true} onToggle={toggleLight} onHover={setHover} marks={marks} />
        <p className="mini-stage-status">
          {hover ? (
            <>
              {hover.name}
              {own(hover.id) ? " · has its own settings" : ""}
            </>
          ) : sel.length ? (
            "Shift-click to select more lights."
          ) : (
            "Click a light to give it its own settings. Shift-click to select several."
          )}
        </p>
        <div className="select-all individual-quick">
          <span>Select</span>
          <div>
            {(["backdrop", "mover", "side", "front"] as const)
              .filter((r) => lights.some((l) => l.role === r))
              .map((r) => (
                <button key={r} type="button" className="group-toggle" onClick={() => setSelected(new Set(lights.filter((l) => l.role === r).map((l) => l.id)))}>
                  All {ROLE_LABEL[r].toLowerCase()}
                </button>
              ))}
            {sel.length > 0 && (
              <button type="button" className="link small" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            )}
          </div>
        </div>
      </div>

      {sel.length === 0 ? (
        <div className="individual-empty">
          <Icon name="stage" size={18} />
          <span>
            {ownCount
              ? `${ownCount} ${ownCount === 1 ? "light has" : "lights have"} their own settings (marked with a dot). Select a light to change it.`
              : "Every light follows the mood and the settings above. Select a light to change it."}
          </span>
        </div>
      ) : (
        <div className="individual-panel">
          <div className="individual-head">
            <strong>{sel.length === 1 ? sel[0]!.name : `${sel.length} lights selected`}</strong>
            {sel.some((l) => own(l.id)) && (
              <button type="button" className="link small" onClick={() => update(null)}>
                Reset to automatic
              </button>
            )}
          </div>

          <div className="individual-row">
            <span className="layout-job">Color</span>
            <div className="individual-colors" role="radiogroup" aria-label="Color for the selected lights">
              <button type="button" role="radio" aria-checked={colorNow === undefined} className={colorNow === undefined ? "lo lo-auto on" : "lo lo-auto"} onClick={() => update({ color: undefined, keepPattern: undefined })} title="Follow the mood and the color settings above">
                Auto
              </button>
              {quickColors.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={colorNow === c} className={colorNow === c ? "lo on" : "lo"} onClick={() => update({ color: c })} title={c === "warmWhite" ? "Warm white" : c.startsWith("#") ? c : (COLORS.find((x) => x.id === c)?.label ?? c)}>
                  <i style={{ background: cssColor(c) }} />
                </button>
              ))}
              <button type="button" className={moreColors ? "lo lo-more on" : "lo lo-more"} onClick={() => setMoreColors((m) => !m)} aria-expanded={moreColors}>
                More…
              </button>
            </div>
          </div>
          {moreColors && (
            <div className="individual-more">
              <div className="individual-gels">
                {COLORS.map((c) => (
                  <button key={c.id} type="button" className={colorNow === c.id ? "gel-dot on" : "gel-dot"} onClick={() => update({ color: c.id })} title={c.label} aria-label={c.label}>
                    <i style={{ background: cssColor(c.id) }} />
                  </button>
                ))}
              </div>
              <label className="individual-custom">
                <input type="color" value={typeof colorNow === "string" && colorNow.startsWith("#") ? colorNow : "#ff8800"} onChange={(e) => update({ color: e.target.value })} />
                Custom color
              </label>
            </div>
          )}

          <div className="individual-row bright-row">
            <span className="layout-job">Brightness</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              style={{ "--pct": `${pct}%` } as CSSProperties}
              aria-label="Brightness for the selected lights"
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) => update({ level: Number(e.target.value) / 100 })}
            />
            <span className="bright-value">{levelNow === "mixed" ? "Mixed" : `${pct}%`}</span>
            {levelNow === undefined ? (
              <span className="bright-auto" title="Set by the mood, energy and the Brightness sliders above">
                Auto
              </span>
            ) : (
              <button type="button" className="link small bright-reset" onClick={() => update({ level: undefined })}>
                Reset
              </button>
            )}
          </div>

          <div className="individual-toggles">
            <Toggle checked={offNow === true} onChange={(off) => update({ off })} label="Off for this section" hint={offNow === "mixed" ? "Some selected lights are off" : "Dark, and left out of the pattern and effects"} />
            {showKeep && <Toggle checked={keepNow === true} onChange={(keepPattern) => update({ keepPattern })} label="Keep in pattern" hint="Normally a light with its own color sits the pattern out" />}
          </div>
        </div>
      )}

      {ownCount > 0 && (
        <div className="individual-foot">
          <span>
            {ownCount} {ownCount === 1 ? "light has" : "lights have"} their own settings in this section.
          </span>
          <div>
            <button type="button" className="ghost small" onClick={() => onCopy("type")} title="Copy these settings to every section of this type">
              <Icon name="copy" size={14} /> Copy to all {sectionTypeById(s.type).label} sections
            </button>
            <button type="button" className="ghost small" onClick={() => onCopy("song")} title="Copy these settings to every section in this song">
              <Icon name="copy" size={14} /> Copy to every section
            </button>
            <button type="button" className="link small danger" onClick={() => onChange({ lights: {} })}>
              Reset all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
