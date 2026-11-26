import { askConfirm } from "./ConfirmDialog";
import { download, emptyProject, type Store } from "./store";

/** Is there anything in this browser that starting a new project would lose? */
export function hasWork(store: Store): boolean {
  if (store.workspace || store.project.rig.fixtures.length) return true;
  // Compared without ids, which every new song and section gets afresh.
  const plain = (v: unknown) => JSON.stringify(v, (k, x: unknown) => (k === "id" ? undefined : x));
  return plain(store.project.songs) !== plain(emptyProject().songs);
}

/**
 * Start a new, empty project. With work in the browser it asks first, and offers to
 * save a project file before anything is cleared. Resolves to whether it went ahead.
 */
export async function startNewProject(store: Store): Promise<boolean> {
  if (hasWork(store)) {
    const ok = await askConfirm({
      title: "Start a new project?",
      message: "Your show file, stage, songs and show control will be cleared from this browser, ready for a new show. Undo can't bring them back, so save a project file first if you want to keep this one.",
      confirmLabel: "Start new project",
      danger: true,
      extra: {
        label: "Save project file",
        doneLabel: "Saved",
        run: () => {
          const f = store.projectFile();
          download(f.name, f.text, "application/json");
        },
      },
    });
    if (!ok) return false;
  }
  store.resetAll();
  return true;
}
