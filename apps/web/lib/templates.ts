'use client';

import type { DesignDocument, SceneNode } from '@opendesign/core';
import { chambThemes, chambTokens } from '@opendesign/plugin-chamb-brand';
import {
  TEMPLATE_BLUEPRINTS,
  buildTemplate,
  resolveTemplate,
  suggestTemplates,
  type TemplateBlueprint,
  type TemplateMatch,
} from '@opendesign/templates';
import { getRegistry } from '@/lib/registry';
import { getCredential } from '@/lib/settings';
import { saveProject } from '@/lib/projects';

/**
 * Templates, from the browser.
 *
 * The document is assembled here rather than on the server for the same reason
 * projects are stored here: a template is not a network feature. Only the hero
 * makes a round trip, and only when the user asked for a generated one — so
 * the flow works offline, with no key, on a self-hosted instance with no
 * outbound access.
 */

export const TWENTY_FIRST_CREDENTIAL = '21st';

export interface HeroResult {
  nodes: SceneNode[];
  rootId: string;
  source: '21st.dev' | 'builtin';
  warnings: string[];
  tool?: string;
}

export interface CreateFromTemplateInput {
  /** What the user typed. Used to pick the template and to brief 21st.dev. */
  request: string;
  /** An explicit choice from the picker; otherwise the request decides. */
  blueprintId?: string;
  name?: string;
  folder?: string;
  /** Off means the blueprint's own hero block is used, with no network call. */
  generateHero?: boolean;
}

export interface CreateFromTemplateResult {
  document: DesignDocument;
  blueprint: TemplateBlueprint;
  hero: HeroResult | null;
  /** Reasons the result differs from what was asked for, in plain language. */
  notes: string[];
}

export function listBlueprints(): TemplateBlueprint[] {
  return TEMPLATE_BLUEPRINTS;
}

export function suggestForRequest(request: string, limit = 3): TemplateMatch[] {
  return suggestTemplates(request, limit);
}

/** Whether the deployment has its own key, so the UI can stop asking for one. */
export async function heroGenerationAvailable(): Promise<boolean> {
  if (getCredential(TWENTY_FIRST_CREDENTIAL)?.apiKey) return true;
  try {
    const response = await fetch('/api/mcp');
    const data = (await response.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export async function generateHero(request: string): Promise<HeroResult> {
  const apiKey = getCredential(TWENTY_FIRST_CREDENTIAL)?.apiKey;

  const response = await fetch('/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-od-21st-key': apiKey } : {}),
    },
    body: JSON.stringify({ request }),
  });

  const data = (await response.json()) as { hero?: HeroResult; error?: string };
  if (!response.ok || !data.hero) {
    throw new Error(data.error ?? 'não foi possível gerar a hero');
  }

  return data.hero;
}

export async function createProjectFromTemplate(
  input: CreateFromTemplateInput,
): Promise<CreateFromTemplateResult> {
  const blueprint =
    (input.blueprintId
      ? TEMPLATE_BLUEPRINTS.find((candidate) => candidate.id === input.blueprintId)
      : undefined) ?? resolveTemplate(input.request);

  const notes: string[] = [];
  let hero: HeroResult | null = null;

  if (input.generateHero) {
    try {
      hero = await generateHero(input.request || blueprint.description);
      if (hero.source === 'builtin') {
        notes.push('A hero veio do bloco padrão — o 21st.dev não pôde ser usado desta vez.');
      }
    } catch (error) {
      // A failed generation must not cost the user the project: the blueprint
      // still has a hero of its own, and it is the one they would have got by
      // leaving the switch off.
      notes.push(
        `A geração pelo 21st.dev falhou (${error instanceof Error ? error.message : String(error)}); usamos a hero padrão do modelo.`,
      );
    }
  }

  const registry = await getRegistry();

  const { document, skipped } = buildTemplate(blueprint, {
    components: registry.getComponents(),
    name: input.name?.trim() || blueprint.name,
    tokens: chambTokens(),
    themes: chambThemes(),
    activeThemeId: 'chamb-light',
    ...(hero && hero.source === '21st.dev'
      ? { hero: { nodes: hero.nodes, rootId: hero.rootId } }
      : {}),
  });

  if (skipped.length > 0) {
    notes.push(`Alguns blocos não estão instalados e foram pulados: ${skipped.join(', ')}.`);
  }

  // Core names the root frame in English; the layers panel is interface, so it
  // is translated at the same seam `createProject` translates it.
  const rootId = document.pages[0]!.rootId;
  const root = document.nodes[rootId]!;
  const named: DesignDocument = {
    ...document,
    nodes: { ...document.nodes, [rootId]: { ...root, name: 'Página' } },
  };

  saveProject(named, input.folder);
  return { document: named, blueprint, hero, notes };
}
