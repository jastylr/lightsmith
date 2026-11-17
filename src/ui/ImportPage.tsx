import { useRef, useState } from "react";
import { fixtureKey } from "../core";
import { Icon } from "./icons";
import type { Store } from "./store";

export function ImportPage({ store, onNext }: { store: Store; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { fixtures, defs, missing, workspace } = store;
  const problems = new Map(missing.map((m) => [m.fixture.id, m.reason]));
  const ready = fixtures.length > 0 && missing.length < fixtures.length;
  const added = [...defs.entries()].filter(([, d]) => d.source === "added");

  return (
    <section className="page">
      <header className="page-head">
        <h1>{workspace ? "Your show file" : "Start with your QLC+ show"}</h1>
        <p className="lead">
          Patch your fixtures in QLC+ as usual, save the workspace, and drop the <code>.qxw</code> file here. Lightsmith adds songs to a copy of it;
          your original is never changed.
        </p>
      </header>

      <div
        className={over ? "dropzone over" : workspace ? "dropzone compact" : "dropzone"}
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
        <Icon name="upload" size={workspace ? 20 : 30} />
        <strong>{workspace ? "Drop another file, or click to choose" : "Drop your show file here, or click to choose"}</strong>
        <span>Workspaces (.qxw), fixture definitions (.qxf) and saved Lightsmith projects (.json)</span>
        <input ref={input} type="file" accept=".qxw,.qxf,.json" multiple hidden onChange={(e) => e.target.files && void store.addFiles(e.target.files)} />
      </div>

      {store.workspaceError && (
        <div className="notice error">
          <Icon name="alert" />
          <span>That workspace couldn't be read: {store.workspaceError}</span>
        </div>
      )}

      {workspace && fixtures.length > 0 && (
        <>
          <div className="section-head">
            <h2>{workspace.name}</h2>
            <span className="hint">
              {fixtures.length - missing.length} of {fixtures.length} fixtures ready
              {store.libraryStatus === "loading" ? ", checking the QLC+ library…" : ""}
            </span>
          </div>
          <ul className="fixture-list">
            {fixtures.map((f) => {
              const d = defs.get(fixtureKey(f.manufacturer, f.model));
              const problem = problems.get(f.id);
              return (
                <li key={f.id} className={problem ? "bad" : "good"}>
                  <span className="status-dot" aria-hidden="true">
                    <Icon name={problem ? "alert" : "check"} size={15} />
                  </span>
                  <span className="fx-name">
                    <strong>{f.name}</strong>
                    <small>
                      {f.manufacturer} {f.model}, {f.mode}
                    </small>
                  </span>
                  <span className="fx-addr">
                    U{f.universe + 1}
                    <b>{f.address + 1}</b>
                  </span>
                  <span className="fx-source">{problem ?? (d?.source === "library" ? "From the QLC+ library" : "Added by you")}</span>
                </li>
              );
            })}
          </ul>

          {missing.length > 0 && (
            <div className="notice warn">
              <Icon name="info" />
              <span>
                <strong>
                  {missing.length} {missing.length === 1 ? "fixture needs its" : "fixtures need their"} definition file.
                </strong>{" "}
                They aren't in the QLC+ library, usually because the definition was made by hand. Drop the <code>.qxf</code> files above. QLC+ keeps
                hand-made definitions in its user fixtures folder; on a Mac that's <code>~/Library/Application Support/QLC+/Fixtures</code> (in Finder,
                press Shift-Command-G and paste the path).
              </span>
            </div>
          )}
        </>
      )}

      {added.length > 0 && (
        <details className="disclosure">
          <summary>Definitions you've added ({added.length})</summary>
          <ul className="plain-list">
            {added.map(([k, d]) => (
              <li key={k}>
                {d.def.manufacturer} {d.def.model}
                <button className="link small" onClick={() => store.removeDef(k)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="page-actions">
        <button className="primary" disabled={!ready} onClick={onNext}>
          Continue to stage
        </button>
      </div>
    </section>
  );
}
