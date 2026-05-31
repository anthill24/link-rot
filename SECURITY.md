# Security Policy

## Supported versions

link-rot is at an early stage. Security fixes are applied to the latest released
version only.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** ("Private vulnerability reporting").
3. Include steps to reproduce, affected versions, and impact.

We aim to acknowledge reports within a few days and will coordinate a fix and
disclosure timeline with you.

## Security considerations when using link-rot

link-rot is a developer tool that processes Markdown you point it at. Keep the
following in mind:

- **It makes outbound HTTP requests.** When checking external links, link-rot
  fetches every non-ignored `http(s)` URL found in your files (HEAD, falling
  back to GET). If your documents may contain untrusted or attacker-controlled
  URLs, be aware those URLs will be contacted from wherever link-rot runs (for
  example, a CI runner). Use `--offline`, the `ignore` config, or
  `--ignore` patterns to restrict this.
- **It does not execute link targets.** Responses are not parsed or executed;
  only HTTP status codes are inspected. Redirects are followed by the runtime's
  `fetch`.
- **It reads the local filesystem.** Relative and root-absolute links are
  resolved and `stat`-ed on disk relative to the file (or the configured
  `base`). It does not follow links outside paths you scan, and it never writes
  to your files.
- **GitHub Action token scope.** The Action only needs `pull-requests: write`
  when commenting; otherwise `contents: read` is sufficient. See the
  permissions caveats in the [README](./README.md#github-action).
