import {
  getAncestors,
  getNode,
  walk,
  type DesignDocument,
  type NodeId,
  type SceneNode,
} from '@opendesign/core';
import { checkContrast, tokenToLiteral } from '@opendesign/design-system';

/**
 * Automated design review.
 *
 * Models are good at layout and bad at the boring parts: they pick colours that
 * do not meet contrast, forget alt text, and set tap targets a thumb cannot
 * hit. Catching that mechanically — before the user sees the result — is far
 * more reliable than asking the model to be careful, and it costs one pass over
 * the tree instead of another round trip.
 */

export type IssueSeverity = 'error' | 'warning';

export interface ReviewIssue {
  nodeId: NodeId;
  nodeName: string;
  rule: string;
  severity: IssueSeverity;
  message: string;
}

export interface ReviewOptions {
  /** Only inspect these subtrees; defaults to the whole document. */
  rootIds?: NodeId[];
  /** Minimum interactive target size in px. */
  minTapTarget?: number;
}

const TEXT_TYPES = new Set(['text', 'heading', 'link', 'button']);
const INTERACTIVE_TYPES = new Set(['button', 'link', 'input', 'textarea']);

/** Walks up the tree to find the nearest resolved background colour. */
function effectiveBackground(document: DesignDocument, node: SceneNode): string | undefined {
  const chain = [node.id, ...[...getAncestors(document, node.id)].reverse()];

  for (const id of chain) {
    const current = getNode(document, id);
    const background = current?.style.background;
    if (typeof background !== 'string') continue;
    // Gradients and colour-mix cannot be evaluated without a renderer.
    if (background.includes('gradient') || background.includes('color-mix')) continue;

    const literal = tokenToLiteral(background, document.tokens);
    if (literal?.startsWith('#')) return literal;
  }

  return undefined;
}

function isLargeText(node: SceneNode): boolean {
  const size = node.style.font?.size;
  if (typeof size === 'number') return size >= 24;
  if (typeof size === 'string' && size.startsWith('{size.')) {
    return ['2xl', '3xl', '4xl', '5xl', '6xl', '7xl'].some((step) => size.includes(step));
  }
  return node.type === 'heading';
}

export function reviewDocument(
  document: DesignDocument,
  options: ReviewOptions = {},
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const minTapTarget = options.minTapTarget ?? 40;
  const roots = options.rootIds ?? document.pages.map((page) => page.rootId);

  const push = (node: SceneNode, rule: string, severity: IssueSeverity, message: string) => {
    issues.push({ nodeId: node.id, nodeName: node.name, rule, severity, message });
  };

  for (const rootId of roots) {
    walk(document, rootId, (node) => {
      if (node.hidden) return false;

      /* Contrast ------------------------------------------------------- */
      if (TEXT_TYPES.has(node.type) && typeof node.style.color === 'string') {
        const foreground = tokenToLiteral(node.style.color, document.tokens);
        const background = effectiveBackground(document, node);

        if (foreground?.startsWith('#') && background) {
          const issue = checkContrast(foreground, background, { large: isLargeText(node) });
          if (issue) {
            push(
              node,
              'contrast',
              'error',
              `O contraste do texto é ${issue.ratio}:1 sobre ${background}; a WCAG AA exige ${issue.required}:1. Escolha um token de cor mais claro ou mais escuro.`,
            );
          }
        }
      }

      /* Alt text ------------------------------------------------------- */
      if (node.type === 'image') {
        const alt = node.props.alt;
        if (typeof alt !== 'string' || alt.trim().length === 0) {
          push(
            node,
            'alt-text',
            'error',
            'A imagem não tem texto alternativo. Adicione uma prop "alt" descritiva.',
          );
        }
      }

      /* Empty interactive elements -------------------------------------- */
      if (INTERACTIVE_TYPES.has(node.type)) {
        const label = node.props.text ?? node.props.placeholder ?? node.props.ariaLabel;
        if (typeof label !== 'string' || label.trim().length === 0) {
          push(
            node,
            'empty-label',
            'error',
            `O elemento ${node.type} não tem rótulo acessível. Defina "text" ou "ariaLabel".`,
          );
        }

        const height = node.style.height;
        if (typeof height === 'number' && height < minTapTarget) {
          push(
            node,
            'tap-target',
            'warning',
            `O elemento interativo tem ${height}px de altura; ${minTapTarget}px é o mínimo confortável no toque.`,
          );
        }
      }

      /* Overflow risk --------------------------------------------------- */
      if (typeof node.style.width === 'number' && node.style.width > 390 && !node.responsive) {
        push(
          node,
          'fixed-width',
          'warning',
          `A largura fixa de ${node.style.width}px vai estourar em um celular de 390px. Use "fill" ou adicione um override responsivo.`,
        );
      }

      /* Heading order ---------------------------------------------------- */
      if (node.type === 'heading') {
        const level = node.props.level;
        if (typeof level === 'string' && !/^h[1-6]$/.test(level)) {
          push(node, 'heading-level', 'warning', `Nível de título inválido: "${level}".`);
        }
      }

      /* Empty containers -------------------------------------------------- */
      if (node.type === 'frame' && node.children.length === 0 && !node.style.height) {
        push(
          node,
          'empty-frame',
          'warning',
          'Um frame vazio sem altura explícita colapsa para zero.',
        );
      }

      return true;
    });
  }

  return issues;
}

/** One `h1` per page, and it should come before any `h2`. */
export function reviewHeadingStructure(document: DesignDocument): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  for (const page of document.pages) {
    const headings: SceneNode[] = [];
    walk(document, page.rootId, (node) => {
      if (node.type === 'heading' && !node.hidden) headings.push(node);
      return true;
    });

    const h1s = headings.filter((node) => node.props.level === 'h1');

    if (h1s.length === 0 && headings.length > 0) {
      const first = headings[0]!;
      issues.push({
        nodeId: first.id,
        nodeName: first.name,
        rule: 'heading-structure',
        severity: 'warning',
        message: `A página "${page.name}" não tem h1. Promova o título principal.`,
      });
    }

    if (h1s.length > 1) {
      for (const extra of h1s.slice(1)) {
        issues.push({
          nodeId: extra.id,
          nodeName: extra.name,
          rule: 'heading-structure',
          severity: 'warning',
          message: `A página "${page.name}" tem ${h1s.length} elementos h1; rebaixe este para h2.`,
        });
      }
    }
  }

  return issues;
}

/** Formats issues for the repair prompt. */
export function formatIssues(issues: ReviewIssue[]): string[] {
  return issues.map(
    (issue) =>
      `[${issue.severity}] ${issue.rule} on node ${issue.nodeId} (${issue.nodeName}): ${issue.message}`,
  );
}
