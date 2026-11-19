import { mirroredAim, newId, type AimPosition, type PanTilt, type Rig, type RigFixture, type WsFixture } from "../core";
import { askConfirm } from "./ConfirmDialog";
import { NumberInput } from "./controls";
import { Icon } from "./icons";

/** Names most bands reach for first; offered until they're used. */
const SUGGESTED = ["X over the drums", "On the lead", "On the rhythm", "On the singer", "Audience sweep", "Straight up"];

/**
 * Named places for the moving heads to point, set once for the rig and picked
 * in any section. Each head has its own pan and tilt in each position.
 */
export function PositionsCard({ rig, fixtures, onChange }: { rig: Rig; fixtures: Map<number, WsFixture>; onChange: (rig: Rig) => void }) {
  const heads = rig.fixtures.filter((f) => f.role === "mover").sort((a, b) => a.order - b.order);
  const positions = rig.positions ?? [];
  if (!heads.length) return null;
  const nameOf = (f: RigFixture) => fixtures.get(f.fixtureId)?.name ?? `Fixture ${f.fixtureId}`;
  const save = (next: AimPosition[]) => onChange({ ...rig, positions: next });
  const patch = (id: string, p: Partial<AimPosition>) => save(positions.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = (name: string) => {
    // Start every head where it rests, so a new position looks like home until changed.
    const aims = Object.fromEntries(heads.map((h) => [String(h.fixtureId), { ...(h.home ?? { pan: 128, tilt: 128 }) }]));
    save([...positions, { id: newId("pos"), name, aims }]);
  };
  const remove = async (p: AimPosition) => {
    const ok = await askConfirm({
      title: `Delete "${p.name}"?`,
      message: "Sections that point the heads here will go back to each head's home position.",
      confirmLabel: "Delete position",
      danger: true,
    });
    if (ok) save(positions.filter((x) => x.id !== p.id));
  };
  const setAim = (p: AimPosition, f: RigFixture, aim: PanTilt) => patch(p.id, { aims: { ...p.aims, [String(f.fixtureId)]: aim } });
  const aimIn = (p: AimPosition, f: RigFixture): PanTilt => p.aims[String(f.fixtureId)] ?? f.home ?? { pan: 128, tilt: 128 };
  const unused = SUGGESTED.filter((n) => !positions.some((p) => p.name.toLowerCase() === n.toLowerCase()));

  return (
    <section className="positions-card" aria-labelledby="positions-title">
      <div className="positions-head">
        <h2 id="positions-title">Where the moving heads point</h2>
        <p className="hint">
          Name a few places once, then pick one in any section; movements run around it. Find each head's values in QLC+'s Simple Desk.
          {heads.length > 1 && " \"Match\" fills in a head from the first one, allowing for which way each faces."}
        </p>
      </div>

      {positions.map((p) => (
        <div key={p.id} className="position">
          <div className="position-title">
            <input className="position-name" value={p.name} aria-label="Position name" onChange={(e) => patch(p.id, { name: e.target.value })} />
            <button type="button" className="cue-action danger" onClick={() => remove(p)} title={`Delete "${p.name}"`} aria-label={`Delete ${p.name}`}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div className="position-heads">
            {heads.map((f, i) => {
              const aim = aimIn(p, f);
              const first = heads[0]!;
              return (
                <div key={f.fixtureId} className="position-head">
                  <div className="position-head-name">
                    <span>{nameOf(f)}</span>
                    {f.facesBack && <small>faces the back</small>}
                  </div>
                  {(["pan", "tilt"] as const).map((axis) => (
                    <div key={axis} className="slider-row">
                      <span>{axis === "pan" ? "Pan" : "Tilt"}</span>
                      <input type="range" min={0} max={255} value={aim[axis]} aria-label={`${nameOf(f)} ${axis} in ${p.name}`} onChange={(e) => setAim(p, f, { ...aim, [axis]: +e.target.value })} />
                      <NumberInput label={`${nameOf(f)} ${axis} value in ${p.name}`} value={aim[axis]} min={0} max={255} onChange={(v) => setAim(p, f, { ...aim, [axis]: Math.round(v) })} />
                    </div>
                  ))}
                  {i > 0 && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setAim(p, f, mirroredAim(aimIn(p, first), !!first.facesBack, !!f.facesBack))}
                      title={first.facesBack !== f.facesBack ? "These heads face opposite ways, so the same values aim them as mirror images." : "These heads face the same way, so the pan is mirrored about the middle."}
                    >
                      Match {nameOf(first)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="position-add">
        {unused.slice(0, 4).map((n) => (
          <button key={n} type="button" className="chip" onClick={() => add(n)}>
            <Icon name="plus" size={14} /> {n}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => add(`Position ${positions.length + 1}`)}>
          <Icon name="plus" size={14} /> New position
        </button>
      </div>
    </section>
  );
}
