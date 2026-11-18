import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Drag-to-reorder for a list or a horizontal strip, with no dependencies.
 * Items swap live as the pointer passes their middle. Alt + arrow keys move
 * the focused item for keyboard users.
 *
 * Pointer moves are tracked on the window rather than with pointer capture,
 * because reordering moves the dragged element in the DOM, which would drop
 * the capture after the first swap.
 */
export function useSortable(keys: string[], onMove: (from: number, to: number) => void, axis: "x" | "y" = "y") {
  const els = useRef(new Map<string, HTMLElement>());
  const [dragging, setDragging] = useState<string | null>(null);
  const latest = useRef({ keys, onMove });
  latest.current = { keys, onMove };
  const justDragged = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const itemRef = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };

  const begin = (key: string, x0: number, y0: number) => {
    let moved = false;
    let lastKeys: string[] | null = null;
    const move = (e: globalThis.PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
      if (!moved) {
        moved = true;
        setDragging(key);
        document.body.classList.add("is-dragging");
      }
      const { keys: ks, onMove: mv } = latest.current;
      // Wait for the previous swap to render before computing the next one.
      if (ks === lastKeys) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const from = ks.indexOf(key);
      // The new index is the number of other items whose middle the pointer has passed.
      const to = ks.filter((k) => {
        if (k === key) return false;
        const r = els.current.get(k)?.getBoundingClientRect();
        return !!r && pos > (axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2);
      }).length;
      if (from >= 0 && to !== from) {
        lastKeys = ks;
        mv(from, to);
      }
    };
    const end = () => {
      if (moved) {
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
      }
      setDragging(null);
      document.body.classList.remove("is-dragging");
      stop();
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      cleanup.current = null;
    };
    cleanup.current?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    cleanup.current = stop;
  };

  const handle = (key: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      begin(key, e.clientX, e.clientY);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!e.altKey || e.shiftKey) return;
      const from = keys.indexOf(key);
      const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const fwd = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (e.key === back && from > 0) {
        e.preventDefault();
        onMove(from, from - 1);
      } else if (e.key === fwd && from < keys.length - 1) {
        e.preventDefault();
        onMove(from, from + 1);
      }
    },
  });

  /** True right after a drag ends, so the drop doesn't also count as a click. */
  const wasDrag = () => justDragged.current;

  return { dragging, itemRef, handle, wasDrag };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
