# Contributing

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Node 20.11+ and pnpm 10 are required. `pnpm build` must run once before the app
dev servers, because they consume the packages' `dist` output.

## Working on it

```bash
pnpm --filter @opendesign/web dev        # editor at :3000
pnpm --filter @opendesign/api dev        # optional server at :4000
pnpm --filter @opendesign/core dev       # rebuild a package on change
```

## Where things go

Before adding a file, check the layering in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Dependencies point downward only.
If your change needs an upward import — `core` reaching into `editor`, say —
the abstraction is in the wrong place, and that is worth raising in the issue
rather than working around.

Some specific guidance:

- **A new block** → `packages/components/src/blocks/`, or your own plugin. Use
  design tokens, never literal colours, and write the mobile layout first.
- **A new export target** → prefer a plugin. `plugins/plugin-exporter-solid` is
  the template.
- **A new model provider** → `packages/ai/src/providers/`, or a plugin. Use
  `fetch`; do not add a vendor SDK.
- **Editor behaviour** → `packages/editor` if it is logic, `apps/web` if it is
  chrome. The rule of thumb: if it could be tested without a DOM, it belongs in
  the package.

## Tests

New behaviour needs a test. The bar is not coverage percentage — it is whether
the test would catch a real regression. Look at the existing suites for the
style: they assert on outcomes users would notice (an undo that does not fully
undo, an export that leaks editor attributes, an AI batch that half-applies),
not on implementation details.

```bash
pnpm test                                # everything
pnpm --filter @opendesign/core test      # one package
```

## Comments

Comment the _why_, not the _what_. A comment that restates the code is noise;
one that explains a non-obvious trade-off, a constraint, or why the obvious
approach was rejected is worth its space. If a decision has a real cost, say so
— the codebase is full of examples.

## Commits and pull requests

Conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

In the PR description, explain what changed and why. If you rejected an
alternative approach, mention it — that is usually the most useful part of a
review.

Run `pnpm build && pnpm test` before pushing. CI runs the same thing.

## Code of conduct

Be decent. Assume good faith. Critique code, not people.
