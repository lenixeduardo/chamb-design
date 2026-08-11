import type { ComponentContribution } from '@opendesign/core';

/**
 * What kind of page the person asking is actually after.
 *
 * The list is short on purpose. An intent is only worth its own entry when it
 * changes the *section order* of the page — "SaaS" and "landing page" do, a
 * "fintech landing page" and a "devtool landing page" do not: those differ in
 * copy, which is a prop, not a template.
 */
export type TemplateIntent =
  'saas' | 'landing' | 'waitlist' | 'portfolio' | 'agency' | 'store' | 'app';

export interface TemplateSection {
  /** A component contribution id, e.g. `lib:hero-centered`. */
  block: string;
  props?: Record<string, unknown>;
  /**
   * Marks the above-the-fold section.
   *
   * Exactly one section per blueprint carries this flag, and it is the one an
   * external generator (21st.dev) is allowed to replace. Without the marker a
   * generated hero would have to be matched by block id, which breaks the
   * moment a blueprint picks a different hero variant.
   */
  hero?: boolean;
  /**
   * Wraps the block in a page section — full width, vertical rhythm, centred.
   *
   * The library contains both *sections* (a hero, a pricing table: they own
   * their padding) and *widgets* (a newsletter field, a contact form: 480px
   * wide, meant to sit inside something else). Dropping a widget straight onto
   * the page root leaves it flush against the viewport edge. This flag is how
   * a blueprint uses a widget as a section without forking the block.
   */
  wrap?: boolean;
  /**
   * `aside` places the block beside the rest of the page rather than above it.
   *
   * A dashboard is the case that needs it: a sidebar and the content column are
   * siblings in a row, not two stacked sections. Without this an app shell
   * renders as a nav list with the tables underneath it.
   */
  slot?: 'aside';
}

export interface TemplateBlueprint {
  id: string;
  name: string;
  /** Display grouping, matching `TemplateContribution['category']`. */
  category: string;
  intent: TemplateIntent;
  description: string;
  /**
   * Terms that make this blueprint the right answer to a request.
   *
   * Bilingual by design: requests arrive in whichever language the person
   * thinks in, and this project's users write in Portuguese as often as in
   * English. Multi-word entries are matched as phrases.
   */
  keywords: string[];
  meta: { title: string; description: string };
  sections: TemplateSection[];
  /**
   * A 16:9 preview image of the rendered page, e.g. `/images/templates/saas-template.png`.
   *
   * Optional: a blueprint without one falls back to the structural bar preview
   * (see `StructurePreview` in the template picker) rather than showing a hole.
   */
  thumbnail?: string;
}

export function heroSectionOf(blueprint: TemplateBlueprint): TemplateSection | undefined {
  return blueprint.sections.find((section) => section.hero);
}

export type ComponentLookup = (id: string) => ComponentContribution | undefined;

/** Accepts either a list or a lookup, so a registry and a plain array both work. */
export function toLookup(components: ComponentContribution[] | ComponentLookup): ComponentLookup {
  if (typeof components === 'function') return components;
  const index = new Map(components.map((component) => [component.id, component]));
  return (id) => index.get(id);
}

/** Every block a blueprint needs, in first-use order. */
export function requiredBlocks(blueprint: TemplateBlueprint): string[] {
  return [...new Set(blueprint.sections.map((section) => section.block))];
}

/**
 * Blocks a blueprint asks for that nothing has contributed.
 *
 * Worth checking before building: a blueprint referencing a block from a
 * plugin that is not installed should say so, rather than quietly produce a
 * page with a hole where the pricing table was.
 */
export function missingBlocks(
  blueprint: TemplateBlueprint,
  components: ComponentContribution[] | ComponentLookup,
): string[] {
  const lookup = toLookup(components);
  return requiredBlocks(blueprint).filter((id) => !lookup(id));
}
