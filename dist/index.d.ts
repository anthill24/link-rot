import GithubSlugger from 'github-slugger';

/**
 * User-facing configuration, as accepted in `.linkrotrc.json`. Every field is
 * optional; unspecified fields fall back to {@link DEFAULT_CONFIG}.
 */
interface LinkRotConfig {
    /** Glob patterns matched against raw link URLs; matches are not checked. */
    ignore?: string[];
    /** Glob patterns of files to exclude from scanning. */
    exclude?: string[];
    /** Per-request timeout for external links, in milliseconds. */
    timeout?: number;
    /** Maximum number of concurrent external requests. */
    concurrency?: number;
    /** Number of retry attempts for transient failures (429/5xx/network). */
    retries?: number;
    /** Base delay between retries, in milliseconds (grows exponentially). */
    retryDelay?: number;
    /** Extra HTTP status codes to treat as OK (beyond the default < 400). */
    okStatuses?: number[];
    /** User-Agent header sent with external requests. */
    userAgent?: string;
    /** Base directory used to resolve root-absolute (`/foo`) links. */
    base?: string;
    /** Whether to validate in-page anchors against heading slugs. */
    checkAnchors?: boolean;
    /** Skip all network access; validate only relative paths and anchors. */
    offline?: boolean;
}
/** Configuration with every field resolved to a concrete value. */
interface ResolvedConfig {
    ignore: string[];
    exclude: string[];
    timeout: number;
    concurrency: number;
    retries: number;
    retryDelay: number;
    okStatuses: number[];
    userAgent: string;
    /** Absolute base directory for root-absolute link resolution. */
    base: string;
    checkAnchors: boolean;
    offline: boolean;
}
declare const DEFAULT_CONFIG: Omit<ResolvedConfig, 'base'>;
declare const CONFIG_FILENAME = ".linkrotrc.json";
/**
 * Validate and normalize a parsed config object. Throws on malformed values so
 * misconfiguration surfaces loudly instead of being silently ignored.
 */
declare function normalizeConfig(raw: unknown): LinkRotConfig;
/**
 * Merge defaults, file config, and CLI overrides (in increasing precedence)
 * into a fully-resolved config. `base` is resolved to an absolute path.
 */
declare function resolveConfig(fileConfig: LinkRotConfig, overrides: LinkRotConfig, cwd: string): ResolvedConfig;
/**
 * Load and validate the config file. When `configPath` is given the file must
 * exist; otherwise `.linkrotrc.json` in `cwd` is loaded if present. Returns an
 * empty config when no file is found via auto-discovery.
 */
declare function loadConfigFile(cwd: string, configPath?: string): Promise<{
    config: LinkRotConfig;
    path: string | undefined;
}>;

/**
 * Shared types for link-rot.
 */
/** How a link was written in the source document. */
type LinkKind = 'link' | 'image' | 'definition' | 'html';
/** Classification of a link target by its scheme/shape. */
type LinkClass = 'external' | 'local' | 'anchor' | 'mailto' | 'tel' | 'other';
/** A link discovered while parsing a document. */
interface ExtractedLink {
    /** Raw target exactly as written in the source. */
    url: string;
    kind: LinkKind;
    /** 1-based line in the source file (best effort for html-extracted links). */
    line: number;
    /** 1-based column in the source file. */
    column: number;
}
/** Result of parsing a single Markdown document. */
interface ParsedDocument {
    links: ExtractedLink[];
    /** Heading slugs + explicit html name/id anchors that exist in the document. */
    anchors: Set<string>;
}
/** Final disposition of a checked link. */
type LinkStatus = 'ok' | 'broken' | 'ignored' | 'skipped';
/** The outcome of checking one link occurrence. */
interface LinkResult {
    /** Source file the link was found in (path relative to cwd). */
    file: string;
    /** Raw target exactly as written. */
    url: string;
    line: number;
    column: number;
    class: LinkClass;
    status: LinkStatus;
    /** Human-readable explanation for broken/skipped/ignored results. */
    reason?: string;
    /** HTTP status code for external links, when available. */
    statusCode?: number;
}
/** Aggregate result of a full check run. */
interface CheckReport {
    /** Number of files scanned. */
    files: number;
    /** Total link occurrences discovered. */
    totalLinks: number;
    ok: number;
    broken: number;
    ignored: number;
    skipped: number;
    /** Every checked link occurrence, in document order. */
    results: LinkResult[];
    /** Wall-clock duration of the run, in milliseconds. */
    durationMs: number;
}
/** Result of probing a single external URL. */
interface ExternalResult {
    ok: boolean;
    statusCode?: number;
    reason?: string;
}

interface CheckOptions {
    /** Working directory globs and relative links resolve against. */
    cwd?: string;
    /** Injectable fetch for external checks (used by tests). */
    fetchImpl?: typeof fetch;
    /** Injectable delay for retry backoff (used by tests). */
    sleepImpl?: (ms: number) => Promise<void>;
}
/**
 * Scan all files matched by `patterns`, extract their links, and validate
 * relative paths, in-page anchors, and (unless offline) external URLs.
 */
declare function check(patterns: string[], config: ResolvedConfig, options?: CheckOptions): Promise<CheckReport>;

/** Abstracted process I/O so the CLI can be driven and asserted in tests. */
interface CliIO {
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
declare const EXIT_OK = 0;
declare const EXIT_BROKEN = 1;
declare const EXIT_USAGE = 2;
/**
 * Run the CLI with the given argv (excluding `node` and the script path) and
 * abstracted I/O. Returns the process exit code rather than calling exit, so
 * it can be unit-tested.
 */
declare function run(argv: string[], io: CliIO): Promise<number>;

/**
 * Parse a Markdown document and extract every link occurrence plus the set of
 * in-page anchor targets (heading slugs and explicit html id/name attributes).
 */
declare function parseMarkdown(source: string): ParsedDocument;

/**
 * Classify a raw link target by its scheme/shape so the checker knows how to
 * validate it (network probe, filesystem lookup, anchor lookup, or skip).
 */
declare function classifyLink(rawUrl: string): LinkClass;
/**
 * Split a local target into its path and fragment (anchor) components.
 * The query string, if present, is dropped from the path portion.
 */
declare function splitLocalTarget(rawUrl: string): {
    path: string;
    anchor: string | undefined;
};

interface LocalCheckResult {
    status: 'ok' | 'broken';
    reason?: string;
}
interface LocalLinkContext {
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
declare function isMarkdownPath(path: string): boolean;
/**
 * Validate a local link (relative or root-absolute path, optionally with an
 * anchor) and same-document `#fragment` links. Checks that the target path
 * exists on disk and, for Markdown targets, that the anchor matches a heading
 * slug or explicit html id.
 */
declare function checkLocalLink(rawUrl: string, ctx: LocalLinkContext): Promise<LocalCheckResult>;

interface HttpCheckOptions {
    timeout: number;
    retries: number;
    retryDelay: number;
    okStatuses: number[];
    userAgent: string;
    concurrency: number;
    /** Injectable fetch, primarily for tests. Defaults to the global fetch. */
    fetchImpl?: typeof fetch;
    /** Injectable delay, primarily for tests. Defaults to a real timer. */
    sleepImpl?: (ms: number) => Promise<void>;
}
/**
 * Run an async mapper over `items` with a bounded number of concurrent
 * workers, preserving input order in the result array.
 */
declare function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
/**
 * Check a list of external URLs, de-duplicating so each unique URL is probed
 * at most once per run. Returns a map from raw URL to its result.
 */
declare function checkExternalLinks(urls: string[], options: HttpCheckOptions): Promise<Map<string, ExternalResult>>;

/**
 * Produce a GitHub-compatible heading anchor slug.
 *
 * GitHub assigns each heading an `id` derived from its text, de-duplicating
 * repeated slugs with a numeric suffix (`-1`, `-2`, ...). `github-slugger`
 * mirrors that algorithm; a single Slugger instance must be reused across all
 * headings in a document so duplicate handling matches GitHub.
 */
declare function createSlugger(): GithubSlugger;
/** Slug a single string of heading text (no duplicate tracking). */
declare function slug(text: string): string;

/**
 * The current link-rot version.
 *
 * Kept in sync with package.json by a unit test (see test/version.test.ts)
 * rather than imported, to avoid bundling package.json into the runtime.
 */
declare const VERSION = "0.1.0";

interface TextReportOptions {
    color?: boolean;
}
/**
 * Render a human-readable report listing broken links grouped by file, with a
 * one-line summary. Returns only the summary line when nothing is broken.
 */
declare function formatText(report: CheckReport, options?: TextReportOptions): string;

/**
 * Render a machine-readable JSON report. Includes a top-level `ok` flag, a
 * summary block, and every checked link with its status — so consumers can
 * filter however they like, not just on broken links.
 */
declare function formatJson(report: CheckReport): string;

/**
 * Render a Markdown report suitable for a PR comment or
 * `$GITHUB_STEP_SUMMARY`. Shows a per-file table of broken links, or a success
 * line when everything checks out.
 */
declare function formatMarkdown(report: CheckReport): string;

type ReportFormat = 'text' | 'json' | 'markdown';
declare const REPORT_FORMATS: readonly ReportFormat[];
declare function isReportFormat(value: string): value is ReportFormat;
interface FormatOptions {
    color?: boolean;
}
/** Render a report in the requested format. */
declare function formatReport(report: CheckReport, format: ReportFormat, options?: FormatOptions): string;

export { CONFIG_FILENAME, type CheckOptions, type CheckReport, type CliIO, DEFAULT_CONFIG, EXIT_BROKEN, EXIT_OK, EXIT_USAGE, type ExternalResult, type ExtractedLink, type FormatOptions, type HttpCheckOptions, type LinkClass, type LinkKind, type LinkResult, type LinkRotConfig, type LinkStatus, type ParsedDocument, REPORT_FORMATS, type ReportFormat, type ResolvedConfig, VERSION, check, checkExternalLinks, checkLocalLink, classifyLink, createSlugger, formatJson, formatMarkdown, formatReport, formatText, isMarkdownPath, isReportFormat, loadConfigFile, mapPool, normalizeConfig, parseMarkdown, resolveConfig, run, slug, splitLocalTarget };
