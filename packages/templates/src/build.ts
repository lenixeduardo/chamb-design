import {
  applyOperations,
  createDocument,
  createId as defaultCreateId,
  type ComponentContribution,
  type DesignDocument,
  type Operation,
  type SceneNode,
  type ThemeDef,
  type TokenSet,
} from '@opendesign/core';
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
  const operations: Operation[] = [];
  const skipped: string[] = [];
  let heroReplaced = false;

  for (const section of blueprint.sections) {
    if (section.hero && options.hero) {
      operations.push({
        type: 'insertSubtree',
        nodes: options.hero.nodes,
        rootId: options.hero.rootId,
        parentId: rootId,
        index: operations.length,
      });
      heroReplaced = true;
      continue;
    }

    const block = lookup(section.block);
    if (!block) {
      skipped.push(section.block);
      continue;
    }

    const built = block.create({
      createId,
      tokens: document.tokens,
      ...(section.props ? { props: section.props } : {}),
    });

    operations.push({
      type: 'insertSubtree',
      nodes: built.nodes,
      rootId: built.rootId,
      parentId: rootId,
      index: operations.length,
    });
  }

  return {
    document: applyOperations(document, operations).document,
    blueprint,
    skipped,
    heroReplaced,
  };
}

/** Request in, document out — the whole flow in one call. */
export function buildTemplateFromRequest(
  request: string,
  options: BuildTemplateOptions,
): BuildTemplateResult {
  return buildTemplate(resolveTemplate(request), options);
}
