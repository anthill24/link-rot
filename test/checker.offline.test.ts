import { describe, it, expect } from 'vitest';
import { check } from '../src/checker.js';
import { resolveConfig, type LinkRotConfig } from '../src/config.js';
import { PROJECT_DIR } from './helpers.js';

function offlineConfig(overrides: LinkRotConfig = {}) {
  return resolveConfig({}, { offline: true, ...overrides }, PROJECT_DIR);
}

function brokenUrls(results: { status: string; url: string }[]): string[] {
  return results
    .filter((r) => r.status === 'broken')
    .map((r) => r.url)
    .sort();
}

describe('check (offline)', () => {
  it('produces the expected tallies for the sample project', async () => {
    const report = await check(['**/*.md'], offlineConfig(), {
      cwd: PROJECT_DIR,
    });
    expect(report.files).toBe(5);
    expect(report.totalLinks).toBe(25);
    expect(report.broken).toBe(5);
    expect(report.ignored).toBe(0);
    // External links are skipped offline, alongside mailto/tel/ftp.
    expect(report.skipped).toBe(8);
    expect(report.ok).toBe(12);
  });

  it('flags exactly the known-broken targets', async () => {
    const report = await check(['**/*.md'], offlineConfig(), {
      cwd: PROJECT_DIR,
    });
    expect(brokenUrls(report.results)).toEqual(
      [
        '#does-not-exist',
        './missing-html.md',
        'api.md#nope',
        'assets/missing.png',
        'docs/missing.md',
      ].sort(),
    );
  });

  it('marks external links as skipped in offline mode', async () => {
    const report = await check(['**/*.md'], offlineConfig(), {
      cwd: PROJECT_DIR,
    });
    const external = report.results.find(
      (r) => r.url === 'https://example.com/auto',
    );
    expect(external?.status).toBe('skipped');
    expect(external?.reason).toMatch(/offline/);
  });

  it('honors ignore patterns', async () => {
    const report = await check(
      ['**/*.md'],
      offlineConfig({ ignore: ['docs/missing.md'] }),
      { cwd: PROJECT_DIR },
    );
    const ignored = report.results.find((r) => r.url === 'docs/missing.md');
    expect(ignored?.status).toBe('ignored');
    expect(report.broken).toBe(4);
    expect(report.ignored).toBe(1);
  });

  it('skips anchor validation when checkAnchors is false', async () => {
    const report = await check(
      ['**/*.md'],
      offlineConfig({ checkAnchors: false }),
      { cwd: PROJECT_DIR },
    );
    // Only the three file-not-found cases remain.
    expect(report.broken).toBe(3);
    expect(brokenUrls(report.results)).toEqual(
      ['./missing-html.md', 'assets/missing.png', 'docs/missing.md'].sort(),
    );
  });

  it('reports zero files when nothing matches', async () => {
    const report = await check(['no-such-glob/**/*.md'], offlineConfig(), {
      cwd: PROJECT_DIR,
    });
    expect(report.files).toBe(0);
    expect(report.totalLinks).toBe(0);
    expect(report.broken).toBe(0);
  });
});
