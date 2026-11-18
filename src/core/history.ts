/**
 * Undo and redo for any immutable state (here, the project).
 *
 * Each change records the state from just before it. Changes that come in a
 * quick burst (dragging a section edge, typing a title) are merged into one
 * step: a new step starts only after `mergeMs` without changes. The oldest
 * steps are dropped past `limit`.
 *
 * A gesture (begin() … end(), such as a mouse drag) is always exactly one
 * step, however long it takes: the state at the start is recorded once.
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastChange = -Infinity;
  private holding = false;
  private heldStep = false;

  constructor(
    private readonly limit = 50,
    private readonly mergeMs = 1000,
  ) {}

  /** Call before applying a change, with the state it replaces. */
  record(before: T, now = Date.now()): void {
    if (this.holding) {
      if (!this.heldStep) this.push(before);
      this.heldStep = true;
      this.future = [];
      return;
    }
    if (now - this.lastChange > this.mergeMs) {
      this.push(before);
    }
    this.lastChange = now;
    this.future = [];
  }

  /** Start a gesture: everything until end() is one step. */
  begin(): void {
    this.holding = true;
    this.heldStep = false;
  }

  /** End a gesture; the next change starts a new step. */
  end(): void {
    this.holding = false;
    this.lastChange = -Infinity;
  }

  private push(state: T): void {
    this.past.push(state);
    if (this.past.length > this.limit) this.past.shift();
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
