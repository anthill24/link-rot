import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { run, EXIT_OK, EXIT_BROKEN, EXIT_USAGE } from '../src/run.js';
import { VERSION } from '../src/version.js';
import { captureIO, PROJECT_DIR, CONFIG_DIR } from './helpers.js';

describe('run', () => {
  it('prints help and exits 0 with --help', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['--help'], cap.io);
    expect(code).toBe(EXIT_OK);
    expect(cap.out).toContain('USAGE');
  });

  it('prints the version with --version', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['--version'], cap.io);
    expect(code).toBe(EXIT_OK);
    expect(cap.out.trim()).toBe(VERSION);
  });

  it('shows help and exits 2 when no command is given', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run([], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.out).toContain('USAGE');
  });

  it('rejects an unknown command', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['frobnicate'], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/unknown command/);
  });

  it('requires at least one glob', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['check'], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/no glob patterns/);
  });

  it('exits 1 and lists broken links in offline mode', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['check', '**/*.md', '--offline'], cap.io);
    expect(code).toBe(EXIT_BROKEN);
    expect(cap.out).toContain('5 broken links');
    expect(cap.out).toContain('docs/missing.md');
  });

  it('emits JSON with --format json', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      ['check', '**/*.md', '--offline', '--format', 'json'],
      cap.io,
    );
    expect(code).toBe(EXIT_BROKEN);
    const parsed = JSON.parse(cap.out);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary.broken).toBe(5);
  });

  it('exits 0 with --exit-zero even when links are broken', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      ['check', '**/*.md', '--offline', '--exit-zero'],
      cap.io,
    );
    expect(code).toBe(EXIT_OK);
  });

  it('honors --ignore from the CLI', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      [
        'check',
        '**/*.md',
        '--offline',
        '--ignore',
        'docs/missing.md',
        '--format',
        'json',
      ],
      cap.io,
    );
    expect(code).toBe(EXIT_BROKEN);
    expect(JSON.parse(cap.out).summary.broken).toBe(4);
  });

  it('rejects an invalid --format', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['check', '**/*.md', '--format', 'xml'], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/invalid --format/);
  });

  it('rejects a non-numeric --timeout', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['check', '**/*.md', '--timeout', 'soon'], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/--timeout must be/);
  });

  it('rejects --color together with --no-color', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      ['check', '**/*.md', '--color', '--no-color'],
      cap.io,
    );
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/mutually exclusive/);
  });

  it('reports a config-file error', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      ['check', '**/*.md', '--config', join(CONFIG_DIR, 'broken.json')],
      cap.io,
    );
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/Invalid JSON/);
  });

  it('warns but exits 0 when no files match', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(
      ['check', 'no-such-dir/**/*.md', '--offline'],
      cap.io,
    );
    expect(code).toBe(EXIT_OK);
    expect(cap.err).toMatch(/no files matched/);
  });
});

describe('run render', () => {
  it('re-formats a saved JSON report as markdown', async () => {
    // First produce a JSON report.
    const jsonCap = captureIO(PROJECT_DIR);
    await run(
      ['check', '**/*.md', '--offline', '--format', 'json'],
      jsonCap.io,
    );

    const dir = mkdtempSync(join(tmpdir(), 'link-rot-'));
    const file = join(dir, 'report.json');
    writeFileSync(file, jsonCap.out);

    const cap = captureIO(PROJECT_DIR);
    const code = await run(['render', file, '--format', 'markdown'], cap.io);
    expect(code).toBe(EXIT_OK);
    expect(cap.out).toContain('## 🔗 link-rot');
    expect(cap.out).toContain('5 broken links');
  });

  it('reads a JSON report from stdin when the source is omitted or "-"', async () => {
    const jsonCap = captureIO(PROJECT_DIR);
    await run(
      ['check', '**/*.md', '--offline', '--format', 'json'],
      jsonCap.io,
    );
    const report = jsonCap.out;

    for (const argv of [['render'], ['render', '-']]) {
      const cap = captureIO(PROJECT_DIR, {}, report);
      const code = await run([...argv, '--format', 'markdown'], cap.io);
      expect(code).toBe(EXIT_OK);
      expect(cap.out).toContain('5 broken links');
    }
  });

  it('rejects a missing report file', async () => {
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['render', '/no/such/report.json'], cap.io);
    expect(code).toBe(EXIT_USAGE);
  });

  it('rejects invalid JSON content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'link-rot-'));
    const file = join(dir, 'bad.json');
    writeFileSync(file, 'not json');
    const cap = captureIO(PROJECT_DIR);
    const code = await run(['render', file], cap.io);
    expect(code).toBe(EXIT_USAGE);
    expect(cap.err).toMatch(/could not parse JSON report/);
  });
});
