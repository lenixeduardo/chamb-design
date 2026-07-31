import { definePlugin, type ComponentContribution, type OpenDesignPlugin } from '@opendesign/core';
import { avatar, badge, button, card, statTile } from './blocks/primitives.js';
import {
  ctaBanner,
  featureGrid,
  heroCentered,
  heroSplit,
  logoCloud,
  testimonials,
} from './blocks/marketing.js';
import { appSidebar, footer, navbar } from './blocks/navigation.js';
import { faqSection, pricingTable } from './blocks/conversion.js';
import { authForm, contactForm, newsletterForm } from './blocks/forms.js';
import { chartCard, crmPipeline, dataTable, statGrid } from './blocks/application.js';

export * from './builder.js';

/** Every block shipped in the box, in library display order. */
export const BUILTIN_COMPONENTS: ComponentContribution[] = [
  // Buttons & atoms
  button,
  badge,
  avatar,
  card,
  statTile,
  // Hero
  heroCentered,
  heroSplit,
  // Landing pages
  featureGrid,
  testimonials,
  logoCloud,
  ctaBanner,
  // Navigation
  navbar,
  footer,
  appSidebar,
  // Conversion
  pricingTable,
  faqSection,
  // Forms
  contactForm,
  authForm,
  newsletterForm,
  // Application
  statGrid,
  dataTable,
  chartCard,
  crmPipeline,
];

/**
 * The built-in library is a plugin like any other.
 *
 * Nothing here uses a private hook — if a third-party pack can't do what this
 * one does, the plugin API is missing something and that is the bug to fix.
 */
export const componentsPlugin: OpenDesignPlugin = definePlugin({
  id: 'opendesign.components',
  name: 'Charm-Design component library',
  version: '0.1.0',
  description: 'Buttons, heroes, pricing, FAQ, forms, dashboards, charts and CRM blocks.',
  activate(context) {
    for (const component of BUILTIN_COMPONENTS) {
      context.registerComponent(component);
    }
  },
});

export {
  avatar,
  badge,
  button,
  card,
  statTile,
  heroCentered,
  heroSplit,
  featureGrid,
  testimonials,
  logoCloud,
  ctaBanner,
  navbar,
  footer,
  appSidebar,
  pricingTable,
  faqSection,
  contactForm,
  authForm,
  newsletterForm,
  statGrid,
  dataTable,
  chartCard,
  crmPipeline,
};
