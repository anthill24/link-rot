import { describe, it, expect } from 'vitest';
import { check } from '../src/checker.js';
import { resolveConfig } from '../src/config.js';
import { ONLINE_DIR } from './helpers.js';

type Handler = (method: string) => Response;

function mockFetch(routes: Record<string, Handler>) {
  const calls: Array<{ url: string; method: string }> = [];
  const impl = (async (input: string, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch to ${url}`);
    return handler(method);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ROUTES: Record<string, Handler> = {
  'https://good.example.com/': () => new Response(null, { status: 200 }),
  'https://missing.example.com/404': () => new Response(null, { status: 404 }),
  'https://flaky.example.com/500': () => new Response(null, { status: 500 }),
  'https://forbidden.example.com/': (method) =>
    new Response(null, { status: method === 'HEAD' ? 403 : 200 }),
};

describe('check (online, mocked fetch)', () => {
  it('classifies external links and respects ignore + relative links', async () => {
    const { impl, calls } = mockFetch(ROUTES);
    const config = resolveConfig(
      {},
      { ignore: ['https://tracking.example.com/**'], retries: 1 },
      ONLINE_DIR,
    );

    const report = await check(['**/*.md'], config, {
      cwd: ONLINE_DIR,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    expect(report.files).toBe(2);
    expect(report.totalLinks).toBe(6);
    expect(report.ok).toBe(3); // good + forbidden(HEAD->GET) + ./local.md
    expect(report.broken).toBe(2); // missing(404) + flaky(500)
    expect(report.ignored).toBe(1); // tracking pixel
    expect(report.skipped).toBe(0);

    const byUrl = new Map(report.results.map((r) => [r.url, r]));
    expect(byUrl.get('https://good.example.com/')?.status).toBe('ok');
    expect(byUrl.get('https://missing.example.com/404')?.statusCode).toBe(404);
    expect(byUrl.get('https://flaky.example.com/500')?.status).toBe('broken');
    expect(byUrl.get('https://forbidden.example.com/')?.status).toBe('ok');
    expect(byUrl.get('https://tracking.example.com/pixel')?.status).toBe(
      'ignored',
    );
    expect(byUrl.get('./local.md')?.status).toBe('ok');

    // The ignored URL is never fetched.
    expect(calls.some((c) => c.url.includes('tracking.example.com'))).toBe(
      false,
    );
    // The flaky URL is retried (1 retry => 2 attempts).
    expect(
      calls.filter((c) => c.url === 'https://flaky.example.com/500').length,
    ).toBe(2);
  });
});
