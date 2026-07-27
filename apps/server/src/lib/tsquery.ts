/**
 * Builds a safe prefix-match tsquery string from raw user input.
 * Every operator/quote is stripped; terms become `term:*` AND-joined —
 * word-prefix search matching Keep's behavior (no stemming; accent folding
 * happens in the `openkeep` text search configuration).
 */
export function buildPrefixTsquery(input: string): string | null {
  const terms = input
    .replace(/[&|!():*'"<>\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    // Drop punctuation-only fragments — to_tsquery rejects empty lexemes.
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 12);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(' & ');
}
