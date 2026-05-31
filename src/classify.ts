import type { LinkClass } from './types.js';

/** Matches an explicit URI scheme like `https:`, `mailto:`, `ftp:`. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Classify a raw link target by its scheme/shape so the checker knows how to
 * validate it (network probe, filesystem lookup, anchor lookup, or skip).
 */
export function classifyLink(rawUrl: string): LinkClass {
  const url = rawUrl.trim();

  if (url === '') return 'local';

  // Pure same-document fragment, e.g. "#installation".
  if (url.startsWith('#')) return 'anchor';

  // Protocol-relative URLs (//cdn.example.com/...) are treated as external.
  if (url.startsWith('//')) return 'external';

  const schemeMatch = SCHEME_RE.exec(url);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    switch (scheme) {
      case 'http':
      case 'https':
        return 'external';
      case 'mailto':
        return 'mailto';
      case 'tel':
        return 'tel';
      default:
        // ftp:, data:, javascript:, vscode:, slack:, etc. — not checkable.
        return 'other';
    }
  }

  // No scheme and not a bare fragment: a filesystem path, possibly with an
  // anchor (e.g. "./guide.md#setup") or query string.
  return 'local';
}

/**
 * Split a local target into its path and fragment (anchor) components.
 * The query string, if present, is dropped from the path portion.
 */
export function splitLocalTarget(rawUrl: string): {
  path: string;
  anchor: string | undefined;
} {
  const hashIndex = rawUrl.indexOf('#');
  const beforeHash = hashIndex === -1 ? rawUrl : rawUrl.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? undefined : rawUrl.slice(hashIndex + 1);

  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);

  return { path, anchor: anchor === '' ? undefined : anchor };
}
