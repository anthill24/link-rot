import type { CheckReport, LinkResult } from '../types.js';
import { createColorizer } from '../color.js';

export interface TextReportOptions {
  color?: boolean;
}

/** Group results by source file, preserving first-seen file order. */
function groupByFile(results: LinkResult[]): Map<string, LinkResult[]> {
  const groups = new Map<string, LinkResult[]>();
  for (const result of results) {
    const existing = groups.get(result.file);
    if (existing) existing.push(result);
    else groups.set(result.file, [result]);
  }
  return groups;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Render a human-readable report listing broken links grouped by file, with a
 * one-line summary. Returns only the summary line when nothing is broken.
 */
export function formatText(
  report: CheckReport,
  options: TextReportOptions = {},
): string {
  const c = createColorizer(options.color ?? false);
  const broken = report.results.filter((r) => r.status === 'broken');
  const lines: string[] = [];

  if (broken.length > 0) {
    const groups = groupByFile(broken);
    for (const [file, fileResults] of groups) {
      lines.push(c('bold', file));
      for (const result of fileResults) {
        const loc = `${result.line}:${result.column}`.padEnd(7);
        const reason = result.reason ?? 'broken';
        lines.push(
          `  ${c('red', '✖')} ${c('dim', loc)} ${result.url}  ${c('dim', '→ ' + reason)}`,
        );
      }
      lines.push('');
    }
  }

  lines.push(summaryLine(report, c));
  return lines.join('\n');
}

function summaryLine(
  report: CheckReport,
  c: ReturnType<typeof createColorizer>,
): string {
  const fileWord = report.files === 1 ? 'file' : 'files';
  const checked = `checked ${report.totalLinks} links across ${report.files} ${fileWord}`;
  const extras: string[] = [];
  if (report.ignored > 0) extras.push(`${report.ignored} ignored`);
  if (report.skipped > 0) extras.push(`${report.skipped} skipped`);
  const extra = extras.length > 0 ? `, ${extras.join(', ')}` : '';
  const duration = ` in ${formatDuration(report.durationMs)}`;

  if (report.broken === 0) {
    return `${c('green', '✓')} No broken links — ${checked}${extra}${duration}`;
  }
  const brokenWord = report.broken === 1 ? 'broken link' : 'broken links';
  return `${c('red', '✖')} ${report.broken} ${brokenWord} — ${checked}${extra}${duration}`;
}
