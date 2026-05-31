import type { ExternalResult } from './types.js';

export interface HttpCheckOptions {
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

const RETRYABLE_STATUSES = new Set([408, 425, 429]);
// HEAD is frequently unsupported or blocked even when GET succeeds.
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 406, 501, 999]);

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  410: 'Gone',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function isOk(status: number, okStatuses: number[]): boolean {
  return status < 400 || okStatuses.includes(status);
}

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

function shouldFallbackToGet(status: number): boolean {
  return HEAD_FALLBACK_STATUSES.has(status);
}

function statusReason(status: number): string {
  const text = STATUS_TEXT[status];
  return text ? `HTTP ${status} ${text}` : `HTTP ${status}`;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

type Probe = { status: number } | { error: string; timedOut: boolean };

async function probe(
  url: string,
  method: 'HEAD' | 'GET',
  options: HttpCheckOptions,
): Promise<Probe> {
  const fetchImpl = options.fetchImpl ?? fetch;
  // Protocol-relative URLs (//host/path) have no scheme, which fetch() rejects
  // with ERR_INVALID_URL. Browsers default these to the page's scheme; we
  // default to https.
  const target = url.startsWith('//') ? `https:${url}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout);
  try {
    const res = await fetchImpl(target, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent,
        accept: '*/*',
      },
    });
    // Drain the body so the underlying connection can be reused/closed.
    if (method === 'GET') {
      await res.body?.cancel().catch(() => {});
    }
    return { status: res.status };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: `timed out after ${options.timeout}ms`, timedOut: true };
    }
    const cause = (err as { cause?: { code?: string } })?.cause?.code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: cause ? `${cause}` : message || 'network error',
      timedOut: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe one external URL, trying HEAD first and falling back to GET when the
 * server rejects HEAD. Retries transient failures (429/5xx/network/timeout)
 * with exponential backoff up to `options.retries` times.
 */
async function checkOne(
  url: string,
  options: HttpCheckOptions,
): Promise<ExternalResult> {
  const sleep = options.sleepImpl ?? defaultSleep;
  let lastReason = 'unknown error';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    if (attempt > 0) {
      await sleep(options.retryDelay * 2 ** (attempt - 1));
    }

    let result = await probe(url, 'HEAD', options);

    if ('error' in result) {
      // A timeout will almost certainly recur on GET, so don't double the wait.
      // For other network errors, some servers reject HEAD specifically, so
      // it's worth one GET before counting the attempt as a failure.
      if (result.timedOut) {
        lastReason = result.error;
        continue;
      }
      const headError = result.error;
      const getResult = await probe(url, 'GET', options);
      if ('error' in getResult) {
        lastReason = getResult.error || headError;
        continue;
      }
      result = getResult;
    } else if (
      !isOk(result.status, options.okStatuses) &&
      shouldFallbackToGet(result.status)
    ) {
      // Only fall back when HEAD wasn't already acceptable — e.g. a 403 the
      // user added to okStatuses should pass without a second request.
      const getResult = await probe(url, 'GET', options);
      if ('status' in getResult) result = getResult;
    }

    const { status } = result;
    if (isOk(status, options.okStatuses)) {
      return { ok: true, statusCode: status };
    }
    lastReason = statusReason(status);
    lastStatus = status;
    if (isRetryable(status)) continue;
    return { ok: false, statusCode: status, reason: lastReason };
  }

  return { ok: false, statusCode: lastStatus, reason: lastReason };
}

/**
 * Run an async mapper over `items` with a bounded number of concurrent
 * workers, preserving input order in the result array.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Check a list of external URLs, de-duplicating so each unique URL is probed
 * at most once per run. Returns a map from raw URL to its result.
 */
export async function checkExternalLinks(
  urls: string[],
  options: HttpCheckOptions,
): Promise<Map<string, ExternalResult>> {
  const unique = [...new Set(urls)];
  const results = await mapPool(unique, options.concurrency, (url) =>
    checkOne(url, options),
  );

  const map = new Map<string, ExternalResult>();
  unique.forEach((url, i) => map.set(url, results[i]!));
  return map;
}

export const _internal = {
  isOk,
  isRetryable,
  shouldFallbackToGet,
  statusReason,
  checkOne,
};
