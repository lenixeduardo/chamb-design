# Charm-Design

An open source, AI-first platform for designing interfaces — a visual canvas, a
real design system, and clean code on the way out. MIT licensed and
self-hostable, with a plugin API that the built-in features themselves use.

> Status: **early**. The document model, editor, block library, exporters and AI
> layer are implemented and tested. Realtime collaboration and one-click deploy
> are scaffolded but not finished — see [the roadmap](docs/ROADMAP.md).

---

## The idea in one paragraph

Most AI design tools return code. Code is hard to trust, impossible to diff
meaningfully, and can only be accepted or thrown away. Charm-Design's model
returns **document operations** instead: `insertSubtree`, `updateStyle`,
`moveNode`. Every AI edit is validated against a schema, dry-run on a copy of
the document, checked by an automated design review, and only then applied —
into the same undo stack as your own edits. That single decision is what makes
the AI a collaborator rather than a slot machine.

## What is here

```
apps/
  web            Next.js editor: canvas, layers, inspector, library, AI chat, export
  api            Optional NestJS + Prisma server for sync, history and collaboration
packages/
  core           Document model, operations, history, plugin registry, geometry
  design-system  Tokens, themes, and the style compiler (Tailwind + plain CSS)
  renderer       Pure React renderer — knows nothing about the editor
  components     23 blocks, contributed through the public plugin API
  templates      SaaS, landing, waitlist, portfolio, agency, store, dashboard
  mcp            MCP client + the 21st.dev integration for hero sections
  exporters      React, Next.js, HTML, Vue, Svelte, Astro
  editor         Headless editor state: selection, viewport, tools, commands
  ai             Claude, GPT, Gemini, DeepSeek, OpenRouter, Ollama, LM Studio
                 plus image generation: gpt-image, Imagen, local servers
  assets         Ingestion: storage adapters, image probing, asset operations
plugins/
  plugin-charts             Example component pack
  plugin-exporter-solid     Example export target
  plugin-provider-mistral   Example model provider
  plugin-chamb-brand        The chamb-design brand: theme, blocks, template
  plugin-remotion           Video export (Remotion is separately licensed)
```

## Quick start

```bash
pnpm install
pnpm build
pnpm --filter @opendesign/web dev
```

Open <http://localhost:3000>. Projects are stored in your browser — no account,
no server, nothing leaves your machine until you connect a cloud model.

To use a hosted model, open **Settings** and paste your own API key. It is kept
in that browser (with a switch to forget it when the tab closes), sent only to
the provider you picked, and never stored on a server — so a deployed instance
is usable by anyone who has a key of their own.

A deployment that would rather supply its own key can set one before starting
the web app instead; a user-supplied key still wins where both exist:

```bash
export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY, GOOGLE_API_KEY, …
export TWENTY_FIRST_API_KEY=...     # optional: 21st.dev, for generated heroes
```

To keep everything local instead, run [Ollama](https://ollama.com) or
[LM Studio](https://lmstudio.ai) and pick it in the model dropdown. The agent
then runs **in your browser** against `localhost`, and no design data is sent
anywhere.

### Optional server

```bash
cd apps/api
cp .env.example .env      # set DATABASE_URL
pnpm prisma:migrate
pnpm dev
```

The server is genuinely optional. It adds shared projects, server-side history
and headless export for CI. Without it the editor is fully functional.

## What makes it different

**Operations, not code.** See above. The consequence is that undo, branching,
collaboration and AI edits are all the same mechanism.

**Tokens all the way through.** A node stores `{color.accent}`, not `#6366f1`.
The style compiler turns that into `bg-accent` plus a Tailwind v4 `@theme`
block, so retheming an _exported_ project is still a one-file change.

**The renderer does not know the editor exists.** It emits `data-od-id`
attributes; the editor layers selection and dragging on top through event
delegation. The same component renders the canvas, the published page and the
SSR preview.

**Plugins are not a bolt-on.** The block library, all six export targets and
every model provider register through the same public API a third-party plugin
uses. There is no privileged path — [`plugins/plugin-charts`](plugins/plugin-charts)
proves it by testing exactly that.

**Local-first is the default, not a mode.** Storage, models and rendering can
all run without a network. Dropped and generated images are inlined into the
document by default, so a project stays one portable JSON file — point the same
pipeline at an upload endpoint and nothing else changes.

**A request picks the page, not a folder of starter files.** "Uma landing page
para um SaaS de gestão financeira" resolves to a blueprint — sections, copy and
meta — which builds a whole document out of registered blocks. Matching is a
deterministic scorer rather than a model call, so it works offline, with no key,
and returns the same page twice. See [templates](docs/TEMPLATES.md).

**The hero can come from 21st.dev, as nodes.** The
[21st.dev MCP server](docs/MCP_21ST.md) generates the above-the-fold section and
the returned JSX is translated into document nodes: Tailwind classes become
design tokens, breakpoint variants become responsive overrides, and the section
lands through the same `insertSubtree` a dragged block uses — so it rethemes,
exports and undoes like everything else. A generated hero without a headline or
a call to action is rejected in favour of the built-in block, and no key at all
simply means the built-in block.

**Images are first-class, in both directions.** Drop, paste or generate an image
and it goes through one pipeline: probed for dimensions (so no layout shift),
stored by whichever adapter is configured, and recorded as an `addAsset`
operation — undoable like any edit. Attach a screenshot to the chat and the
agent switches to reconstruction mode and rebuilds it as real nodes.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — the document model, operations, and why
  the layers are split the way they are
- [Templates](docs/TEMPLATES.md) — blueprints, request matching, and adding your
  own; one exported example per template in [`examples/templates`](examples/templates)
- [Hero sections via 21st.dev](docs/MCP_21ST.md) — the MCP client, the JSX→nodes
  pipeline, and how to configure a key
- [Writing plugins](docs/PLUGINS.md) — contribution points, with runnable examples
- [AI providers](docs/AI_PROVIDERS.md) — adding a model, and how the agent loop works
- [Exporters](docs/EXPORTERS.md) — how a target is built and what "clean code" means here
- [Contributing](CONTRIBUTING.md)
- [Roadmap](docs/ROADMAP.md) — including what is deliberately not done yet

## Tests

```bash
pnpm test
```

572 tests across the packages. The suites that matter most: operation
invertibility (every edit must undo exactly), export output (no editor
attributes leak, void elements stay void, responsive overrides become media
queries), the AI repair loop (a malformed batch must never half-apply), the
server's all-or-nothing writes, the plugin contract (a third-party plugin can do
everything a first-party one can), and the 21st.dev pipeline end to end — JSX
parsed, Tailwind translated to tokens, and a hero without a headline or a call
to action rejected rather than shipped to the canvas.

One suite worth calling out: every block is checked for references to tokens
that do not exist. `{spacing.7}` in a scale that stops at 6 throws nowhere — it
compiles to `var(--spacing-7)`, resolves to nothing, and the gap silently
vanishes. That bug shipped once and was caught by looking at a screenshot,
which is not a scalable review process.

## Licence

MIT. See [LICENSE](LICENSE).
