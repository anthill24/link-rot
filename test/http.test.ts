import { describe, it, expect } from 'vitest';
import {
  checkExternalLinks,
  mapPool,
  _internal,
  type HttpCheckOptions,
} from '../src/http.js';

const BASE: HttpCheckOptions = {
  timeout: 1000,
  retries: 0,
  retryDelay: 0,
  okStatuses: [],
  userAgent: 'link-rot-test',
  concurrency: 4,
  sleepImpl: async () => {},
};

type Handler = (method: string, callIndex: number) => Response;

function mockFetch(routes: Record<string, Handler>) {
  const calls: Array<{ url: string; method: string }> = [];
  const counts = new Map<string, number>();
  const impl = (async (input: string, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const n = counts.get(url) ?? 0;
    counts.set(url, n + 1);
    calls.push({ url, method });
    const handler = routes[url];
    if (!handler) throw new Error(`no route for ${url}`);
    return handler(method, n);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('helpers', () => {
  it('isOk respects the default < 400 boundary and okStatuses', () => {
    expect(_internal.isOk(200, [])).toBe(true);
    expect(_internal.isOk(399, [])).toBe(true);
    expect(_internal.isOk(404, [])).toBe(false);
    expect(_internal.isOk(403, [403])).toBe(true);
  });

  it('isRetryable covers 429 and 5xx', () => {
    expect(_internal.isRetryable(429)).toBe(true);
    expect(_internal.isRetryable(503)).toBe(true);
    expect(_internal.isRetryable(404)).toBe(false);
  });

  it('shouldFallbackToGet covers HEAD-hostile statuses', () => {
    for (const code of [403, 405, 406, 501, 999]) {
      expect(_internal.shouldFallbackToGet(code)).toBe(true);
    }
    expect(_internal.shouldFallbackToGet(200)).toBe(false);
    expect(_internal.shouldFallbackToGet(404)).toBe(false);
  });
});

describe('checkOne', () => {
  it('accepts a 200 from HEAD', async () => {
    const { impl, calls } = mockFetch({
      'https://ok.test/': () => new Response(null, { status: 200 }),
    });
    const result = await _internal.checkOne('https://ok.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: true, statusCode: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('HEAD');
  });

  it('reports a 404 as broken without a GET fallback', async () => {
    const { impl, calls } = mockFetch({
      'https://nf.test/': () => new Response(null, { status: 404 }),
    });
    const result = await _internal.checkOne('https://nf.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.reason).toMatch(/404/);
    expect(calls).toHaveLength(1);
  });

  it('falls back to GET when HEAD returns 405', async () => {
    const { impl, calls } = mockFetch({
      'https://m.test/': (method) =>
        new Response(null, { status: method === 'HEAD' ? 405 : 200 }),
    });
    const result = await _internal.checkOne('https://m.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('falls back to GET when HEAD is forbidden (403)', async () => {
    const { impl } = mockFetch({
      'https://f.test/': (method) =>
        new Response(null, { status: method === 'HEAD' ? 403 : 200 }),
    });
    const result = await _internal.checkOne('https://f.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
  });

  it('falls back to GET on the 999 anti-bot status', async () => {
    const { impl, calls } = mockFetch({
      'https://b.test/': (method) =>
        new Response(null, { status: method === 'HEAD' ? 999 : 200 }),
    });
    const result = await _internal.checkOne('https://b.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('honors okStatuses on the HEAD result without a GET fallback', async () => {
    // 403 is both a HEAD-fallback status and a user-approved status; the
    // approval must short-circuit so no second request is made.
    const { impl, calls } = mockFetch({
      'https://ok403.test/': () => new Response(null, { status: 403 }),
    });
    const result = await _internal.checkOne('https://ok403.test/', {
      ...BASE,
      okStatuses: [403],
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: true, statusCode: 403 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('HEAD');
  });

  it('normalizes protocol-relative URLs to https before fetching', async () => {
    const { impl, calls } = mockFetch({
      'https://cdn.test/app.js': () => new Response(null, { status: 200 }),
    });
    const result = await _internal.checkOne('//cdn.test/app.js', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://cdn.test/app.js');
  });

  it('does not retry a HEAD timeout with a GET (avoids doubling latency)', async () => {
    const calls: Array<{ method: string }> = [];
    const hangingFetch = ((
      _url: string,
      init?: { method?: string; signal?: AbortSignal },
    ) => {
      calls.push({ method: init?.method ?? 'GET' });
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const result = await _internal.checkOne('https://slow.test/', {
      ...BASE,
      timeout: 20,
      retries: 0,
      fetchImpl: hangingFetch,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timed out/);
    // Only the HEAD was attempted — no GET fallback on a timeout.
    expect(calls).toEqual([{ method: 'HEAD' }]);
  });

  it('falls back to GET when HEAD throws a network error', async () => {
    const { impl, calls } = mockFetch({
      'https://n.test/': (method) => {
        if (method === 'HEAD') throw new Error('socket hang up');
        return new Response(null, { status: 200 });
      },
    });
    const result = await _internal.checkOne('https://n.test/', {
      ...BASE,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('retries a 429 and then succeeds', async () => {
    const { impl, calls } = mockFetch({
      'https://r.test/': (_method, n) =>
        new Response(null, { status: n === 0 ? 429 : 200 }),
    });
    const result = await _internal.checkOne('https://r.test/', {
      ...BASE,
      retries: 1,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(calls.length).toBe(2);
  });

  it('gives up on a persistent 500 after exhausting retries', async () => {
    const { impl, calls } = mockFetch({
      'https://e.test/': () => new Response(null, { status: 500 }),
    });
    const result = await _internal.checkOne('https://e.test/', {
      ...BASE,
      retries: 1,
      fetchImpl: impl,
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    // 2 attempts (initial + 1 retry), HEAD each time.
    expect(calls).toHaveLength(2);
  });

  it('treats a configured okStatus as OK', async () => {
    const { impl } = mockFetch({
      'https://a.test/': () => new Response(null, { status: 401 }),
    });
    const result = await _internal.checkOne('https://a.test/', {
      ...BASE,
      okStatuses: [401],
      fetchImpl: impl,
    });
    expect(result).toEqual({ ok: true, statusCode: 401 });
  });

  it('reports a timeout', async () => {
    const hangingFetch = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    const result = await _internal.checkOne('https://slow.test/', {
      ...BASE,
      timeout: 20,
      retries: 0,
      fetchImpl: hangingFetch,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timed out/);
  });
});

describe('checkExternalLinks', () => {
  it('de-duplicates URLs and maps results back', async () => {
    const { impl, calls } = mockFetch({
      'https://a.test/': () => new Response(null, { status: 200 }),
      'https://b.test/': () => new Response(null, { status: 404 }),
    });
    const result = await checkExternalLinks(
      ['https://a.test/', 'https://a.test/', 'https://b.test/'],
      { ...BASE, fetchImpl: impl },
    );
    expect(result.get('https://a.test/')?.ok).toBe(true);
    expect(result.get('https://b.test/')?.ok).toBe(false);
    // Each unique URL probed once (HEAD).
    expect(calls).toHaveLength(2);
  });
});

describe('mapPool', () => {
  it('preserves input order', async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapPool(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty input list', async () => {
    expect(await mapPool([], 4, async (n) => n)).toEqual([]);
  });
});
