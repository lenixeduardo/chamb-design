import {
  getNode,
  resolveStyle,
  type DesignDocument,
  type NodeId,
  type SceneNode,
  type StyleMap,
} from '@opendesign/core';

/**
 * Document serialization for prompts.
 *
 * Sending raw document JSON is the obvious approach and the wrong one: a
 * medium landing page is 60k+ tokens of mostly-noise, and models lose the plot
 * inside it. This module emits a compact outline that keeps exactly what the
 * model needs to make an edit — node ids, hierarchy, the handful of style
 * properties that carry design intent — and drops the rest.
 *
 * Roughly 20x smaller than the JSON, and materially more accurate in practice
 * because every line is signal.
 */

export interface ContextOptions {
  /** Stop descending past this depth. */
  maxDepth?: number;
  /** Cap on the number of children listed per node. */
  maxChildren?: number;
  /** Hard cap on emitted lines; the outline is truncated with a marker. */
  maxLines?: number;
  /** Include full style detail for these ids (typically the user's selection). */
  focusIds?: NodeId[];
}

const STYLE_KEYS_SUMMARY: (keyof StyleMap)[] = [
  'display',
  'direction',
  'justify',
  'align',
  'gap',
  'width',
  'height',
  'background',
  'color',
  'radius',
];

function formatStyle(style: StyleMap, full: boolean): string {
  const entries: string[] = [];
  const keys = full ? (Object.keys(style) as (keyof StyleMap)[]) : STYLE_KEYS_SUMMARY;

  for (const key of keys) {
    const value = style[key];
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null) {
      const inner = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join(',');
      if (inner) entries.push(`${key}={${inner}}`);
      continue;
    }

    entries.push(`${key}=${String(value)}`);
  }

  return entries.length > 0 ? ` [${entries.join(' ')}]` : '';
}

function summarizeNode(node: SceneNode, full: boolean): string {
  const parts = [node.id, node.type, JSON.stringify(node.name)];

  const text = node.props.text;
  if (typeof text === 'string' && text.length > 0) {
    parts.push(JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}…` : text));
  }

  const src = node.props.src;
  if (typeof src === 'string' && src.length > 0) parts.push(`src=${JSON.stringify(src)}`);

  let line = parts.join(' ') + formatStyle(node.style, full);

  const breakpoints = Object.keys(node.responsive ?? {});
  if (breakpoints.length > 0) line += ` responsive=[${breakpoints.join(',')}]`;
  if (node.motion) line += ` motion=${node.motion.trigger}/${node.motion.engine}`;
  if (node.hidden) line += ' hidden';
  if (node.locked) line += ' locked';

  return line;
}

/** Renders a page as an indented outline of node ids. */
export function serializeTree(
  document: DesignDocument,
  rootId: NodeId,
  options: ContextOptions = {},
): string {
  const { maxDepth = 12, maxChildren = 40, maxLines = 400, focusIds = [] } = options;
  const focus = new Set(focusIds);
  const lines: string[] = [];
  let truncated = false;

  const visit = (nodeId: NodeId, depth: number) => {
    if (lines.length >= maxLines) {
      truncated = true;
      return;
    }

    const node = getNode(document, nodeId);
    if (!node) return;

    lines.push(`${'  '.repeat(depth)}${summarizeNode(node, focus.has(node.id))}`);

    if (depth >= maxDepth) {
      if (node.children.length > 0) {
        lines.push(`${'  '.repeat(depth + 1)}… ${node.children.length} descendant(s) omitted`);
      }
      return;
    }

    const shown = node.children.slice(0, maxChildren);
    for (const childId of shown) visit(childId, depth + 1);

    if (node.children.length > shown.length) {
      lines.push(
        `${'  '.repeat(depth + 1)}… ${node.children.length - shown.length} more sibling(s) omitted`,
      );
    }
  };

  visit(rootId, 0);
  if (truncated) lines.push('… outline truncated; ask for a specific subtree if you need more');

  return lines.join('\n');
}

export interface DocumentContext {
  text: string;
  /** Rough token estimate, for budgeting against a model's context window. */
  estimatedTokens: number;
}

/**
 * Builds the full context block handed to the model: tokens available, pages,
 * the current page outline, and the selection expanded in full detail.
 */
export function buildDocumentContext(
  document: DesignDocument,
  options: { pageId?: string; selection?: NodeId[]; contextOptions?: ContextOptions } = {},
): DocumentContext {
  const page = document.pages.find((p) => p.id === options.pageId) ?? document.pages[0];

  const sections: string[] = [];

  sections.push(`PROJECT: ${document.name}`);
  sections.push(
    `PAGES: ${document.pages
      .map(
        (p) =>
          `${p.id} ${JSON.stringify(p.name)} path=${p.path}${p.id === page?.id ? ' (current)' : ''}`,
      )
      .join('\n       ')}`,
  );

  sections.push(
    `THEME: ${document.activeThemeId} (available: ${document.themes.map((t) => t.id).join(', ')})`,
  );
  sections.push(`DESIGN TOKENS:\n${summarizeTokens(document)}`);

  if (document.assets.length > 0) {
    sections.push(
      `ASSETS:\n${document.assets
        .slice(0, 30)
        .map((a) => `  ${a.id} ${a.kind} ${JSON.stringify(a.name)} url=${a.url}`)
        .join('\n')}`,
    );
  }

  if (document.components.length > 0) {
    sections.push(
      `PROJECT COMPONENTS:\n${document.components
        .map((c) => `  ${c.id} ${JSON.stringify(c.name)} root=${c.rootId}`)
        .join('\n')}`,
    );
  }

  if (page) {
    sections.push(
      `CURRENT PAGE OUTLINE (${page.name}):\n${serializeTree(document, page.rootId, {
        ...options.contextOptions,
        ...(options.selection ? { focusIds: options.selection } : {}),
      })}`,
    );
  }

  if (options.selection && options.selection.length > 0) {
    const details = options.selection
      .map((id) => {
        const node = getNode(document, id);
        if (!node) return `  ${id} (not found)`;
        return [
          `  ${summarizeNode(node, true)}`,
          `    props: ${JSON.stringify(node.props)}`,
          `    resolved@lg: ${JSON.stringify(resolveStyle(node, 'lg'))}`,
        ].join('\n');
      })
      .join('\n');
    sections.push(`CURRENT SELECTION:\n${details}`);
  }

  const text = sections.join('\n\n');
  return { text, estimatedTokens: estimateTokens(text) };
}

function summarizeTokens(document: DesignDocument): string {
  const lines: string[] = [];

  for (const [namespace, group] of Object.entries(document.tokens)) {
    if (namespace === 'breakpoint') continue;
    const names = collectTokenPaths(group as Record<string, unknown>, namespace);
    if (names.length === 0) continue;
    lines.push(`  ${namespace}: ${names.slice(0, 40).join(', ')}`);
  }

  return lines.join('\n');
}

function collectTokenPaths(group: Record<string, unknown>, prefix: string): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(group)) {
    const path = `${prefix}.${key}`;
    if (typeof value === 'object' && value !== null) {
      out.push(...collectTokenPaths(value as Record<string, unknown>, path));
    } else {
      out.push(`{${path}}`);
    }
  }
  return out;
}

/**
 * Cheap token estimate.
 *
 * Deliberately not a real tokenizer: we only need it to decide how aggressively
 * to truncate an outline, and pulling in a 2 MB BPE table for that would be a
 * bad trade. ~3.6 chars per token is close enough across the models we target.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}
