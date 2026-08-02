import type { NodeSpec } from '@opendesign/components';
import { translateClasses, type ResponsiveStyles } from './tailwind.js';
import type { StyleMap } from '@opendesign/core';

/**
 * JSX in, `NodeSpec` tree out.
 *
 * This is not a JavaScript parser and does not try to be one: it reads the
 * markup a UI generator returns — elements, attributes, text — and gives up
 * cleanly on everything else. Expressions become either their string literal
 * or nothing at all.
 *
 * The alternative was pulling in a real parser to read one snippet per hero.
 * The narrow reader is a few hundred lines, has no dependencies, and fails in
 * a way the caller can act on (`warnings`), which matters more here: a hero
 * that comes back unreadable must fall back to a built-in block, not crash the
 * editor.
 */

export interface ParsedJsx {
  spec: NodeSpec | null;
  warnings: string[];
}

/** Elements that carry no layout meaning on their own. */
const TRANSPARENT_TAGS = new Set(['fragment', 'react.fragment', '', 'template']);

/** Dropped whole: an inline icon has no equivalent in the document model. */
const DROPPED_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'style',
  'script',
]);

const TEXT_TAGS = new Set([
  'p',
  'span',
  'small',
  'strong',
  'em',
  'b',
  'i',
  'label',
  'li',
  'blockquote',
  'figcaption',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Component tags a generated snippet uses that map onto a primitive.
 *
 * Anything else capitalised becomes a frame: an unknown component is a box
 * with children until proven otherwise, and that is nearly always right for
 * the wrappers these snippets are built from.
 */
const COMPONENT_TAGS: Record<string, string> = {
  button: 'button',
  link: 'link',
  image: 'image',
  img: 'image',
  input: 'input',
  textarea: 'textarea',
  badge: 'text',
  separator: 'divider',
};

interface Element {
  tag: string;
  attributes: Record<string, string>;
  children: Child[];
  selfClosing: boolean;
}

type Child = Element | { text: string };

/* -------------------------------------------------------------------------- */
/*                              Snippet extraction                            */
/* -------------------------------------------------------------------------- */

/**
 * The code inside a tool's answer.
 *
 * MCP tools return prose around fenced blocks. The largest block is the
 * component; the small ones are import lines and usage examples.
 */
export function extractCodeBlock(text: string): string | null {
  const fences = [...text.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? '',
  );
  if (fences.length === 0) return text.includes('<') ? text : null;
  return fences.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    '',
  );
}

/**
 * The outermost JSX element in a component file.
 *
 * Scans from each `return` for a balanced element, longest wins. Reading the
 * whole file's first `<` instead would find the one inside an import comment
 * or a type annotation often enough to matter.
 */
export function extractJsxElement(code: string): string | null {
  const candidates: string[] = [];

  for (const match of code.matchAll(/\breturn\s*\(?\s*(?=<)/g)) {
    const start = match.index! + match[0].length;
    const element = readBalancedElement(code, start);
    if (element) candidates.push(element);
  }

  if (candidates.length === 0) {
    const first = code.indexOf('<');
    if (first === -1) return null;
    const element = readBalancedElement(code, first);
    if (element) candidates.push(element);
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
}

function readBalancedElement(code: string, start: number): string | null {
  if (code[start] !== '<') return null;

  let index = start;
  let depth = 0;

  while (index < code.length) {
    if (code[index] !== '<') {
      index++;
      continue;
    }

    const closing = code[index + 1] === '/';
    const tagEnd = findTagEnd(code, index);
    if (tagEnd === -1) return null;

    const selfClosing = code.slice(index, tagEnd).trimEnd().endsWith('/');

    if (closing) depth--;
    else if (!selfClosing) depth++;

    index = tagEnd + 1;
    if (depth <= 0) return code.slice(start, index);
  }

  return null;
}

/** Index of the `>` that closes the tag starting at `start`, quote-aware. */
function findTagEnd(code: string, start: number): number {
  let index = start;
  let quote: string | null = null;
  let braces = 0;

  while (index < code.length) {
    const char = code[index]!;

    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      braces++;
    } else if (char === '}') {
      braces--;
    } else if (char === '>' && braces === 0) {
      return index;
    }

    index++;
  }

  return -1;
}

/* -------------------------------------------------------------------------- */
/*                                   Parsing                                  */
/* -------------------------------------------------------------------------- */

export function parseJsx(source: string): ParsedJsx {
  const warnings: string[] = [];
  const jsx = source.trimStart().startsWith('<') ? source : (extractJsxElement(source) ?? '');

  if (!jsx) return { spec: null, warnings: ['no JSX element found in the snippet'] };

  const element = parseElement(jsx, warnings);
  if (!element) return { spec: null, warnings: [...warnings, 'the snippet could not be parsed'] };

  const spec = toNodeSpec(element, warnings);
  return { spec, warnings };
}

function parseElement(source: string, warnings: string[]): Element | null {
  const stack: Element[] = [];
  let root: Element | null = null;
  let index = 0;

  const push = (child: Child) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(child);
  };

  while (index < source.length) {
    const char = source[index]!;

    if (char === '<') {
      if (source.startsWith('<!--', index)) {
        const end = source.indexOf('-->', index);
        index = end === -1 ? source.length : end + 3;
        continue;
      }

      const tagEnd = findTagEnd(source, index);
      if (tagEnd === -1) break;

      const rawTag = source.slice(index, tagEnd + 1);
      index = tagEnd + 1;

      if (rawTag.startsWith('</')) {
        stack.pop();
        continue;
      }

      const parsed = parseTag(rawTag);
      if (!parsed) continue;

      const element: Element = { ...parsed, children: [] };
      if (!root) root = element;
      push(element);
      if (!parsed.selfClosing) stack.push(element);
      continue;
    }

    if (char === '{') {
      const end = matchBrace(source, index);
      const expression = source.slice(index + 1, end);
      index = end + 1;

      const literal = stringLiteral(expression);
      if (literal !== null) push({ text: literal });
      else if (expression.trim() && !expression.includes('<')) {
        warnings.push(`dropped expression: ${expression.trim().slice(0, 60)}`);
      }
      continue;
    }

    const next = nextIndexOfAny(source, index, ['<', '{']);
    const text = source.slice(index, next);
    if (text.trim()) push({ text: collapse(text) });
    index = next;
  }

  return root;
}

function parseTag(raw: string): Omit<Element, 'children'> | null {
  const match = /^<\s*([A-Za-z][\w.:-]*)/.exec(raw);
  if (!match) return null;

  const tag = match[1]!;
  const body = raw.slice(match[0].length, raw.endsWith('/>') ? -2 : -1);

  return {
    tag,
    attributes: parseAttributes(body),
    selfClosing: raw.trimEnd().endsWith('/>'),
  };
}

function parseAttributes(body: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;

  while (index < body.length) {
    const match = /([A-Za-z][\w:.-]*)\s*(=)?\s*/.exec(body.slice(index));
    if (!match) break;

    const name = match[1]!;
    index += match.index! + match[0].length;

    if (!match[2]) {
      attributes[name] = 'true';
      continue;
    }

    const char = body[index];
    if (char === '"' || char === "'") {
      const end = body.indexOf(char, index + 1);
      if (end === -1) break;
      attributes[name] = body.slice(index + 1, end);
      index = end + 1;
      continue;
    }

    if (char === '{') {
      const end = matchBrace(body, index);
      const expression = body.slice(index + 1, end);
      index = end + 1;
      attributes[name] = expressionValue(expression);
      continue;
    }

    // Bare value, which JSX does not really allow — skip to the next space.
    const end = body.indexOf(' ', index);
    attributes[name] = body.slice(index, end === -1 ? undefined : end);
    index = end === -1 ? body.length : end;
  }

  return attributes;
}

/**
 * The usable part of an attribute expression.
 *
 * `cn("a", cond && "b")` is the shape every generated snippet uses for
 * classes; keeping every string literal in it is both simple and right — a
 * conditional class is still a class the design was drawn with.
 */
function expressionValue(expression: string): string {
  const literals = [...expression.matchAll(/["'`]([^"'`]*)["'`]/g)].map((match) => match[1] ?? '');
  return literals.join(' ').trim();
}

function stringLiteral(expression: string): string | null {
  const match = /^\s*["'`]([\s\S]*)["'`]\s*$/.exec(expression);
  return match ? collapse(match[1] ?? '') : null;
}

function matchBrace(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = start; index < source.length; index++) {
    const char = source[index]!;

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return index;
    }
  }

  return source.length;
}

function nextIndexOfAny(source: string, from: number, chars: string[]): number {
  const indexes = chars.map((char) => source.indexOf(char, from)).filter((index) => index !== -1);
  return indexes.length === 0 ? source.length : Math.min(...indexes);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/* -------------------------------------------------------------------------- */
/*                              Element -> NodeSpec                           */
/* -------------------------------------------------------------------------- */

function toNodeSpec(element: Element, warnings: string[]): NodeSpec | null {
  const tag = element.tag.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return null;

  const children = element.children
    .map((child) => ('text' in child ? child : toNodeSpec(child, warnings)))
    .filter((child): child is NodeSpec | { text: string } => child !== null);

  if (TRANSPARENT_TAGS.has(tag)) {
    const first = children.find((child) => !('text' in child)) as NodeSpec | undefined;
    return first ?? null;
  }

  const type = elementType(tag);
  const { style, responsive, passthrough } = translateClasses(
    element.attributes.className ?? element.attributes.class ?? '',
  );

  const text = children
    .filter((child): child is { text: string } => 'text' in child)
    .map((child) => child.text)
    .join(' ')
    .trim();

  const childSpecs = children.filter((child): child is NodeSpec => !('text' in child));

  const spec: NodeSpec = {
    type,
    ...(elementName(tag, type, text) ? { name: elementName(tag, type, text) } : {}),
    props: elementProps(type, tag, element.attributes, text),
    style: withDefaults(type, style),
    ...(Object.keys(responsive).length > 0 ? { responsive: responsive as ResponsiveStyles } : {}),
    ...(passthrough.length > 0 ? { className: passthrough.join(' ') } : {}),
  };

  // Loose text next to element children (a headline with a nested `<span>`)
  // would be lost otherwise; it becomes a text node so the copy survives.
  const leftover = isTextual(type)
    ? []
    : children.filter((child): child is { text: string } => 'text' in child);
  const extraText = leftover
    .map((child) => child.text)
    .join(' ')
    .trim();

  const finalChildren = [
    ...(extraText
      ? [{ type: 'text', props: { text: extraText }, style: {} } satisfies NodeSpec]
      : []),
    ...childSpecs,
  ];

  if (finalChildren.length > 0) spec.children = finalChildren;
  return spec;
}

function elementType(tag: string): string {
  if (HEADING_TAGS.has(tag)) return 'heading';
  if (TEXT_TAGS.has(tag)) return 'text';
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'img') return 'image';
  if (tag === 'input') return 'input';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'hr') return 'divider';
  if (tag === 'video') return 'video';
  if (tag === 'iframe') return 'embed';

  return COMPONENT_TAGS[tag] ?? 'frame';
}

function isTextual(type: string): boolean {
  return type === 'text' || type === 'heading' || type === 'button' || type === 'link';
}

function elementName(tag: string, type: string, text: string): string | undefined {
  if (type === 'heading') return tag === 'h1' ? 'Headline' : 'Subhead';
  if (type === 'button') return text ? `Button — ${text.slice(0, 24)}` : 'Button';
  if (type === 'frame') return undefined;
  return undefined;
}

function elementProps(
  type: string,
  tag: string,
  attributes: Record<string, string>,
  text: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  if (isTextual(type) && text) props.text = text;

  if (type === 'heading') props.level = HEADING_TAGS.has(tag) ? tag : 'h2';
  if (type === 'link' && attributes.href) props.href = attributes.href;
  if (type === 'image') {
    if (attributes.src) props.src = attributes.src;
    if (attributes.alt) props.alt = attributes.alt;
  }
  if (type === 'input' || type === 'textarea') {
    if (attributes.placeholder) props.placeholder = attributes.placeholder;
    if (attributes.type) props.type = attributes.type;
  }
  if (tag === 'p' || tag === 'span') props.as = tag;

  return props;
}

/**
 * Style a generated element needs regardless of what its classes said.
 *
 * Snippets lean on browser defaults (`<button>` is inline-flex and clickable,
 * a section is a block). The document model has no user-agent stylesheet, so
 * those defaults have to be written down or the section renders as a pile of
 * inline text.
 */
function withDefaults(type: string, style: StyleMap): StyleMap {
  if (type === 'button' || type === 'link') {
    return {
      display: style.display ?? 'inline-flex',
      align: style.align ?? 'center',
      justify: style.justify ?? 'center',
      cursor: 'pointer',
      ...style,
    };
  }

  if (type === 'frame' && !style.display) return { display: 'flex', direction: 'column', ...style };
  return style;
}
