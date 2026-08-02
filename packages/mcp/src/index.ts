import {
  createId,
  definePlugin,
  type DesignDocument,
  type OpenDesignPlugin,
  type Operation,
} from '@opendesign/core';
import { generateHeroSection, type GeneratedHero } from './hero.js';
import { TwentyFirstClient, twentyFirstKeyFromEnv } from './twenty-first.js';

export * from './client.js';
export * from './twenty-first.js';
export * from './tailwind.js';
export * from './jsx.js';
export * from './hero.js';

export interface HeroImportConfig {
  request: string;
  apiKey?: string;
  /** Where the generated section lands; defaults to the top of the first page. */
  pageId?: string;
  index?: number;
  url?: string;
}

export interface HeroImportResult extends GeneratedHero {
  /** Ready to hand to `applyOperations` — or to the editor's undo stack. */
  operation: Operation;
}

/**
 * Generates a hero and returns the operation that inserts it.
 *
 * Returning an operation rather than a mutated document is the whole point of
 * this architecture: the section arrives on the same path as a human edit, so
 * it lands in the undo stack, it can be dry-run first, and refusing it costs
 * one `ctrl+z`.
 */
export async function importHeroSection(
  document: DesignDocument,
  config: HeroImportConfig,
): Promise<HeroImportResult> {
  const apiKey = config.apiKey ?? twentyFirstKeyFromEnv();
  const client = apiKey
    ? new TwentyFirstClient({ apiKey, ...(config.url ? { url: config.url } : {}) })
    : null;

  const hero = await generateHeroSection({
    request: config.request,
    client,
    createId,
    tokens: document.tokens,
  });

  const page = config.pageId
    ? document.pages.find((candidate) => candidate.id === config.pageId)
    : document.pages[0];

  if (!page) throw new Error(`[opendesign:mcp] page not found: ${config.pageId}`);

  return {
    ...hero,
    operation: {
      type: 'insertSubtree',
      nodes: hero.nodes,
      rootId: hero.rootId,
      parentId: page.rootId,
      index: config.index ?? 0,
    },
  };
}

/**
 * The integration, contributed like anything else.
 *
 * `kind: 'import'` is the existing contribution point for "bring something in
 * from outside", which is exactly what this is — the plugin API needed nothing
 * new to host an MCP server.
 */
export const twentyFirstPlugin: OpenDesignPlugin = definePlugin({
  id: 'opendesign.mcp.21st',
  name: '21st.dev hero sections',
  version: '0.1.0',
  description: 'Generates hero sections through the 21st.dev MCP server and imports them as nodes.',
  homepage: 'https://21st.dev',
  activate(context) {
    context.registerIntegration({
      id: 'mcp:21st',
      label: '21st.dev',
      kind: 'import',
      run: (document, config) => importHeroSection(document, config as unknown as HeroImportConfig),
    });
  },
});

export default twentyFirstPlugin;
