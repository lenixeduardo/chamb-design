import { describe, expect, it } from 'vitest';
import { BUILTIN_COMPONENTS } from '@opendesign/components';
import { PluginRegistry, createId, validateDocumentIntegrity } from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import {
  TEMPLATE_BLUEPRINTS,
  buildTemplate,
  buildTemplateFromRequest,
  heroSectionOf,
  matchTemplates,
  missingBlocks,
  resolveTemplate,
  suggestTemplates,
  templatesPlugin,
} from '../index.js';

describe('blueprint catalog', () => {
  it('has a unique id per blueprint', () => {
    const ids = TEMPLATE_BLUEPRINTS.map((blueprint) => blueprint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks exactly one hero section per blueprint', () => {
    for (const blueprint of TEMPLATE_BLUEPRINTS) {
      const heroes = blueprint.sections.filter((section) => section.hero);
      expect(heroes, blueprint.id).toHaveLength(1);
      expect(heroSectionOf(blueprint)).toBe(heroes[0]);
    }
  });

  /**
   * A blueprint naming a block nobody ships is a page with a hole in it, and
   * nothing else would catch it: `buildTemplate` skips silently on purpose.
   */
  it('only references blocks the built-in library actually contributes', () => {
    for (const blueprint of TEMPLATE_BLUEPRINTS) {
      expect(missingBlocks(blueprint, BUILTIN_COMPONENTS), blueprint.id).toEqual([]);
    }
  });

  it('only passes props the referenced block declares', () => {
    const index = new Map(BUILTIN_COMPONENTS.map((component) => [component.id, component]));

    for (const blueprint of TEMPLATE_BLUEPRINTS) {
      for (const section of blueprint.sections) {
        const declared = new Set(index.get(section.block)!.props.map((prop) => prop.name));
        for (const name of Object.keys(section.props ?? {})) {
          expect(declared.has(name), `${blueprint.id} -> ${section.block}.${name}`).toBe(true);
        }
      }
    }
  });
});

describe('matching a request', () => {
  it.each([
    ['quero um saas de gestão financeira com planos', 'tpl:saas'],
    ['a landing page for our launch', 'tpl:landing'],
    ['página de lista de espera para o beta', 'tpl:waitlist'],
    ['meu portfólio de designer', 'tpl:portfolio'],
    ['site para a agência de publicidade', 'tpl:agency'],
    ['loja para vender minha camiseta', 'tpl:store'],
    ['um dashboard interno de métricas', 'tpl:app'],
  ])('resolves %j to %s', (request, expected) => {
    expect(resolveTemplate(request).id).toBe(expected);
  });

  it('ignores accents and casing', () => {
    expect(resolveTemplate('PORTFOLIO pessoal').id).toBe('tpl:portfolio');
    expect(resolveTemplate('portfólio pessoal').id).toBe('tpl:portfolio');
  });

  /** "landing page" must outrank the bare "page" hiding in every request. */
  it('scores a phrase above a single word', () => {
    const matches = matchTemplates('landing page de produto');
    expect(matches[0]?.blueprint.id).toBe('tpl:landing');
    expect(matches[0]?.matched).toContain('landing page');
  });

  it('falls back to a landing page when nothing matches', () => {
    expect(matchTemplates('xyzzy')).toEqual([]);
    expect(resolveTemplate('xyzzy').id).toBe('tpl:landing');
  });

  it('always suggests something, matched or not', () => {
    expect(suggestTemplates('xyzzy')).toHaveLength(1);
    expect(suggestTemplates('saas com planos e dashboard', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('building a document', () => {
  it('produces a valid document with one section per blueprint entry', () => {
    for (const blueprint of TEMPLATE_BLUEPRINTS) {
      const { document, skipped } = buildTemplate(blueprint, { components: BUILTIN_COMPONENTS });

      expect(skipped, blueprint.id).toEqual([]);
      expect(validateDocumentIntegrity(document).ok, blueprint.id).toBe(true);

      const root = document.nodes[document.pages[0]!.rootId]!;
      expect(root.children, blueprint.id).toHaveLength(blueprint.sections.length);
    }
  });

  it('carries the blueprint meta onto the page', () => {
    const { document, blueprint } = buildTemplateFromRequest('preciso de um saas', {
      components: BUILTIN_COMPONENTS,
    });

    expect(blueprint.id).toBe('tpl:saas');
    expect(document.pages[0]?.meta?.title).toBe(blueprint.meta.title);
  });

  it('skips an unknown block instead of losing the whole page', () => {
    const blueprint = {
      ...TEMPLATE_BLUEPRINTS[0]!,
      sections: [{ block: 'lib:navbar' }, { block: 'nope:missing', hero: true }],
    };

    const { document, skipped } = buildTemplate(blueprint, { components: BUILTIN_COMPONENTS });
    expect(skipped).toEqual(['nope:missing']);
    expect(document.nodes[document.pages[0]!.rootId]!.children).toHaveLength(1);
  });

  it('can be told to refuse instead', () => {
    const blueprint = {
      ...TEMPLATE_BLUEPRINTS[0]!,
      sections: [{ block: 'nope:missing', hero: true }],
    };

    expect(() =>
      buildTemplate(blueprint, { components: BUILTIN_COMPONENTS, onMissingBlock: 'throw' }),
    ).toThrow(/nope:missing/);
  });

  /**
   * The seam the 21st.dev integration writes into. The generated subtree has
   * to land in the hero's slot — not appended at the end, and not in addition
   * to the blueprint's own hero.
   */
  it('substitutes a provided hero in place', () => {
    const blueprint = TEMPLATE_BLUEPRINTS.find((entry) => entry.id === 'tpl:saas')!;
    const heroIndex = blueprint.sections.findIndex((section) => section.hero);
    const rootId = createId();

    const { document, heroReplaced } = buildTemplate(blueprint, {
      components: BUILTIN_COMPONENTS,
      hero: {
        rootId,
        nodes: [
          {
            id: rootId,
            type: 'frame',
            name: 'Hero 21st',
            parent: null,
            children: [],
            props: {},
            style: {},
          },
        ],
      },
    });

    expect(heroReplaced).toBe(true);
    expect(validateDocumentIntegrity(document).ok).toBe(true);

    const children = document.nodes[document.pages[0]!.rootId]!.children;
    expect(children).toHaveLength(blueprint.sections.length);
    expect(document.nodes[children[heroIndex]!]!.name).toBe('Hero 21st');
  });
});

describe('the plugin', () => {
  it('contributes every blueprint through the public API', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, templatesPlugin]);

    const templates = registry.getTemplates();
    expect(templates.map((template) => template.id).sort()).toEqual(
      TEMPLATE_BLUEPRINTS.map((blueprint) => blueprint.id).sort(),
    );

    const document = templates[0]!.build();
    expect(validateDocumentIntegrity(document).ok).toBe(true);
  });
});
