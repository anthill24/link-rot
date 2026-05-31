import { describe, it, expect } from 'vitest';
import { slug, createSlugger } from '../src/slug.js';

describe('slug', () => {
  it('lowercases and hyphenates heading text', () => {
    expect(slug('Hello World')).toBe('hello-world');
  });

  it('drops punctuation the way GitHub does', () => {
    expect(slug('References & HTML')).toBe('references--html');
  });

  it('keeps content from inline code', () => {
    expect(slug('The config object')).toBe('the-config-object');
  });
});

describe('createSlugger', () => {
  it('de-duplicates repeated slugs with numeric suffixes', () => {
    const slugger = createSlugger();
    expect(slugger.slug('Usage')).toBe('usage');
    expect(slugger.slug('Usage')).toBe('usage-1');
    expect(slugger.slug('Usage')).toBe('usage-2');
  });

  it('does not share state between instances', () => {
    expect(createSlugger().slug('Usage')).toBe('usage');
    expect(createSlugger().slug('Usage')).toBe('usage');
  });
});
