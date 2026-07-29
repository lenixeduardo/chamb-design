# Writing plugins

Everything OpenDesign ships is a plugin. The block library, the six export
targets and the seven model providers all register through the API below —
there is no privileged internal path, which is the only way to be sure the API
is actually sufficient.

## Shape

```ts
import { definePlugin } from '@opendesign/core';

export default definePlugin({
  id: 'acme.brand-kit', // globally unique, reverse-DNS style
  name: 'Acme brand kit',
  version: '1.0.0',
  description: 'Acme blocks and brand tokens.',
  dependencies: [], // plugin ids that must be active first

  activate(context) {
    context.registerComponent(/* … */);
  },

  deactivate() {
    // Optional. Contributions are removed automatically.
  },
});
```

Registering is async and ordered: dependencies must already be active, and a
duplicate contribution id fails loudly, naming the plugin that already claimed
it.

## Contribution points

| Method                | Adds                                                  |
| --------------------- | ----------------------------------------------------- |
| `registerComponent`   | A block in the library, insertable and AI-addressable |
| `registerExporter`    | An export target                                      |
| `registerAIProvider`  | A model provider in the picker                        |
| `registerTemplate`    | A starter project                                     |
| `registerCommand`     | An entry in the ⌘K palette                            |
| `registerPanel`       | A panel in the left/right/bottom docks                |
| `registerIntegration` | A deploy, storage, import or analytics hook           |

## A component

Blocks produce **document nodes**, not React. That is what lets one definition
render on the canvas, survive undo, be edited by hand afterwards, and export to
all six targets without the plugin knowing any of them exist.

```ts
import { buildTree, color, column, pad, radius } from '@opendesign/components';
import type { ComponentContribution } from '@opendesign/core';

export const calloutBlock: ComponentContribution = {
  id: 'acme:callout',
  name: 'Callout',
  category: 'Cards',
  keywords: ['note', 'admonition'],
  props: [{ name: 'text', type: 'string', defaultValue: 'Heads up.' }],

  create: ({ createId, props }) =>
    buildTree(
      {
        type: 'frame',
        name: 'Callout',
        style: {
          ...column(2),
          padding: pad(4),
          radius: radius('lg'),
          background: color('muted'),
          border: { width: 1, style: 'solid', color: color('border') },
        },
        children: [
          {
            type: 'text',
            name: 'Body',
            props: { text: (props?.text as string) ?? 'Heads up.' },
            style: { color: color('foreground'), font: { size: '{size.sm}' } },
          },
        ],
      },
      createId,
    ),
};
```

Two rules make a block behave well:

1. **Use tokens, not literals.** `color('accent')` rather than `#6366f1`, so the
   block adapts when a project retheme.
2. **Mobile-first.** Put the narrow layout in `style` and widen it in
   `responsive`. The cascade is the same as Tailwind's.

`buildTree` handles the part that is easy to get wrong: allocating ids and
wiring `parent`/`children` in both directions. Nodes must come out with parents
before children — it guarantees that.

## An exporter

```ts
import type { ExporterContribution } from '@opendesign/core';
import { serializeElement, splitSections } from '@opendesign/exporters';

export const myExporter: ExporterContribution = {
  id: 'my-framework',
  label: 'My framework',
  generate(document) {
    const { shell, sections } = splitSections(document, document.pages[0].rootId, {
      omitHidden: true,
    });
    return [{ path: 'index.tsx', contents: serializeElement(shell!, { dialect: 'jsx' }) }];
  },
};
```

`splitSections` cuts a page into a shell plus one component per top-level frame,
named from the layer name — because a 900-line page component is technically
correct and practically useless. `serializeElement` takes a dialect (`jsx`,
`html`, `vue`, `svelte`, `astro`) that decides `className` vs `class`, whether
void elements self-close, and how text is escaped.

See [`plugins/plugin-exporter-solid`](../plugins/plugin-exporter-solid) for a
complete target in about 90 lines.

## A model provider

If the API speaks the OpenAI chat-completions shape, it is a base URL:

```ts
import { createOpenAICompatibleProvider } from '@opendesign/ai';

export const provider = createOpenAICompatibleProvider({
  id: 'acme',
  label: 'Acme',
  defaultBaseUrl: 'https://api.acme.ai/v1',
  models: [{ id: 'acme-1', label: 'Acme 1', contextWindow: 128000 }],
});
```

If it does not, implement `ChatProvider` directly. The only required method is
`stream()`, which returns an async iterable of `{ delta, done, usage? }`. Use
`parseSSE` for the byte-level framing; it buffers across chunk boundaries, which
matters because JSON payloads are routinely split mid-object.

See [AI_PROVIDERS.md](AI_PROVIDERS.md) for the full contract.

## Installing

```ts
import { getRegistry } from '@/lib/registry';
import brandKit from '@acme/opendesign-brand-kit';

await (await getRegistry()).register(brandKit);
```

## Testing

Test against the published API only. If a test needs an internal import, that is
a gap in the plugin API and worth reporting as a bug.

[`plugins/plugin-charts/src/__tests__`](../plugins/plugin-charts/src/__tests__/plugin.test.ts)
is the reference: it checks registration alongside the built-in library, id
collision handling, clean unregistration, dependency enforcement, and that every
block inserts into a document that still passes integrity validation.
