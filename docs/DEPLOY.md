# Deploying Charm-Design

This is a pnpm + Turborepo monorepo with two deployable apps. They are separate
deployments on purpose: the editor is a static-first Next.js app that works with
no backend at all, and the API is only needed once you want sync, history or
server-side persistence.

| App        | Package           | What it is                           | Required to run the product |
| ---------- | ----------------- | ------------------------------------ | --------------------------- |
| `apps/web` | `@opendesign/web` | The editor — canvas, AI chat, export | yes                         |
| `apps/api` | `@opendesign/api` | NestJS + Prisma sync server          | no                          |

## Vercel

Create **one Vercel project per app**, both pointing at this same repository.
The build settings are already committed as `apps/web/vercel.json` and
`apps/api/vercel.json`, so the only thing that has to be set in the dashboard is
the **Root Directory**:

| Vercel project | Root Directory | Include files outside root |
| -------------- | -------------- | -------------------------- |
| the editor     | `apps/web`     | on                         |
| the API        | `apps/api`     | on                         |

"Include files outside the Root Directory" has to stay on — the app imports
`workspace:*` packages that live in `packages/`, and the lockfile is at the
repo root.

Each `vercel.json` builds through Turborepo (`--filter=<app>...`) so the
workspace packages an app depends on are built first, and uses `turbo-ignore` so
a commit that only touches the other app does not trigger a rebuild.

> A single project whose Root Directory is the repository root will build
> whichever app Vercel's framework detection picks and serve only that one. If
> the deployed site answers `404 Cannot GET /` at the root while `/api/health`
> works, that project is deploying the API — point a second project at
> `apps/web` for the editor.

### Environment variables

The editor needs **none**. Model API keys are entered in the app's Settings
panel, kept in the visitor's own browser, and sent straight to the provider —
a deployed instance never holds anyone's key.

The API needs:

| Variable       | Required | Notes                                                                      |
| -------------- | -------- | -------------------------------------------------------------------------- |
| `DATABASE_URL` | yes      | Postgres. Also needed at build time — `prisma generate` reads it.          |
| `CORS_ORIGIN`  | yes      | Comma-separated origins. Set it to the editor's URL, or CORS blocks calls. |
| `REDIS_URL`    | no       | Enables the realtime/presence path.                                        |
| `PORT`         | no       | Defaults to `4000`; Vercel sets this for you.                              |

Without `DATABASE_URL` the API still boots — `/api/health` returns
`{"status":"ok","database":"unavailable"}` — but the project endpoints fail.
That is deliberate: liveness and full functionality are reported separately so a
load balancer can tell them apart.

## Self-hosting

```bash
pnpm install
pnpm build

# editor
pnpm --filter @opendesign/web start        # serves on :3000

# API (optional)
DATABASE_URL=postgresql://... \
CORS_ORIGIN=https://your-editor-url \
pnpm --filter @opendesign/api start        # serves on :4000, routes under /api
```

## CI

`.github/workflows/ci.yml` runs install, build, test and the Prettier check on
every pull request and on pushes to the default branch.

pnpm's version is pinned **only** by `packageManager` in the root
`package.json`. Do not also pass `version:` to `pnpm/action-setup` — the action
refuses to run when both are set.
