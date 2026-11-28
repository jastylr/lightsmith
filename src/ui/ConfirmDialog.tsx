import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  /** The confirm button's label, such as "Delete section". */
  confirmLabel: string;
  /** The cancel button's label, when it does more than cancel (default "Cancel"). */
  cancelLabel?: string;
  danger?: boolean;
  /** A third button that does something without closing the dialog, such as saving a copy first. */
  extra?: { label: string; doneLabel?: string; icon?: IconName; run: () => void };
}

type Open = (req: ConfirmRequest & { resolve: (ok: boolean) => void }) => void;
let openDialog: Open | null = null;

/**
 * Ask the user to confirm something in Lightsmith's own dialog. Resolves to
 * true if they confirm. Falls back to the browser's confirm() if the dialog
 * isn't on the page.
 */
export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (openDialog) openDialog({ ...req, resolve });
    else resolve(window.confirm(`${req.title}\n\n${typeof req.message === "string" ? req.message : ""}`));
  });
}

/** Renders the confirmation dialog; put it once near the top of the app. */
export function ConfirmHost() {
  const [req, setReq] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openDialog = (r) => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setReq(r);
    };
    return () => {
      openDialog = null;
    };
  }, []);

  useEffect(() => {
    if (req) confirmBtn.current?.focus();
  }, [req]);

  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
    returnFocus.current?.focus?.();
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            close(false);
          } else if (e.key === "Tab") {
            // Keep focus on the dialog's buttons.
            e.preventDefault();
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(".dialog-actions button")];
            const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
          }
        }}
      >
        <div className={req.danger ? "dialog-icon danger" : "dialog-icon"}>
          <Icon name={req.danger ? "trash" : "alert"} size={20} />
        </div>
        <div className="dialog-body">
          <h2 id="confirm-title">{req.title}</h2>
          <div id="confirm-message" className="dialog-message">
            {req.message}
          </div>
          <div className="dialog-actions">
            {req.extra && <ExtraButton extra={req.extra} />}
            <button ref={cancelBtn} type="button" className="ghost" onClick={() => close(false)}>
              {req.cancelLabel ?? "Cancel"}
            </button>
            <button ref={confirmBtn} type="button" className={req.danger ? "danger-solid" : "primary"} onClick={() => close(true)}>
              {req.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The dialog's third button: runs, then says it's done, and the dialog stays open. */
function ExtraButton({ extra }: { extra: NonNullable<ConfirmRequest["extra"]> }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost dialog-extra"
      onClick={() => {
        extra.run();
        setDone(true);
      }}
    >
      <Icon name={done ? "check" : (extra.icon ?? "download")} size={15} /> {done ? (extra.doneLabel ?? "Done") : extra.label}
    </button>
  );
}
