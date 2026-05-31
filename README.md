# link-rot

[![CI](https://github.com/anthill24/link-rot/actions/workflows/ci.yml/badge.svg)](https://github.com/anthill24/link-rot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-43853d.svg)](https://nodejs.org)

> Find dead external links, broken relative paths, and stale in-page anchors in your Markdown and docs — from the CLI or as a GitHub Action.

Documentation rots. A page you linked to 404s, a file you referenced gets
renamed, a heading you anchored to is reworded — and nothing tells you until a
reader hits the dead end. **link-rot** parses your Markdown the way GitHub does,
then checks every link three ways:

- **External links** (`https://…`) — probed over HTTP with retries and a
  HEAD-then-GET fallback.
- **Relative paths** (`../guide.md`, `./img.png`) — resolved against the
  filesystem.
- **In-page anchors** (`#installation`, `other.md#usage`) — validated against
  the actual heading slugs GitHub would generate (duplicate headings included).

## Why link-rot?

- **Catches the links other checkers miss.** Most tools only hit the network.
  link-rot also validates relative file paths _and_ `#anchor` fragments against
  generated heading slugs, so a renamed file or reworded heading is caught.
- **CI-friendly.** Run it fully offline (no network) to validate structure, or
  online to catch dead external URLs. Machine-readable JSON and PR-comment
  Markdown are first-class output formats.
- **GitHub-accurate slugs.** Heading anchors are generated with
  [`github-slugger`](https://github.com/Flet/github-slugger), the same
  algorithm GitHub uses, including `-1`/`-2` de-duplication.
- **Sensible network defaults.** Concurrency limiting, per-request timeouts,
  retries with backoff, an in-run cache so each URL is fetched at most once, and
  a configurable allowlist of "OK" status codes.

## What it checks

| Link kind               | Example                       | How it's checked                                                           |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| External                | `[docs](https://example.com)` | HTTP HEAD, falling back to GET; status `< 400` (plus your allowlist) is OK |
| Relative file           | `[guide](../docs/guide.md)`   | Resolved on disk; missing file → broken                                    |
| Root-absolute           | `[api](/docs/api.md)`         | Resolved against a configurable base dir                                   |
| Same-page anchor        | `[top](#installation)`        | Matched against this file's heading slugs                                  |
| Cross-file anchor       | `[setup](guide.md#setup)`     | Target Markdown is parsed; anchor matched against its slugs                |
| Image                   | `![logo](./logo.png)`         | Same as the link kinds above                                               |
| Reference & inline HTML | `[x][id]`, `<a href="…">`     | Definition URLs and `href`/`src` attributes are extracted                  |

`mailto:`, `tel:`, and other non-HTTP schemes are reported as _skipped_ (not
broken). GFM autolink literals (`https://…`, `www.…`, bare emails) are
recognized.

## Project status

**Early release (v0.1.0).** link-rot is new and maintained by a single author on
a best-effort basis. It is tested (see the suite in [`test/`](./test)) and used
to check this repository's own docs in CI, but it has not yet seen wide
real-world use, and the configuration and JSON shape may change before `1.0`.
Bug reports and PRs are very welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

> link-rot is **not yet published to npm** (it's on the [roadmap](#roadmap)).
> For now, install it from source or use the GitHub Action.

From source:

```bash
git clone https://github.com/anthill24/link-rot.git
cd link-rot
npm install
npm run build
npm link        # optional: puts `link-rot` on your PATH
```

Then:

```bash
link-rot check "**/*.md"
# or without npm link:
node dist/cli.js check "**/*.md"
```

Requires **Node.js 20 or newer**.

## Usage

```text
USAGE
  link-rot check <glob...> [options]
  link-rot render [report.json] [--format <fmt>]   Re-format a saved JSON report

OPTIONS
  --offline               Skip the network; check only relative paths & anchors
  -f, --format <fmt>      Output format: text | json | markdown (default: text)
  -c, --config <path>     Path to a config file (default: ./.linkrotrc.json)
      --timeout <ms>      Per-request timeout for external links
      --concurrency <n>   Max concurrent external requests
      --retries <n>       Retry attempts for transient failures (429/5xx/network)
      --ignore <glob>     Ignore links matching this glob (repeatable)
      --exclude <glob>    Exclude files matching this glob from scanning (repeatable)
      --ok-status <code>  Treat this HTTP status as OK (repeatable)
      --base <dir>        Base directory for root-absolute (/foo) links
      --user-agent <ua>   User-Agent header for external requests
      --no-check-anchors  Do not validate in-page anchors
      --color / --no-color
      --exit-zero         Always exit 0, even when broken links are found
  -h, --help              Show this help
  -v, --version           Show version
```

### Examples

```bash
# Check every Markdown file in the repo (external + relative + anchors)
link-rot check "**/*.md"

# Offline: validate structure only — no network requests
link-rot check "**/*.md" --offline

# Machine-readable output
link-rot check "**/*.md" --format json

# A report you can paste into a PR
link-rot check "**/*.md" --format markdown > report.md

# Ignore a flaky host and accept its 403s elsewhere
link-rot check docs/ --ignore "https://twitter.com/**" --ok-status 403
```

Broken links are grouped by file:

```text
docs/guide.md
  ✖ 5:37   api.md#nope          → anchor "#nope" not found in docs/api.md
README.md
  ✖ 14:1   assets/missing.png   → file not found: assets/missing.png

✖ 2 broken links — checked 18 links across 4 files, 6 skipped in 13ms
```

### Exit codes

| Code | Meaning                            |
| ---- | ---------------------------------- |
| `0`  | No broken links (or `--exit-zero`) |
| `1`  | Broken links were found            |
| `2`  | Usage or configuration error       |

## Configuration

link-rot reads `.linkrotrc.json` from the working directory (or the path given
with `--config`). All fields are optional; CLI flags take precedence.

```json
{
  "ignore": ["https://twitter.com/**", "http://localhost:*/**"],
  "exclude": ["**/node_modules/**", "CHANGELOG.md"],
  "timeout": 10000,
  "concurrency": 8,
  "retries": 2,
  "retryDelay": 300,
  "okStatuses": [403, 429],
  "userAgent": "link-rot/0.1.0",
  "base": ".",
  "checkAnchors": true,
  "offline": false
}
```

| Field          | Type       | Default                  | Description                                                                                 |
| -------------- | ---------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `ignore`       | `string[]` | `[]`                     | Globs matched against the raw link URL; matches are reported as _ignored_ and never checked |
| `exclude`      | `string[]` | `["**/node_modules/**"]` | Globs of files to skip when scanning                                                        |
| `timeout`      | `number`   | `10000`                  | Per-request timeout in ms                                                                   |
| `concurrency`  | `number`   | `8`                      | Max concurrent external requests                                                            |
| `retries`      | `number`   | `2`                      | Retries for transient failures (429 / 5xx / network / timeout)                              |
| `retryDelay`   | `number`   | `300`                    | Base backoff delay in ms (grows exponentially)                                              |
| `okStatuses`   | `number[]` | `[]`                     | Extra HTTP status codes to treat as OK (in addition to `< 400`)                             |
| `userAgent`    | `string`   | `link-rot/<version>`     | `User-Agent` sent with external requests                                                    |
| `base`         | `string`   | `.`                      | Base directory for resolving root-absolute (`/foo`) links                                   |
| `checkAnchors` | `boolean`  | `true`                   | Validate in-page anchors against heading slugs                                              |
| `offline`      | `boolean`  | `false`                  | Skip all network access                                                                     |

**Ignore patterns** are [globs](https://github.com/micromatch/picomatch)
matched against the full, raw URL. For example:

- `https://example.com/**` — any URL on that host
- `https://*.example.com/**` — any subdomain
- `mailto:*` — all mail links

## GitHub Action

Add a workflow that checks links on every pull request, writes a job summary,
and (optionally) posts a sticky comment on the PR:

```yaml
name: Links
on: [pull_request]

permissions:
  contents: read
  pull-requests: write # only needed when comment: 'true'

jobs:
  link-rot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthill24/link-rot@v0.1.0
        with:
          paths: '**/*.md'
          comment: 'true'
          fail-on-error: 'true'
```

### Inputs

| Input               | Default               | Description                                     |
| ------------------- | --------------------- | ----------------------------------------------- |
| `paths`             | `**/*.md`             | Space- or newline-separated globs/paths to scan |
| `config`            | `''`                  | Path to a `.linkrotrc.json`                     |
| `offline`           | `false`               | Skip the network (structure-only check)         |
| `fail-on-error`     | `true`                | Fail the job when broken links are found        |
| `comment`           | `false`               | Post/update a PR comment with the report        |
| `comment-mode`      | `always`              | `always` or `on-failure`                        |
| `github-token`      | `${{ github.token }}` | Token used to comment                           |
| `working-directory` | `.`                   | Directory to run from                           |
| `extra-args`        | `''`                  | Extra raw flags for `link-rot check`            |

Outputs: `broken` (count), `total` (count), and `report` (path to the generated
Markdown).

### ⚠️ Token & permissions for PR comments

Posting a comment requires a token with **`pull-requests: write`**, so the
workflow must declare:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Important caveats:

- The default `GITHUB_TOKEN` is **read-only for pull requests opened from
  forks**. On fork PRs the comment step cannot post and will emit a warning
  (it does not fail the build). The job summary is still written.
- To comment on fork PRs you would need a workflow triggered by
  `pull_request_target` (which runs with the base repo's token). **Do this with
  care** — `pull_request_target` runs in a privileged context, so never check
  out and execute untrusted PR code in such a workflow. For most projects,
  relying on the job summary for fork PRs is the safer choice.
- The comment is _sticky_: link-rot finds its previous comment by a hidden
  marker and edits it in place rather than posting a new one each run.

## Programmatic API

```ts
import { check, resolveConfig, formatReport } from 'link-rot';

const config = resolveConfig({}, { offline: true }, process.cwd());
const report = await check(['docs/**/*.md'], config);
console.log(formatReport(report, 'text', { color: true }));
console.log(`${report.broken} broken / ${report.totalLinks} links`);
```

## Roadmap

- [ ] Publish to npm (`npm i -g link-rot`)
- [ ] HTML file support (parse `.html`, not just embedded HTML in Markdown)
- [ ] Per-domain rate limiting
- [ ] Persistent on-disk cache between runs
- [ ] `.mdx`-aware parsing

See the [open issues](https://github.com/anthill24/link-rot/issues) for the
current list.

## Contributing

Issues and PRs are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md)
first. By participating you agree to abide by our standards of respectful
collaboration. Security reports: see [SECURITY.md](./SECURITY.md).

There is also an [AGENTS.md](./AGENTS.md) describing the repository layout and
conventions for AI coding agents and new contributors alike.

## Acknowledgements

Built on [unified](https://unifiedjs.com/) / [remark](https://github.com/remarkjs/remark),
[github-slugger](https://github.com/Flet/github-slugger),
[tinyglobby](https://github.com/SuperchupuDev/tinyglobby), and
[picomatch](https://github.com/micromatch/picomatch).

## License

[MIT](./LICENSE) © anthill24
