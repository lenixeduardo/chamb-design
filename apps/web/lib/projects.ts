'use client';

import {
  createDocument,
  documentStats,
  validateDocumentIntegrity,
  type DesignDocument,
} from '@opendesign/core';
import { chambThemes, chambTokens } from '@opendesign/plugin-chamb-brand';

/**
 * Local-first project storage.
 *
 * Projects live in the browser first and sync to a server only if one is
 * configured. That is not a limitation to work around later — it is the point:
 * the editor stays fully usable offline, self-hosted, or with no account at all,
 * and the API becomes an optional collaboration layer rather than a hard
 * dependency.
 */

const INDEX_KEY = 'opendesign:projects';
const DOC_PREFIX = 'opendesign:document:';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  folder?: string;
  nodeCount: number;
  pageCount: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readIndex(): ProjectSummary[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as ProjectSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(projects: ProjectSummary[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(projects));
}

export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function searchProjects(query: string): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return listProjects();
  return listProjects().filter(
    (project) =>
      project.name.toLowerCase().includes(q) || project.folder?.toLowerCase().includes(q),
  );
}

export function loadProject(id: string): DesignDocument | null {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(`${DOC_PREFIX}${id}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DesignDocument;
    // A document from storage is untrusted: it may predate a schema change or
    // have been hand-edited. Refuse to open a broken one rather than crash the
    // editor halfway through rendering it.
    const integrity = validateDocumentIntegrity(parsed);
    if (!integrity.ok) {
      console.error('[opendesign] refusing to open a corrupted document', integrity.errors);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveProject(document: DesignDocument, folder?: string): void {
  if (!isBrowser()) return;

  window.localStorage.setItem(`${DOC_PREFIX}${document.id}`, JSON.stringify(document));

  const stats = documentStats(document);
  const index = readIndex();
  const existing = index.find((project) => project.id === document.id);

  const summary: ProjectSummary = {
    id: document.id,
    name: document.name,
    createdAt: existing?.createdAt ?? document.createdAt,
    updatedAt: new Date().toISOString(),
    nodeCount: stats.nodes,
    pageCount: stats.pages,
    ...((folder ?? existing?.folder) ? { folder: folder ?? existing?.folder } : {}),
  };

  writeIndex([summary, ...index.filter((project) => project.id !== document.id)]);
}

export function deleteProject(id: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(`${DOC_PREFIX}${id}`);
  writeIndex(readIndex().filter((project) => project.id !== id));
}

/**
 * A new project starts on the chamb-design system.
 *
 * `createDocument` is deliberately generic — core ships a neutral starter so a
 * third party can build their own product on it. This app is not a third party:
 * it *is* chamb-design, so a blank project should already speak the brand
 * rather than dropping the user into indigo-on-near-black and leaving the theme
 * as homework. The tokens are semantic, so every block and every AI edit
 * inherits it without referencing a single hex value.
 */
export function createProject(name: string, folder?: string): DesignDocument {
  const base = createDocument({ name });
  const document: DesignDocument = {
    ...base,
    tokens: chambTokens(),
    themes: chambThemes(),
    activeThemeId: 'chamb-light',
  };

  saveProject(document, folder);
  return document;
}

export function duplicateProject(id: string): DesignDocument | null {
  const source = loadProject(id);
  if (!source) return null;

  const copy: DesignDocument = {
    ...structuredClone(source),
    id: `doc_${Math.random().toString(36).slice(2, 12)}`,
    name: `${source.name} copy`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveProject(copy);
  return copy;
}

export function listFolders(): string[] {
  return [
    ...new Set(
      listProjects()
        .map((p) => p.folder)
        .filter((f): f is string => Boolean(f)),
    ),
  ];
}

/**
 * Debounced autosave.
 *
 * Serializing a large document on every keystroke is wasteful, and losing work
 * because the tab closed is unacceptable — 800ms is the compromise, plus a
 * flush on `pagehide` so a closing tab never drops the last edit.
 */
export function createAutosave(delay = 800): {
  schedule: (document: DesignDocument) => void;
  flush: () => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: DesignDocument | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      saveProject(pending);
      pending = null;
    }
  };

  if (isBrowser()) window.addEventListener('pagehide', flush);

  return {
    schedule(document) {
      pending = document;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    dispose() {
      flush();
      if (isBrowser()) window.removeEventListener('pagehide', flush);
    },
  };
}
