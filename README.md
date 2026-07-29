# OpenDesign

An open source, AI-first platform for designing interfaces — a visual canvas, a
real design system, and clean code on the way out. MIT licensed and
self-hostable, with a plugin API that the built-in features themselves use.

> Status: **early**. The document model, editor, block library, exporters and AI
> layer are implemented and tested. Realtime collaboration and one-click deploy
> are scaffolded but not finished — see [the roadmap](docs/ROADMAP.md).

---

## The idea in one paragraph

Most AI design tools return code. Code is hard to trust, impossible to diff
meaningfully, and can only be accepted or thrown away. OpenDesign's model
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
  exporters      React, Next.js, HTML, Vue, Svelte, Astro
  editor         Headless editor state: selection, viewport, tools, commands
  ai             Claude, GPT, Gemini, DeepSeek, OpenRouter, Ollama, LM Studio
plugins/
  plugin-charts             Example component pack
  plugin-exporter-solid     Example export target
  plugin-provider-mistral   Example model provider
```

## Quick start

```bash
pnpm install
pnpm build
pnpm --filter @opendesign/web dev
```

Open <http://localhost:3000>. Projects are stored in your browser — no account,
no server, nothing leaves your machine until you connect a cloud model.

To use a hosted model, set a key before starting the web app:

```bash
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, GOOGLE_API_KEY, …
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
all run without a network.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — the document model, operations, and why
  the layers are split the way they are
- [Writing plugins](docs/PLUGINS.md) — contribution points, with runnable examples
- [AI providers](docs/AI_PROVIDERS.md) — adding a model, and how the agent loop works
- [Exporters](docs/EXPORTERS.md) — how a target is built and what "clean code" means here
- [Contributing](CONTRIBUTING.md)
- [Roadmap](docs/ROADMAP.md) — including what is deliberately not done yet

## Tests

```bash
pnpm test
```

293 tests across the packages. The suites that matter most: operation
invertibility (every edit must undo exactly), export output (no editor
attributes leak, void elements stay void, responsive overrides become media
queries), the AI repair loop (a malformed batch must never half-apply), and the
plugin contract (a third-party plugin can do everything a first-party one can).

## Licence

MIT. See [LICENSE](LICENSE).
