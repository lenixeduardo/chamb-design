import { createId } from './id.js';
import type { Operation } from './operations.js';

/**
 * A commit is one user-visible step: "moved 3 layers", "AI: generated hero".
 * Undo restores the whole commit, never half of it.
 */
export interface Commit {
  id: string;
  label: string;
  ops: Operation[];
  /** Ops that undo `ops`, already in undo order. */
  inverse: Operation[];
  timestamp: string;
  author?: string;
  /** `ai` commits render differently in the timeline and can be diffed. */
  source: 'user' | 'ai' | 'plugin' | 'import' | 'system';
}

export interface HistoryState {
  undo: Commit[];
  redo: Commit[];
}

export interface HistoryOptions {
  /** How many commits to retain before dropping the oldest. */
  limit?: number;
  /**
   * Consecutive commits with the same `mergeKey` inside this window are
   * coalesced — dragging a slider produces one undo step, not two hundred.
   */
  mergeWindowMs?: number;
}

export class History {
  private undoStack: Commit[] = [];
  private redoStack: Commit[] = [];
  private lastMergeKey: string | null = null;
  private lastCommitAt = 0;

  private readonly limit: number;
  private readonly mergeWindowMs: number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
    this.mergeWindowMs = options.mergeWindowMs ?? 400;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Newest first — this is what the timeline panel renders. */
  get commits(): readonly Commit[] {
    return [...this.undoStack].reverse();
  }

  push(commit: Omit<Commit, 'id' | 'timestamp'>, mergeKey?: string): Commit {
    const now = Date.now();
    const previous = this.undoStack[this.undoStack.length - 1];

    const mergeable =
      previous !== undefined &&
      mergeKey !== undefined &&
      mergeKey === this.lastMergeKey &&
      now - this.lastCommitAt < this.mergeWindowMs;

    if (mergeable && previous) {
      // Keep the *oldest* inverse so a single undo rewinds the whole gesture.
      const merged: Commit = {
        ...previous,
        ops: [...previous.ops, ...commit.ops],
        inverse: [...commit.inverse, ...previous.inverse],
        timestamp: new Date(now).toISOString(),
      };
      this.undoStack[this.undoStack.length - 1] = merged;
      this.lastCommitAt = now;
      this.redoStack = [];
      return merged;
    }

    const full: Commit = { ...commit, id: createId('c'), timestamp: new Date(now).toISOString() };
    this.undoStack.push(full);
    if (this.undoStack.length > this.limit) this.undoStack.shift();

    this.redoStack = [];
    this.lastMergeKey = mergeKey ?? null;
    this.lastCommitAt = now;
    return full;
  }

  popUndo(): Commit | undefined {
    const commit = this.undoStack.pop();
    if (commit) {
      this.redoStack.push(commit);
      this.lastMergeKey = null;
    }
    return commit;
  }

  popRedo(): Commit | undefined {
    const commit = this.redoStack.pop();
    if (commit) {
      this.undoStack.push(commit);
      this.lastMergeKey = null;
    }
    return commit;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastMergeKey = null;
  }

  toJSON(): HistoryState {
    return { undo: [...this.undoStack], redo: [...this.redoStack] };
  }

  static fromJSON(state: HistoryState, options?: HistoryOptions): History {
    const history = new History(options);
    history.undoStack = [...state.undo];
    history.redoStack = [...state.redo];
    return history;
  }
}
