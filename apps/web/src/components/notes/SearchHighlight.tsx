import { createContext, useContext, useMemo } from 'react';
import { highlightHtml, highlightSegments } from '../../lib/search-highlight.js';

/**
 * The words the current screen searched for, offered to every card below it.
 * A context rather than a prop: the cards sit under the grid's virtualization
 * and its drag layer, and only the search screen has words to give — every
 * other screen leaves this empty and the cards render exactly as before.
 */
const NO_WORDS: string[] = [];

const SearchWordsContext = createContext<string[]>(NO_WORDS);

export function SearchHighlightProvider({
  words,
  children,
}: {
  words: string[];
  children: React.ReactNode;
}) {
  return <SearchWordsContext.Provider value={words}>{children}</SearchWordsContext.Provider>;
}

export function useSearchWords(): string[] {
  return useContext(SearchWordsContext);
}

/** Plain text with the searched words marked (titles, checklist rows). */
export function HighlightedText({ text }: { text: string }) {
  const words = useSearchWords();
  const segments = useMemo(() => highlightSegments(text, words), [text, words]);
  // One segment can still be a match — a title that is only the word searched.
  if (segments.length === 1 && !segments[0]?.match) return text;
  return (
    <>
      {segments.map((segment, i) =>
        segment.match ? (
          // Position is the only identity a run of text has, and the list is
          // rebuilt whole whenever the text or the query changes.
          // biome-ignore lint/suspicious/noArrayIndexKey: no other identity
          <mark key={i} className="search-match">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

/** The card body's html with the searched words marked inside its text. */
export function useHighlightedHtml(html: string): string {
  const words = useSearchWords();
  return useMemo(() => highlightHtml(html, words), [html, words]);
}
