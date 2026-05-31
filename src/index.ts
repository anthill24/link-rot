/**
 * link-rot — programmatic API.
 *
 * @example
 * ```ts
 * import { check, resolveConfig, DEFAULT_CONFIG, formatReport } from 'link-rot';
 *
 * const config = resolveConfig({}, { offline: true }, process.cwd());
 * const report = await check(['docs/**\/*.md'], config);
 * console.log(formatReport(report, 'text'));
 * ```
 */

export { check } from './checker.js';
export type { CheckOptions } from './checker.js';

export { run, EXIT_OK, EXIT_BROKEN, EXIT_USAGE } from './run.js';
export type { CliIO } from './run.js';

export {
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
  loadConfigFile,
  normalizeConfig,
  resolveConfig,
} from './config.js';
export type { LinkRotConfig, ResolvedConfig } from './config.js';

export { parseMarkdown } from './markdown.js';
export { classifyLink, splitLocalTarget } from './classify.js';
export { checkLocalLink, isMarkdownPath } from './resolve.js';
export { checkExternalLinks, mapPool } from './http.js';
export type { HttpCheckOptions } from './http.js';
export { createSlugger, slug } from './slug.js';
export { VERSION } from './version.js';

export {
  formatReport,
  formatText,
  formatJson,
  formatMarkdown,
  isReportFormat,
  REPORT_FORMATS,
} from './reporters/index.js';
export type { ReportFormat, FormatOptions } from './reporters/index.js';

export type {
  CheckReport,
  LinkResult,
  LinkStatus,
  LinkClass,
  LinkKind,
  ExtractedLink,
  ParsedDocument,
  ExternalResult,
} from './types.js';
