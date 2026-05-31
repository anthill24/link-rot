import type { CheckReport } from '../types.js';

/**
 * Render a machine-readable JSON report. Includes a top-level `ok` flag, a
 * summary block, and every checked link with its status — so consumers can
 * filter however they like, not just on broken links.
 */
export function formatJson(report: CheckReport): string {
  return JSON.stringify(
    {
      ok: report.broken === 0,
      summary: {
        files: report.files,
        totalLinks: report.totalLinks,
        ok: report.ok,
        broken: report.broken,
        ignored: report.ignored,
        skipped: report.skipped,
        durationMs: report.durationMs,
      },
      results: report.results.map((result) => ({
        file: result.file,
        url: result.url,
        line: result.line,
        column: result.column,
        class: result.class,
        status: result.status,
        ...(result.statusCode !== undefined
          ? { statusCode: result.statusCode }
          : {}),
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      })),
    },
    null,
    2,
  );
}
