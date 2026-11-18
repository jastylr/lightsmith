/**
 * Undo and redo for any immutable state (here, the project).
 *
 * Each change records the state from just before it. Changes that come in a
 * quick burst (dragging a section edge, typing a title) are merged into one
 * step: a new step starts only after `mergeMs` without changes. The oldest
 * steps are dropped past `limit`.
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastChange = -Infinity;

  constructor(
    private readonly limit = 50,
    private readonly mergeMs = 1000,
  ) {}

  /** Call before applying a change, with the state it replaces. */
  record(before: T, now = Date.now()): void {
    if (now - this.lastChange > this.mergeMs) {
      this.past.push(before);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.lastChange = now;
    this.future = [];
  }

  /** The state to go back to, or undefined if there's nothing to undo. */
  undo(current: T): T | undefined {
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(current);
    this.lastChange = -Infinity;
    return prev;
  }

  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current);
    this.lastChange = -Infinity;
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get steps(): number {
    return this.past.length;
  }
}
