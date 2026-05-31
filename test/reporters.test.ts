import { describe, it, expect } from 'vitest';
import {
  formatText,
  formatJson,
  formatMarkdown,
  formatReport,
} from '../src/reporters/index.js';
import type { CheckReport } from '../src/types.js';

const REPORT: CheckReport = {
  files: 2,
  totalLinks: 5,
  ok: 1,
  broken: 3,
  ignored: 0,
  skipped: 1,
  durationMs: 1234,
  results: [
    {
      file: 'a.md',
      url: './x.md',
      line: 3,
      column: 1,
      class: 'local',
      status: 'broken',
      reason: 'file not found: x.md',
    },
    {
      file: 'a.md',
      url: 'https://dead.test/',
      line: 5,
      column: 2,
      class: 'external',
      status: 'broken',
      reason: 'HTTP 404 Not Found',
      statusCode: 404,
    },
    {
      file: 'a.md',
      url: 'weird|pipe.md',
      line: 6,
      column: 1,
      class: 'local',
      status: 'broken',
      reason: 'file not found: weird|pipe.md',
    },
    {
      file: 'b.md',
      url: 'https://ok.test/',
      line: 1,
      column: 1,
      class: 'external',
      status: 'ok',
      statusCode: 200,
    },
    {
      file: 'b.md',
      url: 'mailto:x@y.z',
      line: 2,
      column: 1,
      class: 'mailto',
      status: 'skipped',
      reason: 'mailto link (not checked)',
    },
  ],
};

const CLEAN: CheckReport = {
  files: 1,
  totalLinks: 2,
  ok: 2,
  broken: 0,
  ignored: 0,
  skipped: 0,
  durationMs: 7,
  results: [],
};

describe('formatText', () => {
  it('lists broken links grouped by file with a summary', () => {
    const out = formatText(REPORT, { color: false });
    expect(out).toContain('a.md');
    expect(out).toContain('./x.md');
    expect(out).toContain('file not found: x.md');
    expect(out).toContain('https://dead.test/');
    expect(out).toContain('3 broken links');
    // Does not surface ok/skipped links.
    expect(out).not.toContain('https://ok.test/');
    expect(out).not.toContain('mailto:x@y.z');
  });

  it('emits no ANSI codes when color is disabled', () => {
    const out = formatText(REPORT, { color: false });
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\[/);
  });

  it('emits ANSI codes when color is enabled', () => {
    const out = formatText(REPORT, { color: true });
    // eslint-disable-next-line no-control-regex
    expect(out).toMatch(/\[/);
  });

  it('shows a success line when nothing is broken', () => {
    const out = formatText(CLEAN, { color: false });
    expect(out).toContain('No broken links');
    expect(out).toContain('2 links');
  });
});

describe('formatJson', () => {
  it('is valid JSON with an ok flag and full results', () => {
    const parsed = JSON.parse(formatJson(REPORT));
    expect(parsed.ok).toBe(false);
    expect(parsed.summary.broken).toBe(3);
    expect(parsed.results).toHaveLength(5);
    expect(parsed.results[1].statusCode).toBe(404);
  });

  it('sets ok=true for a clean report', () => {
    expect(JSON.parse(formatJson(CLEAN)).ok).toBe(true);
  });
});

describe('formatMarkdown', () => {
  it('renders a per-file table of broken links', () => {
    const md = formatMarkdown(REPORT);
    expect(md.startsWith('## 🔗 link-rot')).toBe(true);
    expect(md).toContain('❌');
    expect(md).toContain('3 broken links');
    expect(md).toContain('### `a.md`');
    expect(md).toContain('| Line | Link | Problem |');
    expect(md).toContain('`./x.md`');
  });

  it('escapes pipe characters in table cells', () => {
    const md = formatMarkdown(REPORT);
    expect(md).toContain('weird\\|pipe.md');
  });

  it('renders a success message when clean', () => {
    const md = formatMarkdown(CLEAN);
    expect(md).toContain('✅');
    expect(md).toContain('No broken links found');
  });
});

describe('formatReport', () => {
  it('dispatches to the requested format', () => {
    expect(formatReport(REPORT, 'json')).toBe(formatJson(REPORT));
    expect(formatReport(REPORT, 'markdown')).toBe(formatMarkdown(REPORT));
    expect(formatReport(REPORT, 'text', { color: false })).toBe(
      formatText(REPORT, { color: false }),
    );
  });
});
