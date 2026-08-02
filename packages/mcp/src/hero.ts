import { buildTree, type NodeSpec } from '@opendesign/components';
import { heroCentered, heroSplit } from '@opendesign/components';
import {
  createId as defaultCreateId,
  type ComponentContribution,
  type SceneNode,
  type TokenSet,
} from '@opendesign/core';
import { extractCodeBlock, parseJsx } from './jsx.js';
import type { TwentyFirstClient } from './twenty-first.js';

/**
 * Hero sections, generated.
 *
 * The pipeline is: request -> 21st.dev -> JSX -> nodes -> quality gate. The
 * gate is the part worth arguing about, and it exists because "high quality"
 * has to mean something checkable. A hero that arrives without a headline, or
 * without a call to action, or as three nodes total, is not a hero — and
 * shipping it onto the canvas would be worse than shipping the built-in block,
 * which is at least complete. So the generator is allowed to fail, and failure
 * falls back rather than propagating.
 */

export type HeroSource = '21st.dev' | 'builtin';

export interface GeneratedHero {
  nodes: SceneNode[];
  rootId: string;
  source: HeroSource;
  /** The snippet 21st.dev returned, kept so the UI can show its provenance. */
  code?: string;
  /** Which MCP tool answered. */
  tool?: string;
  /** Everything that degraded along the way, in the order it happened. */
  warnings: string[];
}

export interface GenerateHeroOptions {
  /** The request in the user's own words. */
  request: string;
  /** Absent or unconfigured means "use the built-in block". */
  client?: TwentyFirstClient | null;
  createId?: (prefix?: string) => string;
  tokens?: TokenSet;
  /** Two-to-four words for the catalog search; derived from the request if absent. */
  searchQuery?: string;
  /** The block used when generation is unavailable or rejected. */
  fallbackBlock?: ComponentContribution;
  /** Props handed to the fallback block, e.g. the copy the user asked for. */
  fallbackProps?: Record<string, unknown>;
  /** Minimum node count before a generated hero is considered substantial. */
  minimumNodes?: number;
}

export interface HeroQuality {
  ok: boolean;
  reasons: string[];
  nodeCount: number;
  hasHeadline: boolean;
  hasAction: boolean;
}

const DEFAULT_MINIMUM_NODES = 5;

/**
 * A short catalog query built from a long request.
 *
 * 21st.dev asks for two to four words. Sending the whole sentence returns
 * noise, so the request is stripped to the terms that describe the *thing*.
 */
export function heroSearchQuery(request: string): string {
  const stopwords = new Set([
    'a',
    'an',
    'the',
    'for',
    'with',
    'and',
    'or',
    'of',
    'to',
    'in',
    'on',
    'my',
    'our',
    'me',
    'please',
    'want',
    'need',
    'make',
    'build',
    'create',
    'generate',
    'um',
    'uma',
    'o',
    'os',
    'as',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'para',
    'com',
    'e',
    'ou',
    'que',
    'meu',
    'minha',
    'quero',
    'preciso',
    'faz',
    'faça',
    'crie',
    'criar',
    'gerar',
    'uma',
    'pagina',
    'página',
    'site',
    'seção',
    'secao',
  ]);

  const words = request
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word))
    .slice(0, 2);

  return ['hero section', ...words].join(' ').trim();
}

/** The prompt sent to the generator, with the constraints that matter here. */
export function heroPrompt(request: string): string {
  return [
    `Design a hero section for: ${request}`,
    'Requirements: one h1 headline, one supporting paragraph, and one or two call-to-action buttons.',
    'Use semantic Tailwind colour names (background, foreground, muted-foreground, primary, border) rather than fixed palette colours, and plain elements — no imported icon or UI-kit components.',
    'Return a single self-contained JSX section.',
  ].join('\n');
}

export async function generateHeroSection(options: GenerateHeroOptions): Promise<GeneratedHero> {
  const createId = options.createId ?? defaultCreateId;
  const warnings: string[] = [];

  if (!options.client) {
    return {
      ...buildFallback(options, createId),
      source: 'builtin',
      warnings: ['21st.dev is not configured'],
    };
  }

  let text: string;
  let tool: string;
  try {
    const response = await options.client.generateComponent({
      message: heroPrompt(options.request),
      searchQuery: options.searchQuery ?? heroSearchQuery(options.request),
    });
    text = response.text;
    tool = response.tool;
  } catch (error) {
    warnings.push(`21st.dev call failed: ${(error as Error)?.message ?? String(error)}`);
    return { ...buildFallback(options, createId), source: 'builtin', warnings };
  }

  const code = extractCodeBlock(text);
  if (!code) {
    warnings.push('21st.dev returned no code block');
    return { ...buildFallback(options, createId), source: 'builtin', warnings, tool };
  }

  const parsed = parseJsx(code);
  warnings.push(...parsed.warnings);

  if (!parsed.spec) {
    return { ...buildFallback(options, createId), source: 'builtin', warnings, code, tool };
  }

  const built = buildTree(heroSection(parsed.spec), createId);
  const quality = assessHero(built.nodes, options.minimumNodes ?? DEFAULT_MINIMUM_NODES);

  if (!quality.ok) {
    warnings.push(...quality.reasons);
    return { ...buildFallback(options, createId), source: 'builtin', warnings, code, tool };
  }

  // Provenance travels with the document: an exported project should be able
  // to say where a section came from, and the editor can offer to regenerate.
  const root = built.nodes.find((node) => node.id === built.rootId);
  if (root) root.meta = { ...root.meta, 'mcp:source': '21st.dev', 'mcp:tool': tool };

  return { nodes: built.nodes, rootId: built.rootId, source: '21st.dev', code, tool, warnings };
}

/**
 * Is this actually a hero?
 *
 * Three checks, each earned from a way generation goes wrong: an empty
 * wrapper, a headline with nothing to click, and a decorative fragment that
 * parsed but says nothing.
 */
export function assessHero(nodes: SceneNode[], minimumNodes = DEFAULT_MINIMUM_NODES): HeroQuality {
  const reasons: string[] = [];

  const hasHeadline = nodes.some(
    (node) => node.type === 'heading' && String(node.props.text ?? '').trim().length > 0,
  );
  const hasAction = nodes.some(
    (node) =>
      (node.type === 'button' || node.type === 'link') &&
      String(node.props.text ?? '').trim().length > 0,
  );

  if (nodes.length < minimumNodes)
    reasons.push(`generated hero is too thin (${nodes.length} nodes)`);
  if (!hasHeadline) reasons.push('generated hero has no headline');
  if (!hasAction) reasons.push('generated hero has no call to action');

  return { ok: reasons.length === 0, reasons, nodeCount: nodes.length, hasHeadline, hasAction };
}

/**
 * Gives a generated element the shape of a page section.
 *
 * Some snippets already are one — `<section className="w-full py-24">` — and
 * wrapping those in a second padded frame doubles the vertical rhythm, which
 * is exactly the "AI section that is three screens tall" everyone recognises.
 * So a spec that already owns its full width and vertical padding is only
 * normalised, and just the ones written to sit inside someone else's container
 * get a shell.
 */
export function heroSection(spec: NodeSpec): NodeSpec {
  const style = spec.style ?? {};
  const fullWidth = style.width === 'fill' || style.width === '100%';
  const ownsRhythm = Boolean(style.padding?.top ?? style.padding?.bottom);

  if (fullWidth && ownsRhythm) {
    return {
      ...spec,
      name: 'Hero — 21st.dev',
      style: {
        display: 'flex',
        direction: 'column',
        align: 'center',
        background: '{color.background}',
        color: '{color.foreground}',
        ...style,
      },
    };
  }

  return heroShell(spec);
}

function heroShell(spec: NodeSpec): NodeSpec {
  return {
    type: 'frame',
    name: 'Hero — 21st.dev',
    style: {
      display: 'flex',
      direction: 'column',
      width: 'fill',
      align: 'center',
      justify: 'center',
      padding: {
        top: '{spacing.20}',
        bottom: '{spacing.20}',
        left: '{spacing.6}',
        right: '{spacing.6}',
      },
      background: '{color.background}',
      color: '{color.foreground}',
      ...(spec.style?.background ? { background: spec.style.background } : {}),
    },
    responsive: {
      md: {
        padding: {
          top: '{spacing.32}',
          bottom: '{spacing.32}',
          left: '{spacing.10}',
          right: '{spacing.10}',
        },
      },
    },
    children: [spec],
  };
}

function buildFallback(
  options: GenerateHeroOptions,
  createId: (prefix?: string) => string,
): { nodes: SceneNode[]; rootId: string } {
  const block = options.fallbackBlock ?? pickFallbackBlock(options.request);
  return block.create({
    createId,
    tokens: options.tokens ?? ({} as TokenSet),
    ...(options.fallbackProps ? { props: options.fallbackProps } : {}),
  });
}

/** A split hero when the request implies a product shot, centred otherwise. */
function pickFallbackBlock(request: string): ComponentContribution {
  return /screenshot|produto|product|app|dashboard|painel|imagem|image|mockup/i.test(request)
    ? heroSplit
    : heroCentered;
}
