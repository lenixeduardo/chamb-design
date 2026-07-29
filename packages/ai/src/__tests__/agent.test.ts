import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  createNode,
  seededRng,
  setIdRng,
  type DesignDocument,
} from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { DesignAgent } from '../agent.js';
import { buildDocumentContext, estimateTokens, serializeTree } from '../context.js';
import { extractJson, extractOperations, findJsonBlock } from '../extract.js';
import { reviewDocument, reviewHeadingStructure } from '../review.js';
import { collect, type ChatChunk, type ChatProvider } from '../provider.js';

/* -------------------------------------------------------------------------- */
/*                              Fake provider                                 */
/* -------------------------------------------------------------------------- */

/** Replays scripted responses so the whole agent loop is testable offline. */
function fakeProvider(responses: string[]): ChatProvider & { calls: number } {
  let index = 0;

  const provider = {
    id: 'fake',
    label: 'Fake',
    locality: 'local' as const,
    models: [{ id: 'fake-1', label: 'Fake 1' }],
    calls: 0,
    async *stream(): AsyncIterable<ChatChunk> {
      provider.calls += 1;
      const body = responses[Math.min(index, responses.length - 1)] ?? '';
      index += 1;
      // Chunk it, so streaming assembly is genuinely exercised.
      for (let i = 0; i < body.length; i += 17) {
        yield { delta: body.slice(i, i + 17), done: false };
      }
      yield { delta: '', done: false, usage: { inputTokens: 100, outputTokens: 50 } };
      yield { delta: '', done: true };
    },
  };

  return provider;
}

function seedDoc(): DesignDocument {
  setIdRng(seededRng(3));
  return createDocument({ name: 'AI test' });
}

/* -------------------------------------------------------------------------- */

describe('json extraction', () => {
  it('finds a balanced object ignoring braces inside strings', () => {
    const found = findJsonBlock('prefix {"text":"a } b","n":1} suffix');
    expect(found?.json).toBe('{"text":"a } b","n":1}');
  });

  it('extracts from a fenced block and keeps the surrounding prose', () => {
    const result = extractJson<{ ok: boolean }>(
      'Here you go:\n```json\n{"ok": true}\n```\nLet me know.',
    );
    expect(result.json).toEqual({ ok: true });
    expect(result.message).toContain('Here you go:');
    expect(result.message).toContain('Let me know.');
  });

  it('recovers from trailing commas', () => {
    expect(extractJson<{ a: number }>('{"a": 1,}').json).toEqual({ a: 1 });
  });

  it('accepts a bare array, an operations key and an ops key', () => {
    expect(extractOperations('[{"type":"removeSubtree","nodeId":"x"}]').json).toHaveLength(1);
    expect(extractOperations('{"operations":[{"type":"a"}]}').json).toHaveLength(1);
    expect(extractOperations('{"ops":[{"type":"a"}]}').json).toHaveLength(1);
  });

  it('reports an error rather than throwing when there is no JSON', () => {
    const result = extractOperations('I am not sure what you mean.');
    expect(result.json).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(result.message).toBe('I am not sure what you mean.');
  });
});

describe('document context', () => {
  it('emits a compact outline with ids the model can reference', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const hero = createNode({ type: 'frame', name: 'Hero', style: { display: 'flex' } });

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [hero],
      rootId: hero.id,
      parentId: rootId,
      index: 0,
    }).document;

    const outline = serializeTree(doc, rootId);
    expect(outline).toContain(hero.id);
    expect(outline).toContain('"Hero"');
    expect(outline).toContain('display=flex');
  });

  it('is dramatically smaller than raw document JSON', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    for (let i = 0; i < 40; i += 1) {
      const node = createNode({
        type: 'text',
        name: `Item ${i}`,
        props: { text: `Row number ${i}` },
        style: { padding: { top: 8, bottom: 8, left: 12, right: 12 }, color: '{color.foreground}' },
      });
      doc = applyOperation(doc, {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: rootId,
        index: i,
      }).document;
    }

    const context = buildDocumentContext(doc);
    expect(context.text.length).toBeLessThan(JSON.stringify(doc).length / 2);
    expect(context.estimatedTokens).toBe(estimateTokens(context.text));
  });

  it('truncates very wide trees instead of dumping everything', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    for (let i = 0; i < 100; i += 1) {
      const node = createNode({ type: 'text', name: `N${i}` });
      doc = applyOperation(doc, {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: rootId,
        index: i,
      }).document;
    }

    const outline = serializeTree(doc, rootId, { maxChildren: 10 });
    expect(outline).toContain('more sibling(s) omitted');
  });

  it('expands the selection in full detail', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'button', props: { text: 'Buy' }, style: { opacity: 0.5 } });

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index: 0,
    }).document;

    const context = buildDocumentContext(doc, { selection: [node.id] });
    expect(context.text).toContain('CURRENT SELECTION');
    expect(context.text).toContain('opacity=0.5');
  });
});

describe('design review', () => {
  it('flags failing text contrast', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const text = createNode({
      type: 'text',
      props: { text: 'Barely visible' },
      style: { color: '#111111' },
    });

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [text],
      rootId: text.id,
      parentId: rootId,
      index: 0,
    }).document;

    const issues = reviewDocument(doc);
    expect(issues.some((i) => i.rule === 'contrast' && i.nodeId === text.id)).toBe(true);
  });

  it('accepts text that meets AA', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const text = createNode({
      type: 'text',
      props: { text: 'Readable' },
      style: { color: '#fafafa' },
    });

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [text],
      rootId: text.id,
      parentId: rootId,
      index: 0,
    }).document;

    expect(reviewDocument(doc).some((i) => i.rule === 'contrast')).toBe(false);
  });

  it('flags images without alt text and unlabelled controls', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const image = createNode({ type: 'image', props: { src: '/a.png' } });
    const button = createNode({ type: 'button', props: {} });

    for (const node of [image, button]) {
      doc = applyOperation(doc, {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: rootId,
        index: 0,
      }).document;
    }

    const rules = reviewDocument(doc).map((i) => i.rule);
    expect(rules).toContain('alt-text');
    expect(rules).toContain('empty-label');
  });

  it('warns about fixed widths that overflow a phone', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const wide = createNode({ type: 'frame', style: { width: 900, height: 100 } });

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [wide],
      rootId: wide.id,
      parentId: rootId,
      index: 0,
    }).document;

    expect(reviewDocument(doc).some((i) => i.rule === 'fixed-width')).toBe(true);
  });

  it('checks heading structure per page', () => {
    let doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;
    const a = createNode({ type: 'heading', props: { text: 'One', level: 'h1' } });
    const b = createNode({ type: 'heading', props: { text: 'Two', level: 'h1' } });

    for (const node of [a, b]) {
      doc = applyOperation(doc, {
        type: 'insertSubtree',
        nodes: [node],
        rootId: node.id,
        parentId: rootId,
        index: 0,
      }).document;
    }

    expect(reviewHeadingStructure(doc).some((i) => i.rule === 'heading-structure')).toBe(true);
  });
});

describe('DesignAgent', () => {
  it('applies a valid operation batch and reports it', async () => {
    const doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    const provider = fakeProvider([
      `Added a heading.
\`\`\`json
{
  "message": "Added a heading.",
  "operations": [
    {
      "type": "insertSubtree",
      "rootId": "n_new1",
      "parentId": "${rootId}",
      "index": 0,
      "nodes": [
        {
          "id": "n_new1",
          "type": "heading",
          "name": "Headline",
          "parent": null,
          "children": [],
          "props": { "text": "Hello world", "level": "h1" },
          "style": { "color": "{color.foreground}" }
        }
      ]
    }
  ]
}
\`\`\``,
    ]);

    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });
    const events = [];
    for await (const event of agent.run({ prompt: 'Add a headline', document: doc })) {
      events.push(event);
    }

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(done!.type === 'done' && done!.operations).toHaveLength(1);
    expect(done!.type === 'done' && done!.document.nodes.n_new1?.props.text).toBe('Hello world');
    expect(events.some((e) => e.type === 'message')).toBe(true);
    expect(events.some((e) => e.type === 'delta')).toBe(true);
  });

  it('repairs a schema-invalid batch on a second attempt', async () => {
    const doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    const provider = fakeProvider([
      '```json\n{"operations":[{"type":"insertSubtree","nodes":[],"rootId":"x","parentId":null,"index":0}]}\n```',
      `\`\`\`json
{"operations":[{"type":"setNodeFields","nodeId":"${rootId}","fields":{"name":"Repaired"}}]}
\`\`\``,
    ]);

    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });
    const events = [];
    for await (const event of agent.run({ prompt: 'Break then fix', document: doc })) {
      events.push(event);
    }

    expect(provider.calls).toBe(2);
    expect(events.some((e) => e.type === 'error')).toBe(true);

    const done = events.find((e) => e.type === 'done')!;
    expect(done.type === 'done' && done.document.nodes[rootId]!.name).toBe('Repaired');
  });

  it('never applies a partially valid batch that would corrupt the document', async () => {
    const doc = seedDoc();

    const provider = fakeProvider([
      '```json\n{"operations":[{"type":"removeSubtree","nodeId":"does-not-exist"}]}\n```',
    ]);

    const agent = new DesignAgent({
      provider,
      model: 'fake-1',
      autoReview: false,
      maxRepairAttempts: 0,
    });

    const events = [];
    for await (const event of agent.run({ prompt: 'Remove a ghost', document: doc })) {
      events.push(event);
    }

    const done = events.find((e) => e.type === 'done')!;
    expect(done.type === 'done' && done.operations).toHaveLength(0);
    expect(done.type === 'done' && Object.keys(done.document.nodes)).toEqual(
      Object.keys(doc.nodes),
    );
  });

  it('expands an insertBlock pseudo-operation using the registry', async () => {
    const registry = new PluginRegistry();
    await registry.register(componentsPlugin);

    const doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    const provider = fakeProvider([
      `\`\`\`json
{"operations":[{"type":"insertBlock","blockId":"lib:pricing-table","parentId":"${rootId}","index":0}]}
\`\`\``,
    ]);

    const agent = new DesignAgent({ provider, model: 'fake-1', registry, autoReview: false });
    const result = await agent.edit({ prompt: 'Add pricing', document: doc });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('insertSubtree');
    expect(Object.keys(result.document.nodes).length).toBeGreaterThan(20);
  });

  it('reports an unknown block instead of silently dropping it', async () => {
    const registry = new PluginRegistry();
    await registry.register(componentsPlugin);

    const doc = seedDoc();
    const provider = fakeProvider([
      '```json\n{"operations":[{"type":"insertBlock","blockId":"lib:nope","parentId":"x"}]}\n```',
    ]);

    const agent = new DesignAgent({
      provider,
      model: 'fake-1',
      registry,
      autoReview: false,
      maxRepairAttempts: 0,
    });

    const events = [];
    for await (const event of agent.run({ prompt: 'Add nope', document: doc })) events.push(event);

    const error = events.find((e) => e.type === 'error');
    expect(error && error.type === 'error' && error.message).toContain('unknown block "lib:nope"');
  });

  it('runs the review pass and applies the model’s fix', async () => {
    const doc = seedDoc();
    const rootId = doc.pages[0]!.rootId;

    const provider = fakeProvider([
      // First turn: inserts an image with no alt text.
      `\`\`\`json
{"operations":[{"type":"insertSubtree","rootId":"n_img","parentId":"${rootId}","index":0,
"nodes":[{"id":"n_img","type":"image","name":"Photo","parent":null,"children":[],
"props":{"src":"/hero.png"},"style":{}}]}]}
\`\`\``,
      // Review turn: adds the missing alt text.
      '```json\n{"operations":[{"type":"updateProps","nodeId":"n_img","props":{"alt":"Product screenshot"}}]}\n```',
    ]);

    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: true });
    const events = [];
    for await (const event of agent.run({ prompt: 'Add a hero image', document: doc })) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'review')).toBe(true);

    const done = events.find((e) => e.type === 'done')!;
    expect(done.type === 'done' && done.document.nodes.n_img?.props.alt).toBe(
      'Product screenshot',
    );
  });

  it('surfaces token usage from the provider', async () => {
    const doc = seedDoc();
    const provider = fakeProvider(['```json\n{"operations":[]}\n```']);
    const agent = new DesignAgent({ provider, model: 'fake-1', autoReview: false });

    const result = await agent.edit({ prompt: 'Do nothing', document: doc });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });
});

describe('collect', () => {
  it('assembles a stream into one string plus usage', async () => {
    const provider = fakeProvider(['hello world']);
    const result = await collect(provider.stream({ model: 'fake-1', messages: [] }));
    expect(result.text).toBe('hello world');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });
});
