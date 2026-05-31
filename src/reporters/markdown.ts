import type { CheckReport, LinkResult } from '../types.js';

/** Escape a value for safe inclusion inside a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Wrap a URL in an inline code span, escaping backticks. */
function code(value: string): string {
  const safe = value.replace(/`/g, '​`​');
  return `\`${cell(safe)}\``;
}

function groupByFile(results: LinkResult[]): Map<string, LinkResult[]> {
  const groups = new Map<string, LinkResult[]>();
  for (const result of results) {
    const existing = groups.get(result.file);
    if (existing) existing.push(result);
    else groups.set(result.file, [result]);
  }
  return groups;
}

/**
 * Render a Markdown report suitable for a PR comment or
 * `$GITHUB_STEP_SUMMARY`. Shows a per-file table of broken links, or a success
 * line when everything checks out.
 */
export function formatMarkdown(report: CheckReport): string {
  const lines: string[] = ['## 🔗 link-rot', ''];
  const broken = report.results.filter((r) => r.status === 'broken');
  const fileWord = report.files === 1 ? 'file' : 'files';
  const checked = `checked **${report.totalLinks}** links across **${report.files}** ${fileWord}`;

  if (broken.length === 0) {
    lines.push(`✅ **No broken links found** — ${checked}.`);
  } else {
    const groups = groupByFile(broken);
    const brokenWord = broken.length === 1 ? 'broken link' : 'broken links';
    const fileCount = groups.size;
    const acrossWord = fileCount === 1 ? 'file' : 'files';
    lines.push(
      `❌ Found **${broken.length} ${brokenWord}** across **${fileCount}** ${acrossWord} (${checked}).`,
    );
    lines.push('');

    for (const [file, fileResults] of groups) {
      lines.push(`### \`${file}\``);
      lines.push('');
      lines.push('| Line | Link | Problem |');
      lines.push('| ---: | --- | --- |');
      for (const result of fileResults) {
        const problem = cell(result.reason ?? 'broken');
        lines.push(`| ${result.line} | ${code(result.url)} | ${problem} |`);
      }
      lines.push('');
    }
  }

  const extras: string[] = [
    `${report.files} ${fileWord}`,
    `${report.totalLinks} links`,
  ];
  if (report.ignored > 0) extras.push(`${report.ignored} ignored`);
  if (report.skipped > 0) extras.push(`${report.skipped} skipped`);
  lines.push(`<sub>Checked by link-rot • ${extras.join(' • ')}</sub>`);

  return lines.join('\n');
}
