import {
  applyOperations,
  createDocument,
  createNode,
  createId as defaultCreateId,
  type ComponentContribution,
  type DesignDocument,
  type Operation,
  type SceneNode,
  type ThemeDef,
  type TokenSet,
} from '@opendesign/core';
import type { ImageryMode } from '@opendesign/components';
import {
  missingBlocks,
  toLookup,
  type ComponentLookup,
  type TemplateBlueprint,
} from './blueprint.js';
import { resolveTemplate } from './match.js';

/** A subtree built elsewhere — by 21st.dev, by the agent, by a paste. */
export interface SubtreeInput {
  nodes: SceneNode[];
  rootId: string;
}

export interface BuildTemplateOptions {
  /** Where blocks come from: `registry.getComponents()` or a lookup function. */
  components: ComponentContribution[] | ComponentLookup;
  createId?: (prefix?: string) => string;
  /** Project name; defaults to the blueprint name. */
  name?: string;
  tokens?: TokenSet;
  themes?: ThemeDef[];
  activeThemeId?: string;
  /**
   * Replaces the blueprint's hero section.
   *
   * This is the seam the 21st.dev integration writes into: everything else
   * about the page is decided locally and deterministically, and only the
   * above-the-fold section comes from outside.
   */
  hero?: SubtreeInput;
  /**
   * What to do about a block no plugin contributed. `skip` keeps the rest of
   * the page — the right default in an app where plugins come and go.
   */
  onMissingBlock?: 'skip' | 'throw';
  /**
   * Where the imagery in the page comes from. Defaults to `stock`.
   *
   * A template is judged in the two seconds after it opens, and a page whose
   * every picture is an abstract gradient reads as a wireframe someone forgot
   * to fill in — so a template built for a person gets photographs.
   *
   * `placeholder` keeps the old behaviour, and it is not a legacy setting:
   * the committed examples build with it so they render with no network, and
   * so does anything that has to stay a single portable file.
   */
  imagery?: ImageryMode;
}

export interface BuildTemplateResult {
  document: DesignDocument;
  blueprint: TemplateBlueprint;
  /** Blocks that were asked for and not found, in blueprint order. */
  skipped: string[];
  /** True when `options.hero` actually replaced the blueprint's hero. */
  heroReplaced: boolean;
}

/**
 * Builds a full document from a blueprint.
 *
 * The result is a document rather than a page because that is what a template
 * *is* here: tokens, themes and page meta included. Opening one rethemes the
 * whole project, so blocks from the neutral library immediately look like they
 * belong together.
 */
export function buildTemplate(
  blueprint: TemplateBlueprint,
  options: BuildTemplateOptions,
): BuildTemplateResult {
  const lookup = toLookup(options.components);
  const createId = options.createId ?? defaultCreateId;
  const imagery = options.imagery ?? 'stock';

  if (options.onMissingBlock === 'throw') {
    const missing = missingBlocks(blueprint, lookup);
    if (missing.length > 0) {
      throw new Error(
        `[opendesign:templates] "${blueprint.id}" needs blocks that are not registered: ${missing.join(', ')}`,
      );
    }
  }

  const base = createDocument({ name: options.name ?? blueprint.name, pageName: 'Home' });

  const document: DesignDocument = {
    ...base,
    ...(options.tokens ? { tokens: options.tokens } : {}),
    ...(options.themes ? { themes: options.themes } : {}),
    ...(options.activeThemeId ? { activeThemeId: options.activeThemeId } : {}),
    pages: base.pages.map((page) => ({ ...page, meta: { ...blueprint.meta } })),
  };

  const rootId = document.pages[0]!.rootId;
  const skipped: string[] = [];
  let heroReplaced = false;

  const aside: SubtreeInput[] = [];
  const stacked: SubtreeInput[] = [];

  for (const section of blueprint.sections) {
    let built: SubtreeInput | null = null;

    if (section.hero && options.hero) {
      built = options.hero;
      heroReplaced = true;
    } else {
      const block = lookup(section.block);
      if (!block) {
        skipped.push(section.block);
        continue;
      }

      // The imagery mode rides in as a prop rather than as a `create` option:
      // it is the block that owns the decision, and a blueprint that wants a
      // particular section drawn rather than photographed can still say so.
      built = block.create({
        createId,
        tokens: document.tokens,
        props: { imagery, ...section.props },
      });
    }

    if (section.slot === 'aside') {
      aside.push(built);
      continue;
    }

    stacked.push(section.wrap ? wrapInSection(built, createId) : built);
  }

  const operations: Operation[] =
    aside.length > 0
      ? [shellOperation(aside, stacked, createId, rootId)]
      : stacked.map((subtree, index) => ({
          type: 'insertSubtree',
          nodes: subtree.nodes,
          rootId: subtree.rootId,
          parentId: rootId,
          index,
        }));

  return {
    document: applyOperations(document, operations).document,
    blueprint,
    skipped,
    heroReplaced,
  };
}

/**
 * Puts a widget-sized block on the page as a section.
 *
 * Nothing about the block changes — it keeps its own max width and centres
 * inside the wrapper, which is what a section does for it.
 */
function wrapInSection(subtree: SubtreeInput, createId: (prefix?: string) => string): SubtreeInput {
  const wrapper = createNode({
    id: createId(),
    type: 'frame',
    name: 'Section',
    style: {
      display: 'flex',
      direction: 'column',
      align: 'center',
      width: 'fill',
      padding: {
        top: '{spacing.16}',
        bottom: '{spacing.16}',
        left: '{spacing.6}',
        right: '{spacing.6}',
      },
      background: '{color.background}',
    },
  });

  wrapper.children = [subtree.rootId];
  wrapper.responsive = {
    md: {
      padding: {
        top: '{spacing.20}',
        bottom: '{spacing.20}',
        left: '{spacing.10}',
        right: '{spacing.10}',
      },
    },
  };

  return { rootId: wrapper.id, nodes: [wrapper, ...reparent(subtree, wrapper.id)] };
}

/**
 * The app-shell layout: an aside beside a scrolling content column.
 *
 * Built as a single subtree rather than a series of appends, because the
 * sections are no longer siblings of the page root — the row and the content
 * column sit between them, and `insertSubtree` wants the whole tree at once.
 */
function shellOperation(
  aside: SubtreeInput[],
  stacked: SubtreeInput[],
  createId: (prefix?: string) => string,
  parentId: string,
): Operation {
  const row = createNode({
    id: createId(),
    type: 'frame',
    name: 'App shell',
    style: { display: 'flex', direction: 'row', width: 'fill', minHeight: '100vh' },
  });

  const content = createNode({
    id: createId(),
    type: 'frame',
    name: 'Content',
    style: {
      display: 'flex',
      direction: 'column',
      width: 'fill',
      gap: '{spacing.6}',
      padding: {
        top: '{spacing.6}',
        bottom: '{spacing.6}',
        left: '{spacing.6}',
        right: '{spacing.6}',
      },
      background: '{color.background}',
      overflow: 'auto',
    },
  });

  row.children = [...aside.map((subtree) => subtree.rootId), content.id];
  content.parent = row.id;
  content.children = stacked.map((subtree) => subtree.rootId);

  return {
    type: 'insertSubtree',
    // Parents before children: the row, then each aside with its descendants,
    // then the content column, then the sections it holds.
    nodes: [
      row,
      ...aside.flatMap((subtree) => reparent(subtree, row.id)),
      content,
      ...stacked.flatMap((subtree) => reparent(subtree, content.id)),
    ],
    rootId: row.id,
    parentId,
    index: 0,
  };
}

/** Points a subtree's root at its new parent, leaving the rest untouched. */
function reparent(subtree: SubtreeInput, parentId: string): SceneNode[] {
  return subtree.nodes.map((node) =>
    node.id === subtree.rootId ? { ...node, parent: parentId } : node,
  );
}

/** Request in, document out — the whole flow in one call. */
export function buildTemplateFromRequest(
  request: string,
  options: BuildTemplateOptions,
): BuildTemplateResult {
  return buildTemplate(resolveTemplate(request), options);
}
