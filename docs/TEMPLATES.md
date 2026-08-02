# Templates

A request in plain language, a whole document out. "Uma landing page para um
SaaS de gestão financeira" resolves to a blueprint, the blueprint builds a page
out of registered blocks, and the hero can come from
[21st.dev](MCP_21ST.md) instead of the library.

Templates live in [`packages/templates`](../packages/templates) and register
through `registerTemplate`, the same contribution point a third-party template
pack uses.

## What a blueprint is

A **section order plus copy** — not a document, and not code:

```ts
{
  id: 'tpl:saas',
  name: 'SaaS',
  category: 'Templates',
  intent: 'saas',
  description: 'Página de produto completa: prova social, funcionalidades, métricas, planos e FAQ.',
  keywords: ['saas', 'assinatura', 'subscription', 'planos', 'pricing', 'b2b', /* … */],
  meta: { title: '…', description: '…' },
  sections: [
    { block: 'lib:navbar', props: { cta: 'Testar grátis' } },
    { block: 'lib:hero-split', hero: true, props: { title: '…' } },
    { block: 'lib:pricing-table' },
    // …
  ],
}
```

Blocks are named by contribution id, so a blueprint inherits whatever the
registry currently offers: install a brand plugin and every template rethemes,
install a component pack and a blueprint can reference it. Exactly one section
carries `hero: true` — that is the slot an external generator may replace.

The seven that ship: `tpl:saas`, `tpl:landing`, `tpl:waitlist`,
`tpl:portfolio`, `tpl:agency`, `tpl:store`, `tpl:app`.

Two more flags exist, and both were added because the generated examples showed
the page was wrong without them:

- **`wrap: true`** — the library holds _sections_ (a hero, a pricing table: they
  own their padding) and _widgets_ (a newsletter field, a contact form: 480px
  wide, meant to sit inside something else). A widget placed straight on the
  page root sits flush against the viewport edge. `wrap` puts it in a padded,
  centred section without forking the block.
- **`slot: 'aside'`** — the block goes _beside_ the rest of the page rather than
  above it. `tpl:app` needs it: a dashboard is a sidebar and a content column
  side by side, and without it an app shell renders as a nav list with the
  tables underneath.

## Examples

One exported page per template lives in
[`examples/templates`](../examples/templates), with screenshots in
[`docs/screenshots/templates`](screenshots/templates). They are generated, not
written:

```bash
pnpm build && node scripts/generate-template-examples.mjs
```

Node ids come from a seeded RNG, so regenerating an unchanged template produces
a byte-identical file — a diff there is a real change in a blueprint, a block or
the style compiler. The last example is the SaaS blueprint with its hero
converted from a recorded 21st.dev answer, so the conversion is visible without
an API key.

## Imagery

A template with no pictures reads as a wireframe, so every blueprint that
should show something does. The images are **inline SVG data URIs generated
from the project's own tokens** — `screenshotPlaceholder`, `photoPlaceholder`
and `avatarPlaceholder` in
[`packages/components`](../packages/components/src/placeholders.ts):

- `lib:hero-split` fills its visual slot by default, and takes `visual:
'screenshot' | 'photo'` so a page selling a jacket does not open on a
  dashboard mock.
- `lib:gallery` is a new block whose subject _is_ a picture — work samples,
  product shots, a case wall. Each tile is seeded by its caption, so six of them
  are six different arrangements rather than one tile repeated.
- `lib:testimonials` gives each quote an initials portrait.

Why generated rather than stock photography: they render offline (a document
stays one portable JSON file, the same promise the asset pipeline makes for
dropped images), they retheme with the project, and they read as placeholders —
where a photograph of a real office reads as content someone forgot to replace.
Pass a real `image` prop and it wins.

Images coming _from_ 21st.dev are kept as they arrive, remote URL and all; see
[the MCP doc](MCP_21ST.md).

## Matching a request

```ts
import { resolveTemplate, suggestTemplates, matchTemplates } from '@opendesign/templates';

resolveTemplate('quero um saas de gestão financeira com planos'); // tpl:saas
resolveTemplate('meu portfólio de designer'); // tpl:portfolio
suggestTemplates('landing page de produto', 3); // ranked, with the terms that fired
```

Matching is a scorer, not a model call, and that is deliberate:

- It runs offline, instantly, with no API key. Picking a page shape is the one
  step that must not depend on a network.
- It is deterministic. The same sentence produces the same page twice, which is
  what makes the picker's "sugerido" label honest.
- The model's job starts _after_ the sections are on the canvas, when there is
  something concrete to edit.

Requests are normalised (accents stripped, casing folded, crude
singularisation), keywords are bilingual, and a phrase (`landing page`) scores
above a bare word so it beats the "page" hiding in every request ever typed.
Nothing matching falls back to `tpl:landing` — the shortest blueprint that still
says something complete.

## Building a document

```ts
import { buildTemplate, buildTemplateFromRequest } from '@opendesign/templates';

const { document, skipped, heroReplaced } = buildTemplate(blueprint, {
  components: registry.getComponents(),
  tokens: chambTokens(),
  themes: chambThemes(),
  activeThemeId: 'chamb-light',
  hero: { nodes, rootId }, // optional: replaces the `hero: true` section
});
```

The result is a full `DesignDocument` — tokens, themes and page meta included —
because that is what a template is here: opening one rethemes the whole project
rather than pasting sections into someone else's palette.

A block a blueprint asks for and nobody contributed is **skipped**, and named in
`skipped`. Losing one section beats losing the page; pass
`onMissingBlock: 'throw'` when a caller would rather hear about it. There is a
test asserting every shipped blueprint only references blocks the built-in
library actually contributes, and another asserting every prop it passes is one
the block declares — both silent failures otherwise.

## In the app

**Começar por um modelo**, on the workspace screen, is the whole flow in one
dialog: describe the thing, see which template that resolves to, optionally
switch the hero to 21st.dev, create. The document is assembled in the browser —
only the hero makes a round trip.

## Adding a template

Contribute it from any plugin:

```ts
context.registerTemplate({
  id: 'acme:changelog',
  name: 'Changelog',
  category: 'Templates',
  build: () => buildTemplate(myBlueprint, { components: BUILTIN_COMPONENTS }).document,
});
```

Keep the keyword list bilingual, mark exactly one hero section, and only
reference blocks your plugin either ships or depends on.
