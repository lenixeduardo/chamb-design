import type { EmitElement } from './tree.js';

/**
 * Serializers.
 *
 * The shared element tree is spelled differently per framework. Isolating that
 * here means adding a seventh target is a ~40 line file, not a new walker.
 */

export type Dialect = 'jsx' | 'html' | 'vue' | 'svelte' | 'astro';

/** React renames a handful of HTML attributes; every other target does not. */
const JSX_ATTRIBUTE_NAMES: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  autoplay: 'autoPlay',
  playsinline: 'playsInline',
  srcset: 'srcSet',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  contenteditable: 'contentEditable',
};

const HTML_ATTRIBUTE_NAMES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  autoPlay: 'autoplay',
  playsInline: 'playsinline',
  srcSet: 'srcset',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
  tabIndex: 'tabindex',
  readOnly: 'readonly',
  maxLength: 'maxlength',
  contentEditable: 'contenteditable',
};

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * JSX text is mostly literal, but braces open an expression and would break the
 * build. `{`/`}` are emitted as escaped expressions instead.
 */
function escapeJsxText(text: string): string {
  return text
    .replace(/[{}]/g, (c) => `{'${c}'}`)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renameAttribute(name: string, dialect: Dialect): string {
  if (dialect === 'jsx') return JSX_ATTRIBUTE_NAMES[name] ?? name;
  return HTML_ATTRIBUTE_NAMES[name] ?? name;
}

function serializeAttributes(element: EmitElement, dialect: Dialect): string {
  const parts: string[] = [];

  const classAttribute = dialect === 'jsx' ? 'className' : 'class';
  if (element.className) {
    parts.push(`${classAttribute}="${escapeAttribute(element.className)}"`);
  }

  for (const [rawName, value] of Object.entries(element.attributes)) {
    const name = renameAttribute(rawName, dialect);

    if (typeof value === 'boolean') {
      if (!value) continue;
      // Svelte and Vue accept bare boolean attributes; JSX prefers `{true}`.
      parts.push(dialect === 'jsx' ? `${name}` : name);
      continue;
    }

    if (typeof value === 'number') {
      parts.push(dialect === 'jsx' ? `${name}={${value}}` : `${name}="${value}"`);
      continue;
    }

    parts.push(`${name}="${escapeAttribute(value)}"`);
  }

  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

export interface SerializeOptions {
  dialect: Dialect;
  indent?: string;
  /** Starting indentation depth. */
  depth?: number;
}

export function serializeElement(element: EmitElement, options: SerializeOptions): string {
  const { dialect, indent = '  ', depth = 0 } = options;
  const pad = indent.repeat(depth);

  if (element.componentRef) {
    return `${pad}<${element.componentRef} />`;
  }

  const attributes = serializeAttributes(element, dialect);
  const escapeText = dialect === 'jsx' ? escapeJsxText : escapeHtmlText;

  if (element.selfClosing) {
    // HTML void elements must not be written `<img ... />` in strict HTML5
    // output, but every JSX-like dialect requires the slash.
    return dialect === 'html'
      ? `${pad}<${element.tag}${attributes}>`
      : `${pad}<${element.tag}${attributes} />`;
  }

  const hasText = typeof element.text === 'string' && element.text.length > 0;
  const hasChildren = element.children.length > 0;

  if (!hasText && !hasChildren) {
    return `${pad}<${element.tag}${attributes}></${element.tag}>`;
  }

  // Short text-only nodes stay on one line — that is how humans write them.
  if (hasText && !hasChildren && element.text!.length <= 80 && !element.text!.includes('\n')) {
    return `${pad}<${element.tag}${attributes}>${escapeText(element.text!)}</${element.tag}>`;
  }

  const lines: string[] = [`${pad}<${element.tag}${attributes}>`];

  if (hasText) {
    for (const line of element.text!.split('\n')) {
      lines.push(`${pad}${indent}${escapeText(line)}`);
    }
  }

  for (const child of element.children) {
    lines.push(serializeElement(child, { dialect, indent, depth: depth + 1 }));
  }

  lines.push(`${pad}</${element.tag}>`);
  return lines.join('\n');
}

/** Collects the component names referenced inside a tree, for import lines. */
export function collectComponentRefs(element: EmitElement): string[] {
  const refs = new Set<string>();
  const walk = (current: EmitElement) => {
    if (current.componentRef) refs.add(current.componentRef);
    current.children.forEach(walk);
  };
  walk(element);
  return [...refs];
}
