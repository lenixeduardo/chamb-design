# Known issues

Open findings from a validation pass in which four agents exercised the running
app: the editor in a real browser, the web app's route handlers, the NestJS API
against a real Postgres, and the library packages through their built bundles.

Everything listed here was reproduced. What was fixed in that pass is not
listed — see the commit history. What remains is here because it needs a design
decision, a schema change, or more work than the pass had room for.

## Document model — undo is not always a true inverse

Each of these leaves the document slightly different from where it started after
an undo. None corrupts the tree; all of them mean "undo everything" does not
return you to the byte-identical starting document.

| What                                   | Where                                 | After undo                                                    |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `updateStyle` at a non-base breakpoint | `packages/core/src/operations.ts:317` | an empty `responsive: { md: {} }` bucket is left behind       |
| `setToken` on a new nested path        | `operations.ts:427`                   | the auto-created group stays as `{}`                          |
| `upsertComponent` (update path)        | `operations.ts:498`                   | nodes added by the update stay in `doc.nodes`                 |
| `addPage`                              | `applyAddPage`                        | nodes not reachable from the page root stay in `doc.nodes`    |
| `moveNode` on a **detached** node      | `operations.ts:250`                   | the subtree is deleted rather than returned to `parent: null` |

Two more in the same area:

- `DocumentStore.transact` with `source: 'ai'` prunes orphans **after**
  `history.push` recorded the inverse (`packages/core/src/store.ts:131`), so
  undoing an AI transaction throws `node not found` and leaves the history stack
  broken — the commit has already moved to the redo stack by then.
- `removeSubtree` does not clean up component definitions that point at the
  removed nodes, though page roots are guarded the same way at
  `operations.ts:180`.

## Plugin registry corrupts itself on a failed registration

`packages/core/src/plugins.ts:199` sets the plugin into the map **before**
awaiting `activate()`, and contributions registered before a throw are never
rolled back. A plugin whose `activate` fails halfway is left listed in
`getPlugins()` with its partial contributions live, and re-registering the fixed
version throws `plugin already registered`.

Malformed contributions are also accepted: `id: ''`, `id: undefined`, and an
exporter with no `generate` all register, and the last one fails at export time
with `e.generate is not a function`.

Related: `PluginContext` has no `registerTheme`. `plugin-chamb-brand` describes
itself as "a theme, blocks and a starter template", but its themes can only be
reached by deep-importing the package — the registry has no theme contribution
point.

## Validation is not enforced at the store boundary

`DocumentStore.transact` never calls `parseOperations`
(`packages/core/src/store.ts:113`). `DesignAgent` does validate — parse, dry-run,
integrity check, and it correctly rejects out-of-range values and bad parents —
but every other caller goes straight to `transact`, including
`Editor.addGeneratedAssets` at `packages/editor/src/editor.ts:606`.

Five operation branches in `packages/core/src/schema.ts` are typed
`z.record(z.string(), z.unknown())`, so `parseOperations` waves through payloads
that then produce a document failing `validateDocumentIntegrity`:
`setNodeFields`, `updatePage`, `setThemes`, `upsertComponent`,
`setDocumentFields`.

`insertSubtree` checks only that the batch is non-empty and that `rootId` is in
it (`operations.ts:141`); it does not check that every node is reachable from
`rootId` or that `children` resolve, so a subtree with a dangling child id is
accepted and silently invalidates the document.

## Exporters

- **Motion is dropped by every target.** `packages/exporters/src/emit/tree.ts`
  builds attributes from `spec.attributes` only and never calls
  `motionAttributes()`, which the renderer does call. All six built-in targets
  ship the `[data-od-motion]` stylesheet, but no element ever carries the
  attribute — the canvas animates and the exported code does not. Fixing it
  needs the motion custom properties emitted as an inline style, which is
  spelled differently in JSX than in the template dialects.
  `plugin-exporter-solid` does not even ship the stylesheet.
- **Two pages with the same name collide.** `targets/html.ts:130`,
  `targets/react.ts:72`, `targets/sfc.ts:37` key the output filename off
  `page.name` rather than `page.path`. Astro and Svelte key off `path` and are
  correct.
- **No runnable entrypoint** except for Next.js. The generated `package.json`
  declares `dev`/`build` scripts, but there is no `index.html`, `main.tsx`,
  `vite.config`, `astro.config.mjs` or `svelte.config.js` to go with them.
- `nodeClassName` (`targets/html.ts:32`) truncates the node id to four
  characters and `dedupeRules` keeps only the first rule per selector, so two
  same-named nodes with colliding id prefixes would share styles. Measured at
  zero collisions across 15,240 nodes — theoretical, but real.

## Geometry

`resizeRect` moves the anchored edge when the size clamps
(`packages/core/src/geometry.ts:315`): `x += delta.x` runs before
`width = Math.max(width, minWidth)`. Resizing from the west handle past the
minimum moves the east edge, which should be fixed. Same for the north handle,
and with `preserveAspect` on a corner handle the opposite corner drifts because
`height` is recomputed without adjusting `y`.

## AI response parsing

`findJsonBlock` (`packages/ai/src/extract.ts:19`) takes the first _balanced_
bracket group whether or not it parses, and there is no retry after a failed
block. A model that writes `Step [1]: add the hero.` before its JSON has the
`[1]` taken as the operation list; a bulleted plan containing `[large]` loses
the whole generation. Both paths are fine when the response is fenced with
` ```json `.

## Design system

`styleToClasses` and `styleToCssProperties` disagree on a border that has a
colour but no width (`packages/design-system/src/compile.ts:222` vs `:452`): the
Tailwind path emits `border-border`, which is 0px wide under Preflight, while
the CSS path emits `1px solid`. No shipped block hits it — the two compilers
agreed on all 254 styled nodes of a full document — but it is a live WYSIWYG
hole. Both compilers also drop `StyleMap.x` / `.y`, so canvas placement never
reaches any output.

## Web app routes

There is no `middleware.ts` under `apps/web`, so every route is anonymously
callable with no rate limit. `/api/export` will do unbounded CPU work on an
arbitrarily large document, and a deployment that sets its own provider keys
spends them for anyone who finds the URL — see the warning in
[the deploy guide](DEPLOY.md#environment-variables). A document nested 6000 deep
overflows the exporter's tree walk; it is caught and returned as a 400, but a
depth guard in the walker would be better than relying on the `try/catch`.

## API

- **`PrismaService` never reconnects.** `connected` is written once in
  `onModuleInit` (`apps/api/src/common/prisma.service.ts:33`) and never
  re-evaluated. A cold start that races a sleeping serverless Postgres marks
  that instance unavailable permanently; an instance that connected at boot
  keeps reporting `connected` after the database dies, which is the more
  dangerous direction for a load balancer.
- **The in-process cache is per-instance.** With `REDIS_URL` unset,
  `apps/api/src/common/cache.service.ts:17` gives every serverless instance its
  own 300-second project cache with no cross-instance invalidation. Reads may be
  stale for up to five minutes. On a serverless deployment `REDIS_URL` should be
  treated as required rather than optional.
- **No pool limit.** `PrismaPg({ connectionString })` opens a pool per instance
  with no `max`, so N warm instances will exhaust a small Postgres.
- **Streaming is bounded by the function's max duration.** A full page
  generation can outrun it, and the connection is then cut mid-stream with no
  terminal `error` event, because the `catch` never runs. No `maxDuration` is
  set.
- **No controller or end-to-end tests.** Nothing verifies the global `/api`
  prefix, the 503 mapping, CORS, or the 32 MB body limit. `AiController`,
  `ExportController`, `PrismaService`, `CacheService` and `RegistryService` have
  no tests at all.
- Nothing in `apps/web` or `packages/` calls this API — no `API_URL`, no
  `localhost:4000`. It is deployed but unconsumed.

## Editor UI

- Sub-32px tap targets at 390px: the header logo link (28×28), the zoom reset
  button (17×46), the provider links and the remember-me checkbox in Settings.
  Everything else on mobile is at least 36px.
- Google Fonts is a hard external dependency with no self-hosted fallback, so
  the brand's script and display faces silently fall back to system fonts when
  the request fails. It is the only console error on an otherwise clean load.
