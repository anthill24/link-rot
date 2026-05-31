# Contributing to link-rot

Thanks for your interest in improving link-rot! This project is small and
welcomes issues and pull requests.

## Getting started

```bash
git clone https://github.com/anthill24/link-rot.git
cd link-rot
npm install
npm run build
npm test
```

You'll need **Node.js 20 or newer**.

## Development workflow

| Task            | Command                                           |
| --------------- | ------------------------------------------------- |
| Build (`dist/`) | `npm run build`                                   |
| Watch build     | `npm run dev`                                     |
| Typecheck       | `npm run typecheck`                               |
| Lint            | `npm run lint`                                    |
| Format          | `npm run format` (write) / `npm run format:check` |
| Test            | `npm test`                                        |
| Test (watch)    | `npm run test:watch`                              |
| Coverage        | `npm run coverage`                                |

Run the CLI locally without installing:

```bash
node dist/cli.js check "**/*.md" --offline
```

## Before you open a PR

Please make sure the following all pass — CI runs the same checks on Node 20:

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` — **and commit the updated `dist/`** (see below)

### Committing `dist/`

The GitHub Action (`action.yml`) runs the bundled `dist/cli.js` directly, so the
build output is committed to the repository and must exist at every released
tag. **If you change anything under `src/`, run `npm run build` and commit the
regenerated `dist/` in the same PR.** CI fails if the committed `dist/` is out
of date with the source.

## Tests

- Tests live in `test/` and use [Vitest](https://vitest.dev/).
- **Never make live network requests in tests.** The HTTP layer accepts an
  injectable `fetchImpl` (and `sleepImpl` for backoff); use a mock. See
  [`test/http.test.ts`](./test/http.test.ts) and
  [`test/checker.online.test.ts`](./test/checker.online.test.ts) for the
  pattern.
- Sample Markdown projects live under `test/fixtures/` and intentionally contain
  broken links/anchors. They are excluded from formatting and from the repo's
  own offline self-check.
- Offline behavior (relative paths + anchors) and online behavior (external
  URLs) are tested separately.

## Code style

- TypeScript, ESM, `strict` mode. Use `.js` extensions in relative imports.
- Prettier + ESLint enforce formatting and lint rules; run `npm run format`
  before committing.
- Avoid adding runtime dependencies unless necessary — they are bundled into
  `dist/` and ship in the Action.

## Commit messages & changelog

- Write clear, present-tense commit messages.
- Add a line under the **Unreleased** section of
  [`CHANGELOG.md`](./CHANGELOG.md) for any user-facing change.

## Reporting bugs / requesting features

Use the issue templates (Bug report / Feature request). For security issues, do
**not** open a public issue — see [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
