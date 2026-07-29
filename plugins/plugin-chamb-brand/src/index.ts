import {
  applyOperations,
  createDocument,
  createId,
  definePlugin,
  type DesignDocument,
  type OpenDesignPlugin,
  type Operation,
} from '@opendesign/core';
import { footer, navbar, faqSection, pricingTable } from '@opendesign/components';
import { CHAMB_BLOCKS, chambCta, chambFeatureCards, chambHero, chambShowcase } from './blocks.js';
import { chambThemes, chambTokens } from './tokens.js';

export * from './tokens.js';
export * from './blocks.js';

/**
 * Builds the chamb-design starter project.
 *
 * A template is a whole `DesignDocument`, not a page — it carries the token set
 * and themes too. That is the point: opening this template retheme the entire
 * project, so blocks from the neutral library immediately look like chamb
 * without anyone editing them.
 */
export function buildChambTemplate(): DesignDocument {
  const base = createDocument({ name: 'chamb-design', pageName: 'Home' });

  const document: DesignDocument = {
    ...base,
    tokens: chambTokens(),
    themes: chambThemes(),
    activeThemeId: 'chamb-light',
    pages: base.pages.map((page) => ({
      ...page,
      meta: {
        title: 'chamb-design — design com velocidade e charme',
        description:
          'Plataforma open source de design assistido por IA: canvas visual, design system real e código limpo na exportação.',
      },
    })),
  };

  const rootId = document.pages[0]!.rootId;

  // Brand blocks carry the voice; the two neutral ones (pricing, FAQ) are
  // included on purpose, to show they inherit the theme rather than fighting it.
  const blocks = [
    navbar,
    chambHero,
    chambFeatureCards,
    chambShowcase,
    pricingTable,
    faqSection,
    chambCta,
    footer,
  ];

  const operations: Operation[] = [];

  blocks.forEach((block, index) => {
    const built = block.create({
      createId,
      tokens: document.tokens,
      ...(block === navbar
        ? { props: { brand: 'chamb', links: 'Produto,Templates,Docs,Preços', cta: 'Começar' } }
        : {}),
      ...(block === footer
        ? { props: { brand: 'chamb', tagline: 'Design com velocidade e charme.' } }
        : {}),
    });

    operations.push({
      type: 'insertSubtree',
      nodes: built.nodes,
      rootId: built.rootId,
      parentId: rootId,
      index,
    });
  });

  return applyOperations(document, operations).document;
}

export const chambBrandPlugin: OpenDesignPlugin = definePlugin({
  id: 'chamb.brand',
  name: 'chamb-design brand',
  version: '0.1.0',
  description: 'Warm cream and signal red, with a serif italic display voice.',
  author: 'chamb-design',
  activate(context) {
    for (const block of CHAMB_BLOCKS) context.registerComponent(block);

    context.registerTemplate({
      id: 'chamb:starter',
      name: 'chamb-design starter',
      category: 'Brand',
      build: buildChambTemplate,
    });

    context.log(`registered ${CHAMB_BLOCKS.length} brand blocks and 1 template`);
  },
});

export default chambBrandPlugin;
