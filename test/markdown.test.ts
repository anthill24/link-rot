import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/markdown.js';

describe('parseMarkdown', () => {
  it('extracts inline links and images', () => {
    const doc = parseMarkdown('[text](https://a.com) and ![alt](./img.png)');
    expect(doc.links).toEqual([
      { url: 'https://a.com', kind: 'link', line: 1, column: 1 },
      { url: './img.png', kind: 'image', line: 1, column: 27 },
    ]);
  });

  it('extracts reference definitions', () => {
    const doc = parseMarkdown('[ref][id]\n\n[id]: https://example.com');
    const def = doc.links.find((l) => l.kind === 'definition');
    expect(def?.url).toBe('https://example.com');
  });

  it('collects heading slugs with GitHub-style de-duplication', () => {
    const doc = parseMarkdown('# Title\n\n## Usage\n\n## Usage');
    expect([...doc.anchors]).toEqual(['title', 'usage', 'usage-1']);
  });

  it('extracts hrefs and ids from inline HTML', () => {
    const doc = parseMarkdown('<a href="./other.md">x</a> <a name="spot"></a>');
    const htmlLink = doc.links.find((l) => l.kind === 'html');
    expect(htmlLink?.url).toBe('./other.md');
    expect(doc.anchors.has('spot')).toBe(true);
  });

  it('does not register phantom anchors from hyphenated attrs or URL params', () => {
    // `data-id`/`item-name` are not `id`/`name`; query params inside an href
    // value must not be mistaken for attributes.
    const doc = parseMarkdown(
      '<div data-id="x42"><input item-name="y">' +
        '<a href="page?id=5&name=bob">link</a>',
    );
    expect(doc.anchors.has('x42')).toBe(false);
    expect(doc.anchors.has('y')).toBe(false);
    expect(doc.anchors.has('bob')).toBe(false);
    expect([...doc.anchors]).not.toContain('5&name=bob');
    // The real href is still extracted.
    expect(doc.links.some((l) => l.url === 'page?id=5&name=bob')).toBe(true);
  });

  it('understands GFM autolink literals', () => {
    const doc = parseMarkdown(
      'See https://example.com/a, email me@x.com, and www.example.org',
    );
    const urls = doc.links.map((l) => l.url);
    expect(urls).toContain('https://example.com/a');
    expect(urls).toContain('mailto:me@x.com');
    expect(urls).toContain('http://www.example.org');
  });

  it('records 1-based line numbers', () => {
    const doc = parseMarkdown('# H\n\nsome [link](x.md) text');
    const link = doc.links[0];
    expect(link?.line).toBe(3);
  });
});
