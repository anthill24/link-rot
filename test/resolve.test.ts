import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkLocalLink, isMarkdownPath } from '../src/resolve.js';
import { parseMarkdown } from '../src/markdown.js';
import { PROJECT_DIR } from './helpers.js';

const getTargetAnchors = async (abs: string) => {
  try {
    return parseMarkdown(await readFile(abs, 'utf8')).anchors;
  } catch {
    return undefined;
  }
};

function ctx(
  fromRel: string,
  selfAnchors = new Set<string>(),
  checkAnchors = true,
) {
  return {
    fromFile: join(PROJECT_DIR, fromRel),
    base: PROJECT_DIR,
    selfAnchors,
    checkAnchors,
    getTargetAnchors,
  };
}

describe('isMarkdownPath', () => {
  it('recognizes markdown extensions', () => {
    expect(isMarkdownPath('a.md')).toBe(true);
    expect(isMarkdownPath('a.markdown')).toBe(true);
    expect(isMarkdownPath('a.MDX')).toBe(true);
    expect(isMarkdownPath('a.png')).toBe(false);
    expect(isMarkdownPath('a')).toBe(false);
  });
});

describe('checkLocalLink', () => {
  it('passes an existing relative file', async () => {
    expect(await checkLocalLink('docs/guide.md', ctx('README.md'))).toEqual({
      status: 'ok',
    });
  });

  it('flags a missing file', async () => {
    const result = await checkLocalLink('docs/missing.md', ctx('README.md'));
    expect(result.status).toBe('broken');
    expect(result.reason).toMatch(/file not found/);
  });

  it('validates a cross-file anchor that exists', async () => {
    expect(await checkLocalLink('api.md#usage', ctx('docs/guide.md'))).toEqual({
      status: 'ok',
    });
  });

  it('flags a cross-file anchor that does not exist', async () => {
    const result = await checkLocalLink('api.md#nope', ctx('docs/guide.md'));
    expect(result.status).toBe('broken');
    expect(result.reason).toMatch(/anchor "#nope" not found/);
  });

  it('validates a same-document anchor', async () => {
    expect(
      await checkLocalLink('#setup', ctx('docs/guide.md', new Set(['setup']))),
    ).toEqual({ status: 'ok' });
  });

  it('flags a missing same-document anchor', async () => {
    const result = await checkLocalLink(
      '#missing',
      ctx('docs/guide.md', new Set(['setup'])),
    );
    expect(result.status).toBe('broken');
    expect(result.reason).toMatch(/not found in this document/);
  });

  it('resolves a root-absolute path against the base directory', async () => {
    expect(await checkLocalLink('/README.md', ctx('docs/guide.md'))).toEqual({
      status: 'ok',
    });
  });

  it('treats a link to a directory as ok', async () => {
    expect(await checkLocalLink('docs', ctx('README.md'))).toEqual({
      status: 'ok',
    });
  });

  it('skips anchor validation for non-markdown targets', async () => {
    expect(
      await checkLocalLink('assets/logo.png#frag', ctx('README.md')),
    ).toEqual({ status: 'ok' });
  });

  it('skips anchor checks when checkAnchors is false', async () => {
    expect(
      await checkLocalLink('#missing', ctx('docs/guide.md', new Set(), false)),
    ).toEqual({ status: 'ok' });
  });

  it('treats an empty target as ok', async () => {
    expect(await checkLocalLink('', ctx('README.md'))).toEqual({
      status: 'ok',
    });
  });
});
