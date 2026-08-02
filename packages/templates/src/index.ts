import { definePlugin, type OpenDesignPlugin } from '@opendesign/core';
import { BUILTIN_COMPONENTS } from '@opendesign/components';
import { TEMPLATE_BLUEPRINTS } from './catalog.js';
import { buildTemplate } from './build.js';

export * from './blueprint.js';
export * from './catalog.js';
export * from './match.js';
export * from './build.js';

/**
 * The model templates, contributed like anything else.
 *
 * `registerTemplate` has been in the plugin API since day one with nothing
 * using it but the brand starter; this pack is what makes it earn its place —
 * and a third-party template pack now has a first-party example to copy.
 */
export const templatesPlugin: OpenDesignPlugin = definePlugin({
  id: 'opendesign.templates',
  name: 'Charm-Design model templates',
  version: '0.1.0',
  description: 'SaaS, landing page, waitlist, portfolio, agency, store and dashboard blueprints.',
  activate(context) {
    for (const blueprint of TEMPLATE_BLUEPRINTS) {
      context.registerTemplate({
        id: blueprint.id,
        name: blueprint.name,
        category: blueprint.category,
        build: () => buildTemplate(blueprint, { components: BUILTIN_COMPONENTS }).document,
      });
    }

    context.log(`registered ${TEMPLATE_BLUEPRINTS.length} model templates`);
  },
});

export default templatesPlugin;
