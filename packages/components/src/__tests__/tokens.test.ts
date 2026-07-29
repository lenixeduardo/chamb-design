import { describe, expect, it } from 'vitest';
import { defaultTokens, resolveStyle, type SceneNode, type StyleMap } from '@opendesign/core';
import { BUILTIN_COMPONENTS } from '../index.js';

/**
 * Blocks must only reference tokens that exist.
 *
 * A typo like `{spacing.7}` in a scale that stops at 6 does not throw anywhere:
 * it compiles to `var(--spacing-7)`, resolves to nothing, and the gap silently
 * disappears. Exactly that bug shipped in the navbar and was only caught by
 * looking at a screenshot — which is not a scalable review process, hence this
 * test.
 */

function resolveTokenPath(tokens: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = tokens;
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Every `{token.path}` reference reachable from a style map. */
function collectRefs(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) found.push(value.slice(1, -1));
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, found);
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) collectRefs(item, found);
  }
  return found;
}

function stylesOf(node: SceneNode): StyleMap[] {
  return [node.style, ...Object.values(node.responsive ?? {})];
}

const tokens = defaultTokens() as unknown as Record<string, unknown>;

describe.each(BUILTIN_COMPONENTS.map((c) => [c.id, c] as const))('block %s', (_id, component) => {
  let counter = 0;
  const built = component.create({
    createId: () => `t_${(counter += 1)}`,
    tokens: defaultTokens(),
  });

  it('only references tokens that exist in the default scale', () => {
    const missing: string[] = [];

    for (const node of built.nodes) {
      for (const style of stylesOf(node)) {
        for (const ref of collectRefs(style)) {
          if (resolveTokenPath(tokens, ref) === undefined) {
            missing.push(`${node.name} (${node.id}) -> {${ref}}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('produces a resolvable style at every breakpoint', () => {
    for (const node of built.nodes) {
      for (const breakpoint of ['base', 'md', 'lg', 'xl'] as const) {
        const style = resolveStyle(node, breakpoint);
        // A flex/grid container declaring a gap must resolve it, or the layout
        // collapses in a way that is invisible until someone looks at it.
        if ((style.display === 'flex' || style.display === 'grid') && style.gap !== undefined) {
          const gap = style.gap;
          if (typeof gap === 'string' && gap.startsWith('{')) {
            expect(resolveTokenPath(tokens, gap.slice(1, -1))).toBeDefined();
          }
        }
      }
    }
  });
});
