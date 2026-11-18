import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

const KEY = "lightsmith.previewWindow.v1";
const RATIO = 250 / 640; // the stage preview's height / width
const HEAD = 38;

interface Box {
  x: number;
  y: number;
  w: number;
}

function initial(): Box {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Box | null;
    if (saved && saved.w > 0) return clamp(saved);
  } catch {
    /* ignore */
  }
  const w = Math.min(640, window.innerWidth - 48);
  return clamp({ w, x: window.innerWidth - w - 24, y: window.innerHeight - w * RATIO - HEAD - 24 });
}

function clamp(b: Box): Box {
  const w = Math.max(320, Math.min(b.w, window.innerWidth - 24));
  const h = w * RATIO + HEAD;
  return { w, x: Math.max(8, Math.min(b.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(b.y, window.innerHeight - h - 8)) };
}

/**
 * The stage preview in a floating window that stays on screen while you
 * scroll through a section's settings. Drag its title bar to move it and its
 * corner to resize it; its place and size are remembered.
 */
export function PreviewWindow({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [box, setBox] = useState<Box>(initial);
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(box));
    } catch {
      /* ignore */
    }
  }, [box]);
  useEffect(() => {
    const onResize = () => setBox((b) => clamp(b));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const drag = (e: ReactPointerEvent, mode: "move" | "size") => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...boxRef.current };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      setBox(clamp(mode === "move" ? { ...start, x: start.x + dx, y: start.y + dy } : { ...start, w: start.w + dx }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove(mode === "move" ? "is-dragging" : "is-resizing");
    };
    document.body.classList.add(mode === "move" ? "is-dragging" : "is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return createPortal(
    <div className="preview-window" style={{ left: box.x, top: box.y, width: box.w }} role="dialog" aria-label={`Stage preview: ${title}`}>
      <div className="preview-window-head" onPointerDown={(e) => drag(e, "move")}>
        <Icon name="stage" size={15} />
        <span>{title}</span>
        <button type="button" className="preview-window-close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="Put the preview back in the page" aria-label="Put the preview back in the page">
          <Icon name="dock" size={15} />
        </button>
      </div>
      <div className="preview-window-body">{children}</div>
      <span className="preview-window-resize" onPointerDown={(e) => drag(e, "size")} title="Drag to resize" aria-hidden="true" />
    </div>,
    document.body,
  );
}
