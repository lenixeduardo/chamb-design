import { DEFAULT_BLUEPRINT_ID, TEMPLATE_BLUEPRINTS, getBlueprint } from './catalog.js';
import type { TemplateBlueprint } from './blueprint.js';

/**
 * Turning a request into a template.
 *
 * This is deliberately a scorer and not a model call. Picking the page shape
 * is the one step that has to work offline, instantly, and identically every
 * time — the model's job starts *after* the sections are on the canvas, when
 * there is something concrete to edit. It also means a request typed with no
 * API key configured still produces a real page.
 */

export interface TemplateMatch {
  blueprint: TemplateBlueprint;
  score: number;
  /** Which keywords fired, so the UI can explain the choice. */
  matched: string[];
}

/** Lowercase, unaccented, punctuation collapsed to single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Crude singularisation, enough for `planos` -> `plano` and `apps` -> `app`. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function matchTemplates(
  request: string,
  blueprints: TemplateBlueprint[] = TEMPLATE_BLUEPRINTS,
): TemplateMatch[] {
  const normalized = normalize(request);
  if (!normalized) return [];

  const words = new Set(normalized.split(' ').map(stem));

  const matches = blueprints.map((blueprint) => {
    const matched: string[] = [];
    let score = 0;

    const award = (points: number, term: string) => {
      score += points;
      if (!matched.includes(term)) matched.push(term);
    };

    // The template's own name and intent count as keywords: someone who types
    // "portfolio" should not depend on that word also being in the list.
    for (const term of [blueprint.name, blueprint.intent]) {
      const normalizedTerm = normalize(term);
      if (normalizedTerm && words.has(stem(normalizedTerm))) award(3, normalizedTerm);
    }

    for (const keyword of blueprint.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (!normalizedKeyword) continue;

      if (normalizedKeyword.includes(' ')) {
        // A phrase is a stronger signal than a word — "landing page" should
        // beat the "page" that appears in half the requests ever written.
        if (normalized.includes(normalizedKeyword)) award(4, normalizedKeyword);
        continue;
      }

      if (words.has(stem(normalizedKeyword))) award(2, normalizedKeyword);
      else if (normalizedKeyword.length > 4 && normalized.includes(normalizedKeyword)) {
        // Catches compounds the tokenizer split apart, e.g. `e-commerce`.
        award(1, normalizedKeyword);
      }
    }

    return { blueprint, score, matched };
  });

  return matches
    .filter((match) => match.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || blueprints.indexOf(a.blueprint) - blueprints.indexOf(b.blueprint),
    );
}

/** The best match, or the default blueprint when nothing scored. */
export function resolveTemplate(
  request: string,
  blueprints: TemplateBlueprint[] = TEMPLATE_BLUEPRINTS,
): TemplateBlueprint {
  const best = matchTemplates(request, blueprints)[0];
  if (best) return best.blueprint;

  return getBlueprint(DEFAULT_BLUEPRINT_ID) ?? blueprints[0] ?? TEMPLATE_BLUEPRINTS[0]!;
}

/** Ranked alternatives for a picker, always including the resolved one. */
export function suggestTemplates(
  request: string,
  limit = 3,
  blueprints: TemplateBlueprint[] = TEMPLATE_BLUEPRINTS,
): TemplateMatch[] {
  const matches = matchTemplates(request, blueprints).slice(0, limit);
  if (matches.length > 0) return matches;
  return [{ blueprint: resolveTemplate(request, blueprints), score: 0, matched: [] }];
}
