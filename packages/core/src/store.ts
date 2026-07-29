import { pruneOrphans } from './document.js';
import { History, type Commit, type HistoryOptions } from './history.js';
import { createId } from './id.js';
import { applyOperations, type Operation } from './operations.js';
import type { DesignDocument } from './types.js';

/** A named, immutable point in a project's history. */
export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  document: DesignDocument;
  branchId: string;
  parentId?: string;
  message?: string;
}

export interface Branch {
  id: string;
  name: string;
  headSnapshotId: string | null;
  createdAt: string;
  forkedFromSnapshotId?: string;
}

export interface TransactionOptions {
  label: string;
  source?: Commit['source'];
  author?: string;
  /**
   * Consecutive transactions sharing a merge key collapse into one undo step —
   * pass e.g. `resize:${nodeId}` while dragging a handle.
   */
  mergeKey?: string;
  /** Skip the history stack entirely (remote collaboration echoes). */
  silent?: boolean;
}

export type StoreEvent =
  | { type: 'change'; document: DesignDocument; ops: Operation[]; commit?: Commit }
  | { type: 'undo'; document: DesignDocument; commit: Commit }
  | { type: 'redo'; document: DesignDocument; commit: Commit }
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'branch'; branch: Branch }
  | { type: 'error'; error: Error; ops: Operation[] };

export type StoreListener = (event: StoreEvent) => void;

export interface DocumentStoreOptions extends HistoryOptions {
  /** Auto-snapshot after this many commits. `0` disables it. */
  autoSnapshotEvery?: number;
}

/**
 * The single writable owner of a design document.
 *
 * The editor UI, the AI agent and remote collaborators all funnel through
 * `transact()`, so history, validation and change notification stay consistent
 * no matter who made the edit.
 */
export class DocumentStore {
  private doc: DesignDocument;
  private readonly history: History;
  private readonly listeners = new Set<StoreListener>();
  private readonly autoSnapshotEvery: number;
  private commitsSinceSnapshot = 0;

  private snapshots: Snapshot[] = [];
  private branches: Branch[];
  private currentBranchId: string;

  constructor(document: DesignDocument, options: DocumentStoreOptions = {}) {
    this.doc = document;
    this.history = new History(options);
    this.autoSnapshotEvery = options.autoSnapshotEvery ?? 25;

    const main: Branch = {
      id: createId('br'),
      name: 'main',
      headSnapshotId: null,
      createdAt: new Date().toISOString(),
    };
    this.branches = [main];
    this.currentBranchId = main.id;
  }

  /* ------------------------------ reading ------------------------------- */

  getDocument(): DesignDocument {
    return this.doc;
  }

  getHistory(): readonly Commit[] {
    return this.history.commits;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ------------------------------ writing ------------------------------- */

  /**
   * Applies a batch of operations atomically.
   *
   * If any op throws, the document is left untouched and an `error` event is
   * emitted — a half-applied AI patch is worse than a rejected one.
   */
  transact(ops: Operation[], options: TransactionOptions): Commit | null {
    if (ops.length === 0) return null;

    let result;
    try {
      result = applyOperations(this.doc, ops);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'error', error: err, ops });
      throw err;
    }

    const source = options.source ?? 'user';
    this.doc = source === 'ai' ? pruneOrphans(result.document) : result.document;

    let commit: Commit | undefined;
    if (!options.silent) {
      commit = this.history.push(
        {
          label: options.label,
          ops,
          inverse: result.inverse,
          source,
          ...(options.author ? { author: options.author } : {}),
        },
        options.mergeKey,
      );

      this.commitsSinceSnapshot += 1;
      if (this.autoSnapshotEvery > 0 && this.commitsSinceSnapshot >= this.autoSnapshotEvery) {
        this.createSnapshot(`Auto — ${new Date().toLocaleString()}`, { auto: true });
      }
    }

    this.emit({ type: 'change', document: this.doc, ops, ...(commit ? { commit } : {}) });
    return commit ?? null;
  }

  undo(): Commit | null {
    const commit = this.history.popUndo();
    if (!commit) return null;
    this.doc = applyOperations(this.doc, commit.inverse).document;
    this.emit({ type: 'undo', document: this.doc, commit });
    this.emit({ type: 'change', document: this.doc, ops: commit.inverse });
    return commit;
  }

  redo(): Commit | null {
    const commit = this.history.popRedo();
    if (!commit) return null;
    this.doc = applyOperations(this.doc, commit.ops).document;
    this.emit({ type: 'redo', document: this.doc, commit });
    this.emit({ type: 'change', document: this.doc, ops: commit.ops });
    return commit;
  }

  /** Replaces the document wholesale (project load, branch checkout, import). */
  reset(document: DesignDocument, { keepHistory = false } = {}): void {
    this.doc = document;
    if (!keepHistory) this.history.clear();
    this.emit({ type: 'change', document: this.doc, ops: [] });
  }

  /* ----------------------------- versioning ----------------------------- */

  createSnapshot(name: string, meta?: Record<string, unknown>): Snapshot {
    const branch = this.branches.find((b) => b.id === this.currentBranchId)!;
    const snapshot: Snapshot = {
      id: createId('snap'),
      name,
      createdAt: new Date().toISOString(),
      document: structuredClone(this.doc),
      branchId: branch.id,
      ...(branch.headSnapshotId ? { parentId: branch.headSnapshotId } : {}),
      ...(meta?.message ? { message: String(meta.message) } : {}),
    };

    this.snapshots.push(snapshot);
    branch.headSnapshotId = snapshot.id;
    this.commitsSinceSnapshot = 0;

    this.emit({ type: 'snapshot', snapshot });
    return snapshot;
  }

  getSnapshots(branchId?: string): readonly Snapshot[] {
    const id = branchId ?? this.currentBranchId;
    return this.snapshots.filter((s) => s.branchId === id);
  }

  restoreSnapshot(snapshotId: string): void {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) throw new Error(`[opendesign] snapshot not found: ${snapshotId}`);
    // Restoring is itself undoable: capture the current state first.
    this.createSnapshot(`Before restore of "${snapshot.name}"`);
    this.reset(structuredClone(snapshot.document), { keepHistory: false });
  }

  /* ------------------------------ branches ------------------------------ */

  getBranches(): readonly Branch[] {
    return this.branches;
  }

  getCurrentBranch(): Branch {
    return this.branches.find((b) => b.id === this.currentBranchId)!;
  }

  createBranch(name: string): Branch {
    const from = this.createSnapshot(`Fork point for "${name}"`);
    const branch: Branch = {
      id: createId('br'),
      name,
      headSnapshotId: from.id,
      createdAt: new Date().toISOString(),
      forkedFromSnapshotId: from.id,
    };
    this.branches.push(branch);
    this.emit({ type: 'branch', branch });
    return branch;
  }

  checkoutBranch(branchId: string): void {
    const branch = this.branches.find((b) => b.id === branchId);
    if (!branch) throw new Error(`[opendesign] branch not found: ${branchId}`);

    // Park current work so switching away never loses edits.
    this.createSnapshot(`Autosave before switching to "${branch.name}"`);
    this.currentBranchId = branch.id;

    if (branch.headSnapshotId) {
      const head = this.snapshots.find((s) => s.id === branch.headSnapshotId);
      if (head) this.reset(structuredClone(head.document));
    }
  }

  /* -------------------------------------------------------------------- */

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
