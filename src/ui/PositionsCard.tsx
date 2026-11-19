import { DEFAULT_HOME, mirroredAim, newId, type AimPosition, type PanTilt, type Rig, type RigFixture, type WsFixture } from "../core";
import { askConfirm } from "./ConfirmDialog";
import { NumberInput } from "./controls";
import { Icon } from "./icons";

/** Places most bands point their heads; offered everywhere until made. */
export const SUGGESTED_POSITIONS = ["X over the drums", "On the lead", "On the rhythm", "On the singer", "Audience sweep", "Straight up"];

export const headsOf = (rig: Rig) => rig.fixtures.filter((f) => f.role === "mover").sort((a, b) => a.order - b.order);

/** A new position, with every head starting where it rests, so it looks like home until changed. */
export function makePosition(rig: Rig, name: string): AimPosition {
  const aims = Object.fromEntries(headsOf(rig).map((h) => [String(h.fixtureId), { ...(h.home ?? DEFAULT_HOME) }]));
  return { id: newId("pos"), name, aims };
}

/** Suggested names not used yet. */
export function unusedSuggestions(rig: Rig): string[] {
  return SUGGESTED_POSITIONS.filter((n) => !(rig.positions ?? []).some((p) => p.name.toLowerCase() === n.toLowerCase()));
}

/** Each head's pan and tilt in one position, with "Match" for heads after the first. */
export function PositionEditor({ rig, position, names, onChange }: { rig: Rig; position: AimPosition; names: (f: RigFixture) => string; onChange: (p: AimPosition) => void }) {
  const heads = headsOf(rig);
  const aimIn = (f: RigFixture): PanTilt => position.aims[String(f.fixtureId)] ?? f.home ?? DEFAULT_HOME;
  const setAim = (f: RigFixture, aim: PanTilt) => onChange({ ...position, aims: { ...position.aims, [String(f.fixtureId)]: aim } });
  const first = heads[0];
  return (
    <div className="position-heads">
      {heads.map((f, i) => {
        const aim = aimIn(f);
        return (
          <div key={f.fixtureId} className="position-head">
            <div className="position-head-name">
              <span>{names(f)}</span>
              {f.facesBack && !/rear|back/i.test(names(f)) && <small>faces the back</small>}
            </div>
            {(["pan", "tilt"] as const).map((axis) => (
              <div key={axis} className="slider-row">
                <span>{axis === "pan" ? "Pan" : "Tilt"}</span>
                <input type="range" min={0} max={255} value={aim[axis]} aria-label={`${names(f)} ${axis} in ${position.name}`} onChange={(e) => setAim(f, { ...aim, [axis]: +e.target.value })} />
                <NumberInput label={`${names(f)} ${axis} value in ${position.name}`} value={aim[axis]} min={0} max={255} onChange={(v) => setAim(f, { ...aim, [axis]: Math.round(v) })} />
              </div>
            ))}
            {i > 0 && first && (
              <button
                type="button"
                className="ghost small"
                onClick={() => setAim(f, mirroredAim(aimIn(first), !!first.facesBack, !!f.facesBack))}
                title={first.facesBack !== f.facesBack ? "These heads face opposite ways, so the same values aim them as mirror images." : "These heads face the same way, so the pan is mirrored about the middle."}
              >
                Match {names(first)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The rig's saved positions on the Stage page: rename, adjust or delete them.
 * Sections pick (and can add) positions too.
 */
export function PositionsCard({ rig, fixtures, onChange }: { rig: Rig; fixtures: Map<number, WsFixture>; onChange: (rig: Rig) => void }) {
  const heads = headsOf(rig);
  const positions = rig.positions ?? [];
  if (!heads.length) return null;
  const nameOf = (f: RigFixture) => fixtures.get(f.fixtureId)?.name ?? `Fixture ${f.fixtureId}`;
  const save = (next: AimPosition[]) => onChange({ ...rig, positions: next });
  const replace = (p: AimPosition) => save(positions.map((x) => (x.id === p.id ? p : x)));
  const remove = async (p: AimPosition) => {
    const ok = await askConfirm({
      title: `Delete "${p.name}"?`,
      message: "Sections that point the heads here will go back to each head's home position.",
      confirmLabel: "Delete position",
      danger: true,
    });
    if (ok) save(positions.filter((x) => x.id !== p.id));
  };
  const unused = unusedSuggestions(rig);

  return (
    <section className="positions-card" aria-labelledby="positions-title">
      <div className="positions-head">
        <h2 id="positions-title">Moving-head positions</h2>
        <p className="hint">
          Places for the heads to point, with each head's own pan and tilt. Pick one for each section on the Songs page, where you can also add and adjust them. Find good values in QLC+'s Simple Desk.
        </p>
      </div>

      {positions.length === 0 && <p className="hint">No positions yet.</p>}
      {positions.map((p) => (
        <div key={p.id} className="position">
          <div className="position-title">
            <input className="position-name" value={p.name} aria-label="Position name" onChange={(e) => replace({ ...p, name: e.target.value })} />
            <button type="button" className="cue-action danger" onClick={() => remove(p)} title={`Delete "${p.name}"`} aria-label={`Delete ${p.name}`}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          <PositionEditor rig={rig} position={p} names={nameOf} onChange={replace} />
        </div>
      ))}

      <div className="position-add">
        <span className="position-add-label">Add a position:</span>
        {unused.slice(0, 4).map((n) => (
          <button key={n} type="button" className="chip" onClick={() => save([...positions, makePosition(rig, n)])}>
            <Icon name="plus" size={14} /> {n}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => save([...positions, makePosition(rig, `Position ${positions.length + 1}`)])}>
          <Icon name="plus" size={14} /> Other
        </button>
      </div>
    </section>
  );
}
