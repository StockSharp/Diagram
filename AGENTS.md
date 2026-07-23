# AGENTS.md — StockSharp Diagram

Guidance for AI coding agents (and humans) working in this repository,
`@stocksharp/diagram`.

## What this is
A browser strategy-diagram editor for StockSharp: typed ports, palette, canvas
rendering, persistence, and a TypeScript API. Source in `src/`, the demo host in
`demo/` + `examples/`, tests in `tests/`. Bundled with esbuild/tsc via
`build.mjs`. `dist/` and `demo/dist/` are build outputs and are gitignored —
never commit them.

## Everyday commands
- `npm run build` — build the library and demo bundles.
- `npm test` — typecheck + public-API check + unit tests (`node:test`). Run before every commit.
- `npm run test:browser` — Playwright browser smoke tests (builds first).
- `npm run serve` — serve the demo at `http://0.0.0.0:8792` for manual checks.

## The public API is snapshot-tested
`npm test` runs `api:check`, which compares the exported types against
`tests/api/public-api.d.ts`. If you intentionally change the public API,
regenerate the snapshot with `npm run api:update` and commit it in the same
change — otherwise CI fails.

## Commits
Use Conventional Commits: `feat:`, `fix:`, `ci:`, `chore:`, `docs:`,
`refactor:`, `test:`, `perf:`. Use `feat!:` or a `BREAKING CHANGE:` footer for
breaking changes. Code comments and commit messages are in English.

## Releasing — read this before touching versions or CI
Publishing is automated and driven by the **version in `package.json`**.

- `.github/workflows/release.yml` runs on every push to `main`, but publishes to
  npm **only when the version in `package.json` is not yet on the registry**. A
  normal push whose version is already published is a no-op.
- **To cut a release**, bump the version and push:
  ```bash
  npm run release:patch   # or release:minor / release:major
  git push
  ```
  `npm run release:*` bumps `package.json` and commits `chore: release vX.Y.Z`
  (it needs a clean working tree, and also creates a *local* git tag `vX.Y.Z` —
  leave it alone: a plain `git push` does not push it, and CI creates the remote
  tag itself). The push to `main` triggers the workflow, which builds, runs the
  full test suite, `npm publish`es, then creates the `vX.Y.Z` tag and GitHub
  Release.
- Version policy: pre-1.0 — `feat` → minor, `fix` → patch. Reserve major for a
  deliberate 1.0.
- **Do not** run `npm publish` locally, and **do not** hand-push tags — CI owns
  publishing and tagging. The tag is an *output* of a release, not its trigger.
- Manual retry (e.g. a flaky test failed a publish): GitHub → Actions →
  **Publish package** → **Run workflow** (optional `ref` input).

## npm authentication — do not break this
Publishing uses **npm trusted publishing (OIDC)** — there is **no `NPM_TOKEN`**.
`release.yml` grants `id-token: write`; npm exchanges the GitHub OIDC token for a
short-lived publish token and signs a provenance attestation
(`publishConfig.provenance` in `package.json`).

Violating any of the following causes `npm error code E404 ... you do not have
permission` on publish:

- **Do not rename `.github/workflows/release.yml`**, and do not move the
  `npm publish` step into a different workflow file. The npm Trusted Publisher is
  bound to the workflow filename `release.yml`; a different filename fails OIDC
  claim matching. If a rename is unavoidable, first update the Trusted Publisher
  at npmjs.com → `@stocksharp/diagram` → Settings → Trusted Publisher to the new
  filename.
- **Do not add `NODE_AUTH_TOKEN` / `NPM_TOKEN`** to the publish step or to
  `setup-node`'s auth. A stale or placeholder token shadows the OIDC exchange.
- Keep npm ≥ 11.5.1 and Node ≥ 22.14 in the workflow (currently npm 11.6.2 /
  Node 24) — required for trusted publishing.

## Pushing to main is publishing
Because a version-bumping push to `main` releases a public npm package, treat a
push to `main` as a release action: confirm with the maintainer before pushing,
and make sure the version bump is intended.
