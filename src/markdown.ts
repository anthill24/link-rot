import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Root } from 'mdast';
import { createSlugger } from './slug.js';
import type { ExtractedLink, ParsedDocument } from './types.js';

const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Match an opening HTML tag and capture its raw attribute string. Quoted
 * attribute values may contain `>`, so they are consumed explicitly. Closing
 * tags (`</a>`) do not match because the name must follow `<` directly.
 */
const HTML_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/**
 * Match a single `name="value"` attribute (quoted or unquoted) within a tag's
 * attribute string. Capture group 1 is the attribute name; 2/3/4 the value for
 * the double-quoted, single-quoted, and unquoted forms.
 */
const ATTR_RE =
  /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function attrValue(match: RegExpExecArray): string | undefined {
  return match[2] ?? match[3] ?? match[4];
}

/**
 * Parse a Markdown document and extract every link occurrence plus the set of
 * in-page anchor targets (heading slugs and explicit html id/name attributes).
 */
export function parseMarkdown(source: string): ParsedDocument {
  const tree = processor.parse(source) as Root;
  const slugger = createSlugger();
  const links: ExtractedLink[] = [];
  const anchors = new Set<string>();

  visit(tree, (node) => {
    const line = node.position?.start.line ?? 0;
    const column = node.position?.start.column ?? 0;

    switch (node.type) {
      case 'link':
      case 'image': {
        links.push({
          url: node.url,
          kind: node.type === 'image' ? 'image' : 'link',
          line,
          column,
        });
        break;
      }
      case 'definition': {
        // Reference-style definitions: [id]: <url>. The url here backs every
        // [text][id] reference in the document.
        links.push({ url: node.url, kind: 'definition', line, column });
        break;
      }
      case 'heading': {
        anchors.add(slugger.slug(mdastToString(node)));
        break;
      }
      case 'html': {
        extractFromHtml(node.value, line, links, anchors);
        break;
      }
    }
  });

  return { links, anchors };
}

function extractFromHtml(
  html: string,
  line: number,
  links: ExtractedLink[],
  anchors: Set<string>,
): void {
  HTML_TAG_RE.lastIndex = 0;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = HTML_TAG_RE.exec(html)) !== null) {
    const attrString = tagMatch[2] ?? '';
    ATTR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_RE.exec(attrString)) !== null) {
      const name = attrMatch[1]!.toLowerCase();
      const value = attrValue(attrMatch);
      if (value === undefined || value === '') continue;
      if (name === 'href' || name === 'src') {
        links.push({ url: value, kind: 'html', line, column: 1 });
      } else if (name === 'id' || name === 'name') {
        anchors.add(value);
      }
    }
  }
}
