import { describe, it, expect } from 'vitest';
import { classifyLink, splitLocalTarget } from '../src/classify.js';

describe('classifyLink', () => {
  it.each([
    ['https://example.com', 'external'],
    ['http://example.com/path', 'external'],
    ['//cdn.example.com/app.js', 'external'],
    ['#section', 'anchor'],
    ['./guide.md', 'local'],
    ['../README.md#top', 'local'],
    ['/docs/api.md', 'local'],
    ['relative/path.md', 'local'],
    ['', 'local'],
    ['mailto:a@b.com', 'mailto'],
    ['tel:+15551234567', 'tel'],
    ['ftp://example.com/file', 'other'],
    ['data:text/plain;base64,AAAA', 'other'],
    ['javascript:void(0)', 'other'],
  ] as const)('classifies %s as %s', (url, expected) => {
    expect(classifyLink(url)).toBe(expected);
  });

  it('trims whitespace before classifying', () => {
    expect(classifyLink('  https://example.com  ')).toBe('external');
  });
});

describe('splitLocalTarget', () => {
  it('splits path and anchor', () => {
    expect(splitLocalTarget('docs/api.md#usage')).toEqual({
      path: 'docs/api.md',
      anchor: 'usage',
    });
  });

  it('returns undefined anchor when none present', () => {
    expect(splitLocalTarget('docs/api.md')).toEqual({
      path: 'docs/api.md',
      anchor: undefined,
    });
  });

  it('handles a bare fragment', () => {
    expect(splitLocalTarget('#section')).toEqual({
      path: '',
      anchor: 'section',
    });
  });

  it('drops the query string from the path', () => {
    expect(splitLocalTarget('page.md?v=2#frag')).toEqual({
      path: 'page.md',
      anchor: 'frag',
    });
  });

  it('treats an empty fragment as no anchor', () => {
    expect(splitLocalTarget('page.md#')).toEqual({
      path: 'page.md',
      anchor: undefined,
    });
  });
});
