/**
 * Builds a safe prefix-match tsquery string from raw user input.
 * Every operator/quote is stripped; terms become `term:*` joined by `join` —
 * word-prefix search matching Keep's behavior (no stemming; accent folding
 * happens in the `openkeep` text search configuration).
 *
 * `|` is for the excluded words of a `-word` query: the note must contain
 * *none* of them, which is `NOT (a:* | b:*)` — negating the AND would only
 * exclude notes holding all of them at once.
 */
export function buildPrefixTsquery(input: string, join: '&' | '|' = '&'): string | null {
  const terms = input
    .replace(/[&|!():*'"<>\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    // Drop punctuation-only fragments — to_tsquery rejects empty lexemes.
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 12);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(` ${join} `);
}
