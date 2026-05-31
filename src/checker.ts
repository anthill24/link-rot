import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { glob } from 'tinyglobby';
import picomatch from 'picomatch';
import { parseMarkdown } from './markdown.js';
import { classifyLink } from './classify.js';
import { checkLocalLink, isMarkdownPath } from './resolve.js';
import { checkExternalLinks } from './http.js';
import type { ResolvedConfig } from './config.js';
import type {
  CheckReport,
  ExtractedLink,
  LinkResult,
  LinkStatus,
} from './types.js';

export interface CheckOptions {
  /** Working directory globs and relative links resolve against. */
  cwd?: string;
  /** Injectable fetch for external checks (used by tests). */
  fetchImpl?: typeof fetch;
  /** Injectable delay for retry backoff (used by tests). */
  sleepImpl?: (ms: number) => Promise<void>;
}

interface ParsedFile {
  /** Path relative to cwd, used in reports. */
  relPath: string;
  absPath: string;
  links: ExtractedLink[];
  anchors: Set<string>;
}

const LOCAL_CHECK_CONCURRENCY = 32;

/**
 * Scan all files matched by `patterns`, extract their links, and validate
 * relative paths, in-page anchors, and (unless offline) external URLs.
 */
export async function check(
  patterns: string[],
  config: ResolvedConfig,
  options: CheckOptions = {},
): Promise<CheckReport> {
  const startedAt = Date.now();
  const cwd = options.cwd ?? process.cwd();

  const matches = await glob(patterns, {
    cwd,
    ignore: config.exclude,
    absolute: false,
    dot: true,
    onlyFiles: true,
  });
  // Only parse Markdown files. A bare directory or broad glob (e.g. `docs/`)
  // can match images, lockfiles, etc.; feeding those to the Markdown parser
  // produces misleading link results, so they are skipped here.
  const files = [...new Set(matches)].filter(isMarkdownPath).sort();

  const parsed: ParsedFile[] = await Promise.all(
    files.map(async (relPath) => {
      const absPath = resolve(cwd, relPath);
      const source = await readFile(absPath, 'utf8');
      const doc = parseMarkdown(source);
      return { relPath, absPath, links: doc.links, anchors: doc.anchors };
    }),
  );

  // Cache of anchor sets per absolute path; seed with the files we just
  // parsed so cross-file anchor checks never re-read them.
  const anchorCache = new Map<string, Promise<Set<string> | undefined>>();
  for (const file of parsed) {
    anchorCache.set(file.absPath, Promise.resolve(file.anchors));
  }
  const getTargetAnchors = (
    absPath: string,
  ): Promise<Set<string> | undefined> => {
    const cached = anchorCache.get(absPath);
    if (cached) return cached;
    const entry: Promise<Set<string> | undefined> = readFile(absPath, 'utf8')
      .then((src) => parseMarkdown(src).anchors)
      .catch(() => undefined);
    anchorCache.set(absPath, entry);
    return entry;
  };

  const isIgnored =
    config.ignore.length > 0
      ? picomatch(config.ignore, { dot: true })
      : () => false;

  const results: LinkResult[] = [];
  const localTasks: Array<() => Promise<void>> = [];
  const externalTasks: Array<{ result: LinkResult; url: string }> = [];

  for (const file of parsed) {
    for (const link of file.links) {
      const cls = classifyLink(link.url);
      const result: LinkResult = {
        file: file.relPath,
        url: link.url,
        line: link.line,
        column: link.column,
        class: cls,
        status: 'skipped',
      };
      results.push(result);

      if (isIgnored(link.url.trim())) {
        result.status = 'ignored';
        result.reason = 'matched an ignore pattern';
        continue;
      }

      switch (cls) {
        case 'external': {
          if (config.offline) {
            result.status = 'skipped';
            result.reason = 'skipped (offline mode)';
          } else {
            externalTasks.push({ result, url: link.url.trim() });
          }
          break;
        }
        case 'local':
        case 'anchor': {
          localTasks.push(async () => {
            const outcome = await checkLocalLink(link.url, {
              fromFile: file.absPath,
              base: config.base,
              selfAnchors: file.anchors,
              checkAnchors: config.checkAnchors,
              getTargetAnchors,
            });
            result.status = outcome.status;
            result.reason = outcome.reason;
          });
          break;
        }
        case 'mailto': {
          result.status = 'skipped';
          result.reason = 'mailto link (not checked)';
          break;
        }
        case 'tel': {
          result.status = 'skipped';
          result.reason = 'tel link (not checked)';
          break;
        }
        case 'other': {
          result.status = 'skipped';
          result.reason = 'unsupported scheme (not checked)';
          break;
        }
      }
    }
  }

  await runLocalTasks(localTasks);

  if (externalTasks.length > 0) {
    const urls = externalTasks.map((task) => task.url);
    const external = await checkExternalLinks(urls, {
      timeout: config.timeout,
      retries: config.retries,
      retryDelay: config.retryDelay,
      okStatuses: config.okStatuses,
      userAgent: config.userAgent,
      concurrency: config.concurrency,
      fetchImpl: options.fetchImpl,
      sleepImpl: options.sleepImpl,
    });
    for (const task of externalTasks) {
      const outcome = external.get(task.url);
      if (!outcome) continue;
      task.result.status = outcome.ok ? 'ok' : 'broken';
      task.result.statusCode = outcome.statusCode;
      task.result.reason = outcome.reason;
    }
  }

  return buildReport(files.length, results, Date.now() - startedAt);
}

async function runLocalTasks(tasks: Array<() => Promise<void>>): Promise<void> {
  let cursor = 0;
  const workers = Math.max(1, Math.min(LOCAL_CHECK_CONCURRENCY, tasks.length));
  const run = async (): Promise<void> => {
    while (cursor < tasks.length) {
      await tasks[cursor++]!();
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
}

function buildReport(
  fileCount: number,
  results: LinkResult[],
  durationMs: number,
): CheckReport {
  const counts: Record<LinkStatus, number> = {
    ok: 0,
    broken: 0,
    ignored: 0,
    skipped: 0,
  };
  for (const result of results) counts[result.status]++;

  return {
    files: fileCount,
    totalLinks: results.length,
    ok: counts.ok,
    broken: counts.broken,
    ignored: counts.ignored,
    skipped: counts.skipped,
    results,
    durationMs,
  };
}

/** Re-export for callers that want a relative display path. */
export function toRelative(cwd: string, absPath: string): string {
  return relative(cwd, absPath);
}
