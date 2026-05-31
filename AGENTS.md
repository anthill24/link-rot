# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Keep
changes small, tested, and consistent with the conventions below.

## What this project is

`link-rot` is a Node.js + TypeScript CLI and GitHub Action that finds dead
external links, broken relative paths, and stale in-page anchors in Markdown.
See [README.md](./README.md) for user-facing docs.

## Repository layout

```
src/
  cli.ts          # bin entry (shebang). Thin wrapper around run().
  run.ts          # arg parsing (node:util parseArgs), "check" + "render" commands
  index.ts        # public library API (what `import 'link-rot'` exposes)
  checker.ts      # orchestration: glob files -> parse -> validate -> report
  markdown.ts     # remark/mdast parsing: extract links + heading/anchor slugs
  slug.ts         # github-slugger wrapper
  classify.ts     # URL scheme classification + path/anchor splitting
  resolve.ts      # relative-path + anchor validation against the filesystem
  http.ts         # external link checker: pool, timeout, retries, HEAD->GET, cache
  config.ts       # .linkrotrc.json loading, validation, defaults, merge
  color.ts        # tiny ANSI colorizer (NO_COLOR / FORCE_COLOR aware)
  reporters/      # text, json, markdown output formats
  types.ts        # shared types
  version.ts      # VERSION constant (kept in sync with package.json by a test)
test/
  *.test.ts       # Vitest unit + integration tests
  fixtures/       # sample Markdown projects (intentionally contain broken links)
action.yml        # composite GitHub Action (runs the bundled dist/cli.js)
dist/             # bundled build output — COMMITTED (the Action runs it)
```

## Build, test, and checks

```bash
npm install
npm run build          # tsup -> dist/ (ESM, bundled, with shebang)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format:check   # prettier --check
npm test               # vitest run
```

Before opening a PR, all of the above must pass. CI runs exactly these on Node 20.

## Conventions

- **TypeScript, ESM, strict mode.** Use `.js` extensions in relative imports
  (`import { x } from './foo.js'`) — required for ESM + bundler resolution.
- **No new runtime dependencies** without good reason; they get bundled into
  `dist/` and ship in the Action. Prefer Node built-ins (`node:util`,
  `node:fs/promises`, global `fetch`).
- **Network is always injectable.** HTTP code accepts a `fetchImpl` (and
  `sleepImpl`); tests never make live requests. Do not add tests that hit the
  network — mock `fetch`.
- **Determinism.** Results are produced in document order; the build output must
  be reproducible (CI fails if committed `dist/` drifts from source).
- **Errors surface loudly.** Config problems throw with a clear message and exit
  code `2`; broken links exit `1`.

## Critical: rebuild and commit `dist/`

The GitHub Action runs `dist/cli.js` directly, so `dist/` is committed. **If you
change anything under `src/`, run `npm run build` and commit the updated
`dist/`** in the same PR. CI enforces this with a `git diff` check.

## Adding a feature, briefly

1. Add/extend types in `src/types.ts` if needed.
2. Implement in the relevant `src/` module.
3. Add a fixture under `test/fixtures/` if it needs sample Markdown.
4. Add tests (offline and, if networked, mocked-`fetch`).
5. Update `README.md` and `CHANGELOG.md` (under "Unreleased").
6. `npm run build` and commit `dist/`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.
