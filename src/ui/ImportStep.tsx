import { useRef, useState } from "react";
import { fixtureKey } from "../core";
import type { Store } from "./store";

export function ImportStep({ store, onNext }: { store: Store; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { fixtures, defs, missing, workspace } = store;
  const missingIds = new Map(missing.map((m) => [m.fixture.id, m.reason]));
  const ready = fixtures.length > 0 && missing.length < fixtures.length;

  return (
    <section className="panel">
      <h1>Load your QLC+ show file</h1>
      <p className="lead">
        Patch your fixtures in QLC+ as usual (addresses, universes and modes), save the workspace, then drop the{" "}
        <code>.qxw</code> file here. Your files stay in this browser.
      </p>

      <div
        className={over ? "drop over" : "drop"}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void store.addFiles(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <strong>Drop files here or click to choose</strong>
        <span>A workspace (.qxw), fixture definitions (.qxf), or a saved Lightsmith project (.json)</span>
        <input
          ref={input}
          type="file"
          accept=".qxw,.qxf,.json"
          multiple
          hidden
          onChange={(e) => e.target.files && void store.addFiles(e.target.files)}
        />
      </div>

      {store.workspaceError && <div className="banner error">That workspace couldn't be read: {store.workspaceError}</div>}

      {workspace && fixtures.length > 0 && (
        <>
          <h2>
            {workspace.name} <span className="muted">· {fixtures.length} fixtures</span>
          </h2>
          <table className="grid">
            <thead>
              <tr>
                <th>Fixture</th>
                <th>Make and model</th>
                <th>Mode</th>
                <th>Address</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f) => {
                const key = fixtureKey(f.manufacturer, f.model);
                const d = defs.get(key);
                const problem = missingIds.get(f.id);
                return (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>
                      {f.manufacturer} {f.model}
                    </td>
                    <td>{f.mode}</td>
                    <td>
                      U{f.universe + 1} · {f.address + 1}
                    </td>
                    <td>
                      {problem ? (
                        <span className="bad">✗ {problem}</span>
                      ) : d ? (
                        <span className="good">✓ {d.source === "library" ? "QLC+ library" : "Added by you"}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {store.libraryStatus === "loading" && <p className="muted">Looking up fixtures in the QLC+ library…</p>}
          {missing.length > 0 && (
            <div className="banner warn">
              <strong>{missing.length} fixture(s) need their definition file.</strong> These aren't in the QLC+ library,
              usually because you made the definition yourself. Drop their <code>.qxf</code> files above. QLC+ keeps
              custom definitions in its user fixtures folder (on macOS: <code>~/Library/Application Support/QLC+/Fixtures</code>
              ; press ⇧⌘G in Finder and paste that path).
            </div>
          )}
        </>
      )}

      {[...defs.values()].some((d) => d.source === "added") && (
        <details className="added">
          <summary>Definitions you've added</summary>
          <ul>
            {[...defs.entries()]
              .filter(([, d]) => d.source === "added")
              .map(([k, d]) => (
                <li key={k}>
                  {d.def.manufacturer} {d.def.model}{" "}
                  <button className="link" onClick={() => store.removeDef(k)}>
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      <div className="actions">
        <button className="primary" disabled={!ready} onClick={onNext}>
          Next: set up the stage →
        </button>
      </div>
    </section>
  );
}
