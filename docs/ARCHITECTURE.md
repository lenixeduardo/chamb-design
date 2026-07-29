# Architecture

This document explains the decisions that shape the codebase, and the reasoning
behind them. Where a decision has a real cost, that cost is stated.

## The layer split

```
                    ┌───────────────────────────────┐
                    │        apps/web (Next.js)     │
                    │  canvas · panels · chat · UI  │
                    └───────┬───────────────┬───────┘
                            │               │
              ┌─────────────▼──────┐  ┌─────▼──────────────┐
              │ @opendesign/editor │  │ @opendesign/ai     │
              │ selection, tools,  │  │ providers, agent,  │
              │ viewport, commands │  │ review, context    │
              └─────────┬──────────┘  └─────┬──────────────┘
                        │                   │
                    ┌───▼───────────────────▼───┐
                    │    @opendesign/core       │
                    │ document · operations ·   │
                    │ history · plugin registry │
                    └───┬───────────────────┬───┘
                        │                   │
        ┌───────────────▼──┐   ┌────────────▼─────────┐
        │ @opendesign/     │   │ @opendesign/         │
        │ design-system    │   │ renderer, exporters, │
        │ tokens, compiler │   │ components           │
        └──────────────────┘   └──────────────────────┘
```

Dependencies point strictly downward. `core` depends on nothing but `zod`;
`renderer` depends on `core` and `design-system` but not on `editor`; `editor`
never imports `renderer`. If a change requires an upward import, that is a
signal the abstraction is in the wrong place.

## The document model

A document is a flat map of nodes, not a nested tree:

```ts
interface DesignDocument {
  nodes: Record<NodeId, SceneNode>; // flat
  pages: Page[]; // each points at a rootId
  tokens: TokenSet;
  themes: ThemeDef[];
  assets: Asset[];
  components: ComponentDef[];
}
```

**Why flat.** Any lookup is O(1), and any mutation touches a bounded number of
objects rather than rebuilding a path from the root. That is what makes undo,
streaming AI patches and (eventually) CRDT sync cheap. Structural sharing then
falls out for free: an immutable update copies the map and the two or three
nodes that changed.

**The cost.** Parent and children references must be kept consistent in both
directions, which is a real invariant that can be violated. It is enforced in
`validateDocumentIntegrity`, which the store runs on anything from an untrusted
source (imports, AI output, the API), and asserted in the operation tests.

**Why serializable.** No classes, no functions, no cycles. A document
round-trips through `JSON.stringify` losslessly, which is what lets it live in a
Postgres JSONB column, in `localStorage`, and in a prompt.

## Operations

Every mutation goes through an `Operation` — plain data with an inverse:

```ts
applyOperation(doc, op) -> { document, inverse: Operation[] }
```

This buys four things from one mechanism:

1. **Undo/redo without snapshots.** Each op yields its own inverse, so history
   is a list of small deltas rather than a stack of full documents.
2. **AI edits as data.** The model returns operations; they are schema-checked,
   dry-run, reviewed, and only then applied. A model that returns code can only
   be trusted or discarded.
3. **An audit log** that can be replayed, diffed and branched.
4. **A wire format** for collaboration — clients send ops, the server replays
   them against the authoritative copy instead of last-write-wins on documents.

Batches are atomic. `DocumentStore.transact` applies the whole list or none of
it: a half-applied AI patch is worse than a rejected one.

### Coalescing

Dragging a slider produces one operation per pixel. `History.push` merges
consecutive commits that share a `mergeKey` inside a short window, so one
gesture is one undo step. This is why `editor.setStyle` takes a `mergeKey`.

## Style and tokens

`StyleMap` is a curated subset of CSS — the properties that map cleanly onto
Tailwind utilities, onto visual controls, and onto every export target. Anything
outside it goes through `className` or raw CSS strings, which exporters pass
through untouched.

Values are token references wherever possible: `"{color.accent}"`,
`"{spacing.6}"`. The design system compiles those two ways:

| Compiler               | Output                            | Used by                     |
| ---------------------- | --------------------------------- | --------------------------- |
| `styleToClasses`       | `bg-accent gap-6 rounded-xl`      | exports, published pages    |
| `styleToCssProperties` | `background: var(--color-accent)` | the canvas, the HTML target |

**Why two.** The canvas renders class names that come from the user's document
at runtime — names Tailwind's compiler has never seen, and for which it emits no
CSS. So the canvas compiles to real CSS instead. Both start from the same
`StyleMap`, so they agree on what a style _means_; they only disagree on how to
spell it. The HTML export target uses the CSS compiler for a different reason:
it ships with zero dependencies and no build step.

The token namespaces are chosen to line up with Tailwind v4's `@theme`
conventions — `color.*` → `--color-*` (generating `bg-*`, `text-*`, `border-*`),
`size.*` → `--text-*` (generating `text-lg`). That alignment is why exported
markup reads `bg-card` rather than `bg-[#111113]`.

## Renderer / editor separation

The renderer takes a document and produces DOM. It has no concept of selection,
hover, drag handles or tools. Every element carries `data-od-id`, and the editor
attaches behaviour by delegation and `getBoundingClientRect`.

The payoff: the canvas, the published site and the SSR preview are the same
component, so they cannot drift. The cost: selection geometry depends on the DOM
having been laid out, so measurement is a `ResizeObserver` pass rather than
something computed from the model. That is the right trade — auto-layout means
the model does not know final positions anyway.

## The AI layer

```
prompt + document
    │
    ├─ build context      compact outline, ~20x smaller than raw JSON
    ├─ stream response    provider-agnostic, fetch only, no SDKs
    ├─ extract JSON       tolerant: fences, prose, trailing commas
    ├─ validate           zod schemas from core
    ├─ dry-run            applied to a copy; integrity checked
    ├─ review             contrast, alt text, tap targets, fixed widths
    └─ repair             failures fed back, bounded retries
```

**Context, not JSON.** Serializing a document as JSON produces tens of thousands
of tokens of mostly-noise, and models lose the plot inside it. `serializeTree`
emits an indented outline with ids, types, names and the style properties that
carry design intent. Smaller _and_ more accurate, because every line is signal.

**Providers are `fetch`.** No vendor SDKs. The package has zero runtime
dependencies beyond the workspace, runs on edge runtimes, and adding a provider
is one file. Five providers share one adapter because they all speak the OpenAI
chat-completions shape; Anthropic and Google differ enough to warrant their own.

**Review is mechanical.** Models are good at layout and bad at contrast ratios
and alt text. Checking that in code is more reliable than asking the model to be
careful, and costs one tree walk instead of a round trip.

## Plugins

The registry holds seven kinds of contribution: components, exporters, AI
providers, templates, commands, panels and integrations.

The rule that keeps the API honest: **first-party features get no privileged
path.** The 23 built-in blocks, all six export targets and all seven model
providers register through `PluginRegistry.register` exactly as a third-party
plugin does. `plugins/plugin-charts` tests this directly — if a community
plugin could not do what the built-in library does, the plugin API would be
decorative.

## Persistence

Local-first by default: documents live in `localStorage` with debounced
autosave and a flush on `pagehide`. The server is optional and additive.

Server-side, documents are stored as JSONB rather than shredded into tables.
Normalising a node tree into rows would duplicate the operation system in SQL
and turn every read into a join-heavy reconstruction. Every mutation is also
appended to a `Commit` row with its inverse, so history survives a client going
offline and reconnecting with a divergent copy.

## What is deliberately not done

Being explicit about this matters more than a longer feature list:

- **Realtime multiplayer** — the operation format is designed for it and the
  schema has the tables, but there is no CRDT or presence layer yet.
- **Direct manipulation on canvas** — selection and measurement are in place;
  drag-to-move and drag-to-resize on the canvas are not wired to pointer events
  yet. Geometry (`snapRect`, `resizeRect`, `alignRects`) is implemented and
  tested, so this is wiring rather than design.
- **Deploy integrations** — `IntegrationContribution` exists as a contribution
  point; no provider implements it.
- **Figma import** — the AI import mode handles screenshots and HTML. A Figma
  file parser is not written.

See [ROADMAP.md](ROADMAP.md).
