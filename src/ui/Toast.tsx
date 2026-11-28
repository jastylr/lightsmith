import { useEffect, useState } from "react";
import { Icon } from "./icons";

interface ToastItem {
  id: number;
  text: string;
  undo: boolean;
}

let push: ((t: ToastItem) => void) | null = null;
let next = 1;

/**
 * A short note at the bottom of the screen after a change that's easy to miss
 * or worth taking back: a look applied, a section deleted. With `undo`, it
 * offers Undo for a few seconds.
 */
export function toast(text: string, opts: { undo?: boolean } = {}) {
  push?.({ id: next++, text, undo: opts.undo ?? true });
}

/** Where toasts show. One at a time: a new one replaces the last. */
export function ToastHost({ onUndo }: { onUndo: () => void }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  useEffect(() => {
    push = setItem;
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const t = window.setTimeout(() => setItem((cur) => (cur?.id === item.id ? null : cur)), item.undo ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [item]);
  return (
    <div className="toast-host" aria-live="polite">
      {item && (
        <div className="toast" key={item.id} role="status">
          <Icon name="check" size={16} />
          <span>{item.text}</span>
          {item.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                onUndo();
                setItem(null);
              }}
            >
              Undo
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => setItem(null)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
