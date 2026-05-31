import { stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { splitLocalTarget } from './classify.js';

export interface LocalCheckResult {
  status: 'ok' | 'broken';
  reason?: string;
}

export interface LocalLinkContext {
  /** Absolute path of the file containing the link. */
  fromFile: string;
  /** Absolute base directory for resolving root-absolute (`/foo`) links. */
  base: string;
  /** Anchors (heading slugs + html ids) defined in the source file. */
  selfAnchors: Set<string>;
  /** Whether to validate in-page anchors. */
  checkAnchors: boolean;
  /**
   * Resolve the anchor set for a target Markdown file (parsed + cached by the
   * caller). Returns undefined when the file cannot be parsed for anchors.
   */
  getTargetAnchors: (absPath: string) => Promise<Set<string> | undefined>;
}

const MARKDOWN_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx',
]);

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Validate a local link (relative or root-absolute path, optionally with an
 * anchor) and same-document `#fragment` links. Checks that the target path
 * exists on disk and, for Markdown targets, that the anchor matches a heading
 * slug or explicit html id.
 */
export async function checkLocalLink(
  rawUrl: string,
  ctx: LocalLinkContext,
): Promise<LocalCheckResult> {
  const { path: rawPath, anchor: rawAnchor } = splitLocalTarget(rawUrl);
  const path = safeDecode(rawPath);
  const anchor = rawAnchor === undefined ? undefined : safeDecode(rawAnchor);

  // Same-document reference (e.g. "#installation" or "").
  if (path === '') {
    if (anchor === undefined) return { status: 'ok' };
    if (!ctx.checkAnchors) return { status: 'ok' };
    if (ctx.selfAnchors.has(anchor)) return { status: 'ok' };
    return {
      status: 'broken',
      reason: `anchor "#${anchor}" not found in this document`,
    };
  }

  const targetAbs = path.startsWith('/')
    ? join(ctx.base, path)
    : resolve(dirname(ctx.fromFile), path);

  let stats;
  try {
    stats = await stat(targetAbs);
  } catch {
    return {
      status: 'broken',
      reason: `file not found: ${displayPath(targetAbs)}`,
    };
  }

  if (stats.isDirectory()) {
    // A link to a directory resolves on GitHub; anchors into a directory are
    // meaningless, so there is nothing further to validate.
    return { status: 'ok' };
  }

  if (anchor === undefined || !ctx.checkAnchors) {
    return { status: 'ok' };
  }

  if (!isMarkdownPath(targetAbs)) {
    // Cannot introspect anchors of non-Markdown targets (html, etc.).
    return { status: 'ok' };
  }

  const targetAnchors = await ctx.getTargetAnchors(targetAbs);
  if (targetAnchors === undefined) {
    return { status: 'ok' };
  }
  if (targetAnchors.has(anchor)) {
    return { status: 'ok' };
  }
  return {
    status: 'broken',
    reason: `anchor "#${anchor}" not found in ${displayPath(targetAbs)}`,
  };
}

function displayPath(absPath: string): string {
  const rel = relative(process.cwd(), absPath);
  return rel === '' ? absPath : rel;
}
