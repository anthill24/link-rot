import type { CheckReport } from '../types.js';
import { formatText } from './text.js';
import { formatJson } from './json.js';
import { formatMarkdown } from './markdown.js';

export { formatText } from './text.js';
export { formatJson } from './json.js';
export { formatMarkdown } from './markdown.js';

export type ReportFormat = 'text' | 'json' | 'markdown';

export const REPORT_FORMATS: readonly ReportFormat[] = [
  'text',
  'json',
  'markdown',
];

export function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

export interface FormatOptions {
  color?: boolean;
}

/** Render a report in the requested format. */
export function formatReport(
  report: CheckReport,
  format: ReportFormat,
  options: FormatOptions = {},
): string {
  switch (format) {
    case 'json':
      return formatJson(report);
    case 'markdown':
      return formatMarkdown(report);
    case 'text':
    default:
      return formatText(report, { color: options.color });
  }
}
