/**
 * Shared types for link-rot.
 */

/** How a link was written in the source document. */
export type LinkKind = 'link' | 'image' | 'definition' | 'html';

/** Classification of a link target by its scheme/shape. */
export type LinkClass =
  | 'external' // http(s):// or protocol-relative //host
  | 'local' // relative or root-absolute filesystem path (may include #anchor)
  | 'anchor' // same-document #fragment only
  | 'mailto' // mailto:
  | 'tel' // tel:
  | 'other'; // other schemes we do not check (ftp:, data:, etc.)

/** A link discovered while parsing a document. */
export interface ExtractedLink {
  /** Raw target exactly as written in the source. */
  url: string;
  kind: LinkKind;
  /** 1-based line in the source file (best effort for html-extracted links). */
  line: number;
  /** 1-based column in the source file. */
  column: number;
}

/** Result of parsing a single Markdown document. */
export interface ParsedDocument {
  links: ExtractedLink[];
  /** Heading slugs + explicit html name/id anchors that exist in the document. */
  anchors: Set<string>;
}

/** Final disposition of a checked link. */
export type LinkStatus = 'ok' | 'broken' | 'ignored' | 'skipped';

/** The outcome of checking one link occurrence. */
export interface LinkResult {
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
export interface CheckReport {
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
export interface ExternalResult {
  ok: boolean;
  statusCode?: number;
  reason?: string;
}
