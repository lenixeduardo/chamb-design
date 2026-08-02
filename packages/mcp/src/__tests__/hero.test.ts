import { describe, expect, it, vi } from 'vitest';
import {
  createId,
  validateDocumentIntegrity,
  createDocument,
  applyOperations,
} from '@opendesign/core';
import type { NodeSpec } from '@opendesign/components';
import { extractCodeBlock, extractJsxElement, parseJsx } from '../jsx.js';
import { mapColor, mergeStyle, translateClasses } from '../tailwind.js';
import { assessHero, generateHeroSection, heroSearchQuery } from '../hero.js';
import { TwentyFirstClient } from '../twenty-first.js';
import { importHeroSection } from '../index.js';

/** A realistic answer: prose, an import line, then the component. */
const ANSWER = `Here is a hero section for your product.

\`\`\`tsx
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="w-full bg-background py-24 px-6 flex flex-col items-center">
      <div className="max-w-3xl flex flex-col items-center gap-6">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Novo</span>
        <h1 className="text-4xl md:text-6xl font-semibold text-foreground text-center">
          Ship faster with {"Charm"}
        </h1>
        <p className="text-lg text-muted-foreground text-center max-w-xl">
          A hero that says one thing and says it well.
        </p>
        <div className="flex gap-3">
          <button className="bg-primary text-primary-foreground rounded-md px-6 py-3">Começar</button>
          <a href="/docs" className="border border-border rounded-md px-6 py-3 text-foreground">Docs</a>
        </div>
        <svg viewBox="0 0 24 24"><path d="M0 0" /></svg>
      </div>
    </section>
  );
}
\`\`\`
`;

function fakeClient(text: string): TwentyFirstClient {
  const client = { generateComponent: vi.fn(async () => ({ text, tool: 'generate' })) };
  return client as unknown as TwentyFirstClient;
}

describe('translateClasses', () => {
  it('maps layout, spacing and colour onto tokens', () => {
    const { style } = translateClasses('flex flex-col items-center gap-6 px-6 py-24 bg-background');

    expect(style).toMatchObject({
      display: 'flex',
      direction: 'column',
      align: 'center',
      gap: '{spacing.6}',
      background: '{color.background}',
    });
    expect(style.padding).toEqual({
      left: '{spacing.6}',
      right: '{spacing.6}',
      top: '{spacing.24}',
      bottom: '{spacing.24}',
    });
  });

  it('puts breakpoint variants where they belong', () => {
    const { style, responsive } = translateClasses('text-4xl md:text-6xl lg:px-10');

    expect(style.font?.size).toBe('{size.4xl}');
    expect(responsive.md?.font?.size).toBe('{size.6xl}');
    expect(responsive.lg?.padding).toEqual({ left: '{spacing.10}', right: '{spacing.10}' });
  });

  /** Flattening `hover:` into the base style would apply it at rest. */
  it('keeps state variants as classes rather than flattening them', () => {
    const { style, passthrough } = translateClasses('hover:bg-primary dark:text-white');
    expect(style).toEqual({});
    expect(passthrough).toEqual(['hover:bg-primary', 'dark:text-white']);
  });

  it('keeps what it cannot express', () => {
    const { passthrough } = translateClasses('bg-gradient-to-br from-indigo-500 animate-pulse');
    expect(passthrough).toContain('bg-gradient-to-br');
    expect(passthrough).toContain('animate-pulse');
  });

  it('reads arbitrary values', () => {
    expect(translateClasses('max-w-[42rem]').style.maxWidth).toBe('42rem');
    expect(translateClasses('bg-[#0f172a]').style.background).toBe('#0f172a');
  });

  it('merges classes that each set half a value', () => {
    const { style } = translateClasses('border border-primary');
    expect(style.border).toEqual({ width: 1, style: 'solid', color: '{color.accent}' });
  });

  it('separates min and max bounds', () => {
    expect(translateClasses('max-w-3xl').style.maxWidth).toBe('768px');
    expect(translateClasses('min-h-screen').style.minHeight).toBe('100vh');
    expect(translateClasses('min-w-[200px]').style.minWidth).toBe('200px');
  });
});

describe('mapColor', () => {
  it('prefers tokens over literals', () => {
    expect(mapColor('primary')).toBe('{color.accent}');
    expect(mapColor('muted-foreground')).toBe('{color.muted-foreground}');
    expect(mapColor('zinc-900')).toBe('{color.neutral.900}');
    expect(mapColor('indigo-500')).toBe('{color.primary.500}');
  });

  it('drops the opacity modifier rather than the colour', () => {
    expect(mapColor('primary/10')).toBe('{color.accent}');
  });

  it('returns null for a palette it has no opinion about', () => {
    expect(mapColor('fuchsia-300')).toBeNull();
  });
});

describe('mergeStyle', () => {
  it('merges nested values one level deep', () => {
    const target = { font: { size: '16px' }, padding: { top: 4 } };
    mergeStyle(target, { font: { weight: 600 }, padding: { bottom: 8 } });
    expect(target).toEqual({ font: { size: '16px', weight: 600 }, padding: { top: 4, bottom: 8 } });
  });
});

describe('extracting code', () => {
  it('takes the largest fenced block', () => {
    const code = extractCodeBlock(
      '```bash\nnpm i\n```\ntext\n```tsx\n<section>hello</section>\n```',
    );
    expect(code).toContain('<section>');
  });

  it('finds the returned element, not the first angle bracket in the file', () => {
    const element = extractJsxElement(
      'const x: Array<string> = [];\nexport function Hero() {\n  return (\n    <section className="a"><h1>Hi</h1></section>\n  );\n}',
    );
    expect(element).toBe('<section className="a"><h1>Hi</h1></section>');
  });

  it('handles a self-closing root', () => {
    expect(extractJsxElement('return <img src="a.png" />;')).toBe('<img src="a.png" />');
  });
});

describe('parseJsx', () => {
  it('turns markup into a typed node tree', () => {
    const { spec } = parseJsx(extractCodeBlock(ANSWER)!);

    expect(spec?.type).toBe('frame');
    const flat = flatten(spec!);

    const heading = flat.find((node) => node.type === 'heading');
    expect(heading?.props?.level).toBe('h1');
    expect(String(heading?.props?.text)).toContain('Ship faster with');
    // A string literal inside an expression is copy, and copy is kept.
    expect(String(heading?.props?.text)).toContain('Charm');

    expect(flat.find((node) => node.type === 'button')?.props?.text).toBe('Começar');
    expect(flat.find((node) => node.type === 'link')?.props?.href).toBe('/docs');
    // Icons have no equivalent in the model and are dropped whole.
    expect(flat.some((node) => node.type === 'icon')).toBe(false);
  });

  it('gives elements a real style instead of relying on browser defaults', () => {
    const { spec } = parseJsx('<button className="px-6">Go</button>');
    expect(spec?.style).toMatchObject({ display: 'inline-flex', cursor: 'pointer' });
  });

  it('reports what it could not read', () => {
    const { warnings } = parseJsx('<section>{items.map((item) => item.name)}</section>');
    expect(warnings.join(' ')).toMatch(/dropped expression/);
  });

  it('returns nothing when there is no markup at all', () => {
    expect(parseJsx('const a = 1;').spec).toBeNull();
  });
});

describe('generateHeroSection', () => {
  it('builds nodes from a 21st.dev answer', async () => {
    const hero = await generateHeroSection({
      request: 'landing de um SaaS de finanças',
      client: fakeClient(ANSWER),
      createId,
    });

    expect(hero.source).toBe('21st.dev');
    expect(hero.tool).toBe('generate');
    expect(hero.nodes.length).toBeGreaterThan(5);

    const root = hero.nodes.find((node) => node.id === hero.rootId)!;
    expect(root.meta?.['mcp:source']).toBe('21st.dev');
    expect(root.style.width).toBe('fill');
  });

  it('falls back to a built-in block when 21st.dev is not configured', async () => {
    const hero = await generateHeroSection({ request: 'landing page', client: null, createId });

    expect(hero.source).toBe('builtin');
    expect(hero.warnings).toContain('21st.dev is not configured');
    expect(assessHero(hero.nodes).ok).toBe(true);
  });

  it('falls back when the call fails, and says why', async () => {
    const client = {
      generateComponent: vi.fn(async () => {
        throw new Error('quota exceeded');
      }),
    } as unknown as TwentyFirstClient;

    const hero = await generateHeroSection({ request: 'landing page', client, createId });

    expect(hero.source).toBe('builtin');
    expect(hero.warnings.join(' ')).toMatch(/quota exceeded/);
  });

  /** The quality gate: a decorative fragment is not a hero. */
  it('rejects a thin answer instead of putting it on the canvas', async () => {
    const hero = await generateHeroSection({
      request: 'landing page',
      client: fakeClient('```tsx\n<section className="py-24"><div /></section>\n```'),
      createId,
    });

    expect(hero.source).toBe('builtin');
    expect(hero.warnings.join(' ')).toMatch(/no headline/);
    expect(hero.code).toContain('<section');
  });

  it('rejects a headline with nothing to click', async () => {
    const hero = await generateHeroSection({
      request: 'landing page',
      client: fakeClient(
        '```tsx\n<section className="py-24"><div className="flex flex-col gap-4"><h1>Hello</h1><p>World</p><p>More</p><p>Even more</p></div></section>\n```',
      ),
      createId,
    });

    expect(hero.source).toBe('builtin');
    expect(hero.warnings.join(' ')).toMatch(/no call to action/);
  });

  it('picks a split hero as fallback when the request implies a product shot', async () => {
    const withShot = await generateHeroSection({
      request: 'dashboard do produto',
      client: null,
      createId,
    });
    const plain = await generateHeroSection({
      request: 'evento de música',
      client: null,
      createId,
    });

    // The split hero is the one with a visual slot beside the copy; it holds
    // no `image` node until someone drops a screenshot into it.
    expect(withShot.nodes.some((node) => node.name === 'Visual')).toBe(true);
    expect(plain.nodes.some((node) => node.name === 'Visual')).toBe(false);
  });
});

describe('heroSearchQuery', () => {
  it('shortens a request to a catalog query', () => {
    expect(heroSearchQuery('quero uma página de vendas para meu curso de fotografia')).toBe(
      'hero section vendas curso',
    );
    expect(heroSearchQuery('a landing page for our analytics product').split(' ')).toHaveLength(4);
  });
});

describe('importHeroSection', () => {
  it('returns an operation that applies cleanly', async () => {
    const document = createDocument({ name: 'test' });
    const result = await importHeroSection(document, { request: 'landing page' });

    const applied = applyOperations(document, [result.operation]).document;
    expect(validateDocumentIntegrity(applied).ok).toBe(true);
    expect(applied.nodes[document.pages[0]!.rootId]!.children[0]).toBe(result.rootId);
  });

  it('refuses an unknown page rather than guessing', async () => {
    const document = createDocument({ name: 'test' });
    await expect(importHeroSection(document, { request: 'x', pageId: 'nope' })).rejects.toThrow(
      /page not found/,
    );
  });
});

function flatten(spec: NodeSpec): NodeSpec[] {
  return [spec, ...(spec.children ?? []).flatMap(flatten)];
}
