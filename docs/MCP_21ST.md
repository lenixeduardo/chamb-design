# Hero sections via 21st.dev (MCP)

[21st.dev](https://21st.dev) has a catalog of thousands of React + Tailwind
components and an MCP server that generates from it. Charm-Design speaks to
that server and turns what comes back into **document nodes** — selectable in
the canvas, restylable in the inspector, exportable to Vue or Svelte, undoable
in one keystroke.

Everything lives in [`packages/mcp`](../packages/mcp).

## Why nodes and not code

Pasting the returned JSX into a project would be the easy version and the wrong
one. This editor's whole argument is that an AI edit should arrive as a
validated operation rather than as a blob of code to accept or throw away. A
generated hero that arrives as nodes:

- lands in the same undo stack as a block dragged from the library,
- rethemes with the project, because Tailwind colours are translated to design
  tokens rather than to literals,
- exports through every target the project already has,
- can be edited by hand afterwards, which a code blob cannot.

## The pipeline

```
request → 21st.dev MCP → JSX snippet → node tree → quality gate → insertSubtree
```

1. **`McpClient`** — a ~200-line streamable-HTTP MCP client (`initialize`,
   `notifications/initialized`, `tools/list`, `tools/call`), handling both JSON
   and SSE response bodies plus session ids. No SDK, because this host talks to
   exactly one remote server from a Next.js route and nothing here should pull a
   stdio stack into a serverless bundle.
2. **`TwentyFirstClient`** — endpoint `https://21st.dev/api/mcp`, auth by
   `x-api-key`. Tool names are resolved through a candidate list
   (`generate` → `21st_magic_component_builder`, `get_inspiration` →
   `21st_magic_component_inspiration`, …) because 21st.dev has renamed them
   once already. Only a genuine "unknown tool" moves to the next candidate; a
   bad key or a rate limit surfaces instead of being retried three times.
3. **`parseJsx`** — a narrow reader for the markup subset a generator returns.
   Elements become primitives (`h1` → `heading`, `button` → `button`, `a` →
   `link`, `img` → `image`, anything else → `frame`), string literals inside
   expressions are kept as copy, SVG icons are dropped, and everything it could
   not read comes back in `warnings`.
4. **`translateClasses`** — Tailwind → `StyleMap`. `bg-primary` becomes
   `{color.accent}`, `gap-6` becomes `{spacing.6}`, `md:text-6xl` becomes a
   responsive override rather than a base style, and `hover:`/`dark:` stay
   classes rather than being flattened into the rest state. Anything unmapped is
   passed through on `className`, which the renderer appends after generated
   utilities — an exotic gradient still renders, it simply is not editable in
   the inspector.
5. **Images survive.** Catalog components are frequently image-led, and an
   `<img>`, a `next/image` element or a data URI all become an `image` node with
   its `src` and `alt` intact — so the section arrives with its visual, not as
   text on an empty box. The asset itself stays where 21st.dev put it; it is not
   downloaded or inlined.
6. **The quality gate** — `assessHero` requires a headline, a call to action and
   at least five nodes. "High quality" has to mean something checkable; a hero
   that fails goes to the built-in block instead of onto the canvas.

Every failure along the way degrades rather than throws: no key, a network
error, an unparseable answer and a thin answer all end with a real hero and a
warning explaining what happened.

## Configuring

Get a key at <https://21st.dev/magic/console>, then either:

- **Paste it in the app** — the field in _Começar por um modelo_. It is stored in
  that browser (session-only if you turned off "lembrar" in Ajustes) and
  forwarded to 21st.dev by `/api/mcp`, never logged and never stored server-side.
- **Set it on the server** — `TWENTY_FIRST_API_KEY` (or `API_KEY_21ST`), for a
  deployment that supplies its own. A user-pasted key still wins where both
  exist.

```bash
export TWENTY_FIRST_API_KEY=...
```

With no key at all, the flow still works — it just uses the library's hero.

## Using it

In the app: the **Hero · 21st.dev** field at the top of the editor's library
panel inserts a generated section into the open project, and the template dialog
uses one for a new project's above-the-fold section.

In code:

```ts
import { importHeroSection } from '@opendesign/mcp';

const { operation, source, warnings } = await importHeroSection(document, {
  request: 'SaaS de agendamento para barbearias',
});

// `operation` is an ordinary insertSubtree — hand it to applyOperations,
// to the editor's undo stack, or dry-run it first.
```

Lower-level pieces (`TwentyFirstClient`, `generateHeroSection`, `parseJsx`,
`translateClasses`) are exported too; `generateHeroSection` takes any client
with a `generateComponent` method, which is how the tests run the whole pipeline
with no network.

## Limits

- Only the hero is generated. The rest of a template is local and deterministic,
  and that is a deliberate split, not a stopping point.
- The JSX reader understands markup, not JavaScript: a component whose layout is
  computed in a `.map()` comes back without the mapped items, and says so in
  `warnings`.
- Tailwind coverage is the common subset. Gradients, animations and arbitrary
  variants survive as classes rather than as structured style.
