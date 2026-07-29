import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyOperation,
  createDocument,
  createNode,
  seededRng,
  setIdRng,
  type DesignDocument,
} from '@opendesign/core';
import { PageRenderer } from '../render.js';
import { motionStylesheet, MOTION_PRESETS } from '../motion.js';
import { getPrimitive, resolveElement } from '../primitives.js';

function docWith(nodes: Parameters<typeof createNode>[0][]): DesignDocument {
  setIdRng(seededRng(5));
  let doc = createDocument({ name: 'Render test' });
  const rootId = doc.pages[0]!.rootId;

  for (const [index, input] of nodes.entries()) {
    const node = createNode(input);
    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index,
    }).document;
  }

  return doc;
}

describe('primitive mapping', () => {
  it('resolves polymorphic elements from props', () => {
    expect(resolveElement(createNode({ type: 'heading', props: { level: 'h1' } }))).toBe('h1');
    expect(resolveElement(createNode({ type: 'text', props: { as: 'span' } }))).toBe('span');
    expect(resolveElement(createNode({ type: 'button', props: { href: '/x' } }))).toBe('a');
    expect(resolveElement(createNode({ type: 'button', props: {} }))).toBe('button');
  });

  it('marks void elements self-closing', () => {
    expect(getPrimitive('image')?.selfClosing).toBe(true);
    expect(getPrimitive('frame')?.selfClosing).toBeUndefined();
  });
});

describe('class mode', () => {
  it('emits Tailwind utilities and editor attributes', () => {
    const doc = docWith([
      { type: 'text', props: { text: 'Hello' }, style: { color: '{color.accent}' } },
    ]);
    const html = renderToStaticMarkup(<PageRenderer document={doc} />);

    expect(html).toContain('text-accent');
    expect(html).toContain('data-od-id');
    expect(html).toContain('Hello');
  });

  it('omits editor attributes for published output', () => {
    const doc = docWith([{ type: 'text', props: { text: 'Hi' } }]);
    const html = renderToStaticMarkup(<PageRenderer document={doc} editorAttributes={false} />);
    expect(html).not.toContain('data-od-id');
  });
});

describe('inline mode', () => {
  it('emits real CSS instead of Tailwind classes', () => {
    const doc = docWith([
      {
        type: 'frame',
        style: { display: 'flex', gap: '{spacing.4}', background: '{color.card}' },
      },
    ]);

    const html = renderToStaticMarkup(<PageRenderer document={doc} styleMode="inline" />);

    expect(html).toContain('display:flex');
    expect(html).toContain('gap:var(--spacing-4)');
    expect(html).not.toContain('class="flex');
  });

  it('resolves the requested breakpoint', () => {
    setIdRng(seededRng(9));
    let doc = createDocument();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'frame', style: { direction: 'column' } });
    node.responsive = { lg: { direction: 'row' } };

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index: 0,
    }).document;

    const base = renderToStaticMarkup(
      <PageRenderer document={doc} styleMode="inline" breakpoint="base" />,
    );
    const large = renderToStaticMarkup(
      <PageRenderer document={doc} styleMode="inline" breakpoint="lg" />,
    );

    expect(base).toContain('flex-direction:column');
    expect(large).toContain('flex-direction:row');
  });

  it('keeps the escape-hatch className', () => {
    const doc = docWith([{ type: 'frame', className: 'custom-thing' }]);
    const html = renderToStaticMarkup(<PageRenderer document={doc} styleMode="inline" />);
    expect(html).toContain('custom-thing');
  });
});

describe('tokens and themes', () => {
  it('scopes token variables to the page wrapper', () => {
    const doc = docWith([]);
    const html = renderToStaticMarkup(<PageRenderer document={doc} />);
    expect(html).toContain('--color-background');
    expect(html).toContain('data-theme="dark"');
  });

  it('can skip the wrapper entirely', () => {
    const doc = docWith([]);
    const html = renderToStaticMarkup(<PageRenderer document={doc} applyTokens={false} />);
    expect(html).not.toContain('--color-background');
  });
});

describe('hidden nodes', () => {
  it('keeps them on the canvas and drops them from exports', () => {
    setIdRng(seededRng(13));
    let doc = createDocument();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'text', props: { text: 'Secret' } });
    node.hidden = true;

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index: 0,
    }).document;

    expect(renderToStaticMarkup(<PageRenderer document={doc} />)).toContain('Secret');
    expect(renderToStaticMarkup(<PageRenderer document={doc} omitHidden />)).not.toContain(
      'Secret',
    );
  });
});

describe('motion', () => {
  it('emits data attributes and custom properties', () => {
    setIdRng(seededRng(17));
    let doc = createDocument();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'frame' });
    node.motion = MOTION_PRESETS.fadeUp!;

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index: 0,
    }).document;

    const html = renderToStaticMarkup(<PageRenderer document={doc} />);
    expect(html).toContain('data-od-motion="in-view"');
    expect(html).toContain('--od-motion-duration');
  });

  it('honours prefers-reduced-motion in the stylesheet', () => {
    expect(motionStylesheet()).toContain('prefers-reduced-motion');
  });
});
