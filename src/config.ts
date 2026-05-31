import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { VERSION } from './version.js';

/**
 * User-facing configuration, as accepted in `.linkrotrc.json`. Every field is
 * optional; unspecified fields fall back to {@link DEFAULT_CONFIG}.
 */
export interface LinkRotConfig {
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
export interface ResolvedConfig {
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

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'base'> = {
  ignore: [],
  exclude: ['**/node_modules/**'],
  timeout: 10_000,
  concurrency: 8,
  retries: 2,
  retryDelay: 300,
  okStatuses: [],
  userAgent: `link-rot/${VERSION} (+https://github.com/anthill24/link-rot)`,
  checkAnchors: true,
  offline: false,
};

export const CONFIG_FILENAME = '.linkrotrc.json';

const NUMBER_FIELDS = [
  'timeout',
  'concurrency',
  'retries',
  'retryDelay',
] as const;
const STRING_ARRAY_FIELDS = ['ignore', 'exclude'] as const;

/**
 * Validate and normalize a parsed config object. Throws on malformed values so
 * misconfiguration surfaces loudly instead of being silently ignored.
 */
export function normalizeConfig(raw: unknown): LinkRotConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Config must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  const out: LinkRotConfig = {};

  for (const field of NUMBER_FIELDS) {
    const value = obj[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Config field "${field}" must be a non-negative number.`);
    }
    out[field] = value;
  }

  // Mirror the CLI's `--concurrency` validation so config and flags agree.
  if (out.concurrency !== undefined && out.concurrency < 1) {
    throw new Error('Config field "concurrency" must be at least 1.');
  }

  for (const field of STRING_ARRAY_FIELDS) {
    const value = obj[field];
    if (value === undefined) continue;
    if (!isStringArray(value)) {
      throw new Error(`Config field "${field}" must be an array of strings.`);
    }
    out[field] = value;
  }

  if (obj.okStatuses !== undefined) {
    if (
      !Array.isArray(obj.okStatuses) ||
      !obj.okStatuses.every((n) => typeof n === 'number' && Number.isInteger(n))
    ) {
      throw new Error(
        'Config field "okStatuses" must be an array of integers.',
      );
    }
    out.okStatuses = obj.okStatuses as number[];
  }

  if (obj.userAgent !== undefined) {
    if (typeof obj.userAgent !== 'string') {
      throw new Error('Config field "userAgent" must be a string.');
    }
    out.userAgent = obj.userAgent;
  }

  if (obj.base !== undefined) {
    if (typeof obj.base !== 'string') {
      throw new Error('Config field "base" must be a string.');
    }
    out.base = obj.base;
  }

  for (const field of ['checkAnchors', 'offline'] as const) {
    const value = obj[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new Error(`Config field "${field}" must be a boolean.`);
    }
    out[field] = value;
  }

  return out;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Merge defaults, file config, and CLI overrides (in increasing precedence)
 * into a fully-resolved config. `base` is resolved to an absolute path.
 */
export function resolveConfig(
  fileConfig: LinkRotConfig,
  overrides: LinkRotConfig,
  cwd: string,
): ResolvedConfig {
  const merged: LinkRotConfig = { ...fileConfig, ...stripUndefined(overrides) };
  const base = merged.base ?? '.';
  return {
    ...DEFAULT_CONFIG,
    ...stripUndefined(merged),
    base: isAbsolute(base) ? base : resolve(cwd, base),
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

/**
 * Load and validate the config file. When `configPath` is given the file must
 * exist; otherwise `.linkrotrc.json` in `cwd` is loaded if present. Returns an
 * empty config when no file is found via auto-discovery.
 */
export async function loadConfigFile(
  cwd: string,
  configPath?: string,
): Promise<{ config: LinkRotConfig; path: string | undefined }> {
  const explicit = configPath !== undefined;
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(cwd, configPath)
    : resolve(cwd, CONFIG_FILENAME);

  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (err) {
    if (!explicit && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { config: {}, path: undefined };
    }
    throw new Error(`Could not read config file "${path}": ${describe(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (err) {
    throw new Error(`Invalid JSON in config file "${path}": ${describe(err)}`);
  }

  return { config: normalizeConfig(parsed), path };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
