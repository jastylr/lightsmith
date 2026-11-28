import { useEffect, useRef } from "react";

/**
 * A small message bus between the parts of the page that don't hold each
 * other: the command palette (in the app shell) asks the Songs page to pick a
 * section or open a dialog; the Songs page asks the timeline to flash the
 * sections a change touched.
 */
export type Command =
  | { type: "select-section"; id: string }
  | { type: "open-builder" }
  | { type: "open-library" }
  | { type: "open-variations" }
  | { type: "flash"; ids: string[] };

const EVENT = "lightsmith:command";

export function sendCommand(c: Command) {
  window.dispatchEvent(new CustomEvent<Command>(EVENT, { detail: c }));
}

/** Runs `handler` for every command sent while the component is mounted. */
export function useCommands(handler: (c: Command) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e: Event) => latest.current((e as CustomEvent<Command>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}

/** The ids of the sections that differ between two versions of a song's sections (new ones included). */
export function changedSections(before: { id: string }[], after: { id: string }[]): string[] {
  const was = new Map(before.map((s) => [s.id, JSON.stringify(s)]));
  return after.filter((s) => was.get(s.id) !== JSON.stringify(s)).map((s) => s.id);
}
