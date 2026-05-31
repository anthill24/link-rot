import GithubSlugger from 'github-slugger';

/**
 * Produce a GitHub-compatible heading anchor slug.
 *
 * GitHub assigns each heading an `id` derived from its text, de-duplicating
 * repeated slugs with a numeric suffix (`-1`, `-2`, ...). `github-slugger`
 * mirrors that algorithm; a single Slugger instance must be reused across all
 * headings in a document so duplicate handling matches GitHub.
 */
export function createSlugger(): GithubSlugger {
  return new GithubSlugger();
}

/** Slug a single string of heading text (no duplicate tracking). */
export function slug(text: string): string {
  return new GithubSlugger().slug(text);
}
