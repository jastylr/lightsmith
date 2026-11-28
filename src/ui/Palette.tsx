import { useEffect, useMemo, useRef, useState } from "react";
import { isBlackout, moodById } from "../core";
import { sendCommand } from "./commands";
import { Icon, type IconName } from "./icons";

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  /** Extra words it can be found by. */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

/** Every word typed must appear somewhere in the item; the label counts most. */
function matches(item: PaletteItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const all = `${label} ${item.hint ?? ""} ${item.group} ${item.keywords ?? ""}`.toLowerCase();
  const words = q.split(/\s+/);
  if (!words.every((w) => all.includes(w))) return 0;
  return label.startsWith(q) ? 3 : words.every((w) => label.includes(w)) ? 2 : 1;
}

/**
 * The command palette (Cmd/Ctrl+K): type to find any step, song, section or
 * action, arrow to it, Enter to run it.
 */
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    input.current?.focus();
  }, []);
  const shown = useMemo(
    () =>
      items
        .map((it, i) => ({ it, score: matches(it, query), i }))
        .filter((x) => x.score > 0)
        .sort((a, b) => (query ? b.score - a.score : 0) || a.i - b.i)
        .map((x) => x.it)
        .slice(0, 60),
    [items, query],
  );
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const run = (it: PaletteItem | undefined) => {
    if (!it) return;
    ref.current?.close();
    // After the palette has closed, so a dialog it opens gets the focus.
    window.setTimeout(it.run, 0);
  };
  let lastGroup = "";
  return (
    <dialog ref={ref} className="palette" aria-label="Command palette" onClose={onClose} onClick={(e) => e.target === e.currentTarget && ref.current?.close()}>
      <div className="palette-box">
        <div className="palette-search">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={query}
            placeholder="Go to a song or section, or do something…"
            aria-label="Search commands"
            aria-controls="palette-list"
            aria-activedescendant={shown[active] ? `palette-${shown[active]!.id}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[active]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" ref={list} aria-label="Commands">
          {shown.length === 0 && <li className="palette-empty">Nothing matches "{query}".</li>}
          {shown.map((it, i) => {
            const heading = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {heading && <div className="palette-group">{heading}</div>}
                <div role="option" id={`palette-${it.id}`} data-i={i} aria-selected={i === active} className={i === active ? "palette-item on" : "palette-item"} onPointerMove={() => setActive(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} size={16} />
                  <span className="palette-label">
                    {it.label}
                    {it.hint && <small>{it.hint}</small>}
                  </span>
                  {it.shortcut && <kbd>{it.shortcut}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to choose
          </span>
          <span>
            <kbd>?</kbd> for every shortcut
          </span>
        </footer>
      </div>
    </dialog>
  );
}

/** The keyboard shortcuts, in one sheet (press ?). */
export function ShortcutsSheet({ mod, onClose }: { mod: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Anywhere",
      rows: [
        [`${mod}K`, "Command palette: find a song, section or action"],
        ["?", "This list of shortcuts"],
        [`${mod}Z`, "Undo"],
        [mod === "⌘" ? "⇧⌘Z" : "Ctrl+Y", "Redo"],
        [`${mod}\\`, "Fold or unfold the sidebar"],
      ],
    },
    {
      title: "Songs: playing",
      rows: [
        ["Space", "Play or pause the song"],
        ["Return", "Back to the start"],
        ["← →", "Previous or next section"],
      ],
    },
    {
      title: "Songs: the timeline",
      rows: [
        ["Delete", "Delete the selected section"],
        ["Alt + ← →", "Move the selected section earlier or later"],
        ["Shift + ← →", "Make the selected section shorter or longer"],
        ["↑ ↓ on an energy dot", "Raise or lower that section's energy"],
        [`${mod} + scroll, or pinch`, "Zoom the timeline"],
      ],
    },
    {
      title: "Song Builder",
      rows: [["M", "Mark a new section while the recording plays"]],
    },
  ];
  return (
    <dialog ref={ref} className="shortcuts" aria-labelledby="shortcuts-title" onClose={onClose} onClick={(e) => e.target === e.currentTarget && ref.current?.close()}>
      <div className="shortcuts-box">
        <header className="variations-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="shortcuts-grid">
          {groups.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}

/** The sections of every song as palette items (the current song's first). */
export function sectionItems(songs: { id: string; title: string; sections: { id: string; name: string; mood: string; type: string; bars: number }[] }[], currentSongId: string, go: (songId: string, sectionId: string) => void): PaletteItem[] {
  const ordered = [...songs].sort((a, b) => Number(b.id === currentSongId) - Number(a.id === currentSongId));
  return ordered.flatMap((song) =>
    song.sections.map((s) => ({
      id: `sec-${s.id}`,
      group: "Sections",
      label: s.name,
      hint: `${song.title || "Untitled song"}, ${isBlackout(s as never) ? "blackout" : moodById(s.mood).label.toLowerCase()}`,
      icon: "stack" as IconName,
      keywords: `${s.type} section`,
      run: () => go(song.id, s.id),
    })),
  );
}

export { sendCommand };
