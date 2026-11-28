import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fixtureKey, type FixtureProfile, type Rig, type Role } from "../core";
import { Icon, type IconName } from "./icons";
import type { Store } from "./store";

// No "accept" filter on the file picker: macOS doesn't know the .lightsmith
// extension (or, on some Macs, .qxw and .qxf), so a filter greys those files out
// in Finder. Any file can be chosen; one of the wrong kind gets a clear message.

/** Anything files can be dropped on (or clicked, to choose them). */
function DropTarget({ store, className, children, label }: { store: Store; className: string; children: (open: () => void) => ReactNode; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const open = () => input.current?.click();
  return (
    <div
      className={over ? `${className} over` : className}
      aria-label={label}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void store.addFiles(e.dataTransfer.files);
      }}
    >
      {children(open)}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void store.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const JOURNEY: { icon: IconName; title: string; text: string }[] = [
  { icon: "stage", title: "Your stage", text: "Lightsmith reads your QLC+ show: every light, where it hangs and what it can do." },
  { icon: "music", title: "Your songs", text: "Lay out each song's sections and give each one a look, or let the Song Builder do it." },
  { icon: "midi", title: "Your cues", text: "Pads, footswitches or a modeler move the show along, section by section." },
  { icon: "download", title: "Back to QLC+", text: "Export a copy of your show with every song built in, ready to run." },
];

/** The first page: what Lightsmith does, and the place to drop a show (or a saved project). */
export function Welcome({ store, onDemo }: { store: Store; onDemo: () => void }) {
  const [opening, setOpening] = useState(false);
  const tryDemo = async () => {
    setOpening(true);
    const ok = await store.openDemo();
    setOpening(false);
    if (ok) onDemo();
  };
  return (
    <section className="page welcome">
      <header className="welcome-hero">
        <h1>Light the songs, not the fixtures.</h1>
        <p className="lead">
          Lightsmith builds a QLC+ light show from your songs: the looks, the changes and the cues. Start with the show file you already have; your
          original is never changed.
        </p>
      </header>

      <DropTarget store={store} className="welcome-drop" label="Drop a QLC+ show file or a Lightsmith project">
        {(open) => (
          <button type="button" className="welcome-drop-inner" onClick={open}>
            <span className="welcome-drop-icon" aria-hidden="true">
              <Icon name="upload" size={28} />
            </span>
            <strong>Drop your QLC+ show here, or click to choose it</strong>
            <span>
              Patch your lights in QLC+, save the workspace and bring the <code>.qxw</code> file. A Lightsmith project (<code>.lightsmith</code>) opens
              from here too, and so do fixture definitions (<code>.qxf</code>).
            </span>
          </button>
        )}
      </DropTarget>

      <div className="welcome-demo">
        <span className="welcome-demo-icon" aria-hidden="true">
          <Icon name="play" size={18} />
        </span>
        <p>
          <strong>No show file handy?</strong> Try the demo: a typical small band rig (LED bars, floor washes, front lights and two moving heads) with
          three songs ready to play. Bring your own show whenever you like.
        </p>
        <button type="button" className="welcome-demo-btn" onClick={() => void tryDemo()} disabled={opening}>
          {opening ? "Opening…" : "Try the demo"}
        </button>
      </div>

      {store.workspaceError && (
        <div className="notice error">
          <Icon name="alert" />
          <span>That file couldn't be read: {store.workspaceError}</span>
        </div>
      )}

      <ol className="journey" aria-label="How it works">
        {JOURNEY.map((j, i) => (
          <li key={j.title}>
            <span className="journey-icon" aria-hidden="true">
              <Icon name={j.icon} size={20} />
            </span>
            <span className="journey-step">Step {i + 1}</span>
            <strong>{j.title}</strong>
            <p>{j.text}</p>
          </li>
        ))}
      </ol>
      <p className="welcome-foot">Free and open source. Everything stays in this browser; nothing is uploaded.</p>
    </section>
  );
}

/**
 * The show file, once it's loaded: its name and how many lights are ready,
 * a way to replace it or add definitions, and any problem up front.
 */
export function ShowFileBar({ store }: { store: Store }) {
  const { fixtures, missing, workspace, defs } = store;
  const added = [...defs.entries()].filter(([, d]) => d.source === "added");
  const ready = fixtures.length - missing.length;
  return (
    <DropTarget store={store} className="showfile-bar" label="Your show file. Drop files here to replace it or add definitions.">
      {(open) => (
        <>
          <div className="showfile-main">
            <span className={missing.length ? "showfile-icon warn" : "showfile-icon"} aria-hidden="true">
              <Icon name={missing.length ? "alert" : "file"} size={18} />
            </span>
            <div className="showfile-text">
              <strong>{workspace?.name ?? "Show file"}</strong>
              <span>
                {ready} of {fixtures.length} lights ready
                {store.libraryStatus === "loading" ? ", checking the QLC+ library…" : ""}
                {added.length ? `, ${added.length} ${added.length === 1 ? "definition" : "definitions"} added by you` : ""}
              </span>
            </div>
            <div className="showfile-actions">
              {added.length > 0 && (
                <details className="showfile-defs">
                  <summary>Your definitions</summary>
                  <ul>
                    {added.map(([k, d]) => (
                      <li key={k}>
                        <span>
                          {d.def.manufacturer} {d.def.model}
                        </span>
                        <button type="button" className="link small" onClick={() => store.removeDef(k)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button type="button" className="ghost small" onClick={open} title="Choose a new .qxw show file, a fixture definition (.qxf) or a Lightsmith project; or drop one on this bar">
                <Icon name="upload" size={14} /> Replace or add files
              </button>
            </div>
          </div>
          {store.project.demo && (
            <div className="showfile-demo">
              <Icon name="info" size={16} />
              <p>
                <strong>You're trying the demo rig.</strong> Play with anything; nothing here touches a real light. When you're ready for your own band, drop
                your QLC+ show file on this bar: your songs stay, and Lightsmith works out your lights.
              </p>
            </div>
          )}
          {missing.length > 0 && (
            <div className="showfile-warn" role="alert">
              <p>
                <strong>
                  {missing.length} {missing.length === 1 ? "light needs its" : "lights need their"} fixture definition
                </strong>{" "}
                ({missing.map((m) => m.fixture.name).join(", ")}). It isn't in the QLC+ library, usually because the definition was made by hand. QLC+ keeps
                those in its user fixtures folder; on a Mac that's <code>~/Library/Application Support/QLC+/Fixtures</code> (in Finder, press Shift-Command-G
                and paste the path).
              </p>
              <button type="button" className="primary small" onClick={open}>
                Add definition files
              </button>
            </div>
          )}
          {store.workspaceError && (
            <div className="notice error">
              <Icon name="alert" />
              <span>That file couldn't be read: {store.workspaceError}</span>
            </div>
          )}
        </>
      )}
    </DropTarget>
  );
}

const ROLE_ORDER: Role[] = ["backdrop", "mover", "side", "front", "ignore"];

/**
 * Every light in the show, grouped by its job: what the show file says about
 * it (model, mode, DMX address) and whether it's ready. Click one to pick it.
 */
export function LightsList({ store, rig, roleInfo, selected, onSelect }: { store: Store; rig: Rig; roleInfo: Record<Role, { label: string; color: string; icon: IconName }>; selected: number | null; onSelect: (id: number) => void }) {
  const problems = new Map(store.missing.map((m) => [m.fixture.id, m.reason]));
  const byId = new Map(store.fixtures.map((f) => [f.id, f]));
  const profileOf = (id: number): FixtureProfile | undefined => store.profiles.get(id);
  return (
    <div className="lights-list">
      <div className="lights-list-head">
        <h2>Your lights</h2>
        <span className="hint">Click one to see and change it, or click it on the stage.</span>
      </div>
      {ROLE_ORDER.map((role) => {
        const items = rig.fixtures.filter((f) => f.role === role);
        if (!items.length) return null;
        const info = roleInfo[role];
        return (
          <section key={role} className="lights-group" style={{ "--job": info.color } as CSSProperties}>
            <h3>
              <i aria-hidden="true" />
              {role === "ignore" ? "Not in use" : info.label}
              <span>{items.length}</span>
            </h3>
            <ul>
              {items.map((f) => {
                const fx = byId.get(f.fixtureId);
                const problem = problems.get(f.fixtureId);
                const def = fx ? store.defs.get(fixtureKey(fx.manufacturer, fx.model)) : undefined;
                return (
                  <li key={f.fixtureId}>
                    <button type="button" className={selected === f.fixtureId ? "light-row on" : "light-row"} onClick={() => onSelect(f.fixtureId)} title={problem ?? (def?.source === "library" ? "Definition from the QLC+ library" : "Definition added by you")}>
                      <span className="light-row-text">
                        <strong>{fx?.name ?? `Fixture ${f.fixtureId}`}</strong>
                        <small>{fx ? `${fx.model}, ${fx.mode}` : ""}</small>
                      </span>
                      <span className="light-row-addr">
                        U{(fx?.universe ?? 0) + 1}
                        <b>{(fx?.address ?? 0) + 1}</b>
                      </span>
                      {problem || !profileOf(f.fixtureId) ? <Icon name="alert" size={14} className="light-row-bad" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
