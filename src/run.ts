import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { check } from './checker.js';
import { loadConfigFile, resolveConfig, type LinkRotConfig } from './config.js';
import {
  formatReport,
  isReportFormat,
  REPORT_FORMATS,
  type ReportFormat,
} from './reporters/index.js';
import { shouldUseColor } from './color.js';
import { VERSION } from './version.js';
import type { CheckReport } from './types.js';

/** Abstracted process I/O so the CLI can be driven and asserted in tests. */
export interface CliIO {
  cwd: string;
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
  /** Write to stdout. */
  write: (text: string) => void;
  /** Write to stderr. */
  writeErr: (text: string) => void;
  /** Read all of stdin synchronously (used by `render` with no file arg). */
  readStdin?: () => string;
}

/** Process exit codes. */
export const EXIT_OK = 0;
export const EXIT_BROKEN = 1;
export const EXIT_USAGE = 2;

const HELP = `link-rot v${VERSION} — find dead links in Markdown and docs

USAGE
  link-rot check <glob...> [options]
  link-rot render [report.json] [--format <fmt>]   Re-format a saved JSON report

OPTIONS
  --offline               Skip the network; check only relative paths & anchors
  -f, --format <fmt>      Output format: ${REPORT_FORMATS.join(' | ')} (default: text)
  -c, --config <path>     Path to a config file (default: ./.linkrotrc.json)
      --timeout <ms>      Per-request timeout for external links
      --concurrency <n>   Max concurrent external requests
      --retries <n>       Retry attempts for transient failures (429/5xx/network)
      --ignore <glob>     Ignore links matching this glob (repeatable)
      --ok-status <code>  Treat this HTTP status as OK (repeatable)
      --base <dir>        Base directory for root-absolute (/foo) links
      --user-agent <ua>   User-Agent header for external requests
      --no-check-anchors  Do not validate in-page anchors
      --color             Force colored output
      --no-color          Disable colored output
      --exit-zero         Always exit 0, even when broken links are found
  -h, --help              Show this help
  -v, --version           Show version

EXAMPLES
  link-rot check "**/*.md"
  link-rot check docs/ README.md --offline
  link-rot check "**/*.md" --format markdown > report.md
  link-rot check "**/*.md" --ignore "https://twitter.com/**" --ok-status 403

Exit codes: ${EXIT_OK} = clean, ${EXIT_BROKEN} = broken links found, ${EXIT_USAGE} = usage/config error.
`;

interface ParsedFlags {
  values: Record<string, unknown>;
  positionals: string[];
}

function parseInteger(
  name: string,
  value: string | undefined,
  errors: string[],
): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`--${name} must be a non-negative integer (got "${value}")`);
    return undefined;
  }
  return n;
}

/**
 * Run the CLI with the given argv (excluding `node` and the script path) and
 * abstracted I/O. Returns the process exit code rather than calling exit, so
 * it can be unit-tested.
 */
export async function run(argv: string[], io: CliIO): Promise<number> {
  let parsed: ParsedFlags;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        offline: { type: 'boolean' },
        format: { type: 'string', short: 'f' },
        config: { type: 'string', short: 'c' },
        timeout: { type: 'string' },
        concurrency: { type: 'string' },
        retries: { type: 'string' },
        ignore: { type: 'string', multiple: true },
        'ok-status': { type: 'string', multiple: true },
        base: { type: 'string' },
        'user-agent': { type: 'string' },
        'check-anchors': { type: 'boolean' },
        'no-check-anchors': { type: 'boolean' },
        color: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        'exit-zero': { type: 'boolean' },
      },
    }) as ParsedFlags;
  } catch (err) {
    io.writeErr(`link-rot: ${describe(err)}\n`);
    io.writeErr(`Run "link-rot --help" for usage.\n`);
    return EXIT_USAGE;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    io.write(HELP);
    return EXIT_OK;
  }
  if (values.version) {
    io.write(`${VERSION}\n`);
    return EXIT_OK;
  }

  const command = positionals[0];
  if (command === undefined) {
    io.write(HELP);
    return EXIT_USAGE;
  }
  if (command === 'render') {
    return renderCommand(positionals.slice(1), values, io);
  }
  if (command !== 'check') {
    io.writeErr(`link-rot: unknown command "${command}".\n`);
    io.writeErr(`Run "link-rot --help" for usage.\n`);
    return EXIT_USAGE;
  }

  const globs = positionals.slice(1);
  if (globs.length === 0) {
    io.writeErr('link-rot: no glob patterns or paths given.\n');
    io.writeErr('Example: link-rot check "**/*.md"\n');
    return EXIT_USAGE;
  }

  const format: ReportFormat =
    values.format === undefined ? 'text' : (values.format as ReportFormat);
  if (typeof values.format === 'string' && !isReportFormat(values.format)) {
    io.writeErr(
      `link-rot: invalid --format "${values.format}" (expected ${REPORT_FORMATS.join(', ')}).\n`,
    );
    return EXIT_USAGE;
  }

  const errors: string[] = [];
  const timeout = parseInteger('timeout', values.timeout as string, errors);
  const concurrency = parseInteger(
    'concurrency',
    values.concurrency as string,
    errors,
  );
  const retries = parseInteger('retries', values.retries as string, errors);

  const cliIgnore = (values.ignore as string[] | undefined) ?? [];
  const cliOkStatuses: number[] = [];
  for (const raw of (values['ok-status'] as string[] | undefined) ?? []) {
    const code = parseInteger('ok-status', raw, errors);
    if (code !== undefined) cliOkStatuses.push(code);
  }

  if (concurrency === 0) {
    errors.push('--concurrency must be at least 1');
  }
  if (values['check-anchors'] && values['no-check-anchors']) {
    errors.push(
      '--check-anchors and --no-check-anchors are mutually exclusive',
    );
  }
  if (values.color && values['no-color']) {
    errors.push('--color and --no-color are mutually exclusive');
  }

  if (errors.length > 0) {
    for (const message of errors) io.writeErr(`link-rot: ${message}\n`);
    return EXIT_USAGE;
  }

  let fileConfig: LinkRotConfig;
  try {
    const loaded = await loadConfigFile(io.cwd, values.config as string);
    fileConfig = loaded.config;
  } catch (err) {
    io.writeErr(`link-rot: ${describe(err)}\n`);
    return EXIT_USAGE;
  }

  const overrides: LinkRotConfig = {
    offline: values.offline ? true : undefined,
    timeout,
    concurrency,
    retries,
    base: values.base as string | undefined,
    userAgent: values['user-agent'] as string | undefined,
    checkAnchors: values['no-check-anchors'] ? false : undefined,
    ignore:
      cliIgnore.length > 0
        ? [...(fileConfig.ignore ?? []), ...cliIgnore]
        : undefined,
    okStatuses:
      cliOkStatuses.length > 0
        ? [...(fileConfig.okStatuses ?? []), ...cliOkStatuses]
        : undefined,
  };

  const config = resolveConfig(fileConfig, overrides, io.cwd);

  let report;
  try {
    report = await check(globs, config, { cwd: io.cwd });
  } catch (err) {
    io.writeErr(`link-rot: ${describe(err)}\n`);
    return EXIT_USAGE;
  }

  if (report.files === 0) {
    io.writeErr(
      `link-rot: no files matched ${globs.map((g) => `"${g}"`).join(', ')}.\n`,
    );
  }

  const colorOverride = values.color
    ? true
    : values['no-color']
      ? false
      : undefined;
  const color =
    format === 'text' && shouldUseColor(colorOverride, io.env, io.isTTY);

  io.write(formatReport(report, format, { color }) + '\n');

  if (report.broken > 0 && !values['exit-zero']) return EXIT_BROKEN;
  return EXIT_OK;
}

/**
 * Re-format a JSON report previously produced by `link-rot check --format
 * json`. This lets a single network-bearing check feed multiple outputs (e.g.
 * a step summary and a PR comment) without re-probing every URL. A pure
 * formatter: it always exits 0 on success and 2 on bad input.
 */
function renderCommand(
  positionals: string[],
  values: Record<string, unknown>,
  io: CliIO,
): number {
  if (typeof values.format === 'string' && !isReportFormat(values.format)) {
    io.writeErr(
      `link-rot: invalid --format "${values.format}" (expected ${REPORT_FORMATS.join(', ')}).\n`,
    );
    return EXIT_USAGE;
  }
  const format: ReportFormat =
    values.format === undefined ? 'text' : (values.format as ReportFormat);

  const source = positionals[0];
  let contents: string;
  try {
    // Read from a file path, or from stdin when omitted or given as "-".
    if (source === undefined || source === '-') {
      contents = io.readStdin ? io.readStdin() : readFileSync(0, 'utf8');
    } else {
      contents = readFileSync(source, 'utf8');
    }
  } catch (err) {
    io.writeErr(`link-rot: ${describe(err)}\n`);
    return EXIT_USAGE;
  }

  let report: CheckReport;
  try {
    report = reportFromJson(JSON.parse(contents));
  } catch (err) {
    io.writeErr(`link-rot: could not parse JSON report: ${describe(err)}\n`);
    return EXIT_USAGE;
  }

  const colorOverride = values.color
    ? true
    : values['no-color']
      ? false
      : undefined;
  const color =
    format === 'text' && shouldUseColor(colorOverride, io.env, io.isTTY);

  io.write(formatReport(report, format, { color }) + '\n');
  return EXIT_OK;
}

/** Reconstruct a CheckReport from the JSON emitted by the json reporter. */
function reportFromJson(data: unknown): CheckReport {
  if (data === null || typeof data !== 'object') {
    throw new Error('expected a JSON object');
  }
  const obj = data as Record<string, unknown>;
  const summary = (obj.summary as Record<string, unknown> | undefined) ?? {};
  const results = obj.results;
  if (!Array.isArray(results)) {
    throw new Error('report is missing a "results" array');
  }
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' ? value : fallback;

  return {
    files: num(summary.files, 0),
    totalLinks: num(summary.totalLinks, results.length),
    ok: num(summary.ok, 0),
    broken: num(summary.broken, 0),
    ignored: num(summary.ignored, 0),
    skipped: num(summary.skipped, 0),
    durationMs: num(summary.durationMs, 0),
    results: results as CheckReport['results'],
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
