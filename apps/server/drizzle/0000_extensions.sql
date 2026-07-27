-- Accent-insensitive EN/PT full-text search.
--
-- The custom text search configuration `openkeep` runs every token through the
-- `unaccent` filtering dictionary and then the `simple` dictionary (no
-- language-specific stemming — matching Keep's word-prefix search behavior for
-- both English and Portuguese with a single configuration).
--
-- Referenced as the two-argument form to_tsvector('openkeep', …), which is
-- IMMUTABLE and therefore legal in generated columns.

CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION openkeep ( COPY = simple );
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION openkeep
  ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part
  WITH unaccent, simple;
