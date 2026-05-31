# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-31

Initial release.

### Added

- `link-rot check <glob...>` command that validates three kinds of links in
  Markdown:
  - external `http(s)` links over the network (HEAD with GET fallback),
  - relative and root-absolute filesystem paths,
  - same-page and cross-file `#anchor` fragments, matched against
    GitHub-compatible heading slugs.
- `--offline` mode that validates relative paths and anchors without any
  network access.
- Output formats: `text` (default, grouped by file), `json` (machine-readable),
  and `markdown` (PR-comment friendly).
- `link-rot render` command to re-format a saved JSON report without
  re-checking.
- Configuration via `.linkrotrc.json`: `ignore`, `exclude`, `timeout`,
  `concurrency`, `retries`, `retryDelay`, `okStatuses`, `userAgent`, `base`,
  `checkAnchors`, and `offline`. CLI flags override config.
- `--exclude <glob>` CLI flag (repeatable) to skip files from scanning, layered
  on top of the config/default `exclude` list.
- External checking with a concurrency limit, per-request timeout, retries with
  exponential backoff for transient failures (429/5xx/network/timeout), a
  HEAD-then-GET fallback, an in-run cache (each URL fetched at most once), and a
  configurable allowlist of "OK" status codes.
- GFM-aware parsing (autolink literals, tables) plus extraction of links from
  reference definitions and embedded HTML `href`/`src` attributes, and anchors
  from HTML `id`/`name` attributes.
- A composite GitHub Action (`action.yml`) that writes a job summary, optionally
  posts/updates a sticky PR comment, and fails the build on broken links
  (configurable).
- Programmatic API exported from the package entry point.

[Unreleased]: https://github.com/anthill24/link-rot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anthill24/link-rot/releases/tag/v0.1.0
