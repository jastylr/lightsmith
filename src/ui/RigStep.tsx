import { APP_NAME } from "../config";
import type { Rig, RigFixture, Role, Side } from "../core";
import type { Store } from "./store";

const ROLES: { id: Role; label: string; help: string }[] = [
  { id: "backdrop", label: "Backdrop", help: "Bars or washes behind the band; sets the mood" },
  { id: "side", label: "Side / floor", help: "Aimed at the players from the sides or floor" },
  { id: "mover", label: "Moving head", help: "Lights that pan and tilt" },
  { id: "front", label: "Front light", help: "Lights the band from the audience side" },
  { id: "ignore", label: "Not used", help: "Leave this fixture alone" },
];
const SIDES: { id: Side; label: string }[] = [
  { id: "SL", label: "Stage left" },
  { id: "C", label: "Center" },
  { id: "SR", label: "Stage right" },
];

export function RigStep({ store, onNext }: { store: Store; onNext: () => void }) {
  const rig = store.project.rig;
  const byId = new Map(store.fixtures.map((f) => [f.id, f]));
  const update = (id: number, patch: Partial<RigFixture>) =>
    store.setRig({ fixtures: rig.fixtures.map((f) => (f.fixtureId === id ? { ...f, ...patch, userSet: true } : f)) });

  const move = (rf: RigFixture, dir: -1 | 1) => {
    const peers = rig.fixtures.filter((f) => f.role === rf.role).sort((a, b) => a.order - b.order);
    const i = peers.findIndex((p) => p.fixtureId === rf.fixtureId);
    const j = i + dir;
    if (j < 0 || j >= peers.length) return;
    const reordered = [...peers];
    [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
    const order = new Map(reordered.map((p, k) => [p.fixtureId, k]));
    store.setRig({ fixtures: rig.fixtures.map((f) => (order.has(f.fixtureId) ? { ...f, order: order.get(f.fixtureId)!, userSet: true } : f)) });
  };

  const sorted = [...rig.fixtures].sort(
    (a, b) => ROLES.findIndex((r) => r.id === a.role) - ROLES.findIndex((r) => r.id === b.role) || a.order - b.order,
  );

  return (
    <section className="panel">
      <h1>Set up your stage</h1>
      <p className="lead">
        Tell {APP_NAME} what each light does. We've made a first guess. <strong>Stage left and right</strong> are from
        the performers' point of view, facing the audience.
      </p>

      <div className="rig-layout">
        <table className="grid">
          <thead>
            <tr>
              <th>Fixture</th>
              <th>Job</th>
              <th>Where</th>
              <th>Order</th>
              <th>Moving heads</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((rf) => {
              const f = byId.get(rf.fixtureId);
              const p = store.profiles.get(rf.fixtureId);
              if (!f) return null;
              return (
                <tr key={rf.fixtureId} className={rf.role === "ignore" ? "dim" : ""}>
                  <td>
                    {f.name}
                    <div className="muted small">
                      {f.manufacturer} {f.model}
                      {!p && " · no definition"}
                    </div>
                  </td>
                  <td>
                    <select value={rf.role} onChange={(e) => update(rf.fixtureId, { role: e.target.value as Role, home: e.target.value === "mover" ? rf.home ?? { pan: 128, tilt: 128 } : rf.home })}>
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id} disabled={r.id === "mover" && !p?.isMover}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <div className="muted small">{ROLES.find((r) => r.id === rf.role)?.help}</div>
                  </td>
                  <td>
                    <select value={rf.side} onChange={(e) => update(rf.fixtureId, { side: e.target.value as Side })} disabled={rf.role === "ignore"}>
                      {SIDES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="nowrap">
                    <button className="icon" aria-label="Move earlier" onClick={() => move(rf, -1)}>
                      ↑
                    </button>
                    <button className="icon" aria-label="Move later" onClick={() => move(rf, 1)}>
                      ↓
                    </button>
                  </td>
                  <td>
                    {rf.role === "mover" && (
                      <div className="mover">
                        <label>
                          Home pan
                          <input type="number" min={0} max={255} value={rf.home?.pan ?? 128} onChange={(e) => update(rf.fixtureId, { home: { pan: clamp(+e.target.value), tilt: rf.home?.tilt ?? 128 } })} />
                        </label>
                        <label>
                          tilt
                          <input type="number" min={0} max={255} value={rf.home?.tilt ?? 128} onChange={(e) => update(rf.fixtureId, { home: { tilt: clamp(+e.target.value), pan: rf.home?.pan ?? 128 } })} />
                        </label>
                        <label className="check">
                          <input type="checkbox" checked={!!rf.reverse} onChange={(e) => update(rf.fixtureId, { reverse: e.target.checked })} />
                          Reverse movement
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <StageMap rig={rig} names={new Map(store.fixtures.map((f) => [f.id, f.name]))} />
      </div>

      <details className="help">
        <summary>Tips for moving heads</summary>
        <p>
          <strong>Home pan/tilt</strong> is where the head points when it's still, and the centre of every movement. Find
          a good value in QLC+'s Simple Desk and type it here. <strong>Reverse movement</strong> is handy when two heads face
          opposite directions and you want them to mirror each other.
        </p>
      </details>

      <div className="actions">
        <button className="primary" onClick={onNext}>
          Next: build a song →
        </button>
      </div>
    </section>
  );
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0)));

/** A top-down sketch of the stage, seen from the audience. */
function StageMap({ rig, names }: { rig: Rig; names: Map<number, string> }) {
  const W = 360,
    H = 260;
  // Seen from the audience, stage left is on the right.
  const xFor = (side: Side, i: number, n: number, spread: number) => {
    if (n <= 1 || spread === 0) return side === "SL" ? W - 70 : side === "SR" ? 70 : W / 2;
    return 50 + (spread * i) / (n - 1);
  };
  const role = (r: Role) => rig.fixtures.filter((f) => f.role === r).sort((a, b) => a.order - b.order);
  const nodes: { id: number; x: number; y: number; kind: Role }[] = [];
  const back = role("backdrop");
  // Order is stage left first, which is the right-hand side from the audience.
  back.forEach((f, i) => nodes.push({ id: f.fixtureId, x: W - xFor("C", i, back.length, W - 100), y: 62, kind: "backdrop" }));
  for (const r of ["mover", "side", "front"] as Role[]) {
    const y = r === "mover" ? 110 : r === "side" ? 165 : 220;
    const list = role(r);
    const bySide = { SL: list.filter((f) => f.side === "SL"), C: list.filter((f) => f.side === "C"), SR: list.filter((f) => f.side === "SR") };
    (Object.keys(bySide) as Side[]).forEach((s) =>
      bySide[s].forEach((f, i) => {
        const base = s === "SL" ? W - 60 : s === "SR" ? 60 : W / 2;
        const dx = (i - (bySide[s].length - 1) / 2) * 34 * (s === "SL" ? -1 : 1);
        nodes.push({ id: f.fixtureId, x: base + dx, y, kind: r });
      }),
    );
  }
  const color: Record<Role, string> = { backdrop: "#7c5cff", side: "#00b3a4", mover: "#ff9f1c", front: "#e6e6e6", ignore: "#555" };
  return (
    <figure className="stagemap">
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label="Stage layout seen from the audience">
        <rect x="10" y="10" width={W - 20} height={H - 20} rx="10" className="stage" />
        <text x="20" y="28" className="lbl">
          Stage right
        </text>
        <text x={W - 20} y="28" textAnchor="end" className="lbl">
          Stage left
        </text>
        {nodes.map((n) => (
          <g key={n.id}>
            {n.kind === "mover" ? (
              <circle cx={n.x} cy={n.y} r="10" fill={color[n.kind]} />
            ) : n.kind === "backdrop" ? (
              <rect x={n.x - 5} y={n.y - 16} width="10" height="32" rx="3" fill={color[n.kind]} />
            ) : (
              <rect x={n.x - 10} y={n.y - 7} width="20" height="14" rx="3" fill={color[n.kind]} />
            )}
            <title>{names.get(n.id)}</title>
          </g>
        ))}
        <text x={W / 2} y={H + 12} textAnchor="middle" className="lbl">
          Audience
        </text>
      </svg>
      <figcaption className="muted small">Seen from the audience. Hover a light for its name.</figcaption>
    </figure>
  );
}
